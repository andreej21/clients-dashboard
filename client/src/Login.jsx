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

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ width: 360, background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 16, padding: 36 }}>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>
          <span style={{ color: "#6366f1" }}>Coverd</span> Dashboard
        </h1>
        <p style={{ color: "#555", fontSize: 13, margin: "0 0 28px" }}>Sign in to your account</p>
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
        </div>
      </div>
    </div>
  );
}