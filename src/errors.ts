export const CME_ERROR_MESSAGES: Record<string, string> = {
  "03": "Parameter error",
  "04": "Unknown command",
  E0: "Card type error",
  E1: "Card not found",
  E2: "Key authentication failed",
  E3: "Read failed",
  E4: "Write failed",
  E5: "APDU execution failed",
  E6: "Exchange execution failed",
  E7: "HEX format error",
  E9: "EEPROM write failed",
  EB: "DIY buffer is too large",
  EC: "HID keyboard output is busy"
};

export class AtNfcError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AtNfcError";
  }
}

export class AtNfcCmeError extends AtNfcError {
  readonly code: string;
  readonly command: string;
  readonly responseLines: string[];

  constructor(code: string, command: string, responseLines: string[]) {
    const normalizedCode = code.toUpperCase();
    const label = CME_ERROR_MESSAGES[normalizedCode] ?? "Module returned an error";
    super(`${label} (+CME ERROR:${normalizedCode}) while running ${command}`);
    this.name = "AtNfcCmeError";
    this.code = normalizedCode;
    this.command = command;
    this.responseLines = responseLines;
  }
}

export class AtNfcTimeoutError extends AtNfcError {
  readonly command: string;
  readonly timeoutMs: number;

  constructor(command: string, timeoutMs: number) {
    super(`Timed out after ${timeoutMs} ms while running ${command}`);
    this.name = "AtNfcTimeoutError";
    this.command = command;
    this.timeoutMs = timeoutMs;
  }
}
