import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";
import { HOME_ROW_OPTIONS } from "../catalog/homeRowsConfig";
import type { DashboardSettings } from "../lib/dashboardSettings";
import {
  defaultDashboardSettings,
  loadGuestDashboard,
  saveGuestDashboard,
} from "../lib/dashboardSettings";

export function AccountPage() {
  const { api, showToast, user, refreshUser } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const [genres, setGenres] = useState("");
  const [showRec, setShowRec] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      const g = loadGuestDashboard();
      setGenres(g.favoriteGenres.join(", "));
      setShowRec(g.showRecommendations);
      setHidden(new Set(g.hiddenRowKeys));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api("/user/settings");
        if (!r.ok || cancelled) return;
        const s = (await r.json()) as DashboardSettings;
        const merged = { ...defaultDashboardSettings(), ...s };
        if (!cancelled) {
          setGenres(merged.favoriteGenres.join(", "));
          setShowRec(merged.showRecommendations);
          setHidden(new Set(merged.hiddenRowKeys));
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
    };
    setBusy(true);
    try {
      if (user) {
        const r = await api("/user/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
        <p className="muted small">Uncheck to hide a row from the home page.</p>
        <ul className="account-row-list">
          {HOME_ROW_OPTIONS.map((row) => (
            <li key={row.key}>
              <label className="account-check">
                <input type="checkbox" checked={!hidden.has(row.key)} onChange={() => toggleRow(row.key)} />
                {row.label}
              </label>
            </li>
          ))}
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
