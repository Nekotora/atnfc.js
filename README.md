# atnfc.js

English | [简体中文](./README_zh.md)

`atnfc.js` is a TypeScript client library for ATNFC serial NFC modules. It wraps the module's text-based AT protocol in a typed API, while keeping a raw `command()` entry point for firmware commands that are new or not wrapped yet.

The implementation follows [AT_COMMAND_REFERENCE.md](./AT_COMMAND_REFERENCE.md) in this repository. It covers common ATNFC-102 / ATNFC-103 features, including card discovery, UID reads, M1, NTAG, ISO15693, APDU, configuration, buzzer control, and HID keyboard commands.

## Features

- Written in TypeScript, with ESM output and `.d.ts` declarations.
- No runtime dependencies in the core library.
- Replaceable transport layer.
- Built-in browser WebSerial adapter: `atnfc.js/web-serial`.
- Queues AT commands automatically to avoid mixed serial responses from concurrent writes.
- Parses common responses such as `OK`, `+CME ERROR:XX`, `+FIND`, and `+SYSCFG`.
- Includes a React + Vite example page for WebSerial demos in Chrome and Edge.

## Installation

```bash
npm install atnfc.js
```

The browser example uses WebSerial. It usually requires HTTPS or `localhost`, and is mainly supported by Chromium-based browsers.

## Quick start: WebSerial

```ts
import { AtNfcClient } from "atnfc.js";
import { WebSerialTransport } from "atnfc.js/web-serial";

const transport = await WebSerialTransport.requestPort(undefined, {
  baudRate: 115200
});

const nfc = new AtNfcClient(transport, {
  timeoutMs: 5000
});

await nfc.open();

const info = await nfc.getInfo();
console.log(info);

const card = await nfc.findCard(31);
console.log(card.uid, card.typeName);

await nfc.close();
```

## Quick start: custom transport

The core library only needs an `AtNfcTransport`, so you can plug in a Node serial port, Bluetooth serial connection, or a test stub.

```ts
import { AtNfcClient, type AtNfcTransport } from "atnfc.js";

const transport: AtNfcTransport = {
  async open() {},
  async close() {},
  async write(data) {
    // Write AT command bytes, for example AT+UID\r\n
  },
  async read() {
    // Return one Uint8Array chunk received from the serial port
    return new Uint8Array();
  }
};

const nfc = new AtNfcClient(transport);
```

## Core API

### Connection and raw commands

```ts
await nfc.open();
await nfc.close();

await nfc.test();

const response = await nfc.command("AT+GMR");
console.log(response.dataLines); // ["+GMR:10"]
```

`command()` waits for the module to return `OK` or `+CME ERROR:XX`. If the module returns an error, the library throws `AtNfcCmeError` with:

- `code`, such as `E1` or `03`.
- `command`, the AT command that triggered the error.
- `responseLines`, the response lines received before the error.

### Module information

```ts
await nfc.getManufacturer();
await nfc.getFirmwareVersion();
await nfc.getModel();
await nfc.getSerialNumber();

const info = await nfc.getInfo();
```

### Card discovery and basic NFC

```ts
const card = await nfc.findCard(31);
// 31 = enable A/B/V/F/ID card discovery

console.log(card.uid);
console.log(card.type);     // "02"
console.log(card.typeName); // "ntag21x"

const uid = await nfc.getUid();
const type = await nfc.getCardType();
const atr = await nfc.getAtr();

await nfc.power(true);
await nfc.power(false);
```

`findCard()` parses extra fields from `type` when possible:

- Mifare / NTAG / Type 1 Tag: `sak`, `atqa`
- ISO14443A CPU / Desfire: `sak`, `atqa`, optional `atr`
- ISO14443B CPU: `atqb`
- ISO15693: `afi`, `dsfid`
- FeliCa: `pmm`, `systemCode`

### Mifare Classic

```ts
await nfc.authenticateM1(4, "A", "FFFFFFFFFFFF");

const block = await nfc.readM1(4);

await nfc.writeM1(
  4,
  "00112233445566778899AABBCCDDEEFF"
);
```

### NTAG21x

```ts
const data = await nfc.readNtag(4, 8);

await nfc.writeNtag(4, "00112233445566778899AABB");
```

### NDEF / URL / Wi-Fi / vCard

Use the generic NDEF helpers when application code should not care whether the card is NTAG21x, Mifare Classic, or ISO15693. The client calls `findCard(31)` when `target` is omitted, then routes NTAG cards to `AT+NTAGREAD` / `AT+NTAGWRITE`, M1 cards to authenticated `AT+M1READ` / `AT+M1WRITE` block access, and ISO15693 cards to NFC Forum Type 5 Tag CC/TLV storage over `AT+15693READ` / `AT+15693WRITE`.

Mifare Classic cards reported by `findCard()` as `typeName === "mifare-classic"` do not work with `AT+NTAGREAD`. The M1 route authenticates data blocks, skips sector trailer blocks, and parses the same NDEF TLV payload. The default M1 NDEF data key is `D3F7D3F7D3F7`; `FFFFFFFFFFFF` is also tried for blank/test cards, and formatted-state checks try the public MAD key `A0A1A2A3A4A5`.

For phones to discover M1 NDEF reliably, the card must also have a MIFARE Application Directory (MAD) that marks sectors as NFC data. For third-party applications, prefer `m1: { mode: "auto" }`: the SDK checks whether the M1 card is already formatted and formats it before writing only when needed. This may rewrite MAD blocks and sector trailers, so use it only for cards your app is allowed to manage.

ISO15693 NDEF support expects an NFC Forum Type 5 capability container at block 0. Existing formatted tags can be written with the default `preserve` mode. Blank Type 5 tags need `iso15693: { mode: "format", maxBlocks, blockSize }` or `mode: "auto"` so the SDK can write the CC before the NDEF TLV. The defaults are 4-byte blocks and 64 blocks; override them for tags with different memory geometry. New formatting uses a conservative CC feature byte of `00`; pass `featureFlags` or `cc` only when the card's Type 5 feature bits are known.

```ts
import { encodeTextRecord } from "atnfc.js";

const records = await nfc.readNdef();

await nfc.writeUrl("https://example.com");

await nfc.writeWifi({
  ssid: "Studio WiFi",
  authentication: "WPA2",
  encryption: "AES",
  password: "password1234"
});

await nfc.writeVCard({
  name: "ATNFC Demo",
  phone: "+86 138 0000 0000",
  email: "hello@example.com",
  url: "https://example.com"
});

await nfc.writeText("Hello from ATNFC", "en");

await nfc.writeNdef([
  encodeTextRecord("Hello from ATNFC", "en")
]);
```

For M1 cards that should be readable by phones:

```ts
await nfc.writeUrl("https://example.com", {
  target: "m1",
  m1: {
    mode: "auto"
  }
});
```

You can still force a target or override storage parameters:

```ts
const ntagRecords = await nfc.readNdef({
  target: "ntag",
  ntag: { startPage: 4, pages: 40 }
});

const m1Records = await nfc.readNdef({
  target: "m1",
  m1: {
    startBlock: 4,
    blocks: 45
  }
});

await nfc.writeUrl("https://example.com", {
  target: "m1",
  m1: {
    startBlock: 4,
    maxBlocks: 45,
    mode: "auto"
  }
});

await nfc.writeUrl("https://example.com", {
  target: "iso15693",
  iso15693: {
    mode: "auto",
    maxBlocks: 64,
    blockSize: 4
  }
});

// Pass keys only for cards that use custom keys.
await nfc.writeUrl("https://example.com", {
  target: "m1",
  m1: {
    mode: "auto",
    keys: ["D3F7D3F7D3F7", "FFFFFFFFFFFF", "A0A1A2A3A4A5"]
  }
});

await nfc.formatM1Ndef({
  ndefKey: "D3F7D3F7D3F7"
});
```

You can also use the NDEF utilities directly:

```ts
import {
  decodeType2TagTlv,
  encodeNdefMessage,
  encodeTextRecord,
  encodeType2TagTlv,
  encodeUriRecord,
  type2TlvToHex
} from "atnfc.js";

const message = encodeNdefMessage([
  encodeUriRecord("https://example.com")
]);

const tlvHex = type2TlvToHex(message);
const decoded = decodeType2TagTlv(tlvHex);
```

### ISO15693

```ts
const data = await nfc.readIso15693(0, 4);

await nfc.writeIso15693(0, "0011223344556677");
```

### APDU and protocol exchange

```ts
const sw = await nfc.apdu("00A4040007A0000003330101");

const selected = await nfc.selectAid("A000000333010101", "04", "00");
const file = await nfc.readSelectedFile(128, 16);

const raw = await nfc.exchange("2601", { crc: true, fwi: 8 });
const mifare = await nfc.protocolExchange("MIFARE", "2601", { crc: true, fwi: 4 });
const idCard = await nfc.idCard("00A4040007A0000003330101");
```

### Configuration, URC, buzzer, and HID

```ts
const config = await nfc.getSysConfig();

await nfc.setSysConfig({
  baudRateIndex: 8,
  lowPowerSearchIntervalLow: 5,
  autoSearchInterval10Ms: 20,
  searchCardParameter: 0x76,
  autoSearchEnabled: false,
  lowPowerEnabled: false,
  beepEnabled: true,
  cardFilter: 0xff,
  urcEnabled: true,
  save: true
});

await nfc.setUrc(true, true);
await nfc.setBeepEnabled(true, true);
await nfc.beep(2, 120, 80);

await nfc.setBaudRate(115200);

await nfc.setDiy(2, "CARD:(U:2)(R)", true);

await nfc.setKeyboardMode(4, true);
await nfc.setKeyboardEnabled(true);
await nfc.keyboard("HELLO", true);
```

### Events

```ts
const offLine = nfc.on("line", (line) => {
  console.log("RX", line);
});

const offUrc = nfc.on("urc", (line) => {
  console.log("URC", line);
});

offLine();
offUrc();
```

`line` receives every serial response line. `urc` receives unsolicited `+...` lines that arrive when no command is pending.

## React example

This repository includes a React + Vite example page for WebSerial connection and common read/write operations.

```bash
npm install
npm run example:dev
```

Open the local Vite URL and click `Connect` to choose the serial port.

The example page includes:

- Serial connection and baud rate selection
- Module information reads
- Card discovery and card field display
- NTAG reads and writes
- NDEF reads and URL / Wi-Fi / vCard / Text writes
- Mifare Classic authentication, reads, and writes
- ISO15693 reads
- APDU sending
- DIY output template configuration
- Buzzer test
- Raw AT command panel
- Serial logs and URC logs

## Local development

```bash
npm install
npm run typecheck
npm run build
npm run example:build
```

Project structure:

```text
src/
  client.ts       # High-level ATNFC API and command queue
  errors.ts       # CME/timeout error types
  ndef.ts         # NDEF and NTAG Type 2 TLV codecs
  types.ts        # Public types
  utils.ts        # HEX, FIND, and SYSCFG parsers
  web-serial.ts   # WebSerial adapter
example/
  src/            # React demo page
```

## Publishing to npm

```bash
npm run build
npm publish --access public
```

The package contents are limited by the `files` field in `package.json`:

- `dist`
- `README.md`
- `AT_COMMAND_REFERENCE.md`

## Notes

- Commands such as `AT+IPR`, `AT+KBDEN`, `AT&W`, and `AT&F` may save configuration, change the module baud rate, or reboot the module. Close the client and reconnect with the new baud rate afterward.
- A command timeout marks the client as no longer synchronized. Close and reopen it before sending more commands, so late serial responses cannot be mistaken for the next command.
- M1 block writes, NTAG page writes, and ISO15693 block writes modify real card data. Check the address and data length before testing.
- WebSerial requires the user to grant serial port access manually. The browser cannot show the port picker outside a user gesture.
- The default command timeout is 3000 ms. APDU and long read operations can override it with `{ timeoutMs }`.

## License

MIT
