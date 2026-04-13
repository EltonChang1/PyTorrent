import { useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";

export function LoginPage() {
  const { api, showToast, refreshUser } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!r.ok) {
        showToast((await r.text()) || "Login failed", "err");
        return;
      }
      showToast("Signed in", "ok");
      await refreshUser();
      navigate("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-narrow page-auth">
      <h1 className="page-title">Sign in</h1>
      <p className="muted">
        Optional account: sync watch progress and dashboard across browsers on this Torflix server. Torrents stay on the
        machine running <code>torflixd</code>.
      </p>
      <form className="auth-form" onSubmit={onSubmit}>
        <label className="auth-label">
          Username
          <input
            className="auth-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={2}
          />
        </label>
        <label className="auth-label">
          Password
          <input
            type="password"
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            minLength={1}
          />
        </label>
        <button type="submit" className="btn-primary btn-lg" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="muted">
        No account? <Link to="/register">Create one</Link>
      </p>
    </div>
  );
}
