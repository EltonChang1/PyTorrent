import { useCallback, useEffect, useState } from "react";

type TorrentRow = {
  id: string;
  name: string;
  download_dir: string;
  total: number;
  downloaded: number;
  uploaded?: number;
  complete: boolean;
  error: string | null;
};

type BtListen = {
  ok: boolean;
  configured_bind?: string;
  configured_port?: number;
  announced_to_trackers_port?: number;
  sockets?: string[];
  error?: string;
};

/** Vite dev server proxies `/api` → daemon; production serves API on the same origin without `/api`. */
const API_PREFIX = import.meta.env.DEV ? "/api" : "";

const api = (path: string, init?: RequestInit) =>
  fetch(`${API_PREFIX}${path}`, init);

export default function App() {
  const [rows, setRows] = useState<TorrentRow[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [btListen, setBtListen] = useState<BtListen | null>(null);

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-200), line]);
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const r = await api("/health");
      if (!r.ok) return;
      const j = (await r.json()) as { bt_listen?: BtListen };
      if (j.bt_listen) setBtListen(j.bt_listen);
    } catch {
      setBtListen({ ok: false, error: "could not reach /health" });
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await api("/torrents");
      if (!r.ok) throw new Error(String(r.status));
      setRows(await r.json());
    } catch {
      pushLog("Failed to fetch /torrents — is pytorrentd running on 127.0.0.1:8765?");
    }
  }, [pushLog]);

  useEffect(() => {
    fetchHealth();
    const hid = setInterval(fetchHealth, 10000);
    return () => clearInterval(hid);
  }, [fetchHealth]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const ws = new WebSocket(`${proto}//${host}/ws`);
    ws.onopen = () => {
      setConnected(true);
      pushLog("WebSocket connected");
    };
    ws.onclose = () => {
      setConnected(false);
      pushLog("WebSocket disconnected");
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        pushLog(JSON.stringify(msg));
        if (msg.type === "progress" || msg.type === "complete") refresh();
      } catch {
        pushLog(String(ev.data));
      }
    };
    return () => ws.close();
  }, [pushLog, refresh]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    const r = await api("/torrents", { method: "POST", body: fd });
    if (!r.ok) {
      pushLog(`Add failed: ${await r.text()}`);
      return;
    }
    pushLog(`Added: ${JSON.stringify(await r.json())}`);
    refresh();
    e.target.value = "";
  }

  const btLine =
    btListen == null
      ? "Checking BitTorrent listener…"
      : btListen.ok
        ? `BitTorrent TCP: listening (${btListen.sockets?.join(", ") || `${btListen.configured_bind}:${btListen.configured_port}`}) — announce port to trackers: ${btListen.announced_to_trackers_port ?? btListen.configured_port}. Forward that TCP port on your router/firewall for remote peers.`
        : `BitTorrent listener failed: ${btListen.error ?? "unknown"}. Restart pytorrentd after freeing ${btListen.configured_bind}:${btListen.configured_port} or set PYTORRENT_BT_PORT.`;

  return (
    <>
      <h1>PyTorrent</h1>
      <div className="banner" role="status">
        <p>
          The <strong>daemon</strong> must be running: <code>pytorrentd</code> (default{" "}
          <code>127.0.0.1:8765</code>). This page only talks to that API; the browser does not run
          BitTorrent peer wire itself.
        </p>
        <p>
          <strong>Restart after code changes:</strong> stop the daemon (Ctrl+C) and run{" "}
          <code>pytorrentd</code> again so the peer listener binds.
        </p>
        <p>WebSocket: {connected ? "connected" : "not connected"}</p>
        <p style={{ marginTop: "0.75rem", fontSize: "0.95rem" }}>{btLine}</p>
      </div>

      <label>
        Add torrent:{" "}
        <input type="file" accept=".torrent,application/x-bittorrent" onChange={onFile} />
      </label>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Progress</th>
            <th>Uploaded</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>
                {t.total
                  ? `${((100 * t.downloaded) / t.total).toFixed(1)}%`
                  : "—"}
              </td>
              <td>
                {typeof t.uploaded === "number"
                  ? `${(t.uploaded / 1_048_576).toFixed(2)} MiB`
                  : "—"}
              </td>
              <td>
                {t.error ? t.error : t.complete ? "complete" : "downloading"}
              </td>
              <td>
                <button type="button" onClick={() => api(`/torrents/${t.id}/stop`, { method: "POST" }).then(refresh)}>
                  Stop
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Events</h2>
      <pre style={{ fontSize: 12, maxHeight: 240, overflow: "auto", background: "#1a1d24", padding: "0.75rem" }}>
        {log.join("\n")}
      </pre>
    </>
  );
}
