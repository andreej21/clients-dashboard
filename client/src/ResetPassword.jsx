import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import API from "./config";

const S = {
  inp: { width: "100%", background: "#13131f", border: "1px solid #2a2a3e", borderRadius: 8, padding: "11px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" },
};

export default function ResetPassword() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!password || password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords don't match"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDone(true);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 16, padding: "32px 28px" }}>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>
          <span style={{ color: "#6366f1" }}>SP Media</span> Dashboards
        </h1>

        {!token && (
          <div>
            <p style={{ color: "#f87171", fontSize: 14, margin: "16px 0" }}>⚠️ Invalid reset link. Please request a new one.</p>
            <button onClick={() => nav("/")} style={{ background: "none", border: "none", color: "#6366f1", fontSize: 13, cursor: "pointer", padding: 0 }}>← Back to sign in</button>
          </div>
        )}

        {token && !done && (
          <>
            <p style={{ color: "#555", fontSize: 13, margin: "4px 0 28px" }}>Enter your new password</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input type="password" placeholder="New password" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                style={S.inp} />
              <input type="password" placeholder="Confirm new password" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                style={S.inp} />
              {error && <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>⚠️ {error}</p>}
              <button onClick={submit} disabled={loading} style={{
                background: "#6366f1", border: "none", borderRadius: 8, padding: 11, color: "#fff",
                fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.6 : 1, marginTop: 4
              }}>
                {loading ? "Resetting…" : "Reset Password"}
              </button>
            </div>
          </>
        )}

        {done && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
            <p style={{ color: "#4ade80", fontSize: 14, margin: 0 }}>✅ Password reset successfully!</p>
            <button onClick={() => nav("/")} style={{
              background: "#6366f1", border: "none", borderRadius: 8, padding: 11, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer"
            }}>Sign In</button>
          </div>
        )}
      </div>
    </div>
  );
}