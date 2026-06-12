import type { CardTypeName, FindCardResult, SetSysConfigOptions, SysConfig } from "./types";

const CARD_TYPE_NAMES: Record<string, CardTypeName> = {
  "00": "none",
  "01": "mifare-classic",
  "02": "ntag21x",
  "03": "iso14443a-cpu",
  "04": "iso14443b-cpu",
  "05": "iso15693",
  "06": "felica",
  "07": "desfire",
  "08": "type-1-tag"
};

export function cardTypeName(type: string): CardTypeName {
  return CARD_TYPE_NAMES[type.toUpperCase()] ?? "unknown";
}

export function assertIntegerRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
}

export interface HexOptions {
  bytes?: number;
  minBytes?: number;
  maxBytes?: number;
  allowEmpty?: boolean;
}

export function normalizeHex(value: string | Uint8Array, options: HexOptions = {}): string {
  const hex = typeof value === "string" ? value.replace(/[^0-9a-fA-F]/g, "").toUpperCase() : bytesToHex(value);

  if (hex.length === 0 && !options.allowEmpty) {
    throw new TypeError("HEX value must not be empty");
  }

  if (hex.length % 2 !== 0) {
    throw new TypeError("HEX value must contain an even number of characters");
  }

  const byteLength = hex.length / 2;

  if (options.bytes !== undefined && byteLength !== options.bytes) {
    throw new RangeError(`HEX value must be exactly ${options.bytes} byte(s)`);
  }

  if (options.minBytes !== undefined && byteLength < options.minBytes) {
    throw new RangeError(`HEX value must be at least ${options.minBytes} byte(s)`);
  }

  if (options.maxBytes !== undefined && byteLength > options.maxBytes) {
    throw new RangeError(`HEX value must be at most ${options.maxBytes} byte(s)`);
  }

  return hex;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function parsePrefixedValue(line: string, prefix: string): string | undefined {
  const normalizedPrefix = prefix.startsWith("+") ? prefix : `+${prefix}`;
  const expected = `${normalizedPrefix}:`;
  if (!line.toUpperCase().startsWith(expected.toUpperCase())) {
    return undefined;
  }

  return line.slice(expected.length).trim();
}

export function getRequiredPrefixedValue(lines: string[], prefix: string): string {
  for (const line of lines) {
    const value = parsePrefixedValue(line, prefix);
    if (value !== undefined) {
      return value;
    }
  }

  throw new Error(`Response does not contain ${prefix}`);
}

export function parseFindPayload(payload: string): FindCardResult {
  const [uidRaw, typeRaw, ...extra] = payload.split(",").map((item) => item.trim());
  if (!uidRaw || !typeRaw) {
    throw new Error(`Invalid +FIND payload: ${payload}`);
  }

  const type = typeRaw.toUpperCase();
  const result: FindCardResult = {
    uid: uidRaw.toUpperCase(),
    type,
    typeName: cardTypeName(type),
    extra
  };

  if (["01", "02", "08"].includes(type)) {
    assignIfPresent(result, "sak", extra[0]);
    assignIfPresent(result, "atqa", extra[1]);
  } else if (["03", "07"].includes(type)) {
    assignIfPresent(result, "sak", extra[0]);
    assignIfPresent(result, "atqa", extra[1]);
    assignIfPresent(result, "atr", extra[2]);
  } else if (type === "04") {
    assignIfPresent(result, "atqb", extra[0]);
  } else if (type === "05") {
    assignIfPresent(result, "afi", extra[0]);
    assignIfPresent(result, "dsfid", extra[1]);
  } else if (type === "06") {
    assignIfPresent(result, "pmm", extra[0]);
    assignIfPresent(result, "systemCode", extra[1]);
  }

  return result;
}

export function parseSysConfig(payload: string): SysConfig {
  const hex = normalizeHex(payload, { minBytes: 6, maxBytes: 9 });
  const bytes = hex.match(/../g)?.map((part) => Number.parseInt(part, 16)) ?? [];
  const config: SysConfig = {
    baudRateIndex: requiredByte(bytes, 0),
    lowPowerSearchIntervalLow: requiredByte(bytes, 1),
    autoSearchInterval10Ms: requiredByte(bytes, 2),
    searchCardParameter: requiredByte(bytes, 3),
    autoSearchEnabled: requiredByte(bytes, 4) !== 0,
    lowPowerEnabled: requiredByte(bytes, 5) !== 0,
    raw: hex
  };

  if (bytes[6] !== undefined) config.beepEnabled = bytes[6] !== 0;
  if (bytes[7] !== undefined) config.cardFilter = bytes[7];
  if (bytes[8] !== undefined) config.urcEnabled = bytes[8] !== 0;

  return config;
}

export function encodeSysConfig(config: SetSysConfigOptions): string {
  assertIntegerRange("baudRateIndex", config.baudRateIndex, 1, 11);
  assertIntegerRange("lowPowerSearchIntervalLow", config.lowPowerSearchIntervalLow, 0, 255);
  assertIntegerRange("autoSearchInterval10Ms", config.autoSearchInterval10Ms, 0, 255);
  assertIntegerRange("searchCardParameter", config.searchCardParameter, 0, 255);

  const bytes = [
    config.baudRateIndex,
    config.lowPowerSearchIntervalLow,
    config.autoSearchInterval10Ms,
    config.searchCardParameter,
    config.autoSearchEnabled ? 0xff : 0x00,
    config.lowPowerEnabled ? 0xff : 0x00
  ];

  if (
    config.beepEnabled !== undefined ||
    config.cardFilter !== undefined ||
    config.urcEnabled !== undefined
  ) {
    bytes.push(config.beepEnabled ? 0x01 : 0x00);
  }

  if (config.cardFilter !== undefined || config.urcEnabled !== undefined) {
    const cardFilter = config.cardFilter ?? 0xff;
    assertIntegerRange("cardFilter", cardFilter, 0, 255);
    bytes.push(cardFilter);
  }

  if (config.urcEnabled !== undefined) {
    bytes.push(config.urcEnabled ? 0x01 : 0x00);
  }

  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function appendSaveSuffix(command: string, save?: boolean): string {
  return save ? `${command}&W` : command;
}

function requiredByte(bytes: number[], index: number): number {
  const value = bytes[index];
  if (value === undefined) {
    throw new Error(`Missing byte ${index}`);
  }
  return value;
}

function assignIfPresent<T extends object, K extends keyof T>(target: T, key: K, value: string | undefined): void {
  if (value !== undefined && value !== "") {
    target[key] = value.toUpperCase() as T[K];
  }
}
