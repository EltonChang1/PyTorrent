import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";

type BtListen = {
  ok: boolean;
  configured_bind?: string;
  configured_port?: number;
  announced_to_trackers_port?: number;
  sockets?: string[];
  error?: string;
};

type Props = {
  outletContext: AppOutletContext;
  searchConfigured: boolean;
  connected: boolean;
  btListen: BtListen | null;
  toast: { msg: string; kind: "ok" | "err" } | null;
  onDismissToast: () => void;
};

export function AppLayout({
  outletContext,
  searchConfigured,
  connected,
  btListen,
  toast,
  onDismissToast,
}: Props) {
  const navigate = useNavigate();
  const [quick, setQuick] = useState("");
  const { user } = outletContext;

  const btLine =
    btListen == null
      ? "Checking BitTorrent listener…"
      : btListen.ok
        ? `Peers: ${btListen.sockets?.join(", ") || `${btListen.configured_bind}:${btListen.configured_port}`} · announce port ${btListen.announced_to_trackers_port ?? btListen.configured_port}`
        : `Listener failed: ${btListen.error ?? "unknown"}`;

  return (
    <div className="nf-app">
      <header className="nf-top">
        <div className="nf-top-inner">
          <NavLink to="/" className="nf-logo" end>
            PyTorrent
          </NavLink>
          <nav className="nf-nav" aria-label="Primary">
            {searchConfigured ? (
              <>
                <NavLink to="/" className={({ isActive }) => (isActive ? "nf-link active" : "nf-link")} end>
                  Home
                </NavLink>
                <NavLink to="/find" className={({ isActive }) => (isActive ? "nf-link active" : "nf-link")}>
                  Search
                </NavLink>
              </>
            ) : null}
            <NavLink
              to="/downloads"
              className={({ isActive }) => (isActive ? "nf-link active" : "nf-link")}
            >
              My downloads
            </NavLink>
            <NavLink to="/account" className={({ isActive }) => (isActive ? "nf-link active" : "nf-link")}>
              Dashboard
            </NavLink>
            {user === undefined ? null : user ? (
              <span className="nf-auth-user muted" title={user.username}>
                {user.username}
              </span>
            ) : (
              <NavLink to="/login" className={({ isActive }) => (isActive ? "nf-link active" : "nf-link")}>
                Sign in
              </NavLink>
            )}
          </nav>
          {searchConfigured ? (
            <form
              className="nf-quick-search"
              onSubmit={(e) => {
                e.preventDefault();
                const q = quick.trim();
                if (q.length >= 2) navigate(`/find?q=${encodeURIComponent(q)}`);
              }}
            >
              <input
                type="search"
                placeholder="Quick search…"
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                aria-label="Quick search"
              />
            </form>
          ) : (
            <span className="nf-nav-hint muted">Configure search API for catalog</span>
          )}
        </div>
      </header>

      {toast && (
        <div className="nf-toast-wrap">
          <div className={toast.kind === "err" ? "toast toast-err" : "toast toast-ok"} role="status">
            <span>{toast.msg}</span>
            <button type="button" className="toast-dismiss" onClick={onDismissToast} aria-label="Dismiss">
              ×
            </button>
          </div>
        </div>
      )}

      <main className="nf-main">
        <Outlet context={outletContext} />
      </main>

      <details className="nf-status">
        <summary>Connection & BitTorrent</summary>
        <p className="muted small">
          Daemon <code>pytorrentd</code> · WebSocket {connected ? "connected" : "disconnected"}
        </p>
        <p className="muted small">{btLine}</p>
      </details>

      <footer className="nf-footer">
        <p className="nf-legal">
          Only download and share content you have the right to use. PyTorrent runs locally. Use{" "}
          <strong>Full download</strong> for a normal torrent, or <strong>Watch while downloading</strong> for
          sequential download and in-browser playback (MP4/WebM work best). For privacy on peer connections, use a{" "}
          <strong>system-wide VPN</strong>; the app does not start a VPN for you.
        </p>
      </footer>
    </div>
  );
}
