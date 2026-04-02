import { useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../appOutletContext";

export function RegisterPage() {
  const { api, showToast, refreshUser } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!r.ok) {
        showToast((await r.text()) || "Registration failed", "err");
        return;
      }
      showToast("Account created — you are signed in", "ok");
      await refreshUser();
      navigate("/account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-narrow page-auth">
      <h1 className="page-title">Create account</h1>
      <p className="muted">Choose a username and password (stored only on this PyTorrent server).</p>
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
            maxLength={32}
          />
        </label>
        <label className="auth-label">
          Password
          <input
            type="password"
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </label>
        <button type="submit" className="btn-primary btn-lg" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="muted">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
