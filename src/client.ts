import { AtNfcCmeError, AtNfcTimeoutError } from "./errors";
import {
  decodeType2TagTlv,
  encodeNdefMessage,
  encodeTextRecord,
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
  MifareClassicNdefFormatOptions,
  MifareClassicNdefReadOptions,
  MifareClassicNdefWriteOptions,
  NdefReadOptions,
  NdefTarget,
  NdefWriteOptions,
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

const M1_NDEF_PUBLIC_KEY = "D3F7D3F7D3F7";
const M1_DEFAULT_KEY = "FFFFFFFFFFFF";
const M1_MAD_PUBLIC_KEY = "A0A1A2A3A4A5";
const M1_DEFAULT_NDEF_START_BLOCK = 4;
const M1_DEFAULT_NDEF_BLOCKS = 45;
const M1_BLOCK_SIZE = 16;
const M1_NDEF_TRAILER_ACCESS = "7F078840";
const M1_MAD_TRAILER_ACCESS = "787788C1";

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

  async readNdefFromM1(options: MifareClassicNdefReadOptions = {}): Promise<DecodedNdefRecord[]> {
    const startBlock = options.startBlock ?? M1_DEFAULT_NDEF_START_BLOCK;
    const blocks = options.blocks ?? M1_DEFAULT_NDEF_BLOCKS;
    const keyType = this.normalizeKeyType(options.keyType ?? "A");
    const keys = this.normalizeM1NdefReadKeys(options.keys);

    assertIntegerRange("startBlock", startBlock, 0, 255);
    assertIntegerRange("blocks", blocks, 1, 255);

    let data = "";
    for (const block of m1DataBlocks(startBlock, blocks)) {
      data += await this.readM1WithKeys(block, keyType, keys);
      if (hasCompleteNdefTlv(data)) {
        return decodeType2TagTlv(data);
      }
    }

    return decodeType2TagTlv(data);
  }

  async writeNdefToM1(records: NdefRecord[], options: MifareClassicNdefWriteOptions = {}): Promise<void> {
    const startBlock = options.startBlock ?? M1_DEFAULT_NDEF_START_BLOCK;
    const maxBlocks = options.maxBlocks ?? M1_DEFAULT_NDEF_BLOCKS;
    const keyType = this.normalizeKeyType(options.keyType ?? "A");
    const keys = this.normalizeM1NdefWriteKeys(options);
    const message = encodeNdefMessage(records);
    const tlv = padToPageBoundary(prefixM1NdefTlv(encodeType2TagTlv(message)), M1_BLOCK_SIZE);
    const neededBlocks = tlv.length / M1_BLOCK_SIZE;

    assertIntegerRange("startBlock", startBlock, 0, 255);
    assertIntegerRange("maxBlocks", maxBlocks, 1, 255);
    if (neededBlocks > maxBlocks) {
      throw new RangeError(`NDEF message needs ${neededBlocks} M1 block(s), but maxBlocks is ${maxBlocks}`);
    }

    const mode = options.mode ?? (options.formatBeforeWrite ? "format" : "preserve");
    if (mode === "format" || (mode === "auto" && !(await this.isM1NdefFormatted({ keyType, keys })))) {
      await this.formatM1Ndef({
        keyType,
        keys,
        ndefKey: keys[0] ?? M1_NDEF_PUBLIC_KEY,
        ...options.format
      });
    }

    const blocks = m1DataBlocks(startBlock, neededBlocks);
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index]!;
      const chunk = tlv.slice(index * M1_BLOCK_SIZE, (index + 1) * M1_BLOCK_SIZE);
      await this.writeM1WithKeys(block, chunk, keyType, keys);
    }
  }

  async formatM1Ndef(options: MifareClassicNdefFormatOptions = {}): Promise<void> {
    const keyType = this.normalizeKeyType(options.keyType ?? "A");
    const keys = this.normalizeM1NdefFormatKeys(options.keys);
    const madKey = normalizeHex(options.madKey ?? M1_MAD_PUBLIC_KEY, { bytes: 6 });
    const ndefKey = normalizeHex(options.ndefKey ?? M1_NDEF_PUBLIC_KEY, { bytes: 6 });
    const keyB = normalizeHex(options.keyB ?? M1_DEFAULT_KEY, { bytes: 6 });
    const ndefSectors = options.ndefSectors ?? 15;
    const emptyFirstBlock = hexToByteArray("00000300FE0000000000000000000000");
    const emptyBlock = new Uint8Array(M1_BLOCK_SIZE);

    assertIntegerRange("ndefSectors", ndefSectors, 1, 15);

    await this.writeM1WithKeys(1, m1Mad1Block(ndefSectors), keyType, keys);
    await this.writeM1WithKeys(2, m1Mad2Block(ndefSectors), keyType, keys);

    for (let sector = 1; sector <= ndefSectors; sector += 1) {
      const firstBlock = sector * 4;
      for (let offset = 0; offset < 3; offset += 1) {
        const data = sector === 1 && offset === 0 ? emptyFirstBlock : emptyBlock;
        await this.writeM1WithKeys(firstBlock + offset, data, keyType, keys);
      }

      await this.writeM1WithKeys(
        firstBlock + 3,
        hexToByteArray(`${ndefKey}${M1_NDEF_TRAILER_ACCESS}${keyB}`),
        keyType,
        keys
      );
    }

    await this.writeM1WithKeys(3, hexToByteArray(`${madKey}${M1_MAD_TRAILER_ACCESS}${keyB}`), keyType, keys);
  }

  async isM1NdefFormatted(options: MifareClassicNdefReadOptions = {}): Promise<boolean> {
    const keyType = this.normalizeKeyType(options.keyType ?? "A");
    const keys = this.normalizeM1NdefReadKeys(options.keys);

    try {
      const mad1 = hexToByteArray(await this.readM1WithKeys(1, keyType, keys));
      const mad2 = hexToByteArray(await this.readM1WithKeys(2, keyType, keys));
      if (!isM1MadNdef(mad1, mad2)) return false;

      try {
        const trailer = hexToByteArray(await this.readM1WithKeys(7, keyType, keys));
        if (!isM1NdefTrailer(trailer)) return false;
      } catch (error) {
        if (!(error instanceof AtNfcCmeError && error.code === "E3")) {
          throw error;
        }
      }

      const firstData = hexToByteArray(await this.readM1WithKeys(M1_DEFAULT_NDEF_START_BLOCK, keyType, keys));
      return hasM1NdefTlvPrefix(firstData);
    } catch (error) {
      if (error instanceof AtNfcCmeError && error.code === "E2") {
        return false;
      }
      throw error;
    }
  }

  async readNdef(options: NdefReadOptions = {}): Promise<DecodedNdefRecord[]> {
    const target = await this.resolveNdefTarget(options.target, options.card, options.findFilter);
    if (target === "ntag") {
      return this.readNdefFromNtag(options.ntag?.startPage, options.ntag?.pages);
    }
    if (target === "m1") {
      return this.readNdefFromM1(options.m1);
    }

    throw new Error(`NDEF is not supported for card type ${target}`);
  }

  async writeNdef(records: NdefRecord[], options: NdefWriteOptions = {}): Promise<void> {
    const target = await this.resolveNdefTarget(options.target, options.card, options.findFilter);
    if (target === "ntag") {
      await this.writeNdefToNtag(records, options.ntag?.startPage);
      return;
    }
    if (target === "m1") {
      await this.writeNdefToM1(records, options.m1);
      return;
    }

    throw new Error(`NDEF is not supported for card type ${target}`);
  }

  async writeText(text: string, options?: NdefWriteOptions): Promise<void>;
  async writeText(text: string, language: string, options?: NdefWriteOptions): Promise<void>;
  async writeText(text: string, optionsOrLanguage?: NdefWriteOptions | string, options?: NdefWriteOptions): Promise<void> {
    const language = typeof optionsOrLanguage === "string" ? optionsOrLanguage : undefined;
    const writeOptions = typeof optionsOrLanguage === "string" ? options : optionsOrLanguage;
    await this.writeNdef([encodeTextRecord(text, language)], writeOptions);
  }

  async writeUrl(url: string, options?: NdefWriteOptions): Promise<void> {
    await this.writeNdef([encodeUriRecord(url)], options);
  }

  async writeWifi(network: WifiNetwork, options?: NdefWriteOptions): Promise<void> {
    await this.writeNdef([encodeWifiRecord(network)], options);
  }

  async writeVCard(contact: VCardContact, options?: NdefWriteOptions): Promise<void> {
    await this.writeNdef([encodeVCardRecord(contact)], options);
  }

  async writeUrlToNtag(url: string, startPage = 4): Promise<void> {
    await this.writeNdefToNtag([encodeUriRecord(url)], startPage);
  }

  async writeUrlToM1(url: string, options?: MifareClassicNdefWriteOptions): Promise<void> {
    await this.writeNdefToM1([encodeUriRecord(url)], options);
  }

  async writeWifiToNtag(network: WifiNetwork, startPage = 4): Promise<void> {
    await this.writeNdefToNtag([encodeWifiRecord(network)], startPage);
  }

  async writeWifiToM1(network: WifiNetwork, options?: MifareClassicNdefWriteOptions): Promise<void> {
    await this.writeNdefToM1([encodeWifiRecord(network)], options);
  }

  async writeVCardToNtag(contact: VCardContact, startPage = 4): Promise<void> {
    await this.writeNdefToNtag([encodeVCardRecord(contact)], startPage);
  }

  async writeVCardToM1(contact: VCardContact, options?: MifareClassicNdefWriteOptions): Promise<void> {
    await this.writeNdefToM1([encodeVCardRecord(contact)], options);
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

  private normalizeKeyType(keyType: KeyType): KeyType {
    const normalized = keyType.toUpperCase() as KeyType;
    if (normalized !== "A" && normalized !== "B") {
      throw new TypeError("keyType must be A or B");
    }

    return normalized;
  }

  private normalizeM1NdefReadKeys(keys: Array<string | Uint8Array> | undefined): string[] {
    const values = keys && keys.length > 0 ? keys : [M1_NDEF_PUBLIC_KEY, M1_DEFAULT_KEY];
    return values.map((key) => normalizeHex(key, { bytes: 6 }));
  }

  private normalizeM1NdefWriteKeys(options: MifareClassicNdefWriteOptions): string[] {
    if (options.keys && options.keys.length > 0) {
      return options.keys.map((key) => normalizeHex(key, { bytes: 6 }));
    }
    if (options.key) {
      return [normalizeHex(options.key, { bytes: 6 }), M1_DEFAULT_KEY];
    }
    return [M1_NDEF_PUBLIC_KEY, M1_DEFAULT_KEY];
  }

  private normalizeM1NdefFormatKeys(keys: Array<string | Uint8Array> | undefined): string[] {
    const values = keys && keys.length > 0 ? keys : [M1_DEFAULT_KEY, M1_NDEF_PUBLIC_KEY, M1_MAD_PUBLIC_KEY];
    return values.map((key) => normalizeHex(key, { bytes: 6 }));
  }

  private async readM1WithKeys(block: number, keyType: KeyType, keys: string[]): Promise<string> {
    let authenticationError: unknown;

    for (const key of keys) {
      try {
        await this.authenticateM1(block, keyType, key);
        return this.readM1(block);
      } catch (error) {
        if (error instanceof AtNfcCmeError && error.code === "E2") {
          authenticationError = error;
          continue;
        }
        throw error;
      }
    }

    throw authenticationError ?? new Error(`Unable to authenticate M1 block ${block}`);
  }

  private async writeM1WithKeys(block: number, data: Uint8Array, keyType: KeyType, keys: string[]): Promise<void> {
    let authenticationError: unknown;

    for (const key of keys) {
      try {
        await this.authenticateM1(block, keyType, key);
        await this.writeM1(block, data);
        return;
      } catch (error) {
        if (error instanceof AtNfcCmeError && error.code === "E2") {
          authenticationError = error;
          continue;
        }
        throw error;
      }
    }

    throw authenticationError ?? new Error(`Unable to authenticate M1 block ${block}`);
  }

  private async resolveNdefTarget(
    target: NdefTarget | undefined,
    card: FindCardResult | undefined,
    findFilter: number | undefined
  ): Promise<"ntag" | "m1" | string> {
    const requested = target ?? "auto";
    if (requested !== "auto") return requested;

    const found = card ?? await this.findCard(findFilter ?? 31);
    if (found.typeName === "ntag21x") return "ntag";
    if (found.typeName === "mifare-classic") return "m1";
    return found.typeName;
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

function m1DataBlocks(startBlock: number, count: number): number[] {
  const blocks: number[] = [];
  let block = startBlock;

  while (blocks.length < count) {
    if (block > 255) {
      throw new RangeError("M1 block range must not exceed block 255");
    }
    if (!isM1SectorTrailerBlock(block)) {
      blocks.push(block);
    }
    block += 1;
  }

  return blocks;
}

function isM1SectorTrailerBlock(block: number): boolean {
  const sector = block < 128 ? Math.floor(block / 4) : 32 + Math.floor((block - 128) / 16);
  const firstBlock = sector < 32 ? sector * 4 : 128 + (sector - 32) * 16;
  const blockCount = sector < 32 ? 4 : 16;
  return block === firstBlock + blockCount - 1;
}

function m1Mad1Block(ndefSectors: number): Uint8Array {
  const bytes = new Uint8Array(M1_BLOCK_SIZE);
  bytes[1] = 0x01;
  for (let sector = 1; sector <= Math.min(ndefSectors, 7); sector += 1) {
    const offset = sector * 2;
    bytes[offset] = 0x03;
    bytes[offset + 1] = 0xe1;
  }
  bytes[0] = mifareMadCrc8(bytes.slice(1));

  return bytes;
}

function isM1MadNdef(mad1: Uint8Array, mad2: Uint8Array): boolean {
  if (mad1.length !== M1_BLOCK_SIZE || mad2.length !== M1_BLOCK_SIZE) return false;
  if (mad1[0] !== mifareMadCrc8(mad1.slice(1))) return false;

  for (let sector = 1; sector <= 7; sector += 1) {
    const offset = sector * 2;
    if (mad1[offset] !== 0x03 || mad1[offset + 1] !== 0xe1) return false;
  }

  return true;
}

function m1Mad2Block(ndefSectors: number): Uint8Array {
  const bytes = new Uint8Array(M1_BLOCK_SIZE);
  for (let sector = 8; sector <= ndefSectors; sector += 1) {
    const offset = (sector - 8) * 2;
    bytes[offset] = 0x03;
    bytes[offset + 1] = 0xe1;
  }

  return bytes;
}

function isM1NdefTrailer(trailer: Uint8Array): boolean {
  return (
    trailer.length === M1_BLOCK_SIZE &&
    bytesToHexLocal(trailer.slice(6, 10)) === M1_NDEF_TRAILER_ACCESS
  );
}

function hasM1NdefTlvPrefix(block: Uint8Array): boolean {
  if (block.length < 5) return false;
  return block[0] === 0x00 && block[1] === 0x00 && (block[2] === 0x03 || block[2] === 0xfe);
}

function mifareMadCrc8(data: Uint8Array): number {
  let crc = 0xc7;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const msb = crc & 0x80;
      crc = (crc << 1) & 0xff;
      if (msb) crc ^= 0x1d;
    }
  }

  return crc;
}

function bytesToHexLocal(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function prefixM1NdefTlv(tlv: Uint8Array): Uint8Array {
  const output = new Uint8Array(tlv.length + 2);
  output.set(tlv, 2);
  return output;
}

function hasCompleteNdefTlv(hex: string): boolean {
  const bytes = hexToByteArray(hex);
  let offset = 0;

  while (offset < bytes.length) {
    const type = bytes[offset++];
    if (type === undefined) return false;
    if (type === 0x00) continue;
    if (type === 0xfe) return false;

    const firstLength = bytes[offset++];
    if (firstLength === undefined) return false;

    let length = firstLength;
    if (firstLength === 0xff) {
      const high = bytes[offset++];
      const low = bytes[offset++];
      if (high === undefined || low === undefined) return false;
      length = (high << 8) | low;
    }

    if (type === 0x03) {
      return offset + length <= bytes.length;
    }

    offset += length;
  }

  return false;
}

function hexToByteArray(hex: string): Uint8Array {
  const normalized = normalizeHex(hex);
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
