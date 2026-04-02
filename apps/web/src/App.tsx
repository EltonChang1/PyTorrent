import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import type { AppOutletContext, TorrentJob } from "./appOutletContext";
import { AppLayout } from "./layout/AppLayout";
import { HomePage } from "./pages/HomePage";
import { SearchPage } from "./pages/SearchPage";
import { DownloadsPage } from "./pages/DownloadsPage";
import { WatchPage } from "./pages/WatchPage";

type BtListen = {
  ok: boolean;
  configured_bind?: string;
  configured_port?: number;
  announced_to_trackers_port?: number;
  sockets?: string[];
  error?: string;
};

const API_PREFIX = import.meta.env.DEV ? "/api" : "";

const api = (path: string, init?: RequestInit) =>
  fetch(`${API_PREFIX}${path}`, init);

function AppRoutes() {
  const [torrentRows, setTorrentRows] = useState<TorrentJob[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [btListen, setBtListen] = useState<BtListen | null>(null);
  const [searchConfigured, setSearchConfigured] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-200), line]);
  }, []);

  const showToast = useCallback(
    (msg: string, kind: "ok" | "err" = "ok") => {
      setToast({ msg, kind });
      pushLog(`[${kind}] ${msg}`);
    },
    [pushLog],
  );

  const refreshTorrents = useCallback(async () => {
    try {
      const r = await api("/torrents");
      if (!r.ok) throw new Error(String(r.status));
      setTorrentRows(await r.json());
    } catch {
      pushLog("Failed to fetch /torrents — is pytorrentd running?");
    }
  }, [pushLog]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(id);
  }, [toast]);

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

  useEffect(() => {
    fetchHealth();
    const hid = setInterval(fetchHealth, 10000);
    return () => clearInterval(hid);
  }, [fetchHealth]);

  useEffect(() => {
    refreshTorrents();
    const id = setInterval(refreshTorrents, 5000);
    return () => clearInterval(id);
  }, [refreshTorrents]);

  const logRef = useRef(pushLog);
  const refreshRef = useRef(refreshTorrents);
  logRef.current = pushLog;
  refreshRef.current = refreshTorrents;

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const ws = new WebSocket(`${proto}//${host}/ws`);
    ws.onopen = () => {
      setConnected(true);
      logRef.current("WebSocket connected");
    };
    ws.onclose = () => {
      setConnected(false);
      logRef.current("WebSocket disconnected");
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        logRef.current(JSON.stringify(msg));
        if (msg.type === "progress" || msg.type === "complete") void refreshRef.current();
      } catch {
        logRef.current(String(ev.data));
      }
    };
    return () => ws.close();
  }, []);

  const outletContext = useMemo<AppOutletContext>(
    () => ({
      api,
      showToast,
      refreshTorrents,
      torrentRows,
      searchConfigured,
    }),
    [showToast, refreshTorrents, torrentRows, searchConfigured],
  );

  return (
    <>
      <Routes>
        <Route
          element={
            <AppLayout
              outletContext={outletContext}
              searchConfigured={searchConfigured}
              connected={connected}
              btListen={btListen}
              toast={toast}
              onDismissToast={() => setToast(null)}
            />
          }
        >
          <Route index element={<HomePage />} />
          <Route path="find" element={<SearchPage />} />
          <Route path="downloads" element={<DownloadsPage />} />
          <Route path="watch" element={<WatchPage />} />
        </Route>
      </Routes>
      <details className="nf-debug">
        <summary>Event log (debug)</summary>
        <pre className="events-pre">{log.join("\n")}</pre>
      </details>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
