import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import API from "./config";
import spLogo from "./assets/sp-logo.png";

const fmtCurrency = v => `$${parseFloat(v || 0).toFixed(2)}`;
const fmtNumber   = v => parseInt(v || 0).toLocaleString();
const fmtPercent  = v => `${parseFloat(v || 0).toFixed(2)}%`;
const toYMD = d => d.toISOString().split("T")[0];

const METRICS = [
  { key: "spend",       label: "Spend",       format: fmtCurrency, color: "#6366f1" },
  { key: "impressions", label: "Impressions",  format: fmtNumber,   color: "#3b82f6" },
  { key: "clicks",      label: "Clicks",       format: fmtNumber,   color: "#8b5cf6" },
  { key: "conversions", label: "Conversions",  format: fmtNumber,   color: "#10b981" },
  { key: "cpa",         label: "CPA",          format: fmtCurrency, color: "#f59e0b" },
  { key: "ctr",         label: "CTR",          format: fmtPercent,  color: "#f97316" },
  { key: "cpc",         label: "CPC",          format: fmtCurrency, color: "#14b8a6" },
  { key: "cpm",         label: "CPM",          format: fmtCurrency, color: "#ec4899" },
];

const S = {
  card: { background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 12 },
  inp:  { background: "#13131f", border: "1px solid #2a2a3e", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" },
  th:   { padding: "9px 14px", textAlign: "left", color: "#555", fontWeight: 600, whiteSpace: "nowrap", fontSize: 12 },
  td:   { padding: "8px 14px", whiteSpace: "nowrap", fontSize: 13 },
  btn:  (color = "#2a2a3e", textColor = "#aaa") => ({ background: color, border: "none", borderRadius: 7, padding: "9px 14px", color: textColor, cursor: "pointer", fontSize: 12, fontWeight: 600 }),
};

const authHeaders = token => ({ Authorization: `Bearer ${token}` });

function computeTotals(rows) {
  if (!rows?.length) return {};
  const t = rows.reduce((acc, r) => ({
    spend: acc.spend + r.spend,
    impressions: acc.impressions + r.impressions,
    clicks: acc.clicks + r.clicks,
    conversions: acc.conversions + r.conversions,
  }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 });
  t.cpa = t.conversions > 0 ? t.spend / t.conversions : 0;
  t.ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
  t.cpc = t.clicks > 0 ? t.spend / t.clicks : 0;
  t.cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0;
  return t;
}

const KW_SORTS = [
  { label: "Lowest CPA",     key: "cpa",    dir: "asc",  filter: r => r.conversions > 0 },
  { label: "Most Clicks",    key: "clicks", dir: "desc", filter: () => true },
  { label: "Highest Spend",  key: "spend",  dir: "desc", filter: () => true },
];

export default function GoogleDashboard({ auth, onLogout, myDashboards, activeDash, setActiveDash }) {
  const nav = useNavigate();
  const { id } = useParams();
  const [tab, setTab]             = useState("account");
  const [kwSort, setKwSort]       = useState(0);
  const [rows, setRows]           = useState(null);
  const [campaigns, setCampaigns] = useState(null);
  const [adgroups, setAdgroups]   = useState(null);
  const [keywords, setKeywords]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [activeMetric, setActive] = useState("spend");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const defEnd = new Date(); defEnd.setDate(defEnd.getDate() - 1);
  const defStart = new Date(defEnd); defStart.setDate(defStart.getDate() - 6);
  const [startDate, setStartDate] = useState(toYMD(defStart));
  const [endDate, setEndDate]     = useState(toYMD(defEnd));
  const [activePreset, setActivePreset] = useState(7);

  const h = authHeaders(auth.token);

  const applyPreset = days => {
    const e = new Date(); e.setDate(e.getDate() - 1);
    const s = new Date(e);
    if (days > 1) s.setDate(s.getDate() - (days - 1));
    setStartDate(toYMD(s)); setEndDate(toYMD(e));
    setActivePreset(days);
  };

  const fetchData = useCallback(async () => {
    if (!activeDash) return;
    setLoading(true); setError("");
    setRows(null); setCampaigns(null); setAdgroups(null); setKeywords(null);
    try {
      const params = `since=${startDate}&until=${endDate}`;
      const [r1, r2, r3, r4] = await Promise.all([
        fetch(`${API}/dashboards/${activeDash.id}/google/account?${params}`,   { headers: h }),
        fetch(`${API}/dashboards/${activeDash.id}/google/campaigns?${params}`, { headers: h }),
        fetch(`${API}/dashboards/${activeDash.id}/google/adgroups?${params}`,  { headers: h }),
        fetch(`${API}/dashboards/${activeDash.id}/google/keywords?${params}`,  { headers: h }),
      ]);
      const [d1, d2, d3, d4] = await Promise.all([r1.json(), r2.json(), r3.json(), r4.json()]);
      if (d1.error) throw new Error(d1.error);
      if (d2.error) throw new Error(d2.error);
      if (d3.error) throw new Error(d3.error);
      setRows(d1.data || []);
      setCampaigns(d2.data || []);
      setAdgroups(d3.data || []);
      setKeywords(d4.data || []);
      setActive("spend");
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [activeDash, startDate, endDate]);

  const switchDash = dash => {
    setActiveDash(dash);
    setRows(null); setCampaigns(null); setAdgroups(null); setKeywords(null);
    setError(""); setTab("account");
    setSidebarOpen(false);
    nav(`/dashboards/${dash.id}`);
  };

  const totals = computeTotals(rows);
  const activeMeta = METRICS.find(m => m.key === activeMetric) || METRICS[0];

  const typeBadge = { app: { label: "App", color: "#6366f1" }, lead: { label: "Lead Gen", color: "#10b981" }, ecom: { label: "Ecom", color: "#f59e0b" }, google: { label: "Google", color: "#4285f4" } };

  const Sidebar = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "20px 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <img src={spLogo} alt="SPMP" style={{ height: 28, width: "auto" }} />
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}><span style={{ color: "#6366f1" }}>Clients</span></p>
            <p style={{ margin: "2px 0 0", color: "#555", fontSize: 11 }}>Dashboards</p>
          </div>
        </div>
        <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: "#555", fontSize: 20, cursor: "pointer", padding: 4 }} className="sidebar-close">✕</button>
      </div>
      <div style={{ flex: 1, padding: "8px 10px", overflowY: "auto" }}>
        {(() => {
          const metaDashes    = myDashboards.filter(d => ["app","lead","ecom"].includes(d.type));
          const googleDashes  = myDashboards.filter(d => d.type === "google");
          const organicDashes = myDashboards.filter(d => d.type === "organic");
          const renderBtn = d => {
            const badge = typeBadge[d.type] || typeBadge.app;
            return (
              <button key={d.id} onClick={() => switchDash(d)} style={{
                width: "100%", textAlign: "left", background: activeDash?.id === d.id ? "#6366f122" : "none",
                border: `1px solid ${activeDash?.id === d.id ? "#6366f155" : "transparent"}`,
                borderRadius: 8, padding: "9px 12px", color: activeDash?.id === d.id ? "#fff" : "#888",
                cursor: "pointer", fontSize: 13, fontWeight: activeDash?.id === d.id ? 600 : 400, marginBottom: 2,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
              }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                <span style={{ fontSize: 10, color: badge.color, background: badge.color + "22", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{badge.label}</span>
              </button>
            );
          };
          return (<>
            {(metaDashes.length > 0 || googleDashes.length > 0) && <>
              <p style={{ color: "#555", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", padding: "4px 6px 2px", margin: "0 0 2px" }}>PAID</p>
              {metaDashes.length > 0 && <>
                <p style={{ color: "#6366f1", fontSize: 10, fontWeight: 600, padding: "2px 6px 1px", margin: 0 }}>Meta</p>
                {metaDashes.map(renderBtn)}
              </>}
              {googleDashes.length > 0 && <>
                <p style={{ color: "#4285f4", fontSize: 10, fontWeight: 600, padding: "2px 6px 1px", margin: "4px 0 0" }}>Google</p>
                {googleDashes.map(renderBtn)}
              </>}
            </>}
            {organicDashes.length > 0 && <>
              <p style={{ color: "#555", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", padding: "4px 6px 2px", margin: "8px 0 2px" }}>ORGANIC</p>
              {organicDashes.map(renderBtn)}
            </>}
          </>);
        })()}
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
            <img src={spLogo} alt="SPMP" style={{ height: 24, width: "auto" }} />
            <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}><span style={{ color: "#6366f1" }}>SPMP</span> Dashboards</p>
          </div>

          <div className="main-content" style={{ padding: "24px 20px" }}>

            {activeDash && (
              <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{activeDash.name}</h1>
                  <p style={{ color: "#555", fontSize: 12, margin: "3px 0 0", fontFamily: "monospace" }}>{activeDash.act_id}</p>
                </div>
                <span style={{ fontSize: 12, color: "#4285f4", background: "#4285f422", borderRadius: 6, padding: "3px 10px", fontWeight: 600 }}>Google Ads</span>
              </div>
            )}

            {/* Date Controls */}
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
                  {[{ label: "Yesterday", d: 1 }, { label: "7d", d: 7 }, { label: "14d", d: 14 }, { label: "30d", d: 30 }].map(({ label, d }) => (
                    <button key={d} onClick={() => applyPreset(d)} style={{ ...S.btn(activePreset === d ? "#4285f4" : "#2a2a3e", activePreset === d ? "#fff" : "#aaa"), border: `1px solid ${activePreset === d ? "#4285f4" : "transparent"}` }}>{label}</button>
                  ))}
                  <button onClick={fetchData} disabled={loading || !activeDash} style={{ ...S.btn("#4285f4", "#fff"), opacity: loading ? 0.6 : 1, fontSize: 13 }}>
                    {loading ? "Loading…" : "Fetch Data"}
                  </button>
                </div>
              </div>
              {error && <p style={{ color: "#f87171", margin: "10px 0 0", fontSize: 12 }}>⚠️ {error}</p>}
            </div>

            {!rows && !loading && !error && (
              <div style={{ textAlign: "center", color: "#444", marginTop: 80 }}>
                <div style={{ fontSize: 52 }}>📊</div>
                <p style={{ marginTop: 12, fontSize: 14 }}>Pick a date range and hit <strong style={{ color: "#fff" }}>Fetch Data</strong></p>
              </div>
            )}

            {/* Tabs */}
            {rows && (
              <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
                {[
                  { key: "account",   label: "📊 Account" },
                  { key: "campaigns", label: `🎯 Campaigns${campaigns ? ` (${campaigns.length})` : ""}` },
                  { key: "adgroups",  label: `📁 Ad Groups${adgroups ? ` (${adgroups.length})` : ""}` },
                  { key: "keywords",  label: `🔑 Keywords${keywords ? ` (${keywords.length})` : ""}` },
                ].map(t => (
                  <button key={t.key} onClick={() => setTab(t.key)} style={{
                    background: tab === t.key ? "#4285f4" : "#2a2a3e", border: "none", borderRadius: 8,
                    padding: "9px 14px", color: tab === t.key ? "#fff" : "#aaa",
                    cursor: "pointer", fontSize: 12, fontWeight: tab === t.key ? 700 : 400,
                  }}>{t.label}</button>
                ))}
              </div>
            )}

            {/* Account Tab */}
            {tab === "account" && rows && (<>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 10, marginBottom: 20 }}>
                {METRICS.map(m => {
                  const active = activeMetric === m.key;
                  return (
                    <div key={m.key} onClick={() => setActive(m.key)} style={{
                      ...S.card, padding: "12px 14px", cursor: "pointer",
                      border: `1px solid ${active ? m.color : "#2a2a3e"}`,
                      background: active ? m.color + "18" : "#1e1e2e",
                      boxShadow: active ? `0 0 0 1px ${m.color}55` : "none", transition: "all .15s",
                    }}>
                      <p style={{ margin: "0 0 4px", fontSize: 10, color: active ? m.color : "#666", fontWeight: 600, letterSpacing: ".04em" }}>{m.label.toUpperCase()}</p>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{m.format(totals[m.key] || 0)}</p>
                    </div>
                  );
                })}
              </div>

              <div style={{ ...S.card, padding: 16, marginBottom: 20 }}>
                <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>
                  {activeMeta.label} <span style={{ color: "#555", fontWeight: 400, fontSize: 12 }}>— daily</span>
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={rows}>
                    <CartesianGrid stroke="#1e1e2e" />
                    <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 9 }} />
                    <YAxis tick={{ fill: "#555", fontSize: 9 }} width={55} tickFormatter={v => activeMeta.format(v)} />
                    <Tooltip
                      contentStyle={{ background: "#13131f", border: `1px solid ${activeMeta.color}`, borderRadius: 8, fontSize: 12 }}
                      formatter={v => [activeMeta.format(v), activeMeta.label]}
                    />
                    <Line type="monotone" dataKey={activeMetric} stroke={activeMeta.color} strokeWidth={2.5} dot={{ r: 3, fill: activeMeta.color }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Top Keywords */}
              {keywords && keywords.length > 0 && (() => {
                const s = KW_SORTS[kwSort];
                const top = [...keywords].filter(s.filter).sort((a, b) =>
                  s.dir === "asc" ? a[s.key] - b[s.key] : b[s.key] - a[s.key]
                ).slice(0, 5);
                return (
                  <div style={{ ...S.card, overflow: "hidden", marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #2a2a3e", flexWrap: "wrap", gap: 8 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Top Keywords</p>
                      <div style={{ display: "flex", gap: 6 }}>
                        {KW_SORTS.map((opt, i) => (
                          <button key={i} onClick={() => setKwSort(i)} style={{
                            ...S.btn(i === kwSort ? "#4285f4" : "#13131f", i === kwSort ? "#fff" : "#666"),
                            border: `1px solid ${i === kwSort ? "#4285f4" : "#2a2a3e"}`, padding: "5px 11px", fontSize: 11,
                          }}>{opt.label}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr style={{ background: "#13131f" }}>
                          <th style={S.th}>Keyword</th>
                          <th style={S.th}>Match</th>
                          <th style={S.th}>Spend</th>
                          <th style={S.th}>Clicks</th>
                          <th style={S.th}>Conversions</th>
                          <th style={S.th}>CPA</th>
                          <th style={S.th}>CTR</th>
                          <th style={S.th}>CPC</th>
                        </tr></thead>
                        <tbody>
                          {top.map((row, i) => (
                            <tr key={i} style={{ borderTop: "1px solid #1a1a2e", background: i % 2 ? "#ffffff04" : "transparent" }}>
                              <td style={{ ...S.td, color: "#4285f4", fontWeight: 600 }}>
                                <span style={{ color: "#555", marginRight: 6, fontSize: 11 }}>#{i + 1}</span>{row.keyword}
                              </td>
                              <td style={{ ...S.td, color: "#888", fontSize: 11 }}>{row.matchType}</td>
                              <td style={{ ...S.td, color: "#6366f1", fontWeight: 600 }}>{fmtCurrency(row.spend)}</td>
                              <td style={{ ...S.td, color: "#8b5cf6" }}>{fmtNumber(row.clicks)}</td>
                              <td style={{ ...S.td, color: "#10b981", fontWeight: 600 }}>{parseFloat(row.conversions || 0).toFixed(1)}</td>
                              <td style={{ ...S.td, color: "#f59e0b" }}>{row.cpa > 0 ? fmtCurrency(row.cpa) : "—"}</td>
                              <td style={S.td}>{fmtPercent(row.ctr)}</td>
                              <td style={S.td}>{fmtCurrency(row.cpc)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              <div style={{ ...S.card, overflow: "hidden" }}>
                <p style={{ margin: 0, padding: "14px 18px", fontWeight: 700, fontSize: 14, borderBottom: "1px solid #2a2a3e" }}>Daily Breakdown</p>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: "#13131f" }}>
                      <th style={S.th}>Date</th>
                      <th style={S.th}>Spend</th>
                      <th style={S.th}>Impressions</th>
                      <th style={S.th}>Clicks</th>
                      <th style={S.th}>Conversions</th>
                      <th style={S.th}>CPA</th>
                      <th style={S.th}>CTR</th>
                      <th style={S.th}>CPC</th>
                      <th style={S.th}>CPM</th>
                    </tr></thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={row.date} style={{ borderTop: "1px solid #1a1a2e", background: i % 2 ? "#ffffff04" : "transparent" }}>
                          <td style={S.td}>{row.date}</td>
                          <td style={{ ...S.td, color: "#6366f1", fontWeight: 600 }}>{fmtCurrency(row.spend)}</td>
                          <td style={S.td}>{fmtNumber(row.impressions)}</td>
                          <td style={{ ...S.td, color: "#8b5cf6" }}>{fmtNumber(row.clicks)}</td>
                          <td style={{ ...S.td, color: "#10b981", fontWeight: 600 }}>{fmtNumber(row.conversions)}</td>
                          <td style={{ ...S.td, color: "#f59e0b" }}>{row.cpa > 0 ? fmtCurrency(row.cpa) : "—"}</td>
                          <td style={S.td}>{fmtPercent(row.ctr)}</td>
                          <td style={S.td}>{fmtCurrency(row.cpc)}</td>
                          <td style={S.td}>{fmtCurrency(row.cpm)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>)}

            {/* Campaigns Tab */}
            {tab === "campaigns" && campaigns && (
              <GoogleBreakdownTable rows={campaigns} nameLabel="Campaign" showStatus />
            )}

            {/* Ad Groups Tab */}
            {tab === "adgroups" && adgroups && (
              <GoogleBreakdownTable rows={adgroups} nameLabel="Ad Group" subLabel="Campaign" subKey="campaignName" />
            )}

            {/* Keywords Tab */}
            {tab === "keywords" && keywords && (
              <div style={{ background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: "#13131f" }}>
                      <th style={{ ...S.th, minWidth: 160 }}>Keyword</th>
                      <th style={S.th}>Match Type</th>
                      <th style={S.th}>Ad Group</th>
                      <th style={S.th}>Campaign</th>
                      <th style={S.th}>Spend</th>
                      <th style={S.th}>Impressions</th>
                      <th style={S.th}>Clicks</th>
                      <th style={S.th}>Conversions</th>
                      <th style={S.th}>CPA</th>
                      <th style={S.th}>CTR</th>
                      <th style={S.th}>CPC</th>
                    </tr></thead>
                    <tbody>
                      {keywords.length === 0
                        ? <tr><td colSpan={11} style={{ ...S.th, textAlign: "center", padding: 20 }}>No data</td></tr>
                        : keywords.map((row, i) => (
                          <tr key={i} style={{ borderTop: "1px solid #1a1a2e", background: i % 2 ? "#ffffff04" : "transparent" }}>
                            <td style={{ ...S.td, color: "#fff", fontWeight: 600 }}>{row.keyword}</td>
                            <td style={{ ...S.td, color: "#888", fontSize: 11 }}>{row.matchType}</td>
                            <td style={{ ...S.td, color: "#888", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{row.adGroupName}</td>
                            <td style={{ ...S.td, color: "#888", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{row.campaignName}</td>
                            <td style={{ ...S.td, color: "#6366f1", fontWeight: 600 }}>{fmtCurrency(row.spend)}</td>
                            <td style={S.td}>{fmtNumber(row.impressions)}</td>
                            <td style={{ ...S.td, color: "#8b5cf6" }}>{fmtNumber(row.clicks)}</td>
                            <td style={{ ...S.td, color: "#10b981", fontWeight: 600 }}>{parseFloat(row.conversions || 0).toFixed(1)}</td>
                            <td style={{ ...S.td, color: "#f59e0b" }}>{row.cpa > 0 ? fmtCurrency(row.cpa) : "—"}</td>
                            <td style={S.td}>{fmtPercent(row.ctr)}</td>
                            <td style={S.td}>{fmtCurrency(row.cpc)}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

function GoogleBreakdownTable({ rows, nameLabel, subLabel, subKey, showStatus }) {
  const [sortBy, setSortBy]   = useState("spend");
  const [sortDir, setSortDir] = useState("desc");
  const sorted = [...rows].sort((a, b) => sortDir === "desc" ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy]);
  const toggleSort = key => {
    if (sortBy === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  };
  const SortTh = ({ k, label }) => (
    <th onClick={() => toggleSort(k)} style={{ ...S.th, cursor: "pointer", userSelect: "none", color: sortBy === k ? "#fff" : "#555" }}>
      {label}{sortBy === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );
  const statusColor = s => s === "ENABLED" ? "#10b981" : s === "PAUSED" ? "#f59e0b" : "#555";
  return (
    <div style={{ background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#13131f" }}>
            <th style={{ ...S.th, minWidth: 180 }}>{nameLabel}</th>
            {subLabel && <th style={S.th}>{subLabel}</th>}
            {showStatus && <th style={S.th}>Status</th>}
            <SortTh k="spend" label="Spend" />
            <SortTh k="impressions" label="Impressions" />
            <SortTh k="clicks" label="Clicks" />
            <SortTh k="conversions" label="Conversions" />
            <SortTh k="cpa" label="CPA" />
            <SortTh k="ctr" label="CTR" />
            <SortTh k="cpc" label="CPC" />
            <SortTh k="cpm" label="CPM" />
          </tr></thead>
          <tbody>
            {sorted.length === 0
              ? <tr><td colSpan={10} style={{ ...S.th, textAlign: "center", padding: 20 }}>No data</td></tr>
              : sorted.map((row, i) => (
                <tr key={row.id || i} style={{ borderTop: "1px solid #1a1a2e", background: i % 2 ? "#ffffff04" : "transparent" }}>
                  <td style={{ ...S.th, color: "#fff", fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={row.name}>{row.name}</td>
                  {subLabel && <td style={{ ...S.th, color: "#888", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{row[subKey]}</td>}
                  {showStatus && <td style={S.th}><span style={{ color: statusColor(row.status), fontSize: 11, fontWeight: 600 }}>{row.status}</span></td>}
                  <td style={{ ...S.th, color: "#6366f1", fontWeight: 600 }}>${parseFloat(row.spend || 0).toFixed(2)}</td>
                  <td style={S.th}>{parseInt(row.impressions || 0).toLocaleString()}</td>
                  <td style={{ ...S.th, color: "#8b5cf6" }}>{parseInt(row.clicks || 0).toLocaleString()}</td>
                  <td style={{ ...S.th, color: "#10b981", fontWeight: 600 }}>{parseFloat(row.conversions || 0).toFixed(1)}</td>
                  <td style={{ ...S.th, color: "#f59e0b" }}>{row.cpa > 0 ? `$${parseFloat(row.cpa).toFixed(2)}` : "—"}</td>
                  <td style={S.th}>{parseFloat(row.ctr || 0).toFixed(2)}%</td>
                  <td style={S.th}>${parseFloat(row.cpc || 0).toFixed(2)}</td>
                  <td style={S.th}>${parseFloat(row.cpm || 0).toFixed(2)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
