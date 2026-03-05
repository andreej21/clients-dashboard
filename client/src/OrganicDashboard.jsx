import { useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import API from "./config";
import spLogo from "./assets/sp-logo.png";

const fmtNumber  = v => parseInt(v || 0).toLocaleString();
const fmtPercent = v => `${parseFloat(v || 0).toFixed(2)}%`;
const toYMD      = d => d.toISOString().split("T")[0];

const S = {
  card: { background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 12 },
  inp:  { background: "#13131f", border: "1px solid #2a2a3e", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" },
  th:   { padding: "9px 14px", textAlign: "left", color: "#555", fontWeight: 600, whiteSpace: "nowrap", fontSize: 12 },
  td:   { padding: "8px 14px", whiteSpace: "nowrap", fontSize: 13 },
  btn:  (color = "#2a2a3e", textColor = "#aaa") => ({ background: color, border: "none", borderRadius: 7, padding: "9px 14px", color: textColor, cursor: "pointer", fontSize: 12, fontWeight: 600 }),
};

const authHeaders = token => ({ Authorization: `Bearer ${token}` });

const ORGANIC_COLOR = "#10b981";

const FB_METRICS = [
  { key: "page_fans",                label: "Page Fans",           color: "#6366f1" },
  { key: "page_fan_adds",            label: "New Likes",           color: "#10b981" },
  { key: "page_impressions_organic", label: "Organic Impressions", color: "#3b82f6" },
  { key: "page_post_engagements",    label: "Post Engagements",    color: "#f59e0b" },
];

const IG_METRICS = [
  { key: "impressions",   label: "Impressions",   color: "#e1306c" },
  { key: "reach",         label: "Reach",         color: "#f56040" },
  { key: "profile_views", label: "Profile Views", color: "#fcaf45" },
];

const typeBadge = {
  app:     { label: "App",     color: "#6366f1" },
  lead:    { label: "Lead",    color: "#10b981" },
  ecom:    { label: "Ecom",    color: "#f59e0b" },
  google:  { label: "Google",  color: "#4285f4" },
  organic: { label: "Organic", color: "#10b981" },
};

export default function OrganicDashboard({ auth, onLogout, myDashboards, activeDash, setActiveDash }) {
  const nav = useNavigate();
  useParams();

  const [tab, setTab]         = useState("overview");
  const [fbData, setFbData]   = useState(null);
  const [igData, setIgData]   = useState(null);
  const [igError, setIgError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const defEnd   = new Date(); defEnd.setDate(defEnd.getDate() - 1);
  const defStart = new Date(defEnd); defStart.setDate(defStart.getDate() - 27);
  const [startDate, setStartDate] = useState(toYMD(defStart));
  const [endDate,   setEndDate]   = useState(toYMD(defEnd));

  const h = authHeaders(auth.token);

  const applyPreset = days => {
    const e = new Date(); e.setDate(e.getDate() - 1);
    const s = new Date(e);
    if (days > 1) s.setDate(s.getDate() - (days - 1));
    setStartDate(toYMD(s)); setEndDate(toYMD(e));
  };

  const fetchData = useCallback(async () => {
    if (!activeDash) return;
    setLoading(true); setError(""); setFbData(null); setIgData(null); setIgError("");
    try {
      const params = `since=${startDate}&until=${endDate}`;
      const [fbRes, igRes] = await Promise.all([
        fetch(`${API}/dashboards/${activeDash.id}/organic/facebook?${params}`,  { headers: h }),
        fetch(`${API}/dashboards/${activeDash.id}/organic/instagram?${params}`, { headers: h }),
      ]);
      const [fbJson, igJson] = await Promise.all([fbRes.json(), igRes.json()]);
      if (fbJson.error) throw new Error(fbJson.error);
      setFbData(fbJson);
      if (igJson.error === "not_connected") {
        setIgError("not_connected");
      } else if (igJson.error) {
        setIgError(igJson.error);
      } else {
        setIgData(igJson);
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [activeDash, startDate, endDate]);

  const switchDash = dash => {
    setActiveDash(dash);
    setFbData(null); setIgData(null); setIgError(""); setError("");
    setTab("overview");
    setSidebarOpen(false);
    nav(`/dashboards/${dash.id}`);
  };

  const Sidebar = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "20px 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <img src={spLogo} alt="SP Media" style={{ height: 28, width: "auto" }} />
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}><span style={{ color: "#6366f1" }}>Clients</span></p>
            <p style={{ margin: "2px 0 0", color: "#555", fontSize: 11 }}>Dashboards</p>
          </div>
        </div>
        <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: "#555", fontSize: 20, cursor: "pointer", padding: 4 }} className="sidebar-close">✕</button>
      </div>
      <div style={{ flex: 1, padding: "8px 10px", overflowY: "auto" }}>
        <p style={{ color: "#555", fontSize: 11, fontWeight: 600, padding: "4px 6px", margin: "0 0 4px" }}>CLIENTS</p>
        {myDashboards.map(d => {
          const badge = typeBadge[d.type] || typeBadge.app;
          return (
            <button key={d.id} onClick={() => switchDash(d)} style={{
              width: "100%", textAlign: "left",
              background: activeDash?.id === d.id ? "#6366f122" : "none",
              border: `1px solid ${activeDash?.id === d.id ? "#6366f155" : "transparent"}`,
              borderRadius: 8, padding: "9px 12px",
              color: activeDash?.id === d.id ? "#fff" : "#888",
              cursor: "pointer", fontSize: 13, fontWeight: activeDash?.id === d.id ? 600 : 400,
              marginBottom: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
              <span style={{ fontSize: 10, color: badge.color, background: badge.color + "22", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{badge.label}</span>
            </button>
          );
        })}
      </div>
      <div style={{ padding: "12px 10px", borderTop: "1px solid #2a2a3e" }}>
        <p style={{ color: "#555", fontSize: 11, margin: "0 0 6px", padding: "0 6px" }}>{auth.user.email}</p>
        {auth.user.role === "admin" && (
          <button onClick={() => nav("/admin")} style={{ width: "100%", background: "#2a2a3e", border: "none", borderRadius: 8, padding: "8px 12px", color: "#aaa", cursor: "pointer", fontSize: 12, marginBottom: 6, textAlign: "left" }}>
            ⚙️ Admin Panel
          </button>
        )}
        <button onClick={onLogout} style={{ width: "100%", background: "#3f0f0f22", border: "1px solid #7f1d1d44", borderRadius: 8, padding: "8px 12px", color: "#f87171", cursor: "pointer", fontSize: 12, textAlign: "left" }}>
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .mobile-topbar { display: flex !important; }
          .mobile-overlay { display: ${sidebarOpen ? "block" : "none"} !important; }
          .mobile-drawer { transform: ${sidebarOpen ? "translateX(0)" : "translateX(-100%)"} !important; }
          .main-content { padding: 16px 12px !important; }
        }
        @media (min-width: 769px) {
          .mobile-topbar { display: none !important; }
          .mobile-drawer { display: none !important; }
          .mobile-overlay { display: none !important; }
        }
      `}</style>

      <div className="mobile-overlay" onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 40, display: "none" }} />
      <div className="mobile-drawer" style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 260, background: "#1e1e2e", borderRight: "1px solid #2a2a3e", zIndex: 50, transition: "transform .25s", transform: "translateX(-100%)" }}>
        <Sidebar />
      </div>

      <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#fff", fontFamily: "system-ui,sans-serif", display: "flex" }}>
        <div className="desktop-sidebar" style={{ width: 220, background: "#1e1e2e", borderRight: "1px solid #2a2a3e", display: "flex", flexDirection: "column", flexShrink: 0, minHeight: "100vh" }}>
          <Sidebar />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mobile-topbar" style={{ display: "none", alignItems: "center", gap: 12, padding: "14px 16px", background: "#1e1e2e", borderBottom: "1px solid #2a2a3e", position: "sticky", top: 0, zIndex: 30 }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", padding: 0 }}>☰</button>
            <img src={spLogo} alt="SP Media" style={{ height: 24, width: "auto" }} />
            <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}><span style={{ color: "#6366f1" }}>SP Media</span> Dashboards</p>
          </div>

          <div className="main-content" style={{ padding: "24px 20px" }}>

            {/* Dashboard header */}
            {activeDash && (
              <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{activeDash.name}</h1>
                  <p style={{ color: "#555", fontSize: 12, margin: "3px 0 0", fontFamily: "monospace" }}>{activeDash.act_id}</p>
                </div>
                <span style={{ fontSize: 12, color: ORGANIC_COLOR, background: ORGANIC_COLOR + "22", borderRadius: 6, padding: "3px 10px", fontWeight: 600 }}>Organic Social</span>
              </div>
            )}

            {/* Date controls */}
            <div style={{ ...S.card, padding: 16, marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ minWidth: 130, flex: "1 1 130px" }}>
                  <p style={{ margin: "0 0 5px", fontSize: 11, color: "#888" }}>START DATE</p>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...S.inp, width: "100%" }} />
                </div>
                <div style={{ minWidth: 130, flex: "1 1 130px" }}>
                  <p style={{ margin: "0 0 5px", fontSize: 11, color: "#888" }}>END DATE</p>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...S.inp, width: "100%" }} />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {[{ label: "7d", d: 7 }, { label: "14d", d: 14 }, { label: "28d", d: 28 }, { label: "90d", d: 90 }].map(({ label, d }) => (
                    <button key={d} onClick={() => applyPreset(d)} style={S.btn()}>{label}</button>
                  ))}
                  <button onClick={fetchData} disabled={loading || !activeDash} style={{ ...S.btn(ORGANIC_COLOR, "#fff"), opacity: loading ? 0.6 : 1, fontSize: 13 }}>
                    {loading ? "Loading…" : "Fetch Data"}
                  </button>
                </div>
              </div>
              {error && <p style={{ color: "#f87171", margin: "10px 0 0", fontSize: 12 }}>⚠️ {error}</p>}
            </div>

            {/* Empty state */}
            {!fbData && !loading && !error && (
              <div style={{ textAlign: "center", color: "#444", marginTop: 80 }}>
                <div style={{ fontSize: 52 }}>📱</div>
                <p style={{ marginTop: 12, fontSize: 14 }}>Pick a date range and hit <strong style={{ color: "#fff" }}>Fetch Data</strong></p>
              </div>
            )}

            {/* Tabs */}
            {fbData && (
              <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
                {[
                  { key: "overview",   label: "📊 Overview" },
                  { key: "posts",      label: `📝 FB Posts${fbData.posts ? ` (${fbData.posts.length})` : ""}` },
                  { key: "instagram",  label: igError === "not_connected" ? "📸 Instagram (not linked)" : "📸 Instagram" },
                ].map(t => (
                  <button key={t.key} onClick={() => setTab(t.key)} style={{
                    background: tab === t.key ? ORGANIC_COLOR : "#2a2a3e",
                    border: "none", borderRadius: 8, padding: "9px 14px",
                    color: tab === t.key ? "#fff" : "#aaa",
                    cursor: "pointer", fontSize: 12, fontWeight: tab === t.key ? 700 : 400,
                  }}>{t.label}</button>
                ))}
              </div>
            )}

            {tab === "overview"   && fbData && <OverviewTab fbData={fbData} igData={igData} />}
            {tab === "posts"      && fbData && <PostsTab posts={fbData.posts || []} />}
            {tab === "instagram"  && fbData && <InstagramTab igData={igData} igError={igError} />}

          </div>
        </div>
      </div>
    </>
  );
}

// ── Overview Tab ─────────────────────────────────────────

function OverviewTab({ fbData, igData }) {
  const [activeFbMetric, setActiveFbMetric] = useState("page_fans");
  const [activeIgMetric, setActiveIgMetric] = useState("impressions");

  const activeFbMeta = FB_METRICS.find(m => m.key === activeFbMetric) || FB_METRICS[0];
  const activeIgMeta = IG_METRICS.find(m => m.key === activeIgMetric) || IG_METRICS[0];
  const fbSummary    = fbData.summary || {};
  const igSummary    = igData?.summary || {};

  return (
    <div>
      {/* ── Facebook Section ── */}
      <p style={{ color: "#555", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", margin: "0 0 12px" }}>FACEBOOK PAGE</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 10, marginBottom: 20 }}>
        {FB_METRICS.map(m => {
          const active = activeFbMetric === m.key;
          return (
            <div key={m.key} onClick={() => setActiveFbMetric(m.key)} style={{
              ...S.card, padding: "12px 14px", cursor: "pointer",
              border: `1px solid ${active ? m.color : "#2a2a3e"}`,
              background: active ? m.color + "18" : "#1e1e2e",
              boxShadow: active ? `0 0 0 1px ${m.color}55` : "none", transition: "all .15s",
            }}>
              <p style={{ margin: "0 0 4px", fontSize: 10, color: active ? m.color : "#666", fontWeight: 600, letterSpacing: ".04em" }}>{m.label.toUpperCase()}</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{fmtNumber(fbSummary[m.key] || 0)}</p>
            </div>
          );
        })}
      </div>

      <div style={{ ...S.card, padding: 16, marginBottom: 20 }}>
        <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>
          {activeFbMeta.label} <span style={{ color: "#555", fontWeight: 400, fontSize: 12 }}>— daily</span>
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={fbData.insights || []}>
            <CartesianGrid stroke="#1a1a2e" />
            <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 9 }} />
            <YAxis tick={{ fill: "#555", fontSize: 9 }} width={55} tickFormatter={v => fmtNumber(v)} />
            <Tooltip
              contentStyle={{ background: "#13131f", border: `1px solid ${activeFbMeta.color}`, borderRadius: 8, fontSize: 12 }}
              formatter={v => [fmtNumber(v), activeFbMeta.label]}
            />
            <Line type="monotone" dataKey={activeFbMetric} stroke={activeFbMeta.color} strokeWidth={2.5} dot={{ r: 3, fill: activeFbMeta.color }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Instagram Section ── */}
      {igData && (<>
        <p style={{ color: "#555", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", margin: "20px 0 12px" }}>INSTAGRAM</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 10, marginBottom: 20 }}>
          {IG_METRICS.map(m => {
            const active = activeIgMetric === m.key;
            return (
              <div key={m.key} onClick={() => setActiveIgMetric(m.key)} style={{
                ...S.card, padding: "12px 14px", cursor: "pointer",
                border: `1px solid ${active ? m.color : "#2a2a3e"}`,
                background: active ? m.color + "18" : "#1e1e2e",
                boxShadow: active ? `0 0 0 1px ${m.color}55` : "none", transition: "all .15s",
              }}>
                <p style={{ margin: "0 0 4px", fontSize: 10, color: active ? m.color : "#666", fontWeight: 600, letterSpacing: ".04em" }}>{m.label.toUpperCase()}</p>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{fmtNumber(igSummary[m.key] || 0)}</p>
              </div>
            );
          })}
        </div>

        <div style={{ ...S.card, padding: 16, marginBottom: 20 }}>
          <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>
            {activeIgMeta.label} <span style={{ color: "#555", fontWeight: 400, fontSize: 12 }}>— daily</span>
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={igData.insights || []}>
              <CartesianGrid stroke="#1a1a2e" />
              <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 9 }} />
              <YAxis tick={{ fill: "#555", fontSize: 9 }} width={55} tickFormatter={v => fmtNumber(v)} />
              <Tooltip
                contentStyle={{ background: "#13131f", border: `1px solid ${activeIgMeta.color}`, borderRadius: 8, fontSize: 12 }}
                formatter={v => [fmtNumber(v), activeIgMeta.label]}
              />
              <Line type="monotone" dataKey={activeIgMetric} stroke={activeIgMeta.color} strokeWidth={2.5} dot={{ r: 3, fill: activeIgMeta.color }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>)}
    </div>
  );
}

// ── FB Posts Tab ─────────────────────────────────────────

function PostsTab({ posts }) {
  const [sortBy, setSortBy]   = useState("post_impressions");
  const [sortDir, setSortDir] = useState("desc");

  const toggleSort = key => {
    if (sortBy === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  };

  const sorted = [...posts].sort((a, b) =>
    sortDir === "desc" ? (b[sortBy] || 0) - (a[sortBy] || 0) : (a[sortBy] || 0) - (b[sortBy] || 0)
  );

  const SortTh = ({ k, label, minWidth }) => (
    <th onClick={() => toggleSort(k)} style={{ ...S.th, cursor: "pointer", userSelect: "none", color: sortBy === k ? "#fff" : "#555", minWidth: minWidth || "auto" }}>
      {label}{sortBy === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div style={{ ...S.card, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#13131f" }}>
              <th style={{ ...S.th, minWidth: 220 }}>Post</th>
              <th style={{ ...S.th, minWidth: 90 }}>Date</th>
              <SortTh k="post_impressions"   label="Impressions"    minWidth={100} />
              <SortTh k="post_reach"         label="Reach"          minWidth={80} />
              <SortTh k="post_engaged_users" label="Engaged Users"  minWidth={110} />
              <th style={S.th}>Link</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0
              ? <tr><td colSpan={6} style={{ ...S.th, textAlign: "center", padding: 20 }}>No posts in this period</td></tr>
              : sorted.map((post, i) => (
                <tr key={post.id} style={{ borderTop: "1px solid #1a1a2e", background: i % 2 ? "#ffffff04" : "transparent" }}>
                  <td style={{ ...S.td, maxWidth: 260 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {post.full_picture && (
                        <img src={post.full_picture} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} alt="" />
                      )}
                      <span style={{ color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                        {post.message?.slice(0, 70) || "(no caption)"}
                      </span>
                    </div>
                  </td>
                  <td style={{ ...S.td, color: "#888" }}>{new Date(post.created_time).toLocaleDateString()}</td>
                  <td style={{ ...S.td, color: "#3b82f6", fontWeight: 600 }}>{fmtNumber(post.post_impressions)}</td>
                  <td style={S.td}>{fmtNumber(post.post_reach)}</td>
                  <td style={{ ...S.td, color: "#10b981" }}>{fmtNumber(post.post_engaged_users)}</td>
                  <td style={S.td}>
                    <a href={post.permalink_url} target="_blank" rel="noopener noreferrer" style={{ color: "#6366f1", fontSize: 12 }}>View ↗</a>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Instagram Tab ─────────────────────────────────────────

function InstagramTab({ igData, igError }) {
  const [activeIgMetric, setActiveIgMetric] = useState("impressions");
  const [sortBy, setSortBy]   = useState("ig_impressions");
  const [sortDir, setSortDir] = useState("desc");

  if (igError === "not_connected") {
    return (
      <div style={{ textAlign: "center", color: "#555", marginTop: 60 }}>
        <div style={{ fontSize: 48 }}>📸</div>
        <p style={{ marginTop: 12, fontSize: 14, color: "#666" }}>No Instagram Business account linked to this Facebook Page.</p>
        <p style={{ fontSize: 12, color: "#444" }}>Connect an Instagram Business or Creator account in Meta Business Settings.</p>
      </div>
    );
  }

  if (igError) {
    return <div style={{ color: "#f87171", padding: 20, fontSize: 13 }}>⚠️ {igError}</div>;
  }

  if (!igData) return null;

  const activeIgMeta = IG_METRICS.find(m => m.key === activeIgMetric) || IG_METRICS[0];
  const igSummary    = igData.summary || {};

  const toggleSort = key => {
    if (sortBy === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  };

  const sortedMedia = [...(igData.media || [])].sort((a, b) =>
    sortDir === "desc" ? (b[sortBy] || 0) - (a[sortBy] || 0) : (a[sortBy] || 0) - (b[sortBy] || 0)
  );

  const SortTh = ({ k, label }) => (
    <th onClick={() => toggleSort(k)} style={{ ...S.th, cursor: "pointer", userSelect: "none", color: sortBy === k ? "#fff" : "#555" }}>
      {label}{sortBy === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div>
      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 10, marginBottom: 20 }}>
        {IG_METRICS.map(m => {
          const active = activeIgMetric === m.key;
          return (
            <div key={m.key} onClick={() => setActiveIgMetric(m.key)} style={{
              ...S.card, padding: "12px 14px", cursor: "pointer",
              border: `1px solid ${active ? m.color : "#2a2a3e"}`,
              background: active ? m.color + "18" : "#1e1e2e",
              boxShadow: active ? `0 0 0 1px ${m.color}55` : "none", transition: "all .15s",
            }}>
              <p style={{ margin: "0 0 4px", fontSize: 10, color: active ? m.color : "#666", fontWeight: 600, letterSpacing: ".04em" }}>{m.label.toUpperCase()}</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{fmtNumber(igSummary[m.key] || 0)}</p>
            </div>
          );
        })}
      </div>

      {/* Trend chart */}
      <div style={{ ...S.card, padding: 16, marginBottom: 20 }}>
        <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>
          {activeIgMeta.label} <span style={{ color: "#555", fontWeight: 400, fontSize: 12 }}>— daily</span>
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={igData.insights || []}>
            <CartesianGrid stroke="#1a1a2e" />
            <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 9 }} />
            <YAxis tick={{ fill: "#555", fontSize: 9 }} width={55} tickFormatter={v => fmtNumber(v)} />
            <Tooltip
              contentStyle={{ background: "#13131f", border: `1px solid ${activeIgMeta.color}`, borderRadius: 8, fontSize: 12 }}
              formatter={v => [fmtNumber(v), activeIgMeta.label]}
            />
            <Line type="monotone" dataKey={activeIgMetric} stroke={activeIgMeta.color} strokeWidth={2.5} dot={{ r: 3, fill: activeIgMeta.color }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top posts table */}
      <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 12px" }}>Posts & Reels</p>
      <div style={{ ...S.card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#13131f" }}>
                <th style={{ ...S.th, minWidth: 200 }}>Caption</th>
                <th style={S.th}>Type</th>
                <th style={{ ...S.th, minWidth: 80 }}>Date</th>
                <SortTh k="like_count"     label="Likes" />
                <SortTh k="comments_count" label="Comments" />
                <SortTh k="ig_impressions" label="Impressions" />
                <SortTh k="ig_reach"       label="Reach" />
              </tr>
            </thead>
            <tbody>
              {sortedMedia.length === 0
                ? <tr><td colSpan={7} style={{ ...S.th, textAlign: "center", padding: 20 }}>No posts in this period</td></tr>
                : sortedMedia.slice(0, 50).map((post, i) => (
                  <tr key={post.id} style={{ borderTop: "1px solid #1a1a2e", background: i % 2 ? "#ffffff04" : "transparent" }}>
                    <td style={{ ...S.td, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", color: "#ccc" }}>
                      {post.caption?.slice(0, 60) || "(no caption)"}
                    </td>
                    <td style={{ ...S.td, color: "#888", fontSize: 11 }}>{post.media_type}</td>
                    <td style={{ ...S.td, color: "#888" }}>{new Date(post.timestamp).toLocaleDateString()}</td>
                    <td style={{ ...S.td, color: "#e1306c", fontWeight: 600 }}>{fmtNumber(post.like_count)}</td>
                    <td style={S.td}>{fmtNumber(post.comments_count)}</td>
                    <td style={{ ...S.td, color: "#3b82f6" }}>{fmtNumber(post.ig_impressions)}</td>
                    <td style={S.td}>{fmtNumber(post.ig_reach)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
