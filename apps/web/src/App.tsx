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

type SearchHit = {
  name?: string;
  magnet?: string;
  size?: string;
  seeders?: string;
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
  const [searchConfigured, setSearchConfigured] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [magnetField, setMagnetField] = useState("");

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-200), line]);
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const r = await api("/health");
      if (!r.ok) return;
      const j = (await r.json()) as { bt_listen?: BtListen; search?: { configured?: boolean } };
      if (j.bt_listen) setBtListen(j.bt_listen);
      setSearchConfigured(Boolean(j.search?.configured));
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

  async function submitMagnet(uri?: string) {
    const m = (uri ?? magnetField).trim();
    if (!m) return;
    const r = await api("/torrents/magnet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ magnet: m }),
    });
    if (!r.ok) {
      pushLog(`Magnet add failed: ${await r.text()}`);
      return;
    }
    pushLog(`Magnet added: ${JSON.stringify(await r.json())}`);
    setMagnetField("");
    refresh();
  }

  async function runSearch() {
    const q = searchQ.trim();
    if (!q) return;
    setSearchBusy(true);
    try {
      const r = await api(`/search?q=${encodeURIComponent(q)}&limit=20`);
      if (!r.ok) {
        pushLog(`Search failed: ${await r.text()}`);
        setSearchHits([]);
        return;
      }
      const j = (await r.json()) as { data?: SearchHit[] };
      setSearchHits(Array.isArray(j.data) ? j.data : []);
    } finally {
      setSearchBusy(false);
    }
  }

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

      <div style={{ marginTop: "1rem" }}>
        <label>
          Magnet link (needs <code>tr=</code> trackers):{" "}
          <input
            type="text"
            size={72}
            value={magnetField}
            onChange={(e) => setMagnetField(e.target.value)}
            placeholder="magnet:?xt=urn:btih:…"
          />
        </label>{" "}
        <button type="button" onClick={() => submitMagnet()}>
          Add magnet
        </button>
      </div>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Search</h2>
        {!searchConfigured ? (
          <p style={{ color: "#666", fontSize: "0.95rem" }}>
            Search is off. Run{" "}
            <a href="https://github.com/Ryuk-me/Torrent-Api-py">Torrent-Api-py</a> locally and set{" "}
            <code>PYTORRENT_SEARCH_API_BASE</code> (e.g. <code>http://127.0.0.1:8009</code>), then restart{" "}
            <code>pytorrentd</code>.
          </p>
        ) : (
          <>
            <label>
              Query:{" "}
              <input
                type="search"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
            </label>{" "}
            <button type="button" disabled={searchBusy} onClick={() => runSearch()}>
              {searchBusy ? "Searching…" : "Search"}
            </button>
            {searchHits.length > 0 && (
              <table style={{ marginTop: "0.75rem" }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Seeders</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {searchHits.map((row, i) => (
                    <tr key={i}>
                      <td>{row.name ?? "—"}</td>
                      <td>{row.size ?? "—"}</td>
                      <td>{row.seeders ?? "—"}</td>
                      <td>
                        {row.magnet ? (
                          <button type="button" onClick={() => submitMagnet(row.magnet)}>
                            Add
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

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
