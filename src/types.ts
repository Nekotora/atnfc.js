export interface AtNfcTransport {
  open?(): Promise<void>;
  close?(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  read(): Promise<Uint8Array>;
}

export interface AtNfcClientOptions {
  timeoutMs?: number;
  lineEnding?: "crlf" | "lf";
  autoOpen?: boolean;
}

export interface CommandOptions {
  timeoutMs?: number;
}

export interface AtCommandResponse {
  command: string;
  lines: string[];
  dataLines: string[];
  raw: string;
}

export type AtNfcEventName = "line" | "urc" | "close" | "error";

export type AtNfcEventMap = {
  line: string;
  urc: string;
  close: void;
  error: unknown;
};

export type CardTypeCode =
  | "00"
  | "01"
  | "02"
  | "03"
  | "04"
  | "05"
  | "06"
  | "07"
  | "08"
  | string;

export type CardTypeName =
  | "none"
  | "mifare-classic"
  | "ntag21x"
  | "iso14443a-cpu"
  | "iso14443b-cpu"
  | "iso15693"
  | "felica"
  | "desfire"
  | "type-1-tag"
  | "unknown";

export interface FindCardResult {
  uid: string;
  type: CardTypeCode;
  typeName: CardTypeName;
  sak?: string;
  atqa?: string;
  atr?: string;
  atqb?: string;
  afi?: string;
  dsfid?: string;
  pmm?: string;
  systemCode?: string;
  extra: string[];
}

export interface SysConfig {
  baudRateIndex: number;
  lowPowerSearchIntervalLow: number;
  autoSearchInterval10Ms: number;
  searchCardParameter: number;
  autoSearchEnabled: boolean;
  lowPowerEnabled: boolean;
  beepEnabled?: boolean;
  cardFilter?: number;
  urcEnabled?: boolean;
  raw: string;
}

export interface SetSysConfigOptions {
  baudRateIndex: number;
  lowPowerSearchIntervalLow: number;
  autoSearchInterval10Ms: number;
  searchCardParameter: number;
  autoSearchEnabled: boolean;
  lowPowerEnabled: boolean;
  beepEnabled?: boolean;
  cardFilter?: number;
  urcEnabled?: boolean;
  save?: boolean;
}

export type KeyType = "A" | "B";

export type NdefTarget = "auto" | "ntag" | "m1" | "iso15693";

export interface NtagNdefReadOptions {
  startPage?: number;
  pages?: number;
}

export interface NtagNdefWriteOptions {
  startPage?: number;
}

export interface MifareClassicNdefReadOptions {
  startBlock?: number;
  blocks?: number;
  keyType?: KeyType;
  keys?: Array<string | Uint8Array>;
}

export interface MifareClassicNdefWriteOptions {
  startBlock?: number;
  maxBlocks?: number;
  keyType?: KeyType;
  key?: string | Uint8Array;
  keys?: Array<string | Uint8Array>;
  mode?: "preserve" | "format" | "auto";
  formatBeforeWrite?: boolean;
  format?: MifareClassicNdefFormatOptions;
}

export interface MifareClassicNdefFormatOptions {
  keyType?: KeyType;
  keys?: Array<string | Uint8Array>;
  madKey?: string | Uint8Array;
  ndefKey?: string | Uint8Array;
  keyB?: string | Uint8Array;
  ndefSectors?: number;
}

export interface Iso15693NdefReadOptions {
  startBlock?: number;
  blocks?: number;
  blockSize?: number;
}

export interface Iso15693NdefWriteOptions {
  startBlock?: number;
  maxBlocks?: number;
  blockSize?: number;
  mode?: "preserve" | "format" | "auto";
  featureFlags?: number;
  cc?: string | Uint8Array;
}

export interface NdefReadOptions {
  target?: NdefTarget;
  card?: FindCardResult;
  findFilter?: number;
  ntag?: NtagNdefReadOptions;
  m1?: MifareClassicNdefReadOptions;
  iso15693?: Iso15693NdefReadOptions;
}

export interface NdefWriteOptions {
  target?: NdefTarget;
  card?: FindCardResult;
  findFilter?: number;
  ntag?: NtagNdefWriteOptions;
  m1?: MifareClassicNdefWriteOptions;
  iso15693?: Iso15693NdefWriteOptions;
}

export interface ExchangeOptions {
  crc?: boolean;
  fwi?: number;
}

export type ProtocolChannel = "CEXCHANGE" | "MIFARE" | "ULTRALIGHT" | "ISO15693" | "FELICA";

export type DiyMode = 0 | 1 | 2;

export type KeyboardMode = 0 | 1 | 2 | 3 | 4 | 5;

export interface InfoResult {
  manufacturer: string;
  firmware: string;
  model: string;
  serialNumber: string;
}
