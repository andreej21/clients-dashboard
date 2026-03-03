import { useState } from "react";
import API from "./config";

const S = {
  inp: { width: "100%", background: "#13131f", border: "1px solid #2a2a3e", borderRadius: 8, padding: "11px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" },
};

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("login"); // "login" | "forgot"
  const [resetSent, setResetSent] = useState(false);

  const submit = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onLogin(data.token, data.user);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const submitForgot = async () => {
    if (!email) { setError("Please enter your email address"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResetSent(true);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", padding: "16px" }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 16, padding: "32px 28px" }}>
        
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>
          <span style={{ color: "#6366f1" }}>SP Media</span> Dashboards
        </h1>
        <p style={{ color: "#555", fontSize: 13, margin: "0 0 28px" }}>
          {mode === "login" ? "Sign in to your account" : "Reset your password"}
        </p>

        {mode === "login" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()} style={S.inp} />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()} style={S.inp} />
            {error && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>⚠️ {error}</p>}
            <button onClick={submit} disabled={loading} style={{
              background: "#6366f1", border: "none", borderRadius: 8, padding: "11px", color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.6 : 1, marginTop: 4
            }}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
            <button onClick={() => { setMode("forgot"); setError(""); }} style={{
              background: "none", border: "none", color: "#6366f1", fontSize: 13, cursor: "pointer", padding: 0, marginTop: 4
            }}>
              Forgot password?
            </button>
          </div>
        )}

        {mode === "forgot" && !resetSent && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="email" placeholder="Enter your email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submitForgot()} style={S.inp} />
            {error && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>⚠️ {error}</p>}
            <button onClick={submitForgot} disabled={loading} style={{
              background: "#6366f1", border: "none", borderRadius: 8, padding: "11px", color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.6 : 1
            }}>
              {loading ? "Sending…" : "Send Reset Link"}
            </button>
            <button onClick={() => { setMode("login"); setError(""); }} style={{
              background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: 0
            }}>
              ← Back to sign in
            </button>
          </div>
        )}

        {mode === "forgot" && resetSent && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ color: "#4ade80", fontSize: 14, margin: 0 }}>
              ✅ Reset link sent! Check your inbox at <strong>{email}</strong>
            </p>
            <button onClick={() => { setMode("login"); setResetSent(false); setError(""); }} style={{
              background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: 0
            }}>
              ← Back to sign in
            </button>
          </div>
        )}

      </div>
    </div>
  );
}