import { bytesToHex, normalizeHex } from "./utils";

export type NdefTnf = 0x00 | 0x01 | 0x02 | 0x03 | 0x04 | 0x05 | 0x06 | 0x07;

export interface NdefRecord {
  tnf: NdefTnf;
  type: Uint8Array;
  payload: Uint8Array;
  id?: Uint8Array;
}

export interface DecodedNdefRecord extends NdefRecord {
  typeText: string;
  text?: string;
  language?: string;
  uri?: string;
  mimeType?: string;
  vcard?: string;
  wifi?: WifiNetwork;
}

export interface WifiNetwork {
  ssid: string;
  authentication?: "OPEN" | "WPA" | "WPA2" | "WPA3" | "WEP";
  encryption?: "NONE" | "TKIP" | "AES" | "WEP";
  password?: string;
  hidden?: boolean;
}

export interface VCardContact {
  name: string;
  organization?: string;
  title?: string;
  phone?: string;
  email?: string;
  url?: string;
  note?: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const URI_PREFIXES = [
  "",
  "http://www.",
  "https://www.",
  "http://",
  "https://",
  "tel:",
  "mailto:",
  "ftp://anonymous:anonymous@",
  "ftp://ftp.",
  "ftps://",
  "sftp://",
  "smb://",
  "nfs://",
  "ftp://",
  "dav://",
  "news:",
  "telnet://",
  "imap:",
  "rtsp://",
  "urn:",
  "pop:",
  "sip:",
  "sips:",
  "tftp:",
  "btspp://",
  "btl2cap://",
  "btgoep://",
  "tcpobex://",
  "irdaobex://",
  "file://",
  "urn:epc:id:",
  "urn:epc:tag:",
  "urn:epc:pat:",
  "urn:epc:raw:",
  "urn:epc:",
  "urn:nfc:"
];

export function encodeNdefMessage(records: NdefRecord[]): Uint8Array {
  if (records.length === 0) {
    throw new TypeError("NDEF message must contain at least one record");
  }

  return concatBytes(
    records.map((record, index) => encodeNdefRecord(record, index === 0, index === records.length - 1))
  );
}

export function decodeNdefMessage(data: string | Uint8Array): DecodedNdefRecord[] {
  const bytes = typeof data === "string" ? hexToBytes(data) : data;
  const records: DecodedNdefRecord[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const header = bytes[offset++];
    if (header === undefined) break;

    const shortRecord = (header & 0x10) !== 0;
    const hasId = (header & 0x08) !== 0;
    const tnf = (header & 0x07) as NdefTnf;
    const typeLength = readByte(bytes, offset++);

    let payloadLength: number;
    if (shortRecord) {
      payloadLength = readByte(bytes, offset++);
    } else {
      payloadLength = readUint32(bytes, offset);
      offset += 4;
    }

    const idLength = hasId ? readByte(bytes, offset++) : 0;
    const type = bytes.slice(offset, offset + typeLength);
    offset += typeLength;
    const id = hasId ? bytes.slice(offset, offset + idLength) : undefined;
    offset += idLength;
    const payload = bytes.slice(offset, offset + payloadLength);
    offset += payloadLength;

    records.push(decodeRecord({ tnf, type, payload, ...(id ? { id } : {}) }));

    if ((header & 0x40) !== 0) break;
  }

  return records;
}

export function encodeTextRecord(text: string, language = "en"): NdefRecord {
  const lang = encoder.encode(language);
  if (lang.length > 63) {
    throw new RangeError("NDEF text language code must be 63 bytes or shorter");
  }

  return {
    tnf: 0x01,
    type: encoder.encode("T"),
    payload: concatBytes([new Uint8Array([lang.length]), lang, encoder.encode(text)])
  };
}

export function encodeUriRecord(uri: string): NdefRecord {
  const { code, rest } = chooseUriPrefix(uri);
  return {
    tnf: 0x01,
    type: encoder.encode("U"),
    payload: concatBytes([new Uint8Array([code]), encoder.encode(rest)])
  };
}

export function encodeMimeRecord(mimeType: string, payload: string | Uint8Array): NdefRecord {
  return {
    tnf: 0x02,
    type: encoder.encode(mimeType),
    payload: typeof payload === "string" ? encoder.encode(payload) : payload
  };
}

export function encodeVCardRecord(contact: VCardContact): NdefRecord {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCard(contact.name)}`
  ];

  if (contact.organization) lines.push(`ORG:${escapeVCard(contact.organization)}`);
  if (contact.title) lines.push(`TITLE:${escapeVCard(contact.title)}`);
  if (contact.phone) lines.push(`TEL:${escapeVCard(contact.phone)}`);
  if (contact.email) lines.push(`EMAIL:${escapeVCard(contact.email)}`);
  if (contact.url) lines.push(`URL:${escapeVCard(contact.url)}`);
  if (contact.note) lines.push(`NOTE:${escapeVCard(contact.note)}`);
  lines.push("END:VCARD");

  return encodeMimeRecord("text/vcard", `${lines.join("\r\n")}\r\n`);
}

export function encodeWifiRecord(network: WifiNetwork): NdefRecord {
  const authentication = network.authentication ?? (network.password ? "WPA2" : "OPEN");
  const encryption = network.encryption ?? (network.password ? "AES" : "NONE");

  return encodeMimeRecord("application/vnd.wfa.wsc", encodeWifiSimpleConfigCredential({
    ...network,
    authentication,
    encryption
  }));
}

export function encodeType2TagTlv(message: string | Uint8Array): Uint8Array {
  const bytes = typeof message === "string" ? hexToBytes(message) : message;
  const length = bytes.length;

  if (length < 0xff) {
    return concatBytes([new Uint8Array([0x03, length]), bytes, new Uint8Array([0xfe])]);
  }

  if (length > 0xffff) {
    throw new RangeError("NDEF message is too large for a Type 2 Tag TLV length field");
  }

  return concatBytes([
    new Uint8Array([0x03, 0xff, (length >> 8) & 0xff, length & 0xff]),
    bytes,
    new Uint8Array([0xfe])
  ]);
}

export function decodeType2TagTlv(data: string | Uint8Array): DecodedNdefRecord[] {
  const message = extractNdefMessageFromType2Tag(data);
  return decodeNdefMessage(message);
}

export function extractNdefMessageFromType2Tag(data: string | Uint8Array): Uint8Array {
  const bytes = typeof data === "string" ? hexToBytes(data) : data;
  let offset = 0;

  while (offset < bytes.length) {
    const type = readByte(bytes, offset++);
    if (type === 0x00) continue;
    if (type === 0xfe) break;

    const firstLength = readByte(bytes, offset++);
    const length = firstLength === 0xff ? readUint16(bytes, offset) : firstLength;
    if (firstLength === 0xff) offset += 2;

    if (type === 0x03) {
      return bytes.slice(offset, offset + length);
    }

    offset += length;
  }

  throw new Error("No NDEF TLV found in Type 2 Tag data");
}

export function padToPageBoundary(data: Uint8Array, pageSize = 4): Uint8Array {
  const remainder = data.length % pageSize;
  if (remainder === 0) return data;

  const padded = new Uint8Array(data.length + pageSize - remainder);
  padded.set(data);
  return padded;
}

export function ndefRecordsToHex(records: NdefRecord[]): string {
  return bytesToHex(encodeNdefMessage(records));
}

export function type2TlvToHex(message: string | Uint8Array): string {
  return bytesToHex(encodeType2TagTlv(message));
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = normalizeHex(hex);
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function encodeNdefRecord(record: NdefRecord, messageBegin: boolean, messageEnd: boolean): Uint8Array {
  if (record.type.length > 255) {
    throw new RangeError("NDEF record type must be 255 bytes or shorter");
  }

  const shortRecord = record.payload.length <= 255;
  let flags = record.tnf & 0x07;
  if (messageBegin) flags |= 0x80;
  if (messageEnd) flags |= 0x40;
  if (shortRecord) flags |= 0x10;
  if (record.id) flags |= 0x08;

  const header = [flags, record.type.length];
  if (shortRecord) {
    header.push(record.payload.length);
  } else {
    header.push(
      (record.payload.length >>> 24) & 0xff,
      (record.payload.length >>> 16) & 0xff,
      (record.payload.length >>> 8) & 0xff,
      record.payload.length & 0xff
    );
  }
  if (record.id) header.push(record.id.length);

  return concatBytes([new Uint8Array(header), record.type, record.id ?? new Uint8Array(), record.payload]);
}

function decodeRecord(record: NdefRecord): DecodedNdefRecord {
  const typeText = decoder.decode(record.type);
  const decoded: DecodedNdefRecord = { ...record, typeText };

  if (record.tnf === 0x01 && typeText === "T") {
    const status = record.payload[0] ?? 0;
    const languageLength = status & 0x3f;
    decoded.language = decoder.decode(record.payload.slice(1, 1 + languageLength));
    decoded.text = decoder.decode(record.payload.slice(1 + languageLength));
  } else if (record.tnf === 0x01 && typeText === "U") {
    const prefix = URI_PREFIXES[record.payload[0] ?? 0] ?? "";
    decoded.uri = `${prefix}${decoder.decode(record.payload.slice(1))}`;
  } else if (record.tnf === 0x02) {
    decoded.mimeType = typeText;
    const text = decoder.decode(record.payload);
    if (typeText === "text/vcard" || typeText === "text/x-vcard") {
      decoded.vcard = text;
    } else if (typeText === "application/vnd.wfa.wsc") {
      const wifi = parseWifiSimpleConfigCredential(record.payload) ?? parseWifiTextPayload(text);
      if (wifi) decoded.wifi = wifi;
    }
  } else if (record.tnf === 0x03) {
    decoded.uri = `${typeText}:${decoder.decode(record.payload)}`;
  }

  return decoded;
}

function chooseUriPrefix(uri: string): { code: number; rest: string } {
  let best = { code: 0, prefix: "" };
  URI_PREFIXES.forEach((prefix, code) => {
    if (prefix.length > best.prefix.length && uri.startsWith(prefix)) {
      best = { code, prefix };
    }
  });

  return {
    code: best.code,
    rest: uri.slice(best.prefix.length)
  };
}

function parseWifiTextPayload(payload: string): WifiNetwork | undefined {
  if (!payload.startsWith("WIFI:")) return undefined;

  const fields = new Map<string, string>();
  let key = "";
  let value = "";
  let readingKey = true;
  let escaped = false;

  for (const char of payload.slice(5)) {
    if (escaped) {
      value += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (readingKey && char === ":") {
      readingKey = false;
      continue;
    }
    if (!readingKey && char === ";") {
      if (key) fields.set(key, value);
      key = "";
      value = "";
      readingKey = true;
      continue;
    }
    if (readingKey) key += char;
    else value += char;
  }

  const ssid = fields.get("S");
  if (!ssid) return undefined;

  const network: WifiNetwork = { ssid };
  const authentication = fields.get("T");
  const encryption = fields.get("E");
  if (isWifiAuthentication(authentication)) network.authentication = authentication;
  if (isWifiEncryption(encryption)) network.encryption = encryption;
  const password = fields.get("P");
  if (password) network.password = password;
  network.hidden = fields.get("H") === "true";
  return network;
}

function encodeWifiSimpleConfigCredential(network: Required<Pick<WifiNetwork, "authentication" | "encryption">> & WifiNetwork): Uint8Array {
  const credential = concatBytes([
    wscAttribute(0x1026, new Uint8Array([0x01])),
    wscAttribute(0x1045, encoder.encode(network.ssid)),
    wscAttribute(0x1003, uint16ToBytes(authenticationToWsc(network.authentication))),
    wscAttribute(0x100f, uint16ToBytes(encryptionToWsc(network.encryption))),
    wscAttribute(0x1027, encoder.encode(network.password ?? "")),
    wscAttribute(0x1020, new Uint8Array([0, 0, 0, 0, 0, 0]))
  ]);

  return wscAttribute(0x100e, credential);
}

function parseWifiSimpleConfigCredential(payload: Uint8Array): WifiNetwork | undefined {
  const topLevel = parseWscAttributes(payload);
  const credential = topLevel.get(0x100e);
  if (!credential) return undefined;

  const fields = parseWscAttributes(credential);
  const ssid = fields.get(0x1045);
  if (!ssid) return undefined;

  const network: WifiNetwork = { ssid: decoder.decode(ssid), hidden: false };
  const auth = fields.get(0x1003);
  const encryption = fields.get(0x100f);
  const password = fields.get(0x1027);
  if (auth && auth.length >= 2) network.authentication = authenticationFromWsc(readUint16(auth, 0));
  if (encryption && encryption.length >= 2) network.encryption = encryptionFromWsc(readUint16(encryption, 0));
  if (password && password.length > 0) network.password = decoder.decode(password);
  return network;
}

function parseWscAttributes(bytes: Uint8Array): Map<number, Uint8Array> {
  const attributes = new Map<number, Uint8Array>();
  let offset = 0;

  while (offset + 4 <= bytes.length) {
    const id = readUint16(bytes, offset);
    const length = readUint16(bytes, offset + 2);
    offset += 4;
    attributes.set(id, bytes.slice(offset, offset + length));
    offset += length;
  }

  return attributes;
}

function wscAttribute(id: number, value: Uint8Array): Uint8Array {
  return concatBytes([uint16ToBytes(id), uint16ToBytes(value.length), value]);
}

function uint16ToBytes(value: number): Uint8Array {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function authenticationToWsc(value: NonNullable<WifiNetwork["authentication"]>): number {
  switch (value) {
    case "OPEN": return 0x0001;
    case "WEP": return 0x0004;
    case "WPA": return 0x0002;
    case "WPA2": return 0x0020;
    case "WPA3": return 0x0020;
  }
}

function encryptionToWsc(value: NonNullable<WifiNetwork["encryption"]>): number {
  switch (value) {
    case "NONE": return 0x0001;
    case "WEP": return 0x0002;
    case "TKIP": return 0x0004;
    case "AES": return 0x0008;
  }
}

function authenticationFromWsc(value: number): NonNullable<WifiNetwork["authentication"]> {
  if ((value & 0x0020) !== 0) return "WPA2";
  if ((value & 0x0002) !== 0) return "WPA";
  if ((value & 0x0004) !== 0) return "WEP";
  return "OPEN";
}

function encryptionFromWsc(value: number): NonNullable<WifiNetwork["encryption"]> {
  if ((value & 0x0008) !== 0) return "AES";
  if ((value & 0x0004) !== 0) return "TKIP";
  if ((value & 0x0002) !== 0) return "WEP";
  return "NONE";
}

function isWifiAuthentication(value: string | undefined): value is NonNullable<WifiNetwork["authentication"]> {
  return value === "OPEN" || value === "WPA" || value === "WPA2" || value === "WPA3" || value === "WEP";
}

function isWifiEncryption(value: string | undefined): value is NonNullable<WifiNetwork["encryption"]> {
  return value === "NONE" || value === "TKIP" || value === "AES" || value === "WEP";
}

function escapeVCard(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function readByte(bytes: Uint8Array, offset: number): number {
  const value = bytes[offset];
  if (value === undefined) throw new Error("Unexpected end of NDEF data");
  return value;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (readByte(bytes, offset) << 8) | readByte(bytes, offset + 1);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (readByte(bytes, offset) * 0x1000000) +
    (readByte(bytes, offset + 1) << 16) +
    (readByte(bytes, offset + 2) << 8) +
    readByte(bytes, offset + 3)
  );
}
