import type { AtNfcTransport } from "./types";

export interface WebSerialRequestOptions {
  filters?: Array<{
    usbVendorId?: number;
    usbProductId?: number;
  }>;
}

export interface WebSerialOpenOptions {
  baudRate?: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  bufferSize?: number;
  flowControl?: "none" | "hardware";
}

export interface WebSerialPortLike {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: Required<Pick<WebSerialOpenOptions, "baudRate">> & Omit<WebSerialOpenOptions, "baudRate">): Promise<void>;
  close(): Promise<void>;
}

export interface WebSerialLike {
  requestPort(options?: WebSerialRequestOptions): Promise<WebSerialPortLike>;
  getPorts(): Promise<WebSerialPortLike[]>;
}

export class WebSerialTransport implements AtNfcTransport {
  readonly port: WebSerialPortLike;
  readonly openOptions: WebSerialOpenOptions;

  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private closing: Promise<void> | undefined;
  private isOpen = false;

  constructor(port: WebSerialPortLike, openOptions: WebSerialOpenOptions = {}) {
    this.port = port;
    this.openOptions = openOptions;
  }

  static isSupported(): boolean {
    return getSerial() !== undefined;
  }

  static async requestPort(
    requestOptions?: WebSerialRequestOptions,
    openOptions?: WebSerialOpenOptions
  ): Promise<WebSerialTransport> {
    const serial = getSerial();
    if (!serial) {
      throw new Error("Web Serial API is not available in this browser");
    }

    const port = await serial.requestPort(requestOptions);
    return new WebSerialTransport(port, openOptions);
  }

  static async getPorts(openOptions?: WebSerialOpenOptions): Promise<WebSerialTransport[]> {
    const serial = getSerial();
    if (!serial) return [];

    const ports = await serial.getPorts();
    return ports.map((port) => new WebSerialTransport(port, openOptions));
  }

  async open(): Promise<void> {
    if (this.isOpen) return;
    if (this.closing) await this.closing;

    const options: Required<Pick<WebSerialOpenOptions, "baudRate">> & Omit<WebSerialOpenOptions, "baudRate"> = {
      baudRate: this.openOptions.baudRate ?? 115200
    };

    if (this.openOptions.dataBits !== undefined) options.dataBits = this.openOptions.dataBits;
    if (this.openOptions.stopBits !== undefined) options.stopBits = this.openOptions.stopBits;
    if (this.openOptions.parity !== undefined) options.parity = this.openOptions.parity;
    if (this.openOptions.bufferSize !== undefined) options.bufferSize = this.openOptions.bufferSize;
    if (this.openOptions.flowControl !== undefined) options.flowControl = this.openOptions.flowControl;

    await this.port.open(options);

    this.isOpen = true;
  }

  async close(): Promise<void> {
    if (this.closing) return this.closing;

    this.closing = this.closeInner();
    try {
      await this.closing;
    } finally {
      this.closing = undefined;
    }
  }

  private async closeInner(): Promise<void> {
    if (this.reader) {
      const reader = this.reader;
      this.reader = undefined;
      await reader.cancel().catch(() => undefined);
      try {
        reader.releaseLock();
      } catch {
        // The read loop may have released the lock after observing stream closure.
      }
    }

    if (this.isOpen) {
      await this.port.close();
      this.isOpen = false;
    }
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.port.writable) {
      throw new Error("Serial port is not writable");
    }

    const writer = this.port.writable.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }

  async read(): Promise<Uint8Array> {
    if (!this.port.readable) {
      throw new Error("Serial port is not readable");
    }

    this.reader ??= this.port.readable.getReader();
    const { value, done } = await this.reader.read();
    if (done) {
      this.reader.releaseLock();
      this.reader = undefined;
      this.isOpen = false;
      throw new Error("Serial port stream closed");
    }

    return value ?? new Uint8Array();
  }
}

function getSerial(): WebSerialLike | undefined {
  const maybeNavigator = globalThis.navigator as (Navigator & { serial?: WebSerialLike }) | undefined;
  return maybeNavigator?.serial;
}
