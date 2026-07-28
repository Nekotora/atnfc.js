import { AtNfcCmeError, AtNfcTimeoutError } from "./errors";
import {
  decodeType2TagTlv,
  encodeNdefMessage,
  encodeType2TagTlv,
  encodeUriRecord,
  encodeVCardRecord,
  encodeWifiRecord,
  padToPageBoundary
} from "./ndef";
import type {
  AtCommandResponse,
  AtNfcClientOptions,
  AtNfcEventMap,
  AtNfcTransport,
  CommandOptions,
  DiyMode,
  ExchangeOptions,
  FindCardResult,
  InfoResult,
  KeyboardMode,
  KeyType,
  ProtocolChannel,
  SetSysConfigOptions,
  SysConfig
} from "./types";
import type { DecodedNdefRecord, NdefRecord, VCardContact, WifiNetwork } from "./ndef";
import {
  appendSaveSuffix,
  assertIntegerRange,
  encodeSysConfig,
  getRequiredPrefixedValue,
  normalizeHex,
  parseFindPayload,
  parseSysConfig
} from "./utils";

interface PendingCommand {
  command: string;
  lines: string[];
  resolve: (response: AtCommandResponse) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class AtNfcClient {
  readonly transport: AtNfcTransport;

  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  private readonly timeoutMs: number;
  private readonly commandEnding: string;
  private queue: Promise<void> = Promise.resolve();
  private pending: PendingCommand | undefined;
  private readBuffer = "";
  private opening: Promise<void> | undefined;
  private reading = false;
  private opened = false;
  private closed = false;
  private connectionError: Error | undefined;
  private listeners = new Map<keyof AtNfcEventMap, Set<(value: unknown) => void>>();

  constructor(transport: AtNfcTransport, options: AtNfcClientOptions = {}) {
    this.transport = transport;
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.commandEnding = options.lineEnding === "lf" ? "\n" : "\r\n";

    if (options.autoOpen) {
      void this.open();
    }
  }

  on<K extends keyof AtNfcEventMap>(eventName: K, listener: (value: AtNfcEventMap[K]) => void): () => void {
    let listeners = this.listeners.get(eventName);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(eventName, listeners);
    }

    const wrapped = listener as (value: unknown) => void;
    listeners.add(wrapped);
    return () => listeners.delete(wrapped);
  }

  async open(): Promise<void> {
    if (this.opened) return;
    if (this.opening) return this.opening;
    this.assertConnectionUsable();

    this.closed = false;
    this.opening = (async () => {
      await this.transport.open?.();
      this.opened = true;
      this.startReader();
    })();

    try {
      await this.opening;
    } catch (error) {
      this.closed = true;
      this.opened = false;
      throw error;
    } finally {
      this.opening = undefined;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.opened = false;
    this.connectionError = undefined;

    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error("ATNFC client closed while a command was pending"));
      this.pending = undefined;
    }

    await this.transport.close?.();
    this.emit("close", undefined);
  }

  command(command: string, options: CommandOptions = {}): Promise<AtCommandResponse> {
    const normalized = command.trim();
    if (!normalized.startsWith("AT")) {
      throw new TypeError("AT command must start with AT");
    }

    return this.enqueue(async () => {
      await this.open();

      const response = new Promise<AtCommandResponse>((resolve, reject) => {
        const timeoutMs = options.timeoutMs ?? this.timeoutMs;
        const timer = setTimeout(() => {
          const error = new AtNfcTimeoutError(normalized, timeoutMs);
          if (this.pending?.command === normalized) {
            this.pending = undefined;
          }
          this.invalidateConnection(error);
          reject(error);
        }, timeoutMs);

        this.pending = {
          command: normalized,
          lines: [],
          resolve,
          reject,
          timer
        };
      });

      try {
        await this.transport.write(this.encoder.encode(`${normalized}${this.commandEnding}`));
      } catch (error) {
        if (this.pending?.command === normalized) {
          clearTimeout(this.pending.timer);
          this.pending = undefined;
        }
        throw error;
      }

      return response;
    });
  }

  async test(): Promise<boolean> {
    await this.command("AT");
    return true;
  }

  async getManufacturer(): Promise<string> {
    return this.getSingleValue("AT+GMI", "GMI");
  }

  async getFirmwareVersion(): Promise<string> {
    return this.getSingleValue("AT+GMR", "GMR");
  }

  async getModel(): Promise<string> {
    return this.getSingleValue("AT+GMM", "GMM");
  }

  async getSerialNumber(): Promise<string> {
    return this.getSingleValue("AT+GSN", "GSN");
  }

  async getInfo(): Promise<InfoResult> {
    const [manufacturer, firmware, model, serialNumber] = await Promise.all([
      this.getManufacturer(),
      this.getFirmwareVersion(),
      this.getModel(),
      this.getSerialNumber()
    ]);

    return { manufacturer, firmware, model, serialNumber };
  }

  async getSysConfig(): Promise<SysConfig> {
    return parseSysConfig(await this.getSingleValue("AT+SYSCFG?", "SYSCFG"));
  }

  async setSysConfig(config: SetSysConfigOptions): Promise<void> {
    const hex = encodeSysConfig(config);
    await this.command(appendSaveSuffix(`AT+SYSCFG=${hex}`, config.save));
  }

  async findCard(filter?: number, options?: CommandOptions): Promise<FindCardResult> {
    if (filter !== undefined) assertIntegerRange("filter", filter, 1, 255);
    const command = filter === undefined ? "AT+FIND" : `AT+FIND=${filter}`;
    const response = await this.command(command, options);
    return parseFindPayload(getRequiredPrefixedValue(response.dataLines, "FIND"));
  }

  async getUid(): Promise<string> {
    return this.getSingleValue("AT+UID", "UID");
  }

  async getAtr(): Promise<string> {
    return this.getSingleValue("AT+ATR", "ATR");
  }

  async getCardType(): Promise<string> {
    return this.getSingleValue("AT+TYPE", "TYPE");
  }

  async power(value: boolean): Promise<string | undefined> {
    const response = await this.command(`AT+PWR=${value ? 1 : 0}`);
    return response.dataLines.length > 0 ? getRequiredPrefixedValue(response.dataLines, "PWR") : undefined;
  }

  async authenticateM1(addr: number, keyType: KeyType, key: string | Uint8Array): Promise<void> {
    assertIntegerRange("addr", addr, 0, 255);
    const normalizedKeyType = keyType.toUpperCase() as KeyType;
    if (normalizedKeyType !== "A" && normalizedKeyType !== "B") {
      throw new TypeError("keyType must be A or B");
    }

    await this.command(`AT+M1AUTH=${addr},${normalizedKeyType},${normalizeHex(key, { bytes: 6 })}`);
  }

  async readM1(addr: number): Promise<string> {
    assertIntegerRange("addr", addr, 0, 255);
    return this.getSingleValue(`AT+M1READ=${addr}`, "M1READ");
  }

  async writeM1(addr: number, data: string | Uint8Array): Promise<void> {
    assertIntegerRange("addr", addr, 0, 255);
    await this.command(`AT+M1WRITE=${addr},${normalizeHex(data, { bytes: 16 })}`);
  }

  async readNtag(addr: number, pages = 1): Promise<string> {
    assertIntegerRange("addr", addr, 0, 255);
    assertIntegerRange("pages", pages, 1, 60);
    return this.getSingleValue(`AT+NTAGREAD=${addr},${pages}`, "NTAGREAD");
  }

  async writeNtag(addr: number, data: string | Uint8Array): Promise<void> {
    assertIntegerRange("addr", addr, 0, 255);
    await this.command(`AT+NTAGWRITE=${addr},${normalizeHex(data, { minBytes: 1, maxBytes: 256 })}`);
  }

  async readNdefFromNtag(startPage = 4, pages = 60): Promise<DecodedNdefRecord[]> {
    assertIntegerRange("startPage", startPage, 0, 255);
    assertIntegerRange("pages", pages, 1, 60);
    const data = await this.readNtag(startPage, pages);
    return decodeType2TagTlv(data);
  }

  async writeNdefToNtag(records: NdefRecord[], startPage = 4): Promise<void> {
    const message = encodeNdefMessage(records);
    const tlv = padToPageBoundary(encodeType2TagTlv(message));
    await this.writeNtag(startPage, tlv);
  }

  async writeUrlToNtag(url: string, startPage = 4): Promise<void> {
    await this.writeNdefToNtag([encodeUriRecord(url)], startPage);
  }

  async writeWifiToNtag(network: WifiNetwork, startPage = 4): Promise<void> {
    await this.writeNdefToNtag([encodeWifiRecord(network)], startPage);
  }

  async writeVCardToNtag(contact: VCardContact, startPage = 4): Promise<void> {
    await this.writeNdefToNtag([encodeVCardRecord(contact)], startPage);
  }

  async readIso15693(addr: number, blocks = 1): Promise<string> {
    assertIntegerRange("addr", addr, 0, 255);
    assertIntegerRange("blocks", blocks, 1, 30);
    return this.getSingleValue(`AT+15693READ=${addr},${blocks}`, "15693READ");
  }

  async writeIso15693(addr: number, data: string | Uint8Array): Promise<void> {
    assertIntegerRange("addr", addr, 0, 255);
    await this.command(`AT+15693WRITE=${addr},${normalizeHex(data, { minBytes: 1, maxBytes: 256 })}`);
  }

  async apdu(apdu: string | Uint8Array, options?: CommandOptions): Promise<string> {
    const response = await this.command(`AT+APDU=${normalizeHex(apdu)}`, options);
    return getRequiredPrefixedValue(response.dataLines, "APDU");
  }

  async selectAid(aid: string | Uint8Array, p1?: string | number, p2?: string | number): Promise<string> {
    const parts = [normalizeHex(aid, { minBytes: 1, maxBytes: 32 })];
    if (p1 !== undefined) parts.push(this.oneByteHex("p1", p1));
    if (p2 !== undefined) parts.push(this.oneByteHex("p2", p2));
    return this.getSingleValue(`AT+AIDSEL=${parts.join(",")}`, "AIDSEL");
  }

  async readSelectedFile(length: number, offset?: number): Promise<string> {
    assertIntegerRange("length", length, 1, 1024);
    const command = offset === undefined ? `AT+FREAD=${length}` : `AT+FREAD=${length},${offset}`;
    if (offset !== undefined) assertIntegerRange("offset", offset, 0, 65535);
    return this.getSingleValue(command, "FREAD", { timeoutMs: Math.max(this.timeoutMs, 6000) });
  }

  async exchange(data: string | Uint8Array, options: ExchangeOptions = {}): Promise<string> {
    return this.protocolExchange("CEXCHANGE", data, options);
  }

  async protocolExchange(channel: ProtocolChannel, data: string | Uint8Array, options: ExchangeOptions = {}): Promise<string> {
    const parts = [normalizeHex(data)];
    if (options.crc) parts.push("CRC");
    if (options.fwi !== undefined) {
      assertIntegerRange("fwi", options.fwi, 0, 14);
      parts.push(String(options.fwi));
    }

    return this.getSingleValue(`AT+${channel}=${parts.join(",")}`, channel);
  }

  async idCard(apdu: string | Uint8Array): Promise<string> {
    return this.getSingleValue(`AT+IDCARD=${normalizeHex(apdu)}`, "IDCARD");
  }

  async resetPcd(): Promise<void> {
    await this.command("AT+PCDRST");
  }

  async writeRegister(addr: number, data: string | Uint8Array, flag?: number): Promise<void> {
    assertIntegerRange("addr", addr, 0, 65535);
    const suffix = flag === undefined ? "" : `,${flag}`;
    if (flag !== undefined) assertIntegerRange("flag", flag, 0, 9);
    await this.command(`AT+REGWRITE=${addr},${normalizeHex(data)}${suffix}`);
  }

  async readRegister(addr: number, length: number, flag?: number): Promise<string> {
    assertIntegerRange("addr", addr, 0, 65535);
    assertIntegerRange("length", length, 1, 1024);
    const suffix = flag === undefined ? "" : `,${flag}`;
    if (flag !== undefined) assertIntegerRange("flag", flag, 0, 9);
    return this.getSingleValue(`AT+REGREAD=${addr},${length}${suffix}`, "REGREAD");
  }

  async setUrc(enabled: boolean, save?: boolean): Promise<void> {
    await this.command(appendSaveSuffix(`AT+CURC=${enabled ? 1 : 0}`, save));
  }

  async getUrc(): Promise<string> {
    return this.getSingleValue("AT+CURC?", "CURC");
  }

  async setBeepEnabled(enabled: boolean, save?: boolean): Promise<void> {
    await this.command(appendSaveSuffix(`AT+BEEPEN=${enabled ? 1 : 0}`, save));
  }

  async beep(count: number, onMs?: number, offMs?: number): Promise<void> {
    assertIntegerRange("count", count, 1, 65535);
    const parts = [String(count)];
    if (onMs !== undefined) {
      assertIntegerRange("onMs", onMs, 1, 65535);
      parts.push(String(onMs));
    }
    if (offMs !== undefined) {
      assertIntegerRange("offMs", offMs, 1, 65535);
      parts.push(String(offMs));
    }

    await this.command(`AT+BEEP=${parts.join(",")}`);
  }

  async setBaudRate(baudRate: number): Promise<void> {
    const supported = [4800, 9600, 14400, 19200, 28800, 38400, 57600, 115200, 230400, 460800, 921600];
    if (!supported.includes(baudRate)) {
      throw new RangeError(`baudRate must be one of ${supported.join(", ")}`);
    }

    await this.command(`AT+IPR=${baudRate}`);
  }

  async setDiy(mode: DiyMode, template: string, save?: boolean): Promise<void> {
    assertIntegerRange("mode", mode, 0, 2);
    if (template.length > 100) {
      throw new RangeError("template must be 100 characters or shorter");
    }

    await this.command(appendSaveSuffix(`AT+DIY=${mode},${template}`, save));
  }

  async getDiy(): Promise<string> {
    return this.getSingleValue("AT+DIY?", "DIY");
  }

  async setKeyboardMode(mode: KeyboardMode, save?: boolean): Promise<void> {
    assertIntegerRange("mode", mode, 0, 5);
    await this.command(`AT+KMODE=${mode}${save ? "&" : ""}`);
  }

  async getKeyboardMode(): Promise<string[]> {
    const response = await this.command("AT+KMODE?");
    return response.dataLines;
  }

  async setKeyboardEnabled(enabled: boolean): Promise<void> {
    await this.command(`AT+KBDEN=${enabled ? 1 : 0}`);
  }

  async getKeyboardEnabled(): Promise<string> {
    return this.getSingleValue("AT+KBDEN?", "KBDEN");
  }

  async keyboard(text: string, enter = false): Promise<void> {
    const payload = enter ? `${text}\\r` : text;
    if (payload.length === 0) {
      throw new TypeError("text must not be empty");
    }

    await this.command(`AT+KBD=${payload}`);
  }

  async saveAndRestart(): Promise<void> {
    await this.command("AT&W");
  }

  async factoryReset(): Promise<void> {
    await this.command("AT&F");
  }

  private async getSingleValue(command: string, prefix: string, options?: CommandOptions): Promise<string> {
    const response = await this.command(command, options);
    return getRequiredPrefixedValue(response.dataLines, prefix);
  }

  private oneByteHex(name: string, value: string | number): string {
    if (typeof value === "number") {
      assertIntegerRange(name, value, 0, 255);
      return value.toString(16).padStart(2, "0").toUpperCase();
    }

    return normalizeHex(value, { bytes: 1 });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.catch(() => undefined).then(task);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private startReader(): void {
    if (this.reading) return;

    this.reading = true;
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    try {
      while (!this.closed) {
        const chunk = await this.transport.read();
        if (chunk.length === 0) continue;
        this.consumeText(this.decoder.decode(chunk, { stream: true }));
      }
    } catch (error) {
      if (!this.closed) {
        const connectionError = this.invalidateConnection(error);
        this.emit("error", connectionError);
        if (this.pending) {
          clearTimeout(this.pending.timer);
          this.pending.reject(connectionError);
          this.pending = undefined;
        }
      }
    } finally {
      this.reading = false;
    }
  }

  private consumeText(text: string): void {
    this.readBuffer += text;

    for (;;) {
      const newlineIndex = this.readBuffer.indexOf("\n");
      if (newlineIndex === -1) return;

      const line = this.readBuffer.slice(0, newlineIndex).replace(/\r$/, "").trim();
      this.readBuffer = this.readBuffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        this.handleLine(line);
      }
    }
  }

  private handleLine(line: string): void {
    this.emit("line", line);

    if (!this.pending) {
      if (line.startsWith("+")) {
        this.emit("urc", line);
      }
      return;
    }

    if (line === "OK") {
      const pending = this.pending;
      this.pending = undefined;
      clearTimeout(pending.timer);
      const lines = [...pending.lines, line];
      pending.resolve({
        command: pending.command,
        lines,
        dataLines: pending.lines,
        raw: lines.join("\r\n")
      });
      return;
    }

    const cmeMatch = /^\+CME ERROR:([0-9A-Fa-f]+)$/.exec(line);
    if (cmeMatch) {
      const pending = this.pending;
      this.pending = undefined;
      clearTimeout(pending.timer);
      pending.reject(new AtNfcCmeError(cmeMatch[1] ?? "", pending.command, [...pending.lines, line]));
      return;
    }

    pendingPush(this.pending, line);
  }

  private emit<K extends keyof AtNfcEventMap>(eventName: K, value: AtNfcEventMap[K]): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners) return;

    for (const listener of listeners) {
      listener(value);
    }
  }

  private assertConnectionUsable(): void {
    if (this.connectionError) {
      throw new Error("ATNFC connection is no longer synchronized. Close and reopen the client before sending more commands.", {
        cause: this.connectionError
      });
    }
  }

  private invalidateConnection(error: unknown): Error {
    const connectionError = error instanceof Error ? error : new Error(String(error));
    this.connectionError = connectionError;
    this.closed = true;
    this.opened = false;
    this.opening = undefined;
    void this.transport.close?.().catch((closeError: unknown) => this.emit("error", closeError));
    return connectionError;
  }
}

function pendingPush(pending: PendingCommand, line: string): void {
  if (line !== pending.command) {
    pending.lines.push(line);
  }
}
