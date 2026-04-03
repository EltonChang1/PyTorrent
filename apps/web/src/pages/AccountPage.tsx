import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";
import { HOME_ROW_OPTIONS, normalizeHomeRowOrder } from "../catalog/homeRowsConfig";
import type { CatalogItem } from "../catalog/types";
import type { DashboardSettings } from "../lib/dashboardSettings";
import {
  defaultDashboardSettings,
  loadGuestDashboard,
  saveGuestDashboard,
} from "../lib/dashboardSettings";
import { getMyList, setMyListAll } from "../lib/myList";

export function AccountPage() {
  const { api, showToast, user, refreshUser } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const [genres, setGenres] = useState("");
  const [showRec, setShowRec] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [rowOrder, setRowOrder] = useState<string[]>(() => normalizeHomeRowOrder([]));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      const g = loadGuestDashboard();
      setGenres(g.favoriteGenres.join(", "));
      setShowRec(g.showRecommendations);
      setHidden(new Set(g.hiddenRowKeys));
      setRowOrder(normalizeHomeRowOrder(g.rowOrder));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api("/user/settings");
        if (!r.ok || cancelled) return;
        const s = (await r.json()) as DashboardSettings & { myList?: CatalogItem[] };
        const merged = { ...defaultDashboardSettings(), ...s };
        if (!cancelled) {
          setGenres(merged.favoriteGenres.join(", "));
          setShowRec(merged.showRecommendations);
          setHidden(new Set(merged.hiddenRowKeys));
          setRowOrder(normalizeHomeRowOrder(merged.rowOrder));
          if (Array.isArray(s.myList)) setMyListAll(s.myList);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, user]);

  function toggleRow(key: string) {
    setHidden((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function moveRow(key: string, dir: -1 | 1) {
    setRowOrder((prev) => {
      const i = prev.indexOf(key);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    const favoriteGenres = genres
      .split(/[,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const hiddenRowKeys = [...hidden];
    const payload: DashboardSettings = {
      favoriteGenres: favoriteGenres.length ? favoriteGenres : defaultDashboardSettings().favoriteGenres,
      hiddenRowKeys,
      showRecommendations: showRec,
      rowOrder: normalizeHomeRowOrder(rowOrder),
    };
    setBusy(true);
    try {
      if (user) {
        const r = await api("/user/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, myList: getMyList() }),
        });
        if (!r.ok) {
          showToast(await r.text(), "err");
          return;
        }
        showToast("Dashboard saved", "ok");
      } else {
        saveGuestDashboard(payload);
        showToast("Preferences saved on this device", "ok");
      }
      navigate("/");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    await refreshUser();
    showToast("Signed out", "ok");
    navigate("/");
  }

  if (user === undefined) {
    return (
      <div className="page-narrow">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page-narrow page-account">
      <h1 className="page-title">Dashboard</h1>
      <p className="muted">
        Customize home rows and recommendation genre. {!user ? "You are browsing as a guest — settings stay in this browser." : `Signed in as ${user.username}.`}
      </p>

      <section className="account-section">
        <h2 className="account-h2">Recommendations</h2>
        <label className="auth-label">
          Favorite genres (comma-separated, for &quot;Picked for you&quot;)
          <input className="auth-input" value={genres} onChange={(e) => setGenres(e.target.value)} placeholder="Horror, Comedy, Sci-Fi" />
        </label>
        <label className="account-check">
          <input type="checkbox" checked={showRec} onChange={(e) => setShowRec(e.target.checked)} />
          Show &quot;Picked for you&quot; row
        </label>
      </section>

      <section className="account-section">
        <h2 className="account-h2">Home rows</h2>
        <p className="muted small">Uncheck to hide a row. Use arrows to change order on the home page.</p>
        <ul className="account-row-list">
          {rowOrder.map((key, idx) => {
            const row = HOME_ROW_OPTIONS.find((r) => r.key === key);
            if (!row) return null;
            return (
              <li key={row.key} className="account-row-item">
                <label className="account-check">
                  <input type="checkbox" checked={!hidden.has(row.key)} onChange={() => toggleRow(row.key)} />
                  {row.label}
                </label>
                <span className="account-row-move">
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={idx === 0}
                    aria-label={`Move ${row.label} up`}
                    onClick={() => moveRow(row.key, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={idx >= rowOrder.length - 1}
                    aria-label={`Move ${row.label} down`}
                    onClick={() => moveRow(row.key, 1)}
                  >
                    ↓
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="account-actions">
        <button type="button" className="btn-primary btn-lg" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save and go home"}
        </button>
        {user ? (
          <button type="button" className="btn-secondary btn-lg" onClick={() => void logout()}>
            Sign out
          </button>
        ) : (
          <p className="muted">
            <Link to="/register">Create an account</Link> to sync these settings on this server.
          </p>
        )}
      </div>
    </div>
  );
}
