import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Bell,
  Cable,
  Contact,
  Cpu,
  FileDigit,
  Globe,
  Keyboard,
  Power,
  Radio,
  RotateCcw,
  Save,
  ScanLine,
  Send,
  Settings,
  Type,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import {
  AtNfcClient,
  AtNfcCmeError,
  type DecodedNdefRecord,
  type FindCardResult,
  type InfoResult
} from "../../src";
import { WebSerialTransport } from "../../src/web-serial";
import "./styles.css";

type ConnectionState = "disconnected" | "connecting" | "connected";

interface LogEntry {
  id: number;
  at: string;
  kind: "tx" | "rx" | "info" | "error" | "urc";
  message: string;
}

const DEFAULT_BAUD_RATE = 115200;
const M1_NDEF_PUBLIC_KEY = "D3F7D3F7D3F7";
const M1_MAD_PUBLIC_KEY = "A0A1A2A3A4A5";
const M1_DEFAULT_KEY = "FFFFFFFFFFFF";

function App() {
  const [client, setClient] = useState<AtNfcClient | null>(null);
  const [state, setState] = useState<ConnectionState>("disconnected");
  const [info, setInfo] = useState<InfoResult | null>(null);
  const [card, setCard] = useState<FindCardResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [continuousUid, setContinuousUid] = useState(false);
  const [uidIntervalMs, setUidIntervalMs] = useState(800);
  const [uidReadCount, setUidReadCount] = useState(0);
  const [baudRate, setBaudRate] = useState(DEFAULT_BAUD_RATE);
  const [rawCommand, setRawCommand] = useState("AT+GMR");
  const [ntagPage, setNtagPage] = useState(4);
  const [ntagPages, setNtagPages] = useState(4);
  const [ntagData, setNtagData] = useState("0011223344556677");
  const [m1Block, setM1Block] = useState(4);
  const [m1Key, setM1Key] = useState("FFFFFFFFFFFF");
  const [m1Data, setM1Data] = useState("00112233445566778899AABBCCDDEEFF");
  const [isoBlock, setIsoBlock] = useState(0);
  const [isoBlocks, setIsoBlocks] = useState(1);
  const [apdu, setApdu] = useState("00A4040007A0000003330101");
  const [diyMode, setDiyMode] = useState<0 | 1 | 2>(2);
  const [diyTemplate, setDiyTemplate] = useState("CARD:(U:2)(R)");
  const [hidEnabled, setHidEnabled] = useState(false);
  const [hidMode, setHidMode] = useState<0 | 1 | 2 | 3 | 4 | 5>(4);
  const [hidText, setHidText] = useState("HELLO");
  const [hidEnter, setHidEnter] = useState(true);
  const [hidStatus, setHidStatus] = useState("-");
  const [ndefStartPage, setNdefStartPage] = useState(4);
  const [ndefPages, setNdefPages] = useState(40);
  const [ndefTarget, setNdefTarget] = useState<"auto" | "ntag" | "m1">("auto");
  const [m1NdefKey, setM1NdefKey] = useState(M1_NDEF_PUBLIC_KEY);
  const [m1WriteMode, setM1WriteMode] = useState<"preserve" | "auto" | "format">("auto");
  const [ndefRecords, setNdefRecords] = useState<DecodedNdefRecord[]>([]);
  const [urlValue, setUrlValue] = useState("https://example.com");
  const [wifiSsid, setWifiSsid] = useState("Studio WiFi");
  const [wifiPassword, setWifiPassword] = useState("password1234");
  const [wifiAuth, setWifiAuth] = useState<"OPEN" | "WPA" | "WPA2" | "WPA3" | "WEP">("WPA2");
  const [contactName, setContactName] = useState("ATNFC Demo");
  const [contactPhone, setContactPhone] = useState("+86 138 0000 0000");
  const [contactEmail, setContactEmail] = useState("hello@example.com");
  const [contactUrl, setContactUrl] = useState("https://example.com");
  const [textValue, setTextValue] = useState("Hello from ATNFC");
  const uidLoopBusyRef = useRef(false);
  const lastLoopUidRef = useRef<string | null>(null);

  const m1NdefKeys = useMemo(() => {
    const normalized = m1NdefKey.trim().toUpperCase();
    return normalized === M1_NDEF_PUBLIC_KEY ? undefined : [normalized, M1_DEFAULT_KEY, M1_MAD_PUBLIC_KEY];
  }, [m1NdefKey]);

  const supported = WebSerialTransport.isSupported();
  const statusLabel = useMemo(() => {
    if (!supported) return "unsupported";
    return state;
  }, [state, supported]);

  function appendLog(kind: LogEntry["kind"], message: string) {
    setLogs((current) => [
      {
        id: Date.now() + Math.random(),
        at: new Date().toLocaleTimeString(),
        kind,
        message
      },
      ...current.slice(0, 119)
    ]);
  }

  useEffect(() => {
    if (!client || !continuousUid) return;

    let cancelled = false;
    let timer: number | undefined;

    const schedule = () => {
      if (!cancelled) {
        timer = window.setTimeout(tick, Math.max(uidIntervalMs, 200));
      }
    };

    const tick = async () => {
      if (cancelled) return;
      if (uidLoopBusyRef.current) {
        schedule();
        return;
      }

      uidLoopBusyRef.current = true;
      try {
        const found = await client.findCard(31, { timeoutMs: Math.max(uidIntervalMs, 1200) });
        if (cancelled) return;

        setCard(found);
        setUidReadCount((count) => count + 1);
        if (lastLoopUidRef.current !== found.uid) {
          lastLoopUidRef.current = found.uid;
          appendLog("info", `uid ${found.uid}`);
        }
      } catch (error) {
        if (!cancelled && !(error instanceof AtNfcCmeError && error.code === "E1")) {
          appendLog("error", getErrorMessage(error));
        }
      } finally {
        uidLoopBusyRef.current = false;
        schedule();
      }
    };

    void tick();

    return () => {
      cancelled = true;
      uidLoopBusyRef.current = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [client, continuousUid, uidIntervalMs]);

  async function connect() {
    if (!supported) return;

    setState("connecting");
    try {
      const transport = await WebSerialTransport.requestPort(undefined, { baudRate });
      const nextClient = new AtNfcClient(transport, { timeoutMs: 5000 });
      nextClient.on("line", (line) => appendLog(line === "OK" ? "info" : "rx", line));
      nextClient.on("urc", (line) => appendLog("urc", line));
      nextClient.on("error", (error) => appendLog("error", getErrorMessage(error)));
      await nextClient.open();
      setClient(nextClient);
      setState("connected");
      appendLog("info", `connected @ ${baudRate}`);
    } catch (error) {
      setState("disconnected");
      appendLog("error", getErrorMessage(error));
    }
  }

  async function disconnect() {
    if (!client) return;
    await client.close().catch((error) => appendLog("error", getErrorMessage(error)));
    setClient(null);
    setInfo(null);
    setCard(null);
    setContinuousUid(false);
    setState("disconnected");
    appendLog("info", "disconnected");
  }

  async function run(label: string, action: (activeClient: AtNfcClient) => Promise<unknown>) {
    if (!client || busy) return;

    setBusy(true);
    appendLog("tx", label);
    try {
      const result = await action(client);
      if (result !== undefined) appendLog("info", formatValue(result));
    } catch (error) {
      appendLog("error", getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>ATNFC WebSerial Console</h1>
          <p>Browser control surface for ATNFC-102 / ATNFC-103 serial modules.</p>
        </div>
        <div className={`status ${statusLabel}`}>{statusLabel}</div>
      </header>

      <section className="toolbar" aria-label="Connection controls">
        <label className="field small">
          <span>Baud</span>
          <select value={baudRate} onChange={(event) => setBaudRate(Number(event.target.value))} disabled={state !== "disconnected"}>
            {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((rate) => (
              <option key={rate} value={rate}>{rate}</option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={connect} disabled={!supported || state !== "disconnected"} title="Connect serial port">
          <Cable size={18} /> Connect
        </button>
        <button onClick={disconnect} disabled={state !== "connected"} title="Disconnect serial port">
          <WifiOff size={18} /> Disconnect
        </button>
        <button onClick={() => run("test", (active) => active.test())} disabled={!client || busy} title="Run AT test">
          <Activity size={18} /> Test
        </button>
        <button onClick={() => run("info", async (active) => setInfo(await active.getInfo()))} disabled={!client || busy} title="Read module info">
          <Cpu size={18} /> Info
        </button>
      </section>

      <div className="grid">
        <section className="panel overview">
          <div className="panelTitle"><Radio size={18} /> Module</div>
          <dl>
            <dt>Manufacturer</dt><dd>{info?.manufacturer ?? "-"}</dd>
            <dt>Firmware</dt><dd>{info?.firmware ?? "-"}</dd>
            <dt>Model</dt><dd>{info?.model ?? "-"}</dd>
            <dt>Serial</dt><dd>{info?.serialNumber ?? "-"}</dd>
          </dl>
        </section>

        <section className="panel overview">
          <div className="panelTitle"><ScanLine size={18} /> Card</div>
          <dl>
            <dt>UID</dt><dd>{card?.uid ?? "-"}</dd>
            <dt>Type</dt><dd>{card ? `${card.type} / ${card.typeName}` : "-"}</dd>
            <dt>SAK</dt><dd>{card?.sak ?? card?.afi ?? card?.pmm ?? "-"}</dd>
            <dt>ATQA</dt><dd>{card?.atqa ?? card?.dsfid ?? card?.systemCode ?? "-"}</dd>
            <dt>Loop</dt><dd>{continuousUid ? `${uidReadCount} reads` : "off"}</dd>
          </dl>
          <div className="formGrid one compactField">
            <NumberField label="Interval ms" value={uidIntervalMs} onChange={setUidIntervalMs} />
          </div>
          <div className="rowActions">
            <button onClick={() => run("findCard", async (active) => setCard(await active.findCard(31)))} disabled={!client || busy} title="Find card">
              <ScanLine size={18} /> Find
            </button>
            <button onClick={() => setContinuousUid((value) => !value)} disabled={!client} title="Continuously read UID">
              <Activity size={18} /> {continuousUid ? "Stop" : "Loop"}
            </button>
            <button onClick={() => run("power off", (active) => active.power(false))} disabled={!client || busy} title="Power off antenna">
              <Power size={18} /> Off
            </button>
          </div>
        </section>

        <section className="panel controls">
          <div className="panelTitle"><FileDigit size={18} /> NTAG</div>
          <div className="formGrid two">
            <NumberField label="Page" value={ntagPage} onChange={setNtagPage} />
            <NumberField label="Pages" value={ntagPages} onChange={setNtagPages} />
          </div>
          <TextField label="Data" value={ntagData} onChange={setNtagData} />
          <div className="rowActions">
            <button onClick={() => run("ntag read", (active) => active.readNtag(ntagPage, ntagPages))} disabled={!client || busy} title="Read NTAG pages">
              <ScanLine size={18} /> Read
            </button>
            <button onClick={() => run("ntag write", (active) => active.writeNtag(ntagPage, ntagData))} disabled={!client || busy} title="Write NTAG pages">
              <Save size={18} /> Write
            </button>
          </div>
        </section>

        <section className="panel controls">
          <div className="panelTitle"><Settings size={18} /> Mifare Classic</div>
          <NumberField label="Block" value={m1Block} onChange={setM1Block} />
          <TextField label="Key A" value={m1Key} onChange={setM1Key} />
          <TextField label="Data" value={m1Data} onChange={setM1Data} />
          <div className="rowActions">
            <button onClick={() => run("m1 auth", (active) => active.authenticateM1(m1Block, "A", m1Key))} disabled={!client || busy} title="Authenticate M1 block">
              <Keyboard size={18} /> Auth
            </button>
            <button onClick={() => run("m1 read", (active) => active.readM1(m1Block))} disabled={!client || busy} title="Read M1 block">
              <ScanLine size={18} /> Read
            </button>
            <button onClick={() => run("m1 write", (active) => active.writeM1(m1Block, m1Data))} disabled={!client || busy} title="Write M1 block">
              <Save size={18} /> Write
            </button>
          </div>
        </section>

        <section className="panel controls">
          <div className="panelTitle"><Radio size={18} /> ISO15693</div>
          <div className="formGrid two">
            <NumberField label="Block" value={isoBlock} onChange={setIsoBlock} />
            <NumberField label="Blocks" value={isoBlocks} onChange={setIsoBlocks} />
          </div>
          <div className="rowActions">
            <button onClick={() => run("iso15693 read", (active) => active.readIso15693(isoBlock, isoBlocks))} disabled={!client || busy} title="Read ISO15693 blocks">
              <ScanLine size={18} /> Read
            </button>
          </div>
        </section>

        <section className="panel controls">
          <div className="panelTitle"><Send size={18} /> APDU</div>
          <TextField label="APDU" value={apdu} onChange={setApdu} />
          <div className="rowActions">
            <button onClick={() => run("apdu", (active) => active.apdu(apdu, { timeoutMs: 8000 }))} disabled={!client || busy} title="Send APDU">
              <Send size={18} /> Send
            </button>
          </div>
        </section>

        <section className="panel controls extraWide">
          <div className="panelTitle"><Globe size={18} /> NDEF</div>
          <div className="formGrid two">
            <label className="field">
              <span>Target</span>
              <select value={ndefTarget} onChange={(event) => setNdefTarget(event.target.value as typeof ndefTarget)}>
                <option value="auto">Auto</option>
                <option value="ntag">NTAG</option>
                <option value="m1">M1</option>
              </select>
            </label>
            <TextField label="M1 Key A" value={m1NdefKey} onChange={setM1NdefKey} />
            <label className="field">
              <span>M1 Mode</span>
              <select value={m1WriteMode} onChange={(event) => setM1WriteMode(event.target.value as typeof m1WriteMode)} disabled={ndefTarget === "ntag"}>
                <option value="auto">Auto</option>
                <option value="preserve">Preserve</option>
                <option value="format">Format</option>
              </select>
            </label>
            <NumberField label={ndefTarget === "m1" ? "Block" : "Page"} value={ndefStartPage} onChange={setNdefStartPage} />
            <NumberField label={ndefTarget === "m1" ? "Blocks" : "Pages"} value={ndefPages} onChange={setNdefPages} />
          </div>
          <div className="rowActions compact">
            <button
              onClick={() => run("ndef read", async (active) => {
                const records = await active.readNdef({
                  target: ndefTarget,
                  ntag: { startPage: ndefStartPage, pages: ndefPages },
                  m1: { startBlock: ndefStartPage, blocks: ndefPages, ...(m1NdefKeys ? { keys: m1NdefKeys } : {}) }
                });
                setNdefRecords(records);
              })}
              disabled={!client || busy}
              title="Read NDEF"
            >
              <ScanLine size={18} /> Read
            </button>
            <button
              onClick={() => run("ndef text", (active) => active.writeText(textValue, {
                target: ndefTarget,
                ntag: { startPage: ndefStartPage },
                m1: {
                  startBlock: ndefStartPage,
                  maxBlocks: ndefPages,
                  mode: m1WriteMode,
                  ...(m1NdefKeys ? { keys: m1NdefKeys } : {})
                }
              }))}
              disabled={!client || busy}
              title="Write text NDEF"
            >
              <Type size={18} /> Text
            </button>
            <button
              onClick={() => {
                const confirmed = window.confirm("Format M1 as NDEF? This rewrites MAD, data blocks, and sector trailers.");
                if (confirmed) {
                  void run("m1 ndef format", (active) => active.formatM1Ndef({
                    ndefKey: m1NdefKey,
                    ...(m1NdefKeys ? { keys: m1NdefKeys } : {})
                  }));
                }
              }}
              disabled={!client || busy || ndefTarget === "ntag"}
              title="Format M1 as NDEF"
            >
              <Save size={18} /> Format
            </button>
          </div>
          <TextField label="Text" value={textValue} onChange={setTextValue} />
          <div className="recordList">
            {ndefRecords.length === 0 ? (
              <div className="emptyRecord">No records</div>
            ) : (
              ndefRecords.map((record, index) => (
                <div key={`${record.typeText}-${index}`} className="record">
                  <strong>{record.typeText || record.mimeType || `TNF ${record.tnf}`}</strong>
                  <code>{record.uri ?? record.text ?? record.vcard ?? formatValue(record.wifi) ?? record.mimeType ?? "binary"}</code>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel controls ndefCard">
          <div className="panelTitle"><Globe size={18} /> URL</div>
          <TextField label="URL" value={urlValue} onChange={setUrlValue} />
          <div className="rowActions">
            <button
              onClick={() => run("ndef url", (active) => active.writeUrl(urlValue, {
                target: ndefTarget,
                ntag: { startPage: ndefStartPage },
                m1: {
                  startBlock: ndefStartPage,
                  maxBlocks: ndefPages,
                  mode: m1WriteMode,
                  ...(m1NdefKeys ? { keys: m1NdefKeys } : {})
                }
              }))}
              disabled={!client || busy}
              title="Write URL NDEF"
            >
              <Save size={18} /> Write
            </button>
          </div>
        </section>

        <section className="panel controls ndefCard">
          <div className="panelTitle"><Wifi size={18} /> Wi-Fi</div>
          <div className="formGrid two">
            <TextField label="SSID" value={wifiSsid} onChange={setWifiSsid} />
            <label className="field">
              <span>Auth</span>
              <select value={wifiAuth} onChange={(event) => setWifiAuth(event.target.value as typeof wifiAuth)}>
                {(["OPEN", "WPA", "WPA2", "WPA3", "WEP"] as const).map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
            </label>
          </div>
          <TextField label="Password" value={wifiPassword} onChange={setWifiPassword} />
          <div className="rowActions">
            <button
              onClick={() => run("ndef wifi", (active) => active.writeWifi(
                { ssid: wifiSsid, authentication: wifiAuth, password: wifiAuth === "OPEN" ? undefined : wifiPassword },
                {
                  target: ndefTarget,
                  ntag: { startPage: ndefStartPage },
                  m1: {
                    startBlock: ndefStartPage,
                    maxBlocks: ndefPages,
                    mode: m1WriteMode,
                    ...(m1NdefKeys ? { keys: m1NdefKeys } : {})
                  }
                }
              ))}
              disabled={!client || busy}
              title="Write Wi-Fi NDEF"
            >
              <Save size={18} /> Write
            </button>
          </div>
        </section>

        <section className="panel controls ndefCard">
          <div className="panelTitle"><Contact size={18} /> vCard</div>
          <TextField label="Name" value={contactName} onChange={setContactName} />
          <TextField label="Phone" value={contactPhone} onChange={setContactPhone} />
          <TextField label="Email" value={contactEmail} onChange={setContactEmail} />
          <TextField label="URL" value={contactUrl} onChange={setContactUrl} />
          <div className="rowActions">
            <button
              onClick={() => run("ndef vcard", (active) => active.writeVCard(
                { name: contactName, phone: contactPhone, email: contactEmail, url: contactUrl },
                {
                  target: ndefTarget,
                  ntag: { startPage: ndefStartPage },
                  m1: {
                    startBlock: ndefStartPage,
                    maxBlocks: ndefPages,
                    mode: m1WriteMode,
                    ...(m1NdefKeys ? { keys: m1NdefKeys } : {})
                  }
                }
              ))}
              disabled={!client || busy}
              title="Write vCard NDEF"
            >
              <Save size={18} /> Write
            </button>
          </div>
        </section>

        <section className="panel controls wide">
          <div className="panelTitle"><Settings size={18} /> DIY Output</div>
          <div className="segmented">
            {[0, 1, 2].map((mode) => (
              <button key={mode} className={diyMode === mode ? "active" : ""} onClick={() => setDiyMode(mode as 0 | 1 | 2)} disabled={busy}>
                {mode === 0 ? "Off" : mode === 1 ? "Hex" : "Text"}
              </button>
            ))}
          </div>
          <TextField label="Template" value={diyTemplate} onChange={setDiyTemplate} />
          <div className="rowActions">
            <button onClick={() => run("set diy", (active) => active.setDiy(diyMode, diyTemplate, true))} disabled={!client || busy} title="Save DIY output template">
              <Save size={18} /> Save
            </button>
            <button onClick={() => run("beep", (active) => active.beep(1, 100, 80))} disabled={!client || busy} title="Beep once">
              <Bell size={18} /> Beep
            </button>
          </div>
        </section>

        <section className="panel controls wide">
          <div className="panelTitle"><Keyboard size={18} /> HID</div>
          <dl className="compactDl">
            <dt>KBDEN</dt><dd>{hidStatus}</dd>
          </dl>
          <div className="formGrid two compactField">
            <label className="field">
              <span>UID mode</span>
              <select value={hidMode} onChange={(event) => setHidMode(Number(event.target.value) as typeof hidMode)}>
                <option value={0}>OFF</option>
                <option value={1}>DEC little</option>
                <option value={2}>DEC big</option>
                <option value={3}>HEX little</option>
                <option value={4}>HEX big</option>
                <option value={5}>WG</option>
              </select>
            </label>
            <label className="field checkboxField">
              <span>Enable</span>
              <input type="checkbox" checked={hidEnabled} onChange={(event) => setHidEnabled(event.target.checked)} />
            </label>
          </div>
          <TextField label="Test text" value={hidText} onChange={setHidText} />
          <label className="inlineCheck">
            <input type="checkbox" checked={hidEnter} onChange={(event) => setHidEnter(event.target.checked)} /> Enter
          </label>
          <div className="rowActions">
            <button onClick={() => run("hid status", async (active) => setHidStatus(`${await active.getKeyboardEnabled()} / ${formatValue(await active.getKeyboardMode())}`))} disabled={!client || busy} title="Read HID status">
              <ScanLine size={18} /> Status
            </button>
            <button onClick={() => run("hid mode", (active) => active.setKeyboardMode(hidMode, true))} disabled={!client || busy} title="Save HID UID output mode">
              <Save size={18} /> Mode
            </button>
            <button onClick={() => run("hid enable", async (active) => { await active.setKeyboardEnabled(hidEnabled); setHidStatus(hidEnabled ? "1" : "0"); })} disabled={!client || busy} title="Enable or disable HID keyboard">
              <Power size={18} /> {hidEnabled ? "Enable" : "Disable"}
            </button>
            <button onClick={() => run("hid text", (active) => active.keyboard(hidText, hidEnter))} disabled={!client || busy} title="Send HID keyboard text">
              <Send size={18} /> Test
            </button>
          </div>
        </section>

        <section className="panel controls wide">
          <div className="panelTitle"><Send size={18} /> Raw AT</div>
          <TextField label="Command" value={rawCommand} onChange={setRawCommand} />
          <div className="rowActions">
            <button onClick={() => run(rawCommand, (active) => active.command(rawCommand))} disabled={!client || busy} title="Send raw AT command">
              <Send size={18} /> Send
            </button>
            <button onClick={() => run("pcd reset", (active) => active.resetPcd())} disabled={!client || busy} title="Reset NFC chip">
              <RotateCcw size={18} /> PCD
            </button>
          </div>
        </section>

        <section className="panel logPanel">
          <div className="panelTitle"><Activity size={18} /> Log</div>
          <button className="iconOnly" onClick={() => setLogs([])} title="Clear log"><X size={18} /></button>
          <div className="logList">
            {logs.map((entry) => (
              <div key={entry.id} className={`log ${entry.kind}`}>
                <span>{entry.at}</span>
                <strong>{entry.kind}</strong>
                <code>{entry.message}</code>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
    </label>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof AtNfcCmeError) {
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "OK" : "false";
  return JSON.stringify(value);
}

createRoot(document.getElementById("root")!).render(<App />);
