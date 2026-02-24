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
  const [newDash, setNewDash] = useState({ name: "", act_id: "", type: "app", conversion_event: "" });
  const [newUser, setNewUser] = useState({ email: "", password: "", role: "viewer" });
  const [accessModal, setAccessModal] = useState(null); // { dashboard }
  const [accessList, setAccessList] = useState([]);
  const [addAccess, setAddAccess] = useState({ user_id: "", role: "viewer" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const h = authHeaders(auth.token);

  useEffect(() => { loadDashboards(); loadUsers(); }, []);

  const loadDashboards = async () => {
    const res = await fetch(`${API}/admin/dashboards`, { headers: h });
    const data = await res.json();
    setDashboards(data);
  };

  const loadUsers = async () => {
    const res = await fetch(`${API}/admin/users`, { headers: h });
    const data = await res.json();
    setUsers(data);
  };

  const loadAccessList = async (dashId) => {
    const res = await fetch(`${API}/dashboards/${dashId}/access`, { headers: h });
    const data = await res.json();
    setAccessList(data);
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
    const res = await fetch(`${API}/admin/dashboards`, { method: "POST", headers: h, body: JSON.stringify(newDash) });
    const data = await res.json();
    if (!res.ok) return flash(data.error, true);
    setNewDash({ name: "", act_id: "" });
    loadDashboards();
    flash("Dashboard created!");
  };

  const deleteDashboard = async (id) => {
    if (!confirm("Delete this dashboard?")) return;
    await fetch(`${API}/admin/dashboards/${id}`, { method: "DELETE", headers: h });
    loadDashboards();
    flash("Dashboard deleted");
  };

  const createUser = async () => {
    if (!newUser.email || !newUser.password) return flash("Email and password required", true);
    const res = await fetch(`${API}/admin/users`, { method: "POST", headers: h, body: JSON.stringify(newUser) });
    const data = await res.json();
    if (!res.ok) return flash(data.error, true);
    setNewUser({ email: "", password: "", role: "viewer" });
    loadUsers();
    flash("User created!");
  };

  const deleteUser = async (id) => {
    if (!confirm("Delete this user?")) return;
    await fetch(`${API}/admin/users/${id}`, { method: "DELETE", headers: h });
    loadUsers();
    flash("User deleted");
  };

  const grantAccess = async () => {
    if (!addAccess.user_id) return flash("Select a user", true);
    const res = await fetch(`${API}/dashboards/${accessModal.id}/access`, {
      method: "POST", headers: h,
      body: JSON.stringify({ user_id: parseInt(addAccess.user_id), role: addAccess.role })
    });
    const data = await res.json();
    if (!res.ok) return flash(data.error, true);
    loadAccessList(accessModal.id);
    loadDashboards();
    flash("Access granted!");
  };

  const revokeAccess = async (userId) => {
    await fetch(`${API}/dashboards/${accessModal.id}/access/${userId}`, { method: "DELETE", headers: h });
    loadAccessList(accessModal.id);
    loadDashboards();
    flash("Access revoked");
  };

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{
      background: tab === key ? "#6366f1" : "#2a2a3e", border: "none", borderRadius: 8,
      padding: "9px 18px", color: tab === key ? "#fff" : "#aaa", cursor: "pointer", fontSize: 13, fontWeight: 600
    }}>{label}</button>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#fff", fontFamily: "system-ui,sans-serif", padding: "24px 20px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 28, gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
              <span style={{ color: "#6366f1" }}>Clients</span> Dashboards — Admin
            </h1>
            <p style={{ color: "#555", fontSize: 12, margin: "3px 0 0" }}>{auth.user.email}</p>
          </div>
          <button onClick={() => nav("/dashboards")} style={S.btn("#2a2a3e")}>← Dashboards</button>
          <button onClick={onLogout} style={S.btn("#3f0f0f")}>Sign Out</button>
        </div>

        {/* Flash messages */}
        {success && <div style={{ background: "#052e16", border: "1px solid #10b981", borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: "#10b981", fontSize: 13 }}>✅ {success}</div>}
        {error   && <div style={{ background: "#3f0f0f", border: "1px solid #f87171", borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: "#f87171", fontSize: 13 }}>⚠️ {error}</div>}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {tabBtn("dashboards", `Dashboards (${dashboards.length})`)}
          {tabBtn("users", `Users (${users.length})`)}
        </div>

        {/* ── DASHBOARDS TAB ── */}
        {tab === "dashboards" && (<>
          {/* Create dashboard */}
          <div style={{ ...S.card, padding: 20, marginBottom: 20 }}>
            <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>Add New Dashboard</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input placeholder="Client name (e.g. Coverd)" value={newDash.name} onChange={e => setNewDash(p => ({ ...p, name: e.target.value }))}
                style={{ ...S.inp, flex: 1, minWidth: 160 }} />
              <input placeholder="Act ID (e.g. act_123456789)" value={newDash.act_id} onChange={e => setNewDash(p => ({ ...p, act_id: e.target.value }))}
                style={{ ...S.inp, flex: 1, minWidth: 200 }} />
              <select value={newDash.type} onChange={e => setNewDash(p => ({ ...p, type: e.target.value, conversion_event: "" }))}
                style={{ ...S.inp, minWidth: 110 }}>
                <option value="app">App Install</option>
                <option value="lead">Lead Gen</option>
                <option value="ecom">Ecom</option>
              </select>
              {newDash.type === "lead" && (
                <select value={newDash.conversion_event} onChange={e => setNewDash(p => ({ ...p, conversion_event: e.target.value }))}
                  style={{ ...S.inp, minWidth: 200 }}>
                  <option value="lead">Leads</option>
                  <option value="complete_registration">Complete Registrations</option>
                </select>
              )}
              <button onClick={createDashboard} style={S.btn()}>Create</button>
            </div>
          </div>

          {/* Dashboards list */}
          <div style={S.card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#13131f" }}>
                <th style={S.th}>Client</th>
                <th style={S.th}>Act ID</th>
                <th style={S.th}>Users</th>
                <th style={S.th}>Created</th>
                <th style={S.th}>Actions</th>
              </tr></thead>
              <tbody>
                {dashboards.length === 0 && (
                  <tr><td colSpan={5} style={{ ...S.td, textAlign: "center", color: "#555" }}>No dashboards yet</td></tr>
                )}
                {dashboards.map(d => (
                  <tr key={d.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{d.name}</td>
                    <td style={{ ...S.td, color: "#6366f1", fontFamily: "monospace" }}>{d.act_id}</td>
                    <td style={S.td}>
                      <span style={{
                        background: d.type === "app" ? "#6366f122" : d.type === "lead" ? "#10b98122" : "#f59e0b22",
                        color: d.type === "app" ? "#6366f1" : d.type === "lead" ? "#10b981" : "#f59e0b",
                        borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 600
                      }}>{d.type === "app" ? "App" : d.type === "lead" ? "Lead Gen" : "Ecom"}</span>
                    </td>
                    <td style={{ ...S.td, color: "#888", fontSize: 12 }}>{d.conversion_event || "—"}</td>
                    <td style={{ ...S.td, color: "#10b981" }}>{d.users?.length || 0} user{d.users?.length !== 1 ? "s" : ""}</td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openAccessModal(d)} style={S.btn("#1d4ed8")}>Manage Access</button>
                        <button onClick={() => deleteDashboard(d.id)} style={S.btn("#7f1d1d")}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ── USERS TAB ── */}
        {tab === "users" && (<>
          <div style={{ ...S.card, padding: 20, marginBottom: 20 }}>
            <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>Add New User</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input placeholder="Email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                style={{ ...S.inp, flex: 2, minWidth: 180 }} />
              <input type="password" placeholder="Password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                style={{ ...S.inp, flex: 1, minWidth: 140 }} />
              <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                style={{ ...S.inp, minWidth: 110 }}>
                <option value="viewer">Viewer</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={createUser} style={S.btn()}>Create</button>
            </div>
          </div>

          <div style={S.card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#13131f" }}>
                <th style={S.th}>Email</th>
                <th style={S.th}>Role</th>
                <th style={S.th}>Created</th>
                <th style={S.th}>Actions</th>
              </tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={S.td}>{u.email}</td>
                    <td style={S.td}>
                      <span style={{
                        background: u.role === "admin" ? "#6366f122" : u.role === "manager" ? "#f59e0b22" : "#2a2a3e",
                        color: u.role === "admin" ? "#6366f1" : u.role === "manager" ? "#f59e0b" : "#aaa",
                        borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 600
                      }}>{u.role}</span>
                    </td>
                    <td style={{ ...S.td, color: "#555" }}>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td style={S.td}>
                      {u.email !== auth.user.email &&
                        <button onClick={() => deleteUser(u.id)} style={S.btn("#7f1d1d")}>Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ── ACCESS MODAL ── */}
        {accessModal && (
          <div style={{ position: "fixed", inset: 0, background: "#000a", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
            <div style={{ background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 16, padding: 28, width: 500, maxWidth: "95vw" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Manage Access</p>
                  <p style={{ margin: "2px 0 0", color: "#6366f1", fontSize: 13 }}>{accessModal.name}</p>
                </div>
                <button onClick={() => setAccessModal(null)} style={{ background: "none", border: "none", color: "#555", fontSize: 20, cursor: "pointer" }}>✕</button>
              </div>

              {/* Grant access */}
              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                <select value={addAccess.user_id} onChange={e => setAddAccess(p => ({ ...p, user_id: e.target.value }))}
                  style={{ ...S.inp, flex: 1 }}>
                  <option value="">Select user…</option>
                  {users.filter(u => !accessList.find(a => a.id === u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
                </select>
                <select value={addAccess.role} onChange={e => setAddAccess(p => ({ ...p, role: e.target.value }))}
                  style={{ ...S.inp }}>
                  <option value="viewer">Viewer</option>
                  <option value="manager">Manager</option>
                </select>
                <button onClick={grantAccess} style={S.btn()}>Add</button>
              </div>

              {/* Access list */}
              <div style={{ ...S.card }}>
                {accessList.length === 0
                  ? <p style={{ padding: 16, color: "#555", fontSize: 13, margin: 0 }}>No users have access yet</p>
                  : accessList.map(u => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #1a1a2e" }}>
                      <span style={{ flex: 1, fontSize: 13 }}>{u.email}</span>
                      <span style={{ color: u.role === "manager" ? "#f59e0b" : "#888", fontSize: 12, marginRight: 12 }}>{u.role}</span>
                      <button onClick={() => revokeAccess(u.id)} style={S.btn("#7f1d1d")}>Remove</button>
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