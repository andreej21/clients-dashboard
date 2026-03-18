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
  const [compare, setCompare]     = useState(false);
  const [prevTotals, setPrevTotals] = useState(null);
  const [prevRows, setPrevRows]     = useState(null);

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
    setPrevTotals(null); setPrevRows(null);
    try {
      const params = `since=${startDate}&until=${endDate}`;
      const dayDiff = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
      const prevEnd = new Date(startDate); prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (dayDiff - 1));
      const prevParams = `since=${toYMD(prevStart)}&until=${toYMD(prevEnd)}`;
      const fetches = [
        fetch(`${API}/dashboards/${activeDash.id}/google/account?${params}`,   { headers: h }),
        fetch(`${API}/dashboards/${activeDash.id}/google/campaigns?${params}`, { headers: h }),
        fetch(`${API}/dashboards/${activeDash.id}/google/adgroups?${params}`,  { headers: h }),
        fetch(`${API}/dashboards/${activeDash.id}/google/keywords?${params}`,  { headers: h }),
      ];
      if (compare) fetches.push(fetch(`${API}/dashboards/${activeDash.id}/google/account?${prevParams}`, { headers: h }));
      const jsons = await Promise.all((await Promise.all(fetches)).map(r => r.json()));
      const [d1, d2, d3, d4, d5] = jsons;
      if (d1.error) throw new Error(d1.error);
      if (d2.error) throw new Error(d2.error);
      if (d3.error) throw new Error(d3.error);
      setRows(d1.data || []);
      setCampaigns(d2.data || []);
      setAdgroups(d3.data || []);
      setKeywords(d4.data || []);
      setActive("spend");
      if (compare && d5) {
        const pRows = d5.data || [];
        setPrevRows(pRows);
        setPrevTotals(computeTotals(pRows));
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [activeDash, startDate, endDate, compare]);

  const switchDash = dash => {
    setActiveDash(dash);
    setRows(null); setCampaigns(null); setAdgroups(null); setKeywords(null);
    setPrevRows(null); setPrevTotals(null);
    setError(""); setTab("account");
    setSidebarOpen(false);
    nav(`/dashboards/${dash.id}`);
  };

  const totals = computeTotals(rows);
  const activeMeta = METRICS.find(m => m.key === activeMetric) || METRICS[0];

  const genInsights = () => {
    if (!rows || rows.length === 0) return [];
    const out = [];
    const days = rows.length;
    out.push({ icon: "💰", color: "#8b5cf6", text: `${fmtCurrency(totals.spend)} spent over ${days} day${days !== 1 ? "s" : ""} · avg ${fmtCurrency(totals.spend / days)}/day` });
    const daysC = rows.filter(r => r.conversions > 0);
    if (daysC.length > 0) {
      const best  = daysC.reduce((a, b) => a.cpa < b.cpa ? a : b);
      const worst = daysC.reduce((a, b) => a.cpa > b.cpa ? a : b);
      out.push({ icon: "🎯", color: "#10b981", text: `Best day: ${best.date} — ${fmtCurrency(best.cpa)} CPA with ${best.conversions} conv` });
      if (best.date !== worst.date)
        out.push({ icon: "⚠️", color: "#f59e0b", text: `Worst day: ${worst.date} — ${fmtCurrency(worst.cpa)} CPA` });
    } else {
      out.push({ icon: "📊", color: "#555", text: "No conversions recorded in this period" });
    }
    if (totals.ctr > 0) {
      const [ico, lvl, col] = totals.ctr >= 3 ? ["✅", "excellent", "#10b981"] : totals.ctr >= 2 ? ["📊", "good", "#4285f4"] : totals.ctr >= 1 ? ["📊", "average", "#f59e0b"] : ["⚠️", "below average — consider refreshing creatives", "#ef4444"];
      out.push({ icon: ico, color: col, text: `CTR of ${fmtPercent(totals.ctr)} is ${lvl}` });
    }
    if (keywords && keywords.length > 0) {
      const kwC = keywords.filter(k => k.conversions > 0);
      if (kwC.length > 0) {
        const top = kwC.reduce((a, b) => a.cpa < b.cpa ? a : b);
        const pct = totals.conversions > 0 ? Math.round((top.conversions / totals.conversions) * 100) : 0;
        out.push({ icon: "🔑", color: "#4285f4", text: `Top keyword: "${top.keyword}" · ${fmtCurrency(top.cpa)} CPA · ${pct}% of all conversions` });
      }
    }
    if (compare && prevTotals && prevTotals.spend > 0) {
      if (prevTotals.cpa > 0 && totals.cpa > 0) {
        const d = ((totals.cpa - prevTotals.cpa) / prevTotals.cpa) * 100;
        const good = d < 0;
        out.push({ icon: good ? "📈" : "📉", color: good ? "#10b981" : "#ef4444", text: `CPA ${good ? "improved" : "worsened"} ${Math.abs(d).toFixed(1)}% vs previous period (${fmtCurrency(prevTotals.cpa)} → ${fmtCurrency(totals.cpa)})` });
      }
      if (prevTotals.conversions > 0) {
        const d = ((totals.conversions - prevTotals.conversions) / prevTotals.conversions) * 100;
        if (Math.abs(d) > 5) {
          const good = d > 0;
          out.push({ icon: good ? "📈" : "📉", color: good ? "#10b981" : "#ef4444", text: `Conversions ${good ? "up" : "down"} ${Math.abs(d).toFixed(1)}% vs previous period` });
        }
      }
    }
    return out;
  };

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
                  <button onClick={() => setCompare(c => !c)} style={{
                    ...S.btn(compare ? "#f59e0b22" : "#2a2a3e", compare ? "#f59e0b" : "#aaa"),
                    border: `1px solid ${compare ? "#f59e0b" : "transparent"}`,
                  }}>
                    {compare ? "⚡ Comparing" : "Compare"}
                  </button>
                  <button onClick={fetchData} disabled={loading || !activeDash} style={{ ...S.btn("#4285f4", "#fff"), opacity: loading ? 0.6 : 1, fontSize: 13 }}>
                    {loading ? "Loading…" : "Fetch Data"}
                  </button>
                </div>
              </div>
              {compare && (() => {
                const dayDiff = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
                const pEnd = new Date(startDate); pEnd.setDate(pEnd.getDate() - 1);
                const pStart = new Date(pEnd); pStart.setDate(pStart.getDate() - (dayDiff - 1));
                return <p style={{ margin: "10px 0 0", fontSize: 12, color: "#f59e0b" }}>⚡ {startDate} → {endDate} vs {toYMD(pStart)} → {toYMD(pEnd)}</p>;
              })()}
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
              {(() => {
                const insights = genInsights();
                if (!insights.length) return null;
                return (
                  <div style={{ ...S.card, padding: "14px 18px", marginBottom: 20 }}>
                    <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 13, color: "#888" }}>🧠 Smart Insights</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {insights.map((ins, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <span style={{ fontSize: 14, lineHeight: 1.4 }}>{ins.icon}</span>
                          <p style={{ margin: 0, fontSize: 12, color: ins.color, lineHeight: 1.5 }}>{ins.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 10, marginBottom: 20 }}>
                {METRICS.map(m => {
                  const active = activeMetric === m.key;
                  const curr = totals[m.key] || 0;
                  const prev = prevTotals?.[m.key] || 0;
                  const pct  = compare && prev > 0 ? ((curr - prev) / prev) * 100 : null;
                  const costMetric = ["cpa","cpc","cpm"].includes(m.key);
                  const isGood = pct === null ? null : costMetric ? pct < 0 : pct > 0;
                  return (
                    <div key={m.key} onClick={() => setActive(m.key)} style={{
                      ...S.card, padding: "12px 14px", cursor: "pointer",
                      border: `1px solid ${active ? m.color : "#2a2a3e"}`,
                      background: active ? m.color + "18" : "#1e1e2e",
                      boxShadow: active ? `0 0 0 1px ${m.color}55` : "none", transition: "all .15s",
                    }}>
                      <p style={{ margin: "0 0 4px", fontSize: 10, color: active ? m.color : "#666", fontWeight: 600, letterSpacing: ".04em" }}>{m.label.toUpperCase()}</p>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{m.format(curr)}</p>
                      {pct !== null && (
                        <p style={{ margin: "4px 0 0", fontSize: 11, fontWeight: 600, color: isGood ? "#10b981" : "#ef4444" }}>
                          {pct > 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ ...S.card, padding: 16, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
                    {activeMeta.label} <span style={{ color: "#555", fontWeight: 400, fontSize: 12 }}>— daily</span>
                  </p>
                  {compare && prevRows && (
                    <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                      <span style={{ color: activeMeta.color }}>— Current</span>
                      <span style={{ color: "#f59e0b" }}>-- Previous</span>
                    </div>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={rows.map((r, i) => ({ ...r, prev: prevRows?.[i]?.[activeMetric] ?? null }))}>
                    <CartesianGrid stroke="#1e1e2e" />
                    <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 9 }} />
                    <YAxis tick={{ fill: "#555", fontSize: 9 }} width={55} tickFormatter={v => activeMeta.format(v)} />
                    <Tooltip
                      contentStyle={{ background: "#13131f", border: `1px solid ${activeMeta.color}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(v, name) => [activeMeta.format(v), name === "prev" ? "Previous" : activeMeta.label]}
                    />
                    <Line type="monotone" dataKey={activeMetric} stroke={activeMeta.color} strokeWidth={2.5} dot={{ r: 3, fill: activeMeta.color }} />
                    {compare && prevRows && (
                      <Line type="monotone" dataKey="prev" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    )}
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

              {(() => {
                const daysWithConv = rows.filter(r => r.conversions > 0);
                const bestDate  = daysWithConv.length > 0 ? daysWithConv.reduce((a, b) => a.cpa < b.cpa ? a : b).date : rows.reduce((a, b) => a.clicks > b.clicks ? a : b, rows[0])?.date;
                const worstDate = daysWithConv.length > 0 ? daysWithConv.reduce((a, b) => a.cpa > b.cpa ? a : b).date : rows.reduce((a, b) => a.clicks < b.clicks ? a : b, rows[0])?.date;
                return (
                  <div style={{ ...S.card, overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", borderBottom: "1px solid #2a2a3e", display: "flex", alignItems: "center", gap: 12 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Daily Breakdown</p>
                      <span style={{ fontSize: 11, color: "#10b981" }}>🟢 Best day</span>
                      <span style={{ fontSize: 11, color: "#ef4444" }}>🔴 Worst day</span>
                    </div>
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
                          {rows.map((row, i) => {
                            const isBest  = row.date === bestDate;
                            const isWorst = row.date === worstDate;
                            const bg = isBest ? "#10b98112" : isWorst ? "#ef444412" : i % 2 ? "#ffffff04" : "transparent";
                            const borderLeft = isBest ? "3px solid #10b981" : isWorst ? "3px solid #ef4444" : "3px solid transparent";
                            return (
                              <tr key={row.date} style={{ borderTop: "1px solid #1a1a2e", background: bg, borderLeft }}>
                                <td style={S.td}>
                                  {isBest && <span style={{ marginRight: 4 }}>🟢</span>}
                                  {isWorst && <span style={{ marginRight: 4 }}>🔴</span>}
                                  {row.date}
                                </td>
                                <td style={{ ...S.td, color: "#6366f1", fontWeight: 600 }}>{fmtCurrency(row.spend)}</td>
                                <td style={S.td}>{fmtNumber(row.impressions)}</td>
                                <td style={{ ...S.td, color: "#8b5cf6" }}>{fmtNumber(row.clicks)}</td>
                                <td style={{ ...S.td, color: "#10b981", fontWeight: 600 }}>{fmtNumber(row.conversions)}</td>
                                <td style={{ ...S.td, color: "#f59e0b" }}>{row.cpa > 0 ? fmtCurrency(row.cpa) : "—"}</td>
                                <td style={S.td}>{fmtPercent(row.ctr)}</td>
                                <td style={S.td}>{fmtCurrency(row.cpc)}</td>
                                <td style={S.td}>{fmtCurrency(row.cpm)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
                const byDow = DOW.map((day, i) => {
                  const idx = i === 6 ? 0 : i + 1;
                  const dayRows = rows.filter(r => new Date(r.date + "T12:00:00").getDay() === idx);
                  if (!dayRows.length) return { day, count: 0, spend: null, clicks: null, conversions: null, cpa: null, ctr: null };
                  const n = dayRows.length;
                  const sum = k => dayRows.reduce((s, r) => s + (r[k] || 0), 0);
                  const daysC = dayRows.filter(r => r.conversions > 0);
                  return {
                    day, count: n,
                    spend: sum("spend") / n,
                    clicks: sum("clicks") / n,
                    conversions: sum("conversions") / n,
                    cpa: daysC.length > 0 ? daysC.reduce((s, r) => s + r.cpa, 0) / daysC.length : null,
                    ctr: sum("ctr") / n,
                  };
                });
                const colorCell = (val, vals, lowerBetter) => {
                  const valid = vals.filter(v => v !== null && v > 0);
                  if (!valid.length || val === null) return "transparent";
                  const min = Math.min(...valid), max = Math.max(...valid);
                  if (max === min) return "transparent";
                  const t = (val - min) / (max - min);
                  const good = lowerBetter ? 1 - t : t;
                  return good > 0.66 ? "#10b98120" : good > 0.33 ? "#f59e0b12" : "#ef444420";
                };
                const metrics = [
                  { label: "Avg Spend",  key: "spend",       fmt: fmtCurrency,         lowerBetter: false },
                  { label: "Avg Clicks", key: "clicks",       fmt: v => fmtNumber(Math.round(v)), lowerBetter: false },
                  { label: "Avg Conv",   key: "conversions",  fmt: v => v.toFixed(1),   lowerBetter: false },
                  { label: "Avg CPA",    key: "cpa",          fmt: v => v ? fmtCurrency(v) : "—", lowerBetter: true  },
                  { label: "Avg CTR",    key: "ctr",          fmt: fmtPercent,          lowerBetter: false },
                ];
                return (
                  <div style={{ ...S.card, overflow: "hidden", marginTop: 20 }}>
                    <p style={{ margin: 0, padding: "14px 18px", fontWeight: 700, fontSize: 14, borderBottom: "1px solid #2a2a3e" }}>📅 Day-of-Week Performance</p>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#13131f" }}>
                            <th style={{ ...S.th, textAlign: "left", minWidth: 90 }}>Metric</th>
                            {byDow.map(d => (
                              <th key={d.day} style={{ ...S.th, minWidth: 75, textAlign: "center" }}>
                                {d.day}
                                {d.count > 0 && <span style={{ color: "#444", display: "block", fontWeight: 400, fontSize: 10 }}>{d.count}×</span>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.map(m => {
                            const vals = byDow.map(d => d[m.key]);
                            return (
                              <tr key={m.key} style={{ borderTop: "1px solid #1a1a2e" }}>
                                <td style={{ ...S.th, textAlign: "left", color: "#666", fontWeight: 600, fontSize: 11 }}>{m.label}</td>
                                {byDow.map(d => (
                                  <td key={d.day} style={{ ...S.td, textAlign: "center", background: colorCell(d[m.key], vals, m.lowerBetter) }}>
                                    {d.count > 0 && d[m.key] !== null ? m.fmt(d[m.key]) : <span style={{ color: "#333" }}>—</span>}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </>)}

            {/* Campaigns Tab */}
            {tab === "campaigns" && campaigns && (() => {
              const getHealth = c => {
                let score = 100;
                if (c.conversions > 0 && totals.cpa > 0) {
                  const r = c.cpa / totals.cpa;
                  if (r > 1.5) score -= 40; else if (r > 1.2) score -= 25; else if (r > 0.8) score -= 10;
                } else if (c.spend > 20 && c.conversions === 0) score -= 35;
                if (totals.ctr > 0) {
                  const r = c.ctr / totals.ctr;
                  if (r < 0.5) score -= 25; else if (r < 0.8) score -= 10;
                }
                score = Math.max(0, Math.min(100, score));
                if (score >= 75) return { label: "Healthy", color: "#10b981", bg: "#10b98112", score };
                if (score >= 50) return { label: "Fair",    color: "#f59e0b", bg: "#f59e0b12", score };
                return                { label: "Needs Attention", color: "#ef4444", bg: "#ef444412", score };
              };
              return (<>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10, marginBottom: 20 }}>
                  {campaigns.map((c, i) => {
                    const h = getHealth(c);
                    return (
                      <div key={i} style={{ background: h.bg, border: `1px solid ${h.color}44`, borderRadius: 10, padding: "12px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#ddd", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.name}>{c.name}</p>
                          <span style={{ fontSize: 10, fontWeight: 700, color: h.color, background: h.color + "22", borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>{h.label}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                          <div><p style={{ margin: 0, fontSize: 9, color: "#555", letterSpacing: ".04em" }}>SPEND</p><p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#8b5cf6" }}>{fmtCurrency(c.spend)}</p></div>
                          <div><p style={{ margin: 0, fontSize: 9, color: "#555", letterSpacing: ".04em" }}>CPA</p><p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: h.color }}>{c.cpa > 0 ? fmtCurrency(c.cpa) : "—"}</p></div>
                          <div><p style={{ margin: 0, fontSize: 9, color: "#555", letterSpacing: ".04em" }}>CTR</p><p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{fmtPercent(c.ctr)}</p></div>
                          <div><p style={{ margin: 0, fontSize: 9, color: "#555", letterSpacing: ".04em" }}>CONV</p><p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#10b981" }}>{fmtNumber(c.conversions)}</p></div>
                        </div>
                        <div style={{ height: 4, background: "#ffffff10", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${h.score}%`, height: "100%", background: h.color, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <GoogleBreakdownTable rows={campaigns} nameLabel="Campaign" showStatus />
              </>);
            })()}

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
