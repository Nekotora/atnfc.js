# AT 命令说明手册

## 型号支持总览

说明：以下按固件编译宏与运行分发逻辑整理，`√` 表示支持，`-` 表示不支持/不可用。

### ATNFC-102

| 模块               | 支持的 AT 指令                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| NFC 基础           | `AT+SYSCFG` `AT+FIND` `AT+UID` `AT+ATR` `AT+TYPE` `AT+PWR`                                                              |
| M1/NTAG/15693 读写 | `AT+M1AUTH` `AT+M1READ` `AT+M1WRITE` `AT+NTAGREAD` `AT+NTAGWRITE` `AT+15693READ` `AT+15693WRITE`                      |
| APDU/协议通道      | `AT+APDU` `AT+AIDSEL` `AT+FREAD` `AT+CEXCHANGE` `AT+MIFARE` `AT+ULTRALIGHT` `AT+ISO15693` `AT+FELICA` `AT+IDCARD` |
| 芯片维护           | `AT+PCDRST` `AT+REGWRITE` `AT+REGREAD`                                                                                        |
| 通用信息           | `AT+GMI` `AT+GMR` `AT+GMM` `AT+GSN` `AT+CGMI` `AT+CGMR` `AT+CGMM` `AT+CGSN`                                         |
| 配置与输出         | `AT+CURC` `AT+IPR` `AT+DIY` `AT+KMODE` `AT+KBDEN` `AT+KBD` `ATI` `AT&W` `AT&F`                                    |

### ATNFC-103

| 模块               | 支持的 AT 指令                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| NFC 基础           | `AT+SYSCFG` `AT+FIND` `AT+UID` `AT+ATR` `AT+TYPE` `AT+PWR`                                                              |
| M1/NTAG/15693 读写 | `AT+M1AUTH` `AT+M1READ` `AT+M1WRITE` `AT+NTAGREAD` `AT+NTAGWRITE` `AT+15693READ` `AT+15693WRITE`                      |
| APDU/协议通道      | `AT+APDU` `AT+AIDSEL` `AT+FREAD` `AT+CEXCHANGE` `AT+MIFARE` `AT+ULTRALIGHT` `AT+ISO15693` `AT+FELICA` `AT+IDCARD` |
| 芯片维护           | `AT+PCDRST` `AT+REGWRITE` `AT+REGREAD`                                                                                        |
| 通用信息           | `AT+GMI` `AT+GMR` `AT+GMM` `AT+GSN` `AT+CGMI` `AT+CGMR` `AT+CGMM` `AT+CGSN`                                         |
| 配置与输出         | `AT+CURC` `AT+IPR` `AT+DIY` `AT+KMODE` `AT+KBDEN` `AT+KBD` `ATI` `AT&W` `AT&F`                                    |
| 蜂鸣器             | `AT+BEEPEN` `AT+BEEP`                                                                                                           |

### IDNFC-102

| 模块            | 支持的 AT 指令                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------ |
| 可用 NFC/系统类 | `AT+SYSCFG` `AT+FIND` `AT+UID` `AT+TYPE`                                                 |
| 通用信息        | `AT+GMI` `AT+GMR` `AT+GMM` `AT+GSN` `AT+CGMI` `AT+CGMR` `AT+CGMM` `AT+CGSN`      |
| 配置与输出      | `AT+CURC` `AT+IPR` `AT+DIY` `AT+KMODE` `AT+KBDEN` `AT+KBD` `ATI` `AT&W` `AT&F` |

## 按指令维度对照总表

说明：`√`=编译并可分发；`-`=未编译或被分发层屏蔽。

| AT 指令                  | ATNFC-102 | ATNFC-103 | IDNFC-102 | 备注                 |
| ------------------------ | --------- | --------- | --------- | -------------------- |
| `AT+SYSCFG`            | √        | √        | √        | 系统配置             |
| `AT+FIND`              | √        | √        | √        | 寻卡入口             |
| `AT+UID`               | √        | √        | √        | 读 UID               |
| `AT+ATR`               | √        | √        | -         | 读取 ATR（并复位卡） |
| `AT+TYPE`              | √        | √        | √        | 卡类型               |
| `AT+PWR`               | √        | √        | -         | 天线上电/掉电控制    |
| `AT+M1AUTH`            | √        | √        | -         | M1 密钥认证          |
| `AT+M1READ`            | √        | √        | -         | M1 读块              |
| `AT+M1WRITE`           | √        | √        | -         | M1 写块              |
| `AT+NTAGREAD`          | √        | √        | -         | NTAG 读页            |
| `AT+NTAGWRITE`         | √        | √        | -         | NTAG 写页            |
| `AT+15693READ`         | √        | √        | -         | ISO15693 读块        |
| `AT+15693WRITE`        | √        | √        | -         | ISO15693 写块        |
| `AT+APDU`              | √        | √        | -         | APDU 透传通道        |
| `AT+AIDSEL`            | √        | √        | -         | 按 AID 选择文件      |
| `AT+FREAD`             | √        | √        | -         | 读当前文件           |
| `AT+CEXCHANGE`         | √        | √        | -         | 原始数据交互         |
| `AT+MIFARE`            | √        | √        | -         | MIFARE 协议通道      |
| `AT+ULTRALIGHT`        | √        | √        | -         | ULTRALIGHT 协议通道  |
| `AT+ISO15693`          | √        | √        | -         | ISO15693 协议通道    |
| `AT+FELICA`            | √        | √        | -         | FeliCa 协议通道      |
| `AT+IDCARD`            | √        | √        | -         | 身份证 APDU 通道     |
| `AT+PCDRST`            | √        | √        | -         | NFC 芯片复位         |
| `AT+REGWRITE`          | √        | √        | -         | 寄存器写入           |
| `AT+REGREAD`           | √        | √        | -         | 寄存器读取           |
| `AT+GMI` / `AT+CGMI` | √        | √        | √        | 制造商               |
| `AT+GMR` / `AT+CGMR` | √        | √        | √        | 固件版本             |
| `AT+GMM` / `AT+CGMM` | √        | √        | √        | 型号                 |
| `AT+GSN` / `AT+CGSN` | √        | √        | √        | 序列号               |
| `AT+CURC`              | √        | √        | √        | URC 开关             |
| `AT+BEEPEN`            | -         | √        | -         | 蜂鸣器使能设置       |
| `AT+BEEP`              | -         | √        | -         | 蜂鸣器鸣叫控制       |
| `AT+IPR`               | √        | √        | √        | 波特率               |
| `AT+DIY`               | √        | √        | √        | 自定义输出           |
| `AT+KMODE`             | √        | √        | √        | 键盘 UID 输出模式    |
| `AT+KBDEN`             | √        | √        | √        | HID 键盘开关         |
| `AT+KBD`               | √        | √        | √        | HID 文本输出         |
| `ATI`                  | √        | √        | √        | 信息命令             |
| `AT&W`                 | √        | √        | √        | 保存并重启           |
| `AT&F`                 | √        | √        | √        | 恢复出厂并重启       |

## 通用规则

- 命令前缀：`AT`
- 运行：`AT+CMD`
- 设置：`AT+CMD=...`
- 测试格式：`AT+CMD=?`
- 帮助/当前值：`AT+CMD?`
- 成功返回：`\r\nOK\r\n`
- 失败返回：`\r\n+CME ERROR:XX\r\n`

常见错误码：

- `03` 参数错误
- `04` 未知命令
- `E0` 卡类型错误
- `E1` 未寻到卡
- `E2` 密钥认证失败
- `E3` 读失败
- `E4` 写失败
- `E5` APDU 执行失败
- `E6` 交互执行失败
- `E7` HEX 格式错误
- `E9` EEPROM 写失败

## NFC 命令

### AT+SYSCFG

作用：模块配置读写（系统关键配置）。

参数：

- `hex_cfg`：6~9 字节配置数据（HEX）
- 可选 `&W`：保存并重启

格式：

- `AT+SYSCFG=<B0B1B2B3B4B5[ B6[ B7[ B8 ]]]>`
- 最少 6 字节（B0~B5），最多 9 字节（B0~B8）

每个字节含义：

- `B0`：串口波特率索引（不是直接波特率值）
  - `01`=4800
  - `02`=9600
  - `03`=14400
  - `04`=19200
  - `05`=28800
  - `06`=38400
  - `07`=57600
  - `08`=115200
  - `09`=230400
  - `0A`=460800
  - `0B`=921600
- `B1`：低功耗寻卡间隔低 8 位（实际内部字段是 16 位，这里仅映射 8 位）
- `B2`：自动寻卡间隔，单位为 10ms，内部实际值 = `B2 * 10 ms`
- `B3`：寻卡参数 `search_card_p`（底层射频参数，按固件约定使用）
- `B4`：自动寻卡使能
  - `00`=关闭
  - 非 `00`=开启
- `B5`：低功耗使能
  - `00`=关闭
  - 非 `00`=开启
- `B6`（可选）：蜂鸣器使能
  - `00`=关闭
  - 非 `00`=开启
- `B7`（可选）：卡过滤掩码 `card_filter`（按 bit 生效）
  - bit0 (`0x01`)：A 类卡
  - bit1 (`0x02`)：B 类卡
  - bit2 (`0x04`)：V 类卡（ISO15693）
  - bit3 (`0x08`)：F 类卡（FeliCa）
  - bit4 (`0x10`)：P 类卡（身份证）
  - bit5~bit7：保留
  - 常用值：`0xFF`（全部使能）
- `B8`（可选）：URC 主动上报使能
  - `00`=关闭
  - 非 `00`=开启

bit 级说明补充：

- 本命令协议中，大部分开关使用“整字节 00/非00”表达，不是多个开关打包到同一字节。
- 只有 `B7(card_filter)` 明确定义为位掩码，需要按 bit 解析。

示例：

```text
AT+SYSCFG=?
AT+SYSCFG?
AT+SYSCFG=0805147600FF
AT+SYSCFG=08051476FFFF01FF01&W
```

返回示例：

```text
\r\n+SYSCFG:08051476FFFF01FF01\r\n
\r\nOK\r\n
```

### AT+FIND

作用：寻卡并返回 UID/卡型等信息。

参数：

- 可选 `filter`：卡过滤掩码（十进制，非 0；按 bit 生效）

`filter` 每一 bit 含义：

- bit0 (`0x01`)：A 类卡（ISO14443A）
- bit1 (`0x02`)：B 类卡（ISO14443B）
- bit2 (`0x04`)：V 类卡（ISO15693）
- bit3 (`0x08`)：F 类卡（FeliCa）
- bit4 (`0x10`)：P 类卡（身份证）
- bit5~bit7：保留位（当前不使用）

常用组合示例：

- `1` (`0x01`)：仅寻 A 卡
- `2` (`0x02`)：仅寻 B 卡
- `3` (`0x03`)：A + B
- `4` (`0x04`)：仅寻 V 卡
- `8` (`0x08`)：仅寻 F 卡
- `16` (`0x10`)：仅寻身份证
- `31` (`0x1F`)：A/B/V/F/身份证 全开（推荐“全类型”值）
- `255` (`0xFF`)：全开（与默认配置一致，含保留位）

说明：

- `AT+FIND`（不带参数）使用当前系统配置中的 `card_filter`。
- `AT+FIND=<filter>` 会先临时/当前设置过滤值再执行寻卡。

示例：

```text
AT+FIND
AT+FIND=1
AT+FIND=3
AT+FIND=31
AT+FIND?
AT+FIND=?
```

返回示例：

```text
\r\n+FIND:04A1B2C3D4,02,08,0400\r\n
\r\nOK\r\n
```

返回字段总览：

- 格式起始固定：`+FIND:<UID>,<type>`
- 后续字段随卡类型变化（见下文）

公共字段：

- `UID`：卡 UID（HEX，不定长）
- `type`：卡类型码（HEX，1 字节）

`type` 取值映射（来自 `phal_card_type_t`）：

- `00`：`PHAL_CARD_TYPE_NONE`（无效/未识别）
- `01`：`PHAL_CARD_TYPE_MF`（Mifare Classic）
- `02`：`PHAL_CARD_TYPE_NTAG21X`（NTAG21x）
- `03`：`PHAL_CARD_TYPE_ACPU`（ISO14443A CPU）
- `04`：`PHAL_CARD_TYPE_BCPU`（ISO14443B CPU）
- `05`：`PHAL_CARD_TYPE_ISO15693`
- `06`：`PHAL_CARD_TYPE_FELICA`
- `07`：`PHAL_CARD_TYPE_DESFIER`（Desfire）
- `08`：`PHAL_CARD_TYPE_T1T`（Type 1 Tag）

按不同卡类型逐字段展开：

1. ISO14443A 普通卡（T1T / Mifare / NTAG21x）

- 返回格式：`+FIND:<UID>,<type>,<sak>,<atqa>`
- 字段说明：
  - `sak`：1 字节 HEX
  - `atqa`：2 字节 HEX
- 示例：

```text
+FIND:04A1B2C3D4,02,08,0400
```

2. ISO14443A CPU/Desfire 类（DESFIRE / ACPU）

- 返回格式：`+FIND:<UID>,<type>,<sak>,<atqa>[,<atr>]`
- 字段说明：
  - `sak`：1 字节 HEX
  - `atqa`：2 字节 HEX
  - `atr`：可选，存在时为 ATR 全部 HEX
- 示例（带 ATR）：

```text
+FIND:04A1B2C3D4,03,20,0344,3B8F8001804F0CA000000306030001000000006A
```

- 示例（无 ATR）：

```text
+FIND:04A1B2C3D4,03,20,0344
```

3. ISO14443B CPU 卡（BCPU）

- 返回格式：`+FIND:<UID>,<type>,<atqb>`
- 字段说明：
  - `atqb`：ATQB 全部 HEX（长度随卡而定）
- 示例：

```text
+FIND:1122334455667788,04,50000000000000000000
```

4. ISO15693 卡

- 返回格式：`+FIND:<UID>,<type>,<afi>,<dsfid>`
- 字段说明：
  - `afi`：1 字节 HEX
  - `dsfid`：1 字节 HEX
- 示例：

```text
+FIND:E004015012345678,05,00,00
```

5. FeliCa 卡

- 返回格式：`+FIND:<UID>,<type>,<pmm>,<sys_code>`
- 字段说明：
  - `pmm`：8 字节 HEX
  - `sys_code`：2 字节 HEX
- 示例：

```text
+FIND:0123456789ABCDEF,06,01FEA1B2C3D4E5F6,88B4
```

6. 其他/未定义类型

- 只保证前两段：`+FIND:<UID>,<type>`
- 具体扩展字段取决于固件后续实现。

解析建议：

- 主机端应先按逗号分割，优先读取 `UID` 与 `type`。
- 再依据 `type` 选择对应字段模板，避免按固定字段数硬解析。

### AT+UID

作用：读取当前卡 UID。
参数：无。

示例：

```text
AT+UID
```

返回示例：

```text
\r\n+UID:04A1B2C3D4\r\n
\r\nOK\r\n
```

### AT+ATR

作用：读取 CPU 卡 ATR（会复位卡）。
参数：无。

示例：

```text
AT+ATR
```

返回示例：

```text
\r\n+ATR:3B8F8001804F0CA000000306030001000000006A\r\n
\r\nOK\r\n
```

### AT+TYPE

作用：读取当前卡类型码（与 `+FIND` 中 `type` 字段一致）。
参数：无。

返回字段：

- 格式：`+TYPE:XX`
- `XX` 为 1 字节 HEX 类型码

`XX` 取值映射（来自 `phal_card_type_t`）：

- `00`：`PHAL_CARD_TYPE_NONE`（无效/未识别）
- `01`：`PHAL_CARD_TYPE_MF`（Mifare Classic）
- `02`：`PHAL_CARD_TYPE_NTAG21X`（NTAG21x）
- `03`：`PHAL_CARD_TYPE_ACPU`（ISO14443A CPU）
- `04`：`PHAL_CARD_TYPE_BCPU`（ISO14443B CPU）
- `05`：`PHAL_CARD_TYPE_ISO15693`
- `06`：`PHAL_CARD_TYPE_FELICA`
- `07`：`PHAL_CARD_TYPE_DESFIER`（Desfire）
- `08`：`PHAL_CARD_TYPE_T1T`（Type 1 Tag）

示例：

```text
AT+TYPE
```

返回示例：

```text
\r\n+TYPE:02\r\n
\r\nOK\r\n
```

### AT+PWR

作用：卡片激活/去激活。

参数：

- `0`：关闭天线
- `1`：寻卡激活并上报

示例：

```text
AT+PWR=?
AT+PWR?
AT+PWR=0
AT+PWR=1
```

返回示例：

```text
\r\n+PWR:01\r\n
\r\nOK\r\n
```

### AT+M1AUTH

作用：M1 密钥认证。

参数：

- `addr`：块地址（0~255）
- `keyType`：`A` 或 `B`
- `key`：12 HEX（6 字节）

示例：

```text
AT+M1AUTH=4,A,FFFFFFFFFFFF
AT+M1AUTH?
AT+M1AUTH=?
```

返回示例：

```text
\r\n+M1AUTH:4,A,FFFFFFFFFFFF\r\n
\r\nOK\r\n
```

### AT+M1READ

作用：M1 读块（16 字节）。
参数：`addr`（0~255）

示例：

```text
AT+M1READ=4
AT+M1READ?
```

返回示例：

```text
\r\n+M1READ:00112233445566778899AABBCCDDEEFF\r\n
\r\nOK\r\n
```

### AT+M1WRITE

作用：M1 写块（16 字节）。

参数：

- `addr`：块地址（0~255）
- `data`：32 HEX（16 字节）

示例：

```text
AT+M1WRITE=4,00112233445566778899AABBCCDDEEFF
AT+M1WRITE?
```

返回示例：

```text
\r\nOK\r\n
```

### M1 与 NDEF

Mifare Classic（`+FIND` 的 `type=01`）和 NTAG21x（`type=02`）虽然都可能被手机或厂商软件识别为 NDEF 标签，但底层存储命令不同：

- M1 使用 `AT+M1AUTH` / `AT+M1READ` / `AT+M1WRITE`，每块 16 字节，读写前需要密钥认证。
- NTAG21x 使用 `AT+NTAGREAD` / `AT+NTAGWRITE`，每页 4 字节，不使用 M1 块认证流程。
- `AT+NTAGREAD` 不适用于 `type=01` 的 M1 卡。对 M1 卡执行 NTAG 命令时，固件可能返回 `+CME ERROR:E0`（卡类型错误）或 `+CME ERROR:E1`（未寻到卡/当前命令未能在目标类型上寻到可操作标签）。
- 如果要在 M1 上读写 NDEF，应按 Mifare Classic NDEF 的数据块布局处理：认证对应块，跳过 sector trailer，再从数据块中解析或写入 NDEF TLV。常见 NDEF 公共 Key A 为 `D3F7D3F7D3F7`，空白卡/测试卡也可能仍是 `FFFFFFFFFFFF`。
- 注意：让手机把 M1 当作 NDEF 标签，通常还要求卡已经按 Mifare Classic NDEF/MAD 规则初始化；只把 NDEF TLV 写进普通数据块，不一定会被手机识别。

### AT+NTAGREAD

作用：NTAG21x 读页。

参数：

- `addr`：起始页（0~255）
- 可选 `num`：页数（1~60，默认 1）

示例：

```text
AT+NTAGREAD=4
AT+NTAGREAD=4,8
AT+NTAGREAD?
```

返回示例：

```text
\r\n+NTAGREAD:00112233445566778899AABBCCDDEEFF...\r\n
\r\nOK\r\n
```

### AT+NTAGWRITE

作用：NTAG21x 连续写入。

参数：

- `addr`：起始页（0~255）
- `data`：HEX，长度 2~512 字符

示例：

```text
AT+NTAGWRITE=4,00112233445566778899AABB
AT+NTAGWRITE?
```

返回示例：

```text
\r\nOK\r\n
```

### AT+15693READ

作用：ISO15693 读块。

参数：

- `addr`：起始块（0~255）
- 可选 `num`：块数（1~30，默认 1）

示例：

```text
AT+15693READ=0
AT+15693READ=0,4
AT+15693READ?
```

返回示例：

```text
\r\n+15693READ:0011223344556677\r\n
\r\nOK\r\n
```

### AT+15693WRITE

作用：ISO15693 写块。

参数：

- `addr`：起始块（0~255）
- `data`：HEX，长度 2~512 字符

示例：

```text
AT+15693WRITE=0,0011223344556677
AT+15693WRITE?
```

返回示例：

```text
\r\nOK\r\n
```

### AT+APDU

作用：APDU 通道。

参数：

- `apdu`：APDU 命令（HEX）

示例：

```text
AT+APDU=00A4040007A0000003330101
AT+APDU=?
```

返回示例：

```text
\r\n+APDU:9000\r\n
\r\nOK\r\n
```

### AT+AIDSEL

作用：按 AID 选文件（SELECT）。

参数：

- `aid`：AID（HEX，1~32 字节）
- 可选 `p1`：1 字节 HEX
- 可选 `p2`：1 字节 HEX
- 格式：`AID[,P1[,P2]]`

示例：

```text
AT+AIDSEL=A000000333010101
AT+AIDSEL=A000000333010101,04
AT+AIDSEL=A000000333010101,04,00
AT+AIDSEL=?
```

返回示例：

```text
\r\n+AIDSEL:9000\r\n
\r\nOK\r\n
```

### AT+FREAD

作用：读取当前已选择文件（READ BINARY）。

参数：

- `len`：必填，读取长度（十进制，1~1024）
- 可选 `offset`：起始偏移（十进制，默认 0）
- 规则：单次 APDU 最多 230 字节，末包按剩余长度精确读取

示例：

```text
AT+FREAD=32
AT+FREAD=128,16
AT+FREAD=?
```

返回示例：

```text
\r\n+FREAD:11223344556677889900AABBCCDDEEFF...\r\n
\r\nOK\r\n
```

### AT+CEXCHANGE

作用：原始卡片收发（多协议通用）。

参数：

- `data`：发送数据（HEX）
- 可选 `CRC`：开启 CRC
- 可选 `fwi`：超时参数（0~14）
- 支持：`data` / `data,fwi` / `data,CRC` / `data,CRC,fwi`

示例：

```text
AT+CEXCHANGE=2601
AT+CEXCHANGE=2601,4
AT+CEXCHANGE=2601,CRC
AT+CEXCHANGE=2601,CRC,8
AT+CEXCHANGE=?
```

返回示例：

```text
\r\n+CEXCHANGE:0400\r\n
\r\nOK\r\n
```

### AT+MIFARE / AT+ULTRALIGHT / AT+ISO15693 / AT+FELICA

作用：协议专用数据通道（实现同 `AT+CEXCHANGE`）。
参数：同 `AT+CEXCHANGE`。

示例：

```text
AT+MIFARE=2601,CRC,4
AT+ULTRALIGHT=3004
AT+ISO15693=2601,6
AT+FELICA=0000
```

返回示例：

```text
\r\n+MIFARE:0400\r\n
\r\nOK\r\n
```

### AT+IDCARD

作用：身份证通道（实现同 `AT+APDU`）。
参数：`apdu`（HEX）

示例：

```text
AT+IDCARD=00A4040007A0000003330101
```

返回示例：

```text
\r\n+IDCARD:9000\r\n
\r\nOK\r\n
```

### AT+PCDRST

作用：复位 NFC 芯片。
参数：无。

示例：

```text
AT+PCDRST
```

返回示例：

```text
\r\nOK\r\n
```

### AT+REGWRITE

作用：写寄存器。

参数：

- `addr`：起始地址（十进制）
- `data`：HEX 数据
- 可选 `flag`：单字符十进制

示例：

```text
AT+REGWRITE=1,00112233
AT+REGWRITE=1,00112233,0
AT+REGWRITE=?
```

返回示例：

```text
\r\nOK\r\n
```

### AT+REGREAD

作用：读寄存器。

参数：

- `addr`：起始地址（十进制）
- `num`：读取字节数（十进制）
- 可选 `flag`：单字符十进制

示例：

```text
AT+REGREAD=1,4
AT+REGREAD=1,4,0
AT+REGREAD=?
```

返回示例：

```text
\r\n+REGREAD:00112233\r\n
\r\nOK\r\n
```

## 通用 AT 命令

### AT+GMI / AT+CGMI

作用：查询制造商信息。
参数：无。

示例：

```text
AT+GMI
AT+CGMI
```

返回示例：

```text
\r\n+GMI:WCH\r\n
\r\nOK\r\n
```

### AT+GMR / AT+CGMR

作用：查询固件版本。
参数：无。

示例：

```text
AT+GMR
AT+CGMR
```

返回示例：

```text
\r\n+GMR:10\r\n
\r\nOK\r\n
```

### AT+GMM / AT+CGMM

作用：查询型号。
参数：无。

示例：

```text
AT+GMM
AT+CGMM
```

返回示例：

```text
\r\n+GMM:NFC-102\r\n
\r\nOK\r\n
```

### AT+GSN / AT+CGSN

作用：查询序列号（16 字节）。
参数：无。

示例：

```text
AT+GSN
AT+CGSN
```

返回示例：

```text
\r\n+GSN:11223344556677889900AABBCCDDEEFF\r\n
\r\nOK\r\n
```

### AT+CURC

作用：配置 URC 主动上报开关。

参数：

- `0` 或 `1`
- 可选 `&W`：保存

示例：

```text
AT+CURC=?
AT+CURC?
AT+CURC=1
AT+CURC=0&W
```

返回示例：

```text
\r\n+CURC:1\r\n
\r\nOK\r\n
```

### AT+BEEPEN

作用：配置系统蜂鸣器使能开关（影响系统业务中的蜂鸣器触发策略）。

参数：

- `0`：关闭
- `1`：开启
- 可选 `&W`：保存到配置区

说明：

- 本命令用于配置项 `beep_en`。
- `AT+BEEP` 为手动控制命令，不受 `beep_en` 当前值影响。

示例：

```text
AT+BEEPEN=?
AT+BEEPEN?
AT+BEEPEN=1
AT+BEEPEN=0&W
```

返回示例：

```text
\r\n+BEEPEN:1\r\n
\r\nOK\r\n
```

### AT+BEEP

作用：手动控制蜂鸣器鸣叫次数与节拍。

参数：

- 格式：`AT+BEEP=<n>[,<on_ms>[,<off_ms>]]`
- `n`：鸣叫次数（1~65535）
- 可选 `on_ms`：每次鸣叫时长，单位 ms（1~65535，默认 100）
- 可选 `off_ms`：两次鸣叫间隔，单位 ms（1~65535，默认 100）

说明：

- `AT+BEEP` 始终可执行，不受 `beep_en` 开关影响。

示例：

```text
AT+BEEP=?
AT+BEEP?
AT+BEEP=1
AT+BEEP=2,120,80
AT+BEEP=3,300,150
```

返回示例：

```text
\r\nOK\r\n
```

### AT+IPR

作用：设置波特率（成功后保存并重启）。
参数：4800/9600/14400/19200/28800/38400/57600/115200/230400/460800/921600

示例：

```text
AT+IPR=?
AT+IPR?
AT+IPR=115200
```

返回示例：

```text
\r\n+IPR:115200\r\n
\r\nOK\r\n
```

### AT+DIY

作用：配置“刷卡后自动输出”的自定义模板（可拼接固定头尾、卡号、读卡数据、长度和校验）。

命令格式：

- `AT+DIY=<mode>,<template>`
- 可选：结尾追加 `&W` 持久化保存

参数说明：

- `mode`：输出模式（1 位十进制）
  - `0`：关闭 DIY 输出（`LHDIY_OUT_MODE_NONE`）
  - `1`：按“字节流”输出（模板最终必须是纯 HEX 字符串，内部会转成真实字节发送）
  - `2`：按“字符串”输出（模板按 ASCII 原样发送，可包含 `\r\n`）
- `template`：模板内容（最大 `DIY_OUT_CFG_MAX_LEN`，当前为 100）
  - 模板由“固定文本 + 功能段(括号)”组成
  - 功能段写法：`(X:参数...)` 或 `(X)`

模板语法总览：

- 固定文本：直接写在模板里，原样拼接
- 功能段：
  - `(L[:offset])`：插入 1 字节长度（2 位 HEX）
  - `(U[:uid_mode])`：插入 UID
  - `(M:block,start,len,keyType,key)`：读 M1 块并截取
  - `(N:addr,len)`：读 NTAG 数据
  - `(V:addr,len)`：读 ISO15693 数据
  - `(R)`：插入回车换行（`\r\n`）
  - `(B[:start,len])`：插入 BCC 校验（异或）
  - `(S[:start,len])`：插入 SUM 校验（累加）

各功能段详细说明：

1. `(L[:offset])` 长度字段

- 作用：在当前位置预留 1 字节长度，最终自动回填
- 默认长度：后续拼接内容字节数
- 可选 `offset`：对最终长度加减偏移（十进制，可负数）
- 示例：`AA(L:-2)0104(U)`

2. `(U[:uid_mode])` UID 字段

- `uid_mode` 取值：
  - `0`：16 进制大端（默认）
  - `1`：16 进制小端
  - `2`：10 进制大端（输出 10 位十进制字符串）
  - `3`：10 进制小端（输出 10 位十进制字符串）
- 示例：`(U)`、`(U:1)`、`(U:2)`

3. `(M:block,start,len,keyType,key)` M1 数据

- `block`：块地址（十进制）
- `start`：块内起始偏移（0~16）
- `len`：截取长度（字节，且 `start+len<=16`）
- `keyType`：`A` 或 `B`
- `key`：12 位 HEX（6 字节密钥）
- 示例：`(M:4,0,16,A,FFFFFFFFFFFF)`

4. `(N:addr,len)` NTAG 数据

- `addr`：起始页地址（十进制）
- `len`：要输出的字节数（十进制）
- 示例：`(N:4,16)`

5. `(V:addr,len)` ISO15693 数据

- `addr`：起始块地址（十进制）
- `len`：要输出的字节数（十进制）
- 示例：`(V:0,8)`

6. `(R)` 换行

- 作用：插入 `\r\n`
- 常用于 `mode=2` 字符串输出

7. `(B[:start,len])` BCC 校验

- 作用：在当前位置预留 1 字节，最终填充异或校验值
- 默认：从当前输出开头开始，到校验位之前全部参与
- 可选 `start,len`：指定参与校验范围（基于当前输出缓冲）
- 示例：`AA(U)(B)`、`AA(U)(B:2,8)`

8. `(S[:start,len])` SUM 校验

- 作用：与 `B` 类似，但使用累加和
- 示例：`AA(U)(S)`

客户可直接使用的典型模板：

1. 最常见 Wiegand 风格（HEX 字节流）

```text
AT+DIY=1,AA(L:-2)0104(U)(B)
```

解释：`AA` 帧头 + 长度 + `0104` + UID + BCC。

2. 仅输出 UID（HEX 字节流）

```text
AT+DIY=1,(U)
```

3. 输出 UID 小端（HEX 字节流）

```text
AT+DIY=1,(U:1)
```

4. 输出 UID 十进制（字符串模式）

```text
AT+DIY=2,CARD:(U:2)(R)
```

5. 输出 M1 第 4 块 16 字节

```text
AT+DIY=1,AA(M:4,0,16,A,FFFFFFFFFFFF)(B)
```

6. 输出 NTAG 从 4 页开始 16 字节

```text
AT+DIY=1,AA(N:4,16)(B)
```

7. 输出 ISO15693 从 0 块开始 8 字节

```text
AT+DIY=1,AA(V:0,8)(B)
```

8. 保存当前配置到 Flash

```text
AT+DIY=1,AA(L:-2)0104(U)(B)&W
```

查询与测试命令：

```text
AT+DIY=?
AT+DIY?
```

返回示例：

```text
\r\n+DIY:1,AA(L:-2)0104(U)(B)\r\n
\r\nOK\r\n
```

注意事项：

- `mode=1` 时，模板最终结果必须是合法 HEX 字符串，否则不会输出。
- `mode=2` 时按字符串发送，可混合普通文本与 `(R)`。
- 模板里出现 `,` 是正常的（功能段参数分隔）；命令解析按首个逗号把 `mode` 与模板分开。
- 配置过长会返回 `+CME ERROR:EB`（空间不足）。
- 参数错误通常返回 `+CME ERROR:03`。

### AT+DIY 常见问题（FAQ）

1. 配置了 `AT+DIY=...` 但刷卡没有任何输出？

- 先确认 `mode` 不是 `0`（`0` 表示关闭 DIY 输出）。
- 再确认模板是否能成功解析；模板语法错误会导致不输出。
- 如果是 `mode=1`，最终拼出的内容必须是纯 HEX。

2. 为什么返回 `+CME ERROR:03`？

- `mode` 不在 `0/1/2`。
- 模板语法错误（括号未闭合、参数个数不对、字段超界）。
- `M/N/V` 参数不合法（如长度越界）。

3. 为什么返回 `+CME ERROR:EB`？

- 模板长度超过上限（`DIY_OUT_CFG_MAX_LEN`，当前 100）。
- 或拼接后内部缓冲超过限制。

4. `mode=1` 和 `mode=2` 怎么选？

- `mode=1`：用于发二进制字节流，常见于串口协议对接。
- `mode=2`：用于发可读字符串，适合日志/上位机文本协议。

5. `mode=1` 下为什么“看起来有内容但还是不发”？

- 因为最终结果中包含了非 HEX 字符。
- 例如写了 `CARD:` 这类文本，`mode=1` 会失败，需改为 `mode=2`。

6. `(L)` 计算的长度到底是什么？

- 是当前模板“最终输出缓冲”的字节长度。
- `(L:-2)` 表示在该长度基础上减 2，常用于去除帧头/校验字段。

7. `(B)` 和 `(S)` 的区别？

- `(B)`：BCC（异或校验）。
- `(S)`：SUM（累加和校验）。
- 两者都支持 `start,len` 指定参与范围。

8. `(U:2)` / `(U:3)` 十进制 UID 有什么限制？

- 当前实现按 4 字节拼 10 位十进制，适用于常见 4 字节 UID 场景。
- 7 字节/10 字节 UID 场景建议优先使用 HEX 模式（`U:0/1`）。

9. `AT+DIY?` 和 `AT+DIY=?` 有什么不同？

- `AT+DIY?`：返回当前生效配置字符串。
- `AT+DIY=?`：返回测试样例格式。

10. 什么时候要加 `&W`？

- 需要断电保存时加 `&W`。
- 不加 `&W` 仅当前运行期有效（重启后可能恢复为已保存配置）。

### AT+KMODE

作用：设置刷卡后 USB HID 键盘输出 UID 的格式模式。

参数：

- 格式：`AT+KMODE=<mode>[&]`
- `mode` 取值：
  - `0`：OFF（关闭键盘 UID 输出）
  - `1`：DEC_LITTLE（十进制小端）
  - `2`：DEC_BIG（十进制大端）
  - `3`：HEX_LITTLE（十六进制小端）
  - `4`：HEX_BIG（十六进制大端）
  - `5`：WG（3 位 + 5 位，格式 `DDD,DDDDD`）
- 可选后缀 `&`：立即写入配置区（不带 `&` 仅运行期生效）

说明：

- `AT+KMODE?` 会返回当前模式与每个模式含义。
- 本命令只配置输出格式；是否启用 HID 由 `AT+KBDEN` 控制。

示例：

```text
AT+KMODE=?
AT+KMODE?
AT+KMODE=4
AT+KMODE=5&
```

返回示例：

```text
\r\n#sym:kbd_mode=2\r\n
0:OFF\r\n
1:DEC_LITTLE\r\n
2:DEC_BIG\r\n
3:HEX_LITTLE\r\n
4:HEX_BIG\r\n
5:WG(3DIGIT,5DIGIT)\r\n
\r\nOK\r\n
```

### AT+KBDEN

作用：开启/关闭 USB HID 键盘功能。

参数：

- `0`：关闭
- `1`：开启

说明：

- 设置成功后会写入配置并立即重启。
- 本命令不使用 `&W`，设置即保存。

示例：

```text
AT+KBDEN=?
AT+KBDEN?
AT+KBDEN=1
AT+KBDEN=0
```

返回示例：

```text
\r\n+KBDEN:1\r\n
\r\nOK\r\n
```

### AT+KBD

作用：通过 USB HID 键盘发送字符串。

参数：

- 格式：`AT+KBD=<text>[\\r]`
- `<text>`：要输出的文本
- 可选后缀 `\r`（仅末尾有效）：额外发送一个 Enter 键

说明：

- 仅当 `AT+KBDEN=1` 时可用；否则返回参数错误。
- 当 HID 发送忙时返回 `+CME ERROR:EC`。
- 若只传空串，或仅传无效内容，返回 `+CME ERROR:03`。

示例：

```text
AT+KBD=?
AT+KBD?
AT+KBD=HELLO
AT+KBD=HELLO\r
```

返回示例：

```text
\r\n+KBD:ENABLE=1,SUFFIX=\r(仅末尾有效)\r\n
\r\nOK\r\n
```

### ATI

作用：模块信息命令（当前实现仅返回 OK）。
参数：无。

示例：

```text
ATI
```

返回示例：

```text
\r\nOK\r\n
```

### AT&W

作用：保存配置并重启。
参数：无。

示例：

```text
AT&W
```

返回示例：

```text
\r\nOK\r\n
```

### AT&F

作用：恢复出厂配置并重启。
参数：无。

示例：

```text
AT&F
```

返回示例：

```text
\r\nOK\r\n
```
