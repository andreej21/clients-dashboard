import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "./config";

const S = {
  card: { background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 12, overflow: "hidden" },
  inp: { background: "#13131f", border: "1px solid #2a2a3e", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" },
  btn: (color = "#6366f1") => ({ background: color, border: "none", borderRadius: 7, padding: "8px 14px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }),
  th: { padding: "10px 16px", textAlign: "left", color: "#555", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" },
  td: { padding: "10px 16px", fontSize: 13, borderTop: "1px solid #1a1a2e" },
};

function authHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export default function Admin({ auth, onLogout }) {
  const nav = useNavigate();
  const [tab, setTab] = useState("dashboards");
  const [dashboards, setDashboards] = useState([]);
  const [users, setUsers] = useState([]);
  const [newDash, setNewDash] = useState({ name: "", act_id: "", type: "app", conversion_event: "", page_token: "" });
  const [newUser, setNewUser] = useState({ email: "", password: "", role: "viewer" });
  const [accessModal, setAccessModal] = useState(null);
  const [accessList, setAccessList] = useState([]);
  const [addAccess, setAddAccess] = useState({ user_id: "", role: "viewer" });
  const [tokenModal, setTokenModal] = useState(null);
  const [newToken, setNewToken] = useState("");
  const [tokenTab, setTokenTab] = useState("oauth"); // "oauth" | "manual"
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const h = authHeaders(auth.token);

  useEffect(() => {
    loadDashboards(); loadUsers();
    const p = new URLSearchParams(window.location.search);
    if (p.get("fb_connected")) { flash("Facebook Page connected successfully! ✅"); window.history.replaceState({}, "", "/admin"); }
    if (p.get("fb_error"))     { flash(decodeURIComponent(p.get("fb_error")), true); window.history.replaceState({}, "", "/admin"); }
  }, []);

  const loadDashboards = async () => {
    const res = await fetch(`${API}/admin/dashboards`, { headers: h });
    setDashboards(await res.json());
  };

  const loadUsers = async () => {
    const res = await fetch(`${API}/admin/users`, { headers: h });
    setUsers(await res.json());
  };

  const loadAccessList = async (dashId) => {
    const res = await fetch(`${API}/dashboards/${dashId}/access`, { headers: h });
    setAccessList(await res.json());
  };

  const openAccessModal = async (dash) => {
    setAccessModal(dash);
    await loadAccessList(dash.id);
    setAddAccess({ user_id: "", role: "viewer" });
  };

  const flash = (msg, isErr = false) => {
    isErr ? setError(msg) : setSuccess(msg);
    setTimeout(() => { setError(""); setSuccess(""); }, 3000);
  };

  const createDashboard = async () => {
    if (!newDash.name || !newDash.act_id) return flash("Name and Act ID required", true);
    const body = { ...newDash };
    if (!body.page_token) delete body.page_token;
    const res = await fetch(`${API}/admin/dashboards`, { method: "POST", headers: h, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return flash(data.error, true);
    setNewDash({ name: "", act_id: "", type: "app", conversion_event: "", page_token: "" });
    loadDashboards(); flash("Dashboard created!");
  };

  const deleteDashboard = async (id) => {
    if (!confirm("Delete this dashboard?")) return;
    await fetch(`${API}/admin/dashboards/${id}`, { method: "DELETE", headers: h });
    loadDashboards(); flash("Dashboard deleted");
  };

  const createUser = async () => {
    if (!newUser.email || !newUser.password) return flash("Email and password required", true);
    const res = await fetch(`${API}/admin/users`, { method: "POST", headers: h, body: JSON.stringify(newUser) });
    const data = await res.json();
    if (!res.ok) return flash(data.error, true);
    setNewUser({ email: "", password: "", role: "viewer" });
    loadUsers(); flash("User created!");
  };

  const deleteUser = async (id) => {
    if (!confirm("Delete this user?")) return;
    await fetch(`${API}/admin/users/${id}`, { method: "DELETE", headers: h });
    loadUsers(); flash("User deleted");
  };

  const updateToken = async () => {
    if (!newToken.trim()) return flash("Paste the new token first", true);
    const res = await fetch(`${API}/admin/dashboards/${tokenModal.id}`, {
      method: "PATCH", headers: h,
      body: JSON.stringify({ page_token: newToken.trim(), type: tokenModal.type }),
    });
    const data = await res.json();
    if (!res.ok) return flash(data.error || "Update failed", true);
    setTokenModal(null); setNewToken("");
    loadDashboards(); flash("Token updated!");
  };

  const grantAccess = async () => {
    if (!addAccess.user_id) return flash("Select a user", true);
    const res = await fetch(`${API}/dashboards/${accessModal.id}/access`, {
      method: "POST", headers: h,
      body: JSON.stringify({ user_id: parseInt(addAccess.user_id), role: addAccess.role })
    });
    const data = await res.json();
    if (!res.ok) return flash(data.error, true);
    loadAccessList(accessModal.id); loadDashboards(); flash("Access granted!");
  };

  const revokeAccess = async (userId) => {
    await fetch(`${API}/dashboards/${accessModal.id}/access/${userId}`, { method: "DELETE", headers: h });
    loadAccessList(accessModal.id); loadDashboards(); flash("Access revoked");
  };

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{
      background: tab === key ? "#6366f1" : "#2a2a3e", border: "none", borderRadius: 8,
      padding: "9px 16px", color: tab === key ? "#fff" : "#aaa", cursor: "pointer", fontSize: 13, fontWeight: 600
    }}>{label}</button>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#fff", fontFamily: "system-ui,sans-serif" }}>

      {/* Topbar */}
      <div style={{ background: "#1e1e2e", borderBottom: "1px solid #2a2a3e", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={{ color: "#6366f1" }}>SPMP</span> — Admin
          </h1>
          <p style={{ color: "#555", fontSize: 11, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auth.user.email}</p>
        </div>
        <button onClick={() => nav("/dashboards")} style={{ ...S.btn("#2a2a3e"), fontSize: 12, padding: "7px 12px" }}>← Dashboards</button>
        <button onClick={onLogout} style={{ ...S.btn("#3f0f0f"), fontSize: 12, padding: "7px 12px" }}>Sign Out</button>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px" }}>

        {/* Flash messages */}
        {success && <div style={{ background: "#052e16", border: "1px solid #10b981", borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: "#10b981", fontSize: 13 }}>✅ {success}</div>}
        {error   && <div style={{ background: "#3f0f0f", border: "1px solid #f87171", borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: "#f87171", fontSize: 13 }}>⚠️ {error}</div>}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {tabBtn("dashboards", `Dashboards (${dashboards.length})`)}
          {tabBtn("users", `Users (${users.length})`)}
        </div>

        {/* ── DASHBOARDS TAB ── */}
        {tab === "dashboards" && (<>
          <div style={{ ...S.card, padding: 20, marginBottom: 20 }}>
            <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>Add New Dashboard</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input placeholder="Client name" value={newDash.name} onChange={e => setNewDash(p => ({ ...p, name: e.target.value }))}
                style={{ ...S.inp, flex: "1 1 150px" }} />
              <input
                placeholder={newDash.type === "organic" ? "Facebook Page ID (e.g. 123456789)" : "Act ID (e.g. act_123456789)"}
                value={newDash.act_id} onChange={e => setNewDash(p => ({ ...p, act_id: e.target.value }))}
                style={{ ...S.inp, flex: "2 1 180px" }} />
              <select value={newDash.type} onChange={e => setNewDash(p => ({ ...p, type: e.target.value, conversion_event: "", page_token: "" }))}
                style={{ ...S.inp, flex: "0 0 160px" }}>
                <option value="auto">Auto (Multi-Goal)</option>
                <option value="app">App Install</option>
                <option value="lead">Lead Gen</option>
                <option value="ecom">Ecom</option>
                <option value="google">Google Ads</option>
                <option value="organic">Organic Social</option>
              </select>
              {newDash.type === "lead" && (
                <select value={newDash.conversion_event} onChange={e => setNewDash(p => ({ ...p, conversion_event: e.target.value }))}
                  style={{ ...S.inp, flex: "1 1 180px" }}>
                  <option value="lead">Leads</option>
                  <option value="complete_registration">Complete Registrations</option>
                </select>
              )}
              {newDash.type === "organic" && (
                <input
                  placeholder="Page Access Token"
                  value={newDash.page_token}
                  onChange={e => setNewDash(p => ({ ...p, page_token: e.target.value }))}
                  style={{ ...S.inp, flex: "2 1 200px" }}
                />
              )}
              <button onClick={createDashboard} style={{ ...S.btn(), flexShrink: 0 }}>Create</button>
            </div>
          </div>

          {/* Dashboards list — scrollable on mobile */}
          <div style={S.card}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead><tr style={{ background: "#13131f" }}>
                  <th style={S.th}>Client</th>
                  <th style={S.th}>Act ID</th>
                  <th style={S.th}>Type</th>
                  <th style={S.th}>Conv. Event</th>
                  <th style={S.th}>Users</th>
                  <th style={S.th}>Actions</th>
                </tr></thead>
                <tbody>
                  {dashboards.length === 0 && (
                    <tr><td colSpan={6} style={{ ...S.td, textAlign: "center", color: "#555" }}>No dashboards yet</td></tr>
                  )}
                  {dashboards.map(d => (
                    <tr key={d.id}>
                      <td style={{ ...S.td, fontWeight: 600 }}>{d.name}</td>
                      <td style={{ ...S.td, color: "#6366f1", fontFamily: "monospace", fontSize: 12 }}>{d.act_id}</td>
                      <td style={S.td}>
                        <select value={d.type} onChange={async e => {
                          const newType = e.target.value;
                          const res = await fetch(`${API}/admin/dashboards/${d.id}`, { method: "PATCH", headers: h, body: JSON.stringify({ type: newType }) });
                          if (res.ok) { loadDashboards(); flash("Type updated!"); } else flash("Update failed", true);
                        }} style={{ background: "#13131f", color: "#ccc", border: "1px solid #2a2a3e", borderRadius: 5, padding: "3px 6px", fontSize: 12, cursor: "pointer" }}>
                          <option value="auto">Auto</option>
                          <option value="app">App</option>
                          <option value="lead">Lead Gen</option>
                          <option value="ecom">Ecom</option>
                          <option value="google">Google</option>
                          <option value="organic">Organic</option>
                        </select>
                      </td>
                      <td style={{ ...S.td, color: "#888", fontSize: 12 }}>
                        {d.type === "organic"
                          ? <span style={{ color: d.page_token ? "#10b981" : "#f87171", fontSize: 11, fontWeight: 600 }}>{d.page_token ? "✓ Token set" : "⚠ No token"}</span>
                          : d.type === "auto"
                          ? <span style={{ color: "#4b9cf5", fontSize: 11, fontWeight: 600 }}>Auto-detected</span>
                          : (d.conversion_event || "—")}
                      </td>
                      <td style={{ ...S.td, color: "#10b981" }}>{d.users?.length || 0} user{d.users?.length !== 1 ? "s" : ""}</td>
                      <td style={S.td}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={() => openAccessModal(d)} style={{ ...S.btn("#1d4ed8"), fontSize: 12, padding: "6px 10px" }}>Manage Access</button>
                          {d.type === "organic" && (
                            <button onClick={() => { setTokenModal(d); setNewToken(""); }} style={{ ...S.btn("#065f46"), fontSize: 12, padding: "6px 10px" }}>🔑 Token</button>
                          )}
                          <button onClick={() => deleteDashboard(d.id)} style={{ ...S.btn("#7f1d1d"), fontSize: 12, padding: "6px 10px" }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>)}

        {/* ── USERS TAB ── */}
        {tab === "users" && (<>
          <div style={{ ...S.card, padding: 20, marginBottom: 20 }}>
            <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>Add New User</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input placeholder="Email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                style={{ ...S.inp, flex: "2 1 180px" }} />
              <input type="password" placeholder="Password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                style={{ ...S.inp, flex: "1 1 140px" }} />
              <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                style={{ ...S.inp, flex: "0 0 120px" }}>
                <option value="viewer">Viewer</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={createUser} style={{ ...S.btn(), flexShrink: 0 }}>Create</button>
            </div>
          </div>

          <div style={S.card}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
                <thead><tr style={{ background: "#13131f" }}>
                  <th style={S.th}>Email</th>
                  <th style={S.th}>Role</th>
                  <th style={S.th}>Created</th>
                  <th style={S.th}>Actions</th>
                </tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={{ ...S.td, wordBreak: "break-all" }}>{u.email}</td>
                      <td style={S.td}>
                        <span style={{
                          background: u.role === "admin" ? "#6366f122" : u.role === "manager" ? "#f59e0b22" : "#2a2a3e",
                          color: u.role === "admin" ? "#6366f1" : u.role === "manager" ? "#f59e0b" : "#aaa",
                          borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 600
                        }}>{u.role}</span>
                      </td>
                      <td style={{ ...S.td, color: "#555", whiteSpace: "nowrap" }}>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td style={S.td}>
                        {u.email !== auth.user.email &&
                          <button onClick={() => deleteUser(u.id)} style={{ ...S.btn("#7f1d1d"), fontSize: 12, padding: "6px 10px" }}>Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>)}

        {/* ── TOKEN MODAL ── */}
        {tokenModal && (
          <div style={{ position: "fixed", inset: 0, background: "#000a", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
            <div style={{ background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Update Page Token</p>
                  <p style={{ margin: "2px 0 0", color: "#10b981", fontSize: 13 }}>{tokenModal.name}</p>
                </div>
                <button onClick={() => setTokenModal(null)} style={{ background: "none", border: "none", color: "#555", fontSize: 22, cursor: "pointer" }}>✕</button>
              </div>
              {/* Tabs */}
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                {[{ k: "oauth", l: "🔗 Connect with Facebook" }, { k: "manual", l: "✏️ Paste Token" }].map(t => (
                  <button key={t.k} onClick={() => setTokenTab(t.k)} style={{
                    ...S.btn(tokenTab === t.k ? "#10b981" : "#2a2a3e", tokenTab === t.k ? "#fff" : "#aaa"),
                    fontSize: 12, padding: "7px 12px",
                  }}>{t.l}</button>
                ))}
              </div>

              {tokenTab === "oauth" ? (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <p style={{ color: "#888", fontSize: 12, margin: "0 0 16px" }}>
                    The page admin clicks the button below, logs in with their Facebook account, and the token is saved automatically. No copy-pasting needed.
                  </p>
                  <a
                    href={`${API}/facebook/auth-start?dash_id=${tokenModal?.id}`}
                    style={{ display: "inline-block", background: "#1877f2", color: "#fff", borderRadius: 8, padding: "11px 22px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
                  >
                    f &nbsp; Connect Facebook Page
                  </a>
                  <p style={{ color: "#555", fontSize: 11, margin: "12px 0 0" }}>
                    Share this Admin URL with the page admin so they can click the button themselves.
                  </p>
                </div>
              ) : (
                <>
                  <p style={{ color: "#888", fontSize: 12, margin: "0 0 12px" }}>Paste a Page Access Token manually:</p>
                  <textarea
                    value={newToken}
                    onChange={e => setNewToken(e.target.value)}
                    placeholder="EAAxxxxx..."
                    rows={4}
                    style={{ ...S.inp, width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 11 }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
                    <button onClick={() => setTokenModal(null)} style={S.btn()}>Cancel</button>
                    <button onClick={updateToken} style={{ ...S.btn("#10b981", "#fff") }}>Save Token</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── ACCESS MODAL ── */}
        {accessModal && (
          <div style={{ position: "fixed", inset: 0, background: "#000a", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
            <div style={{ background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 16, padding: 24, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Manage Access</p>
                  <p style={{ margin: "2px 0 0", color: "#6366f1", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{accessModal.name}</p>
                </div>
                <button onClick={() => setAccessModal(null)} style={{ background: "none", border: "none", color: "#555", fontSize: 22, cursor: "pointer", flexShrink: 0 }}>✕</button>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                <select value={addAccess.user_id} onChange={e => setAddAccess(p => ({ ...p, user_id: e.target.value }))}
                  style={{ ...S.inp, flex: "1 1 160px" }}>
                  <option value="">Select user…</option>
                  {users.filter(u => !accessList.find(a => a.id === u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
                </select>
                <select value={addAccess.role} onChange={e => setAddAccess(p => ({ ...p, role: e.target.value }))}
                  style={{ ...S.inp, flex: "0 0 110px" }}>
                  <option value="viewer">Viewer</option>
                  <option value="manager">Manager</option>
                </select>
                <button onClick={grantAccess} style={{ ...S.btn(), flexShrink: 0 }}>Add</button>
              </div>

              <div style={S.card}>
                {accessList.length === 0
                  ? <p style={{ padding: 16, color: "#555", fontSize: 13, margin: 0 }}>No users have access yet</p>
                  : accessList.map(u => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #1a1a2e", gap: 8 }}>
                      <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
                      <span style={{ color: u.role === "manager" ? "#f59e0b" : "#888", fontSize: 12, flexShrink: 0 }}>{u.role}</span>
                      <button onClick={() => revokeAccess(u.id)} style={{ ...S.btn("#7f1d1d"), fontSize: 12, padding: "5px 10px", flexShrink: 0 }}>Remove</button>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}