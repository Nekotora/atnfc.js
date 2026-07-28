# atnfc.js

[English](./README.md) | 简体中文

`atnfc.js` 是一个用于 ATNFC 串口 NFC 模块的 TypeScript 客户端库。它把模块的 AT 文本协议封装成可类型提示的 API，同时保留 `command()` 原始入口，方便你直接调用固件新增或暂未封装的指令。

当前根据仓库内的 [AT_COMMAND_REFERENCE.md](./AT_COMMAND_REFERENCE.md) 实现，覆盖 ATNFC-102 / ATNFC-103 的常用寻卡、UID、M1、NTAG、ISO15693、APDU、配置、蜂鸣器、HID 键盘等能力。

## 特性

- TypeScript 编写，发布时输出 ESM 与 `.d.ts` 类型声明。
- 核心库零运行时依赖，传输层可替换。
- 内置浏览器 WebSerial 适配器：`atnfc.js/web-serial`。
- AT 命令自动排队，避免并发写串口导致响应串线。
- 自动解析 `OK`、`+CME ERROR:XX`、`+FIND`、`+SYSCFG` 等常见响应。
- 附带 React + Vite example page，可在 Chrome / Edge 里通过 WebSerial 演示读写。

## 安装

```bash
npm install atnfc.js
```

浏览器示例需要 WebSerial，通常要求 HTTPS 或 `localhost`，并且目前主要由 Chromium 系浏览器支持。

## 快速开始：WebSerial

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

## 快速开始：自定义传输层

核心库只要求传入一个 `AtNfcTransport`，所以 Node 串口、蓝牙串口或测试桩都可以接入。

```ts
import { AtNfcClient, type AtNfcTransport } from "atnfc.js";

const transport: AtNfcTransport = {
  async open() {},
  async close() {},
  async write(data) {
    // 写入 AT 命令字节，例如 AT+UID\r\n
  },
  async read() {
    // 返回串口收到的一段 Uint8Array
    return new Uint8Array();
  }
};

const nfc = new AtNfcClient(transport);
```

## 核心 API

### 连接与原始命令

```ts
await nfc.open();
await nfc.close();

await nfc.test();

const response = await nfc.command("AT+GMR");
console.log(response.dataLines); // ["+GMR:10"]
```

`command()` 会等待模块返回 `OK` 或 `+CME ERROR:XX`。如果模块返回错误，库会抛出 `AtNfcCmeError`，其中包含：

- `code`：如 `E1`、`03`。
- `command`：触发错误的 AT 命令。
- `responseLines`：错误前已收到的响应行。

### 模块信息

```ts
await nfc.getManufacturer();
await nfc.getFirmwareVersion();
await nfc.getModel();
await nfc.getSerialNumber();

const info = await nfc.getInfo();
```

### 寻卡与基础 NFC

```ts
const card = await nfc.findCard(31);
// 31 = A/B/V/F/身份证 全开

console.log(card.uid);
console.log(card.type);     // "02"
console.log(card.typeName); // "ntag21x"

const uid = await nfc.getUid();
const type = await nfc.getCardType();
const atr = await nfc.getAtr();

await nfc.power(true);
await nfc.power(false);
```

`findCard()` 会根据 `type` 尽量解析扩展字段：

- Mifare / NTAG / Type 1 Tag：`sak`、`atqa`
- ISO14443A CPU / Desfire：`sak`、`atqa`、可选 `atr`
- ISO14443B CPU：`atqb`
- ISO15693：`afi`、`dsfid`
- FeliCa：`pmm`、`systemCode`

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

NDEF 高阶 API 面向 NFC Forum Type 2 Tag，默认从 NTAG 的 page 4 写入 TLV：`03 <len> <NDEF message> FE`。普通手机读 URL、Wi-Fi、名片时，一般就是识别这类 NDEF 数据。

```ts
import { encodeTextRecord } from "atnfc.js";

const records = await nfc.readNdefFromNtag(4, 40);

await nfc.writeUrlToNtag("https://example.com", 4);

await nfc.writeWifiToNtag({
  ssid: "Studio WiFi",
  authentication: "WPA2",
  encryption: "AES",
  password: "password1234"
});

await nfc.writeVCardToNtag({
  name: "ATNFC Demo",
  phone: "+86 138 0000 0000",
  email: "hello@example.com",
  url: "https://example.com"
});

await nfc.writeNdefToNtag([
  encodeTextRecord("Hello from ATNFC", "en")
]);
```

也可以直接使用 NDEF 工具函数：

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

### APDU 与协议通道

```ts
const sw = await nfc.apdu("00A4040007A0000003330101");

const selected = await nfc.selectAid("A000000333010101", "04", "00");
const file = await nfc.readSelectedFile(128, 16);

const raw = await nfc.exchange("2601", { crc: true, fwi: 8 });
const mifare = await nfc.protocolExchange("MIFARE", "2601", { crc: true, fwi: 4 });
const idCard = await nfc.idCard("00A4040007A0000003330101");
```

### 配置、URC、蜂鸣器、HID

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

### 事件

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

`line` 会收到所有串口响应行，`urc` 会收到没有待处理命令时出现的 `+...` 主动上报行。

## React Example

本仓库带了一个 React + Vite 示例页面，演示 WebSerial 连接和常见功能读写。

```bash
npm install
npm run example:dev
```

打开 Vite 输出的本地地址，点击 `Connect` 选择串口即可。

示例页包含：

- 串口连接与波特率选择
- 模块信息读取
- 寻卡与卡片字段展示
- NTAG 读写
- NDEF 读取与 URL / Wi-Fi / vCard / Text 写入
- Mifare Classic 认证、读、写
- ISO15693 读取
- APDU 发送
- DIY 输出模板配置
- 蜂鸣器测试
- 原始 AT 命令面板
- 串口日志与 URC 日志

## 本地开发

```bash
npm install
npm run typecheck
npm run build
npm run example:build
```

目录结构：

```text
src/
  client.ts       # ATNFC 高阶 API 与命令队列
  errors.ts       # CME/timeout 错误类型
  ndef.ts         # NDEF 与 NTAG Type 2 TLV 编解码
  types.ts        # 公共类型
  utils.ts        # HEX、FIND、SYSCFG 解析工具
  web-serial.ts   # WebSerial adapter
example/
  src/            # React 演示页面
```

## 发布到 npm

```bash
npm run build
npm publish --access public
```

发布产物由 `package.json` 的 `files` 字段限制为：

- `dist`
- `README.md`
- `AT_COMMAND_REFERENCE.md`

## 注意事项

- `AT+IPR`、`AT+KBDEN`、`AT&W`、`AT&F` 等命令可能让模块保存配置或重启，调用后浏览器串口可能需要重新连接。
- M1 写块、NTAG 写页、ISO15693 写块都是实写操作，调试时先确认地址和数据长度。
- WebSerial 需要用户手动授权串口，不能在非用户手势里弹出选择框。
- 默认命令超时是 3000ms，APDU 或长读操作可以通过 `{ timeoutMs }` 覆盖。

## License

MIT
