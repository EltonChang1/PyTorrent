import { useCallback, useEffect, useRef, useState } from "react";
import { DiscoverMovies } from "./DiscoverMovies";

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
  const [searchConfigured, setSearchConfigured] = useState(false);
  const [magnetField, setMagnetField] = useState("");
  const [tab, setTab] = useState<"discover" | "downloads">("downloads");
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const preferDiscoverOnce = useRef(true);

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-200), line]);
  }, []);

  const showToast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    pushLog(`[${kind}] ${msg}`);
  }, [pushLog]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  const fetchHealth = useCallback(async () => {
    try {
      const r = await api("/health");
      if (!r.ok) return;
      const j = (await r.json()) as { bt_listen?: BtListen; search?: { configured?: boolean } };
      if (j.bt_listen) setBtListen(j.bt_listen);
      const sc = Boolean(j.search?.configured);
      setSearchConfigured(sc);
      if (!sc) setTab("downloads");
      else if (preferDiscoverOnce.current) {
        preferDiscoverOnce.current = false;
        setTab("discover");
      }
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
      showToast(await r.text(), "err");
      return;
    }
    const j = (await r.json()) as { name?: string };
    showToast(`Added: ${j.name ?? "torrent"}`, "ok");
    setMagnetField("");
    refresh();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    const r = await api("/torrents", { method: "POST", body: fd });
    if (!r.ok) {
      showToast(`Add failed: ${await r.text()}`, "err");
      return;
    }
    showToast(`Added: ${JSON.stringify(await r.json())}`, "ok");
    refresh();
    e.target.value = "";
  }

  const btLine =
    btListen == null
      ? "Checking BitTorrent listener…"
      : btListen.ok
        ? `Listening on ${btListen.sockets?.join(", ") || `${btListen.configured_bind}:${btListen.configured_port}`}; trackers use port ${btListen.announced_to_trackers_port ?? btListen.configured_port}.`
        : `Listener failed: ${btListen.error ?? "unknown"}. Set PYTORRENT_BT_PORT or free the port.`;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <h1 className="brand-title">PyTorrent</h1>
          <p className="brand-tag">Local downloads — runs on your machine</p>
        </div>
        <nav className="app-nav" aria-label="Main">
          {searchConfigured ? (
            <button
              type="button"
              className={tab === "discover" ? "nav-btn nav-btn-active" : "nav-btn"}
              onClick={() => setTab("discover")}
            >
              Movies
            </button>
          ) : null}
          <button
            type="button"
            className={tab === "downloads" ? "nav-btn nav-btn-active" : "nav-btn"}
            onClick={() => setTab("downloads")}
          >
            My downloads
          </button>
        </nav>
      </header>

      {toast && (
        <div className={toast.kind === "err" ? "toast toast-err" : "toast toast-ok"} role="status">
          {toast.msg}
        </div>
      )}

      <details className="status-panel">
        <summary>Connection & BitTorrent status</summary>
        <p>
          API / daemon: <code>pytorrentd</code> (default <code>127.0.0.1:8765</code>). WebSocket:{" "}
          {connected ? "connected" : "disconnected"}.
        </p>
        <p className="status-bt">{btLine}</p>
        {!searchConfigured && (
          <p>
            Movie browse needs{" "}
            <a href="https://github.com/Ryuk-me/Torrent-Api-py">Torrent-Api-py</a> and{" "}
            <code>PYTORRENT_SEARCH_API_BASE</code> on the daemon.
          </p>
        )}
      </details>

      {searchConfigured && tab === "discover" && (
        <DiscoverMovies api={api} onToast={showToast} onAdded={refresh} />
      )}

      {(!searchConfigured || tab === "downloads") && (
        <section className="downloads-section">
          <h2 className="section-title">My downloads</h2>
          <div className="add-row">
            <label className="field-inline">
              <span className="field-label">Torrent file</span>
              <input type="file" accept=".torrent,application/x-bittorrent" onChange={onFile} />
            </label>
            <label className="field-inline grow">
              <span className="field-label">Magnet</span>
              <input
                type="text"
                className="input-magnet"
                value={magnetField}
                onChange={(e) => setMagnetField(e.target.value)}
                placeholder="magnet:?xt=urn:btih:… (needs tr= trackers)"
              />
            </label>
            <button type="button" className="btn-primary" onClick={() => submitMagnet()}>
              Add magnet
            </button>
          </div>

          <div className="table-wrap">
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
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No active downloads. Use Movies or add a torrent above.
                    </td>
                  </tr>
                ) : (
                  rows.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>
                        {t.total ? `${((100 * t.downloaded) / t.total).toFixed(1)}%` : "—"}
                      </td>
                      <td>
                        {typeof t.uploaded === "number"
                          ? `${(t.uploaded / 1_048_576).toFixed(2)} MiB`
                          : "—"}
                      </td>
                      <td>{t.error ? t.error : t.complete ? "complete" : "downloading"}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() =>
                            api(`/torrents/${t.id}/stop`, { method: "POST" }).then(refresh)
                          }
                        >
                          Stop
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <details className="events-panel">
        <summary>Event log</summary>
        <pre className="events-pre">{log.join("\n")}</pre>
      </details>
    </div>
  );
}
