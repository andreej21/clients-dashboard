import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import API from "./config";


const fmtCurrency = v => `$${parseFloat(v || 0).toFixed(2)}`;
const fmtNumber   = v => parseInt(v || 0).toLocaleString();
const fmtPercent  = v => `${parseFloat(v || 0).toFixed(2)}%`;
const fmtROAS     = v => `${parseFloat(v || 0).toFixed(2)}x`;
const toYMD = d => d.toISOString().split("T")[0];

const INSTALL_TYPES = ["omni_app_install", "mobile_app_install", "app_install"];
const findAction = (arr, types) => arr?.find(x => (Array.isArray(types) ? types : [types]).includes(x.action_type));

function getMetrics(type, convEvent) {
  const convLabel = convEvent === "complete_registration" ? "Registrations" : convEvent === "lead" ? "Leads" : convEvent === "purchase" ? "Purchases" : "Conversions";
  const cpaLabel  = convEvent === "complete_registration" ? "Cost/Registration" : convEvent === "lead" ? "Cost/Lead" : convEvent === "purchase" ? "Cost/Purchase" : "CPA";
  const shared = [
    { key: "spend",       label: "Spend",       format: fmtCurrency, color: "#6366f1" },
    { key: "impressions", label: "Impressions",  format: fmtNumber,   color: "#3b82f6" },
    { key: "reach",       label: "Reach",        format: fmtNumber,   color: "#8b5cf6" },
    { key: "cpm",         label: "CPM",          format: fmtCurrency, color: "#ec4899" },
    { key: "cpc",         label: "CPC",          format: fmtCurrency, color: "#14b8a6" },
    { key: "ctr",         label: "CTR",          format: fmtPercent,  color: "#f97316" },
  ];
  if (type === "app")  return [{ key: "conversions", label: "Installs", format: fmtNumber, color: "#10b981" }, { key: "conversionCost", label: "CPI", format: fmtCurrency, color: "#f59e0b" }, ...shared];
  if (type === "lead") return [{ key: "conversions", label: convLabel, format: fmtNumber, color: "#10b981" }, { key: "conversionCost", label: cpaLabel, format: fmtCurrency, color: "#f59e0b" }, { key: "linkClicks", label: "Link Clicks", format: fmtNumber, color: "#a78bfa" }, ...shared];
  if (type === "ecom") return [{ key: "conversions", label: "Purchases", format: fmtNumber, color: "#10b981" }, { key: "conversionCost", label: "Cost/Purchase", format: fmtCurrency, color: "#f59e0b" }, { key: "revenue", label: "Revenue", format: fmtCurrency, color: "#34d399" }, { key: "roas", label: "ROAS", format: fmtROAS, color: "#fbbf24" }, { key: "addToCart", label: "Add to Carts", format: fmtNumber, color: "#60a5fa" }, { key: "checkouts", label: "Checkouts", format: fmtNumber, color: "#a78bfa" }, ...shared];
  return shared;
}

function getTop5Sorts(type) {
  const base = [{ key: "spend_desc", label: "Highest Spend" }];
  if (type === "app")  return [{ key: "conversionCost_asc", label: "Lowest CPI" }, { key: "conversions_desc", label: "Most Installs" }, ...base];
  if (type === "lead") return [{ key: "conversionCost_asc", label: "Lowest CPL" }, { key: "conversions_desc", label: "Most Leads" }, ...base];
  if (type === "ecom") return [{ key: "roas_desc", label: "Highest ROAS" }, { key: "conversions_desc", label: "Most Purchases" }, { key: "revenue_desc", label: "Most Revenue" }, ...base];
  return base;
}

function parseRow(day, type, convEvent) {
  const convTypes = type === "app" ? INSTALL_TYPES : type === "lead" ? [convEvent || "lead"] : ["purchase", "omni_purchase"];
  const ia  = findAction(day.actions, convTypes);
  const ca  = findAction(day.cost_per_action_type, convTypes);
  const lc  = findAction(day.actions, ["link_click", "outbound_click"]);
  const atc = findAction(day.actions, ["add_to_cart", "omni_add_to_cart"]);
  const chk = findAction(day.actions, ["initiate_checkout", "omni_initiated_checkout"]);
  const spend = parseFloat(day.spend) || 0;
  let revenue = 0, roas = 0;
  if (type === "ecom" && day.action_values) {
    const rv = findAction(day.action_values, ["purchase", "omni_purchase"]);
    revenue = parseFloat(rv?.value) || 0;
    roas = spend > 0 ? revenue / spend : 0;
  }
  const date = new Date((day.date_start || "") + "T00:00:00");
  return {
    id: day.ad_id || day.adset_id || day.campaign_id,
    name: day.ad_name || day.adset_name || day.campaign_name || "",
    adsetName: day.adset_name || "",
    campaignName: day.campaign_name || "",
    date: day.date_start,
    label: day.date_start ? date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "",
    spend, conversions: parseInt(ia?.value) || 0, conversionCost: parseFloat(ca?.value) || 0,
    impressions: parseInt(day.impressions) || 0, reach: parseInt(day.reach) || 0,
    cpm: parseFloat(day.cpm) || 0,
    cpc: parseFloat(day.cost_per_unique_outbound_click?.[0]?.value) || 0,
    ctr: parseFloat(day.unique_outbound_clicks_ctr?.[0]?.value) || 0,
    linkClicks: parseInt(lc?.value) || 0, addToCart: parseInt(atc?.value) || 0,
    checkouts: parseInt(chk?.value) || 0, revenue, roas,
  };
}

function computeTotals(rows) {
  const t = rows.reduce((acc, r) => ({
    spend: acc.spend + r.spend, conversions: acc.conversions + r.conversions,
    impressions: acc.impressions + r.impressions, reach: acc.reach + r.reach,
    linkClicks: acc.linkClicks + r.linkClicks, addToCart: acc.addToCart + r.addToCart,
    checkouts: acc.checkouts + r.checkouts, revenue: acc.revenue + r.revenue,
    ctrSum: (acc.ctrSum || 0) + r.ctr, cpcSum: (acc.cpcSum || 0) + r.cpc,
    cpcCount: (acc.cpcCount || 0) + (r.cpc > 0 ? 1 : 0),
  }), { spend: 0, conversions: 0, impressions: 0, reach: 0, linkClicks: 0, addToCart: 0, checkouts: 0, revenue: 0 });
  t.cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0;
  t.cpc = t.cpcCount > 0 ? t.cpcSum / t.cpcCount : 0;
  t.ctr = rows.length > 0 ? t.ctrSum / rows.length : 0;
  t.conversionCost = t.conversions > 0 ? t.spend / t.conversions : 0;
  t.roas = t.spend > 0 ? t.revenue / t.spend : 0;
  return t;
}

const S = {
  card: { background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 12 },
  inp:  { background: "#13131f", border: "1px solid #2a2a3e", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" },
  th:   { padding: "9px 14px", textAlign: "left", color: "#555", fontWeight: 600, whiteSpace: "nowrap", fontSize: 12 },
  td:   { padding: "8px 14px", whiteSpace: "nowrap", fontSize: 13 },
  btn:  (color = "#2a2a3e", textColor = "#aaa") => ({ background: color, border: "none", borderRadius: 7, padding: "9px 14px", color: textColor, cursor: "pointer", fontSize: 12, fontWeight: 600 }),
};

const authHeaders = token => ({ Authorization: `Bearer ${token}` });
const typeBadge = { app: { label: "App", color: "#6366f1" }, lead: { label: "Lead Gen", color: "#10b981" }, ecom: { label: "Ecom", color: "#f59e0b" } };

// ── Export helpers ──────────────────────────────────────

function exportCSV(rows, dashName, metrics) {
  const headers = ["Date", ...metrics.map(m => m.label)];
  const csvRows = rows.map(r => [
    r.date,
    ...metrics.map(m => r[m.key] ?? "")
  ]);
  const csv = [headers, ...csvRows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `${dashName}-${new Date().toISOString().split("T")[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function exportPDF(dashName, startDate, endDate, totals, metrics, rows, annotations) {
  const w = window.open("", "_blank");
  const rows_html = rows.map(r => `
    <tr>
      <td>${r.label}</td>
      ${metrics.map(m => `<td>${m.format(r[m.key] ?? 0)}</td>`).join("")}
      <td style="color:#f59e0b">${annotations.find(a => a.date === r.date)?.note || ""}</td>
    </tr>
  `).join("");

  w.document.write(`
    <html><head><title>${dashName} — Report</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 32px; color: #111; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      p.sub { color: #888; font-size: 13px; margin-bottom: 24px; }
      .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
      .kpi { background: #f8f8f8; border-radius: 8px; padding: 14px; }
      .kpi-label { font-size: 11px; color: #888; font-weight: 600; margin-bottom: 4px; }
      .kpi-value { font-size: 20px; font-weight: 800; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #f0f0f0; padding: 8px 10px; text-align: left; font-weight: 600; }
      td { padding: 7px 10px; border-top: 1px solid #eee; }
      tr:nth-child(even) td { background: #fafafa; }
      @media print { body { padding: 16px; } }
    </style></head><body>
    <h1>${dashName}</h1>
    <p class="sub">Period: ${startDate} → ${endDate} &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString()}</p>
    <div class="kpis">
      ${metrics.map(m => `<div class="kpi"><div class="kpi-label">${m.label.toUpperCase()}</div><div class="kpi-value">${m.format(totals[m.key] || 0)}</div></div>`).join("")}
    </div>
    <table>
      <thead><tr><th>Date</th>${metrics.map(m => `<th>${m.label}</th>`).join("")}<th>Notes</th></tr></thead>
      <tbody>${rows_html}</tbody>
    </table>
    <script>window.onload = () => window.print();<\/script>
    </body></html>
  `);
  w.document.close();
}

// ── Main component ──────────────────────────────────────

export default function Dashboard({ auth, onLogout }) {
  const nav = useNavigate();
  const { id } = useParams();
  const [myDashboards, setMyDashboards] = useState([]);
  const [activeDash, setActiveDash]     = useState(null);
  const [tab, setTab]                   = useState("account");
  const [rows, setRows]                 = useState(null);
  const [ads, setAds]                   = useState(null);
  const [campaigns, setCampaigns]       = useState(null);
  const [adsets, setAdsets]             = useState(null);
  const [dashType, setDashType]         = useState("app");
  const [convEvent, setConvEvent]       = useState("app_install");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [activeMetric, setActive]       = useState("spend");
  const [sortKey, setSortKey]           = useState("conversionCost_asc");
  const [compare, setCompare]           = useState(false);
  const [prevTotals, setPrevTotals]     = useState(null);
  const [prevRows, setPrevRows]         = useState(null);
  // Annotations
  const [annotations, setAnnotations]   = useState([]);
  const [showAnnotPanel, setAnnotPanel] = useState(false);
  const [newAnnotDate, setNewAnnotDate] = useState("");
  const [newAnnotNote, setNewAnnotNote] = useState("");
  const [annotLoading, setAnnotLoading] = useState(false);

  const defEnd = new Date(); defEnd.setDate(defEnd.getDate() - 1);
  const defStart = new Date(defEnd); defStart.setDate(defStart.getDate() - 6);
  const [startDate, setStartDate] = useState(toYMD(defStart));
  const [endDate,   setEndDate]   = useState(toYMD(defEnd));

  const h = authHeaders(auth.token);

  useEffect(() => {
    fetch(`${API}/my-dashboards`, { headers: h }).then(r => r.json()).then(data => {
      setMyDashboards(data);
      const target = id ? data.find(d => d.id === parseInt(id)) : data[0];
      if (target) { setActiveDash(target); if (!id) nav(`/dashboards/${target.id}`, { replace: true }); }
    });
  }, []);

  // Load annotations when dashboard changes
  useEffect(() => {
    if (!activeDash) return;
    fetch(`${API}/dashboards/${activeDash.id}/annotations`, { headers: h })
      .then(r => r.json()).then(data => setAnnotations(Array.isArray(data) ? data : []));
  }, [activeDash]);

  const applyPreset = days => {
    const e = new Date(); e.setDate(e.getDate() - 1);
    const s = new Date(e);
    if (days > 1) s.setDate(s.getDate() - (days - 1));
    setStartDate(toYMD(s)); setEndDate(toYMD(e));
  };

  const fetchData = useCallback(async () => {
    if (!activeDash) return;
    setLoading(true); setError("");
    setRows(null); setAds(null); setCampaigns(null); setAdsets(null);
    setPrevTotals(null); setPrevRows(null);
    try {
      const params = `since=${startDate}&until=${endDate}`;
      const dayDiff = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
      const prevEnd = new Date(startDate); prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (dayDiff - 1));
      const prevParams = `since=${toYMD(prevStart)}&until=${toYMD(prevEnd)}`;

      const fetches = [
        fetch(`${API}/dashboards/${activeDash.id}/insights/account?${params}`,   { headers: h }),
        fetch(`${API}/dashboards/${activeDash.id}/insights/ads?${params}`,       { headers: h }),
        fetch(`${API}/dashboards/${activeDash.id}/insights/campaigns?${params}`, { headers: h }),
        fetch(`${API}/dashboards/${activeDash.id}/insights/adsets?${params}`,    { headers: h }),
      ];
      if (compare) fetches.push(fetch(`${API}/dashboards/${activeDash.id}/insights/account?${prevParams}`, { headers: h }));

      const jsons = await Promise.all((await Promise.all(fetches)).map(r => r.json()));
      const [d1, d2, d3, d4, d5] = jsons;
      if (d1.error) throw new Error(`Account: ${d1.error}`);
      if (d2.error) throw new Error(`Ads: ${d2.error}`);
      if (d3.error) throw new Error(`Campaigns: ${d3.error}`);
      if (d4.error) throw new Error(`Ad Sets: ${d4.error}`);

      const type = d1.type || "app", conv = d1.conversion_event || "app_install";
      setDashType(type); setConvEvent(conv);
      setRows((d1.data || []).map(r => parseRow(r, type, conv)).sort((a, b) => a.date.localeCompare(b.date)));
      setAds((d2.data || []).map(r => parseRow(r, type, conv)));
      setCampaigns((d3.data || []).map(r => parseRow(r, type, conv)));
      setAdsets((d4.data || []).map(r => parseRow(r, type, conv)));
      setActive("conversions");
      setSortKey(type === "ecom" ? "roas_desc" : "conversionCost_asc");
      if (compare && d5) {
        if (d5.error) throw new Error(`Prev: ${d5.error}`);
        const pRows = (d5.data || []).map(r => parseRow(r, type, conv));
        setPrevTotals(computeTotals(pRows)); setPrevRows(pRows);
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [activeDash, startDate, endDate, compare]);

  const switchDash = dash => {
    setActiveDash(dash); setRows(null); setAds(null); setCampaigns(null); setAdsets(null);
    setError(""); setTab("account"); setAnnotations([]);
    nav(`/dashboards/${dash.id}`);
  };

  const saveAnnotation = async () => {
    if (!newAnnotDate || !newAnnotNote.trim()) return;
    setAnnotLoading(true);
    const res = await fetch(`${API}/dashboards/${activeDash.id}/annotations`, {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ date: newAnnotDate, note: newAnnotNote.trim() }),
    });
    const data = await res.json();
    if (!data.error) {
      setAnnotations(prev => {
        const filtered = prev.filter(a => a.date !== newAnnotDate);
        return [...filtered, data].sort((a, b) => a.date.localeCompare(b.date));
      });
      setNewAnnotNote(""); setNewAnnotDate("");
    }
    setAnnotLoading(false);
  };

  const deleteAnnotation = async (annotId) => {
    await fetch(`${API}/dashboards/${activeDash.id}/annotations/${annotId}`, { method: "DELETE", headers: h });
    setAnnotations(prev => prev.filter(a => a.id !== annotId));
  };

  const metrics   = getMetrics(dashType, convEvent);
  const top5Sorts = getTop5Sorts(dashType);
  const totals    = rows ? computeTotals(rows) : null;

  const sortedAds = ads ? [...ads].filter(a => a.spend > 0).sort((a, b) => {
    const [k, dir] = sortKey.split("_");
    if (dir === "asc") { const v = r => (!r[k] || r[k] === 0) ? Infinity : r[k]; return v(a) - v(b); }
    return b[k] - a[k];
  }).slice(0, 5) : [];

  const activeMeta = metrics.find(m => m.key === activeMetric) || metrics[0];

  // Annotations that fall within current date range
  const visibleAnnotations = annotations.filter(a => a.date >= startDate && a.date <= endDate);

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#fff", fontFamily: "system-ui,sans-serif", display: "flex" }}>

      {/* Sidebar */}
      <div style={{ width: 220, background: "#1e1e2e", borderRight: "1px solid #2a2a3e", display: "flex", flexDirection: "column", flexShrink: 0, minHeight: "100vh" }}>
        <div style={{ padding: "20px 16px 12px" }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}><span style={{ color: "#6366f1" }}>Clients</span></p>
          <p style={{ margin: "2px 0 0", color: "#555", fontSize: 11 }}>Dashboards</p>
        </div>
        <div style={{ flex: 1, padding: "8px 10px", overflowY: "auto" }}>
          <p style={{ color: "#555", fontSize: 11, fontWeight: 600, padding: "4px 6px", margin: "0 0 4px" }}>CLIENTS</p>
          {myDashboards.map(d => {
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

      {/* Main */}
      <div style={{ flex: 1, padding: "24px 20px", overflowX: "hidden" }}>

        {/* Header */}
        {activeDash && (
          <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{activeDash.name}</h1>
              <p style={{ color: "#555", fontSize: 12, margin: "3px 0 0", fontFamily: "monospace" }}>{activeDash.act_id}</p>
            </div>
            {activeDash.type && (
              <span style={{ fontSize: 12, color: typeBadge[activeDash.type]?.color, background: typeBadge[activeDash.type]?.color + "22", borderRadius: 6, padding: "3px 10px", fontWeight: 600 }}>
                {typeBadge[activeDash.type]?.label}
              </span>
            )}
          </div>
        )}

        {/* Date Controls */}
        <div style={{ ...S.card, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <p style={{ margin: "0 0 5px", fontSize: 11, color: "#888" }}>START DATE</p>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={S.inp} />
            </div>
            <div>
              <p style={{ margin: "0 0 5px", fontSize: 11, color: "#888" }}>END DATE</p>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={S.inp} />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {[{ label: "Yesterday", d: 1 }, { label: "7d", d: 7 }, { label: "14d", d: 14 }, { label: "30d", d: 30 }].map(({ label, d }) => (
                <button key={d} onClick={() => applyPreset(d)} style={S.btn()}>{label}</button>
              ))}
              <button onClick={() => setCompare(c => !c)} style={{
                ...S.btn(compare ? "#f59e0b22" : "#2a2a3e", compare ? "#f59e0b" : "#aaa"),
                border: `1px solid ${compare ? "#f59e0b" : "transparent"}`,
              }}>
                {compare ? "⚡ Comparing" : "Compare"}
              </button>
              <button onClick={fetchData} disabled={loading || !activeDash} style={{ ...S.btn("#6366f1", "#fff"), opacity: loading ? 0.6 : 1, fontSize: 13 }}>
                {loading ? "Loading…" : "Fetch Data"}
              </button>
              {/* Export buttons — only show when data loaded */}
              {rows && <>
                <button onClick={() => exportCSV(rows, activeDash?.name, metrics)} style={S.btn("#052e16", "#10b981")}>
                  ↓ CSV
                </button>
                <button onClick={() => exportPDF(activeDash?.name, startDate, endDate, totals, metrics, rows, annotations)} style={S.btn("#1e1b4b", "#818cf8")}>
                  ↓ PDF
                </button>
              </>}
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
              { key: "adsets",    label: `📁 Ad Sets${adsets ? ` (${adsets.length})` : ""}` },
              { key: "ads",       label: `🎨 Ads${ads ? ` (${ads.filter(a => a.spend > 0).length})` : ""}` },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                background: tab === t.key ? "#6366f1" : "#2a2a3e", border: "none", borderRadius: 8,
                padding: "9px 18px", color: tab === t.key ? "#fff" : "#aaa",
                cursor: "pointer", fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
              }}>{t.label}</button>
            ))}
            {/* Annotations toggle */}
            <button onClick={() => setAnnotPanel(p => !p)} style={{
              ...S.btn(showAnnotPanel ? "#fef3c722" : "#2a2a3e", showAnnotPanel ? "#fbbf24" : "#aaa"),
              border: `1px solid ${showAnnotPanel ? "#fbbf24" : "transparent"}`, marginLeft: "auto",
            }}>
              📝 Notes {annotations.length > 0 ? `(${annotations.length})` : ""}
            </button>
          </div>
        )}

        {/* Annotations Panel */}
        {showAnnotPanel && activeDash && (
          <div style={{ ...S.card, padding: 20, marginBottom: 20, borderColor: "#fbbf2444" }}>
            <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14, color: "#fbbf24" }}>📝 Chart Annotations</p>
            {/* Add annotation */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <input type="date" value={newAnnotDate} onChange={e => setNewAnnotDate(e.target.value)}
                min={startDate} max={endDate} style={{ ...S.inp, width: 160 }} />
              <input placeholder="Add a note (e.g. New creative launched)" value={newAnnotNote}
                onChange={e => setNewAnnotNote(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveAnnotation()}
                style={{ ...S.inp, flex: 1, minWidth: 200 }} />
              <button onClick={saveAnnotation} disabled={annotLoading || !newAnnotDate || !newAnnotNote.trim()}
                style={{ ...S.btn("#6366f1", "#fff"), opacity: (!newAnnotDate || !newAnnotNote.trim()) ? 0.5 : 1 }}>
                {annotLoading ? "Saving…" : "Add Note"}
              </button>
            </div>
            {/* Annotations list */}
            {annotations.length === 0
              ? <p style={{ color: "#555", fontSize: 13, margin: 0 }}>No notes yet — add one above</p>
              : annotations.map(a => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #1a1a2e" }}>
                  <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 600, minWidth: 90 }}>{a.date}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{a.note}</span>
                  <span style={{ color: "#555", fontSize: 11 }}>{a.users?.email}</span>
                  <button onClick={() => deleteAnnotation(a.id)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
                </div>
              ))
            }
          </div>
        )}

        {/* Campaigns Tab */}
        {tab === "campaigns" && rows && (
          campaigns?.length > 0
            ? <BreakdownTable rows={campaigns} nameLabel="Campaign" dashType={dashType} convEvent={convEvent} />
            : <div style={{ textAlign: "center", color: "#555", marginTop: 40, fontSize: 14 }}>No campaign data returned</div>
        )}

        {/* Ad Sets Tab */}
        {tab === "adsets" && rows && (
          adsets?.length > 0
            ? <BreakdownTable rows={adsets} nameLabel="Ad Set" subLabel="Campaign" subKey="campaignName" dashType={dashType} convEvent={convEvent} />
            : <div style={{ textAlign: "center", color: "#555", marginTop: 40, fontSize: 14 }}>No ad set data returned</div>
        )}

        {/* Ads Tab */}
        {tab === "ads" && rows && (
          ads?.filter(a => a.spend > 0).length > 0
            ? <BreakdownTable rows={ads.filter(a => a.spend > 0)} nameLabel="Ad" subLabel="Ad Set" subKey="adsetName" dashType={dashType} convEvent={convEvent} />
            : <div style={{ textAlign: "center", color: "#555", marginTop: 40, fontSize: 14 }}>No ad data returned</div>
        )}

        {/* Account Tab */}
        {tab === "account" && totals && (<>

          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(165px,1fr))", gap: 10, marginBottom: 20 }}>
            {metrics.map(m => {
              const active = activeMetric === m.key;
              const curr = totals[m.key] || 0;
              const prev = prevTotals?.[m.key] || 0;
              const pct  = compare && prev > 0 ? ((curr - prev) / prev) * 100 : null;
              const costMetric = ["conversionCost","cpm","cpc"].includes(m.key);
              const isGood = pct === null ? null : costMetric ? pct < 0 : pct > 0;
              return (
                <div key={m.key} onClick={() => setActive(m.key)} style={{
                  ...S.card, padding: "14px 16px", cursor: "pointer",
                  border: `1px solid ${active ? m.color : "#2a2a3e"}`,
                  background: active ? m.color + "18" : "#1e1e2e",
                  boxShadow: active ? `0 0 0 1px ${m.color}55` : "none", transition: "all .15s",
                }}>
                  <p style={{ margin: "0 0 4px", fontSize: 11, color: active ? m.color : "#666", fontWeight: 600, letterSpacing: ".04em" }}>{m.label.toUpperCase()}</p>
                  <p style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>{m.format(curr)}</p>
                  {pct !== null && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: isGood ? "#10b981" : "#f87171" }}>
                        {isGood ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
                      </span>
                      <span style={{ fontSize: 11, color: "#555" }}>{m.format(prev)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Chart */}
          <div style={{ ...S.card, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 14, gap: 16, flexWrap: "wrap" }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
                {activeMeta.label} <span style={{ color: "#555", fontWeight: 400, fontSize: 12 }}>— daily</span>
              </p>
              {compare && prevRows && (
                <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                  <span style={{ color: activeMeta.color }}>— Current</span>
                  <span style={{ color: "#f59e0b" }}>-- Previous</span>
                </div>
              )}
              {visibleAnnotations.length > 0 && (
                <span style={{ fontSize: 11, color: "#fbbf24", marginLeft: "auto" }}>📝 {visibleAnnotations.length} note{visibleAnnotations.length > 1 ? "s" : ""} on chart</span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={rows.map((r, i) => ({ ...r, prev: prevRows?.[i]?.[activeMetric] ?? null }))}>
                <CartesianGrid stroke="#1e1e2e" />
                <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 10 }} />
                <YAxis tick={{ fill: "#555", fontSize: 10 }} width={60} tickFormatter={v => activeMeta.format(v)} />
                <Tooltip
                  contentStyle={{ background: "#13131f", border: `1px solid ${activeMeta.color}`, borderRadius: 8, fontSize: 12 }}
                  formatter={(v, name) => [activeMeta.format(v), name === "prev" ? "Previous Period" : "Current Period"]}
                  labelFormatter={(label, payload) => {
                    const date = payload?.[0]?.payload?.date;
                    const annot = visibleAnnotations.find(a => a.date === date);
                    return annot ? `${label} · 📝 ${annot.note}` : label;
                  }}
                />
                {/* Annotation reference lines */}
                {visibleAnnotations.map(a => {
                  const rowMatch = rows.find(r => r.date === a.date);
                  return rowMatch ? (
                    <ReferenceLine key={a.id} x={rowMatch.label} stroke="#fbbf24" strokeDasharray="4 4"
                      label={{ value: "📝", position: "top", fill: "#fbbf24", fontSize: 12 }} />
                  ) : null;
                })}
                <Line type="monotone" dataKey={activeMetric} stroke={activeMeta.color} strokeWidth={2.5} dot={{ r: 3, fill: activeMeta.color }} />
                {compare && prevRows && (
                  <Line type="monotone" dataKey="prev" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Top 5 Ads */}
          <div style={{ ...S.card, marginBottom: 20, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #2a2a3e", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Top 5 Ads</p>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {top5Sorts.map(s => (
                  <button key={s.key} onClick={() => setSortKey(s.key)} style={{ background: sortKey === s.key ? "#6366f1" : "#2a2a3e", border: "none", borderRadius: 6, padding: "5px 10px", color: sortKey === s.key ? "#fff" : "#aaa", cursor: "pointer", fontSize: 11 }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#13131f" }}>
                  <th style={S.th}>Ad Name</th><th style={S.th}>Spend</th>
                  {dashType !== "ecom" && <><th style={S.th}>Conversions</th><th style={S.th}>CPA</th></>}
                  {dashType === "ecom" && <><th style={S.th}>Purchases</th><th style={S.th}>Revenue</th><th style={S.th}>ROAS</th><th style={S.th}>Cost/Purchase</th></>}
                  <th style={S.th}>CPM</th><th style={S.th}>CPC</th><th style={S.th}>CTR</th><th style={S.th}>Impressions</th>
                </tr></thead>
                <tbody>
                  {sortedAds.length === 0
                    ? <tr><td colSpan={9} style={{ ...S.td, textAlign: "center", color: "#555", padding: 20 }}>No ad data</td></tr>
                    : sortedAds.map((ad, i) => (
                      <tr key={ad.id || i} style={{ borderTop: "1px solid #1a1a2e" }}>
                        <td style={{ ...S.td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }} title={ad.name}>
                          <span style={{ color: "#6366f1", fontWeight: 700, marginRight: 6 }}>#{i + 1}</span>{ad.name}
                        </td>
                        <td style={{ ...S.td, color: "#6366f1", fontWeight: 600 }}>{fmtCurrency(ad.spend)}</td>
                        {dashType !== "ecom" && <>
                          <td style={{ ...S.td, color: "#10b981", fontWeight: 600 }}>{fmtNumber(ad.conversions)}</td>
                          <td style={{ ...S.td, color: "#f59e0b" }}>{ad.conversionCost > 0 ? fmtCurrency(ad.conversionCost) : "—"}</td>
                        </>}
                        {dashType === "ecom" && <>
                          <td style={{ ...S.td, color: "#10b981", fontWeight: 600 }}>{fmtNumber(ad.conversions)}</td>
                          <td style={{ ...S.td, color: "#34d399", fontWeight: 600 }}>{fmtCurrency(ad.revenue)}</td>
                          <td style={{ ...S.td, color: "#fbbf24", fontWeight: 600 }}>{fmtROAS(ad.roas)}</td>
                          <td style={{ ...S.td, color: "#f59e0b" }}>{ad.conversionCost > 0 ? fmtCurrency(ad.conversionCost) : "—"}</td>
                        </>}
                        <td style={S.td}>{fmtCurrency(ad.cpm)}</td>
                        <td style={S.td}>{fmtCurrency(ad.cpc)}</td>
                        <td style={S.td}>{fmtPercent(ad.ctr)}</td>
                        <td style={S.td}>{fmtNumber(ad.impressions)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Daily Breakdown */}
          <div style={{ ...S.card, overflow: "hidden" }}>
            <p style={{ margin: 0, padding: "14px 18px", fontWeight: 700, fontSize: 14, borderBottom: "1px solid #2a2a3e" }}>Daily Breakdown</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#13131f" }}>
                  <th style={S.th}>Date</th><th style={S.th}>Conversions</th><th style={S.th}>CPA</th><th style={S.th}>Spend</th>
                  {dashType === "ecom" && <><th style={S.th}>Revenue</th><th style={S.th}>ROAS</th></>}
                  {dashType === "lead" && <th style={S.th}>Link Clicks</th>}
                  <th style={S.th}>Impressions</th><th style={S.th}>Reach</th>
                  <th style={S.th}>CPM</th><th style={S.th}>CPC</th><th style={S.th}>CTR</th>
                  <th style={S.th}>Notes</th>
                </tr></thead>
                <tbody>
                  {rows.map((row, i) => {
                    const annot = annotations.find(a => a.date === row.date);
                    return (
                      <tr key={row.date} style={{ borderTop: "1px solid #1a1a2e", background: i % 2 ? "#ffffff04" : "transparent" }}>
                        <td style={S.td}>{row.label}</td>
                        <td style={{ ...S.td, color: "#10b981", fontWeight: 600 }}>{fmtNumber(row.conversions)}</td>
                        <td style={{ ...S.td, color: "#f59e0b" }}>{row.conversionCost > 0 ? fmtCurrency(row.conversionCost) : "—"}</td>
                        <td style={{ ...S.td, color: "#6366f1", fontWeight: 600 }}>{fmtCurrency(row.spend)}</td>
                        {dashType === "ecom" && <>
                          <td style={{ ...S.td, color: "#34d399", fontWeight: 600 }}>{fmtCurrency(row.revenue)}</td>
                          <td style={{ ...S.td, color: "#fbbf24", fontWeight: 600 }}>{fmtROAS(row.roas)}</td>
                        </>}
                        {dashType === "lead" && <td style={S.td}>{fmtNumber(row.linkClicks)}</td>}
                        <td style={S.td}>{fmtNumber(row.impressions)}</td>
                        <td style={S.td}>{fmtNumber(row.reach)}</td>
                        <td style={S.td}>{fmtCurrency(row.cpm)}</td>
                        <td style={S.td}>{fmtCurrency(row.cpc)}</td>
                        <td style={S.td}>{fmtPercent(row.ctr)}</td>
                        <td style={{ ...S.td, color: "#fbbf24", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={annot?.note}>
                          {annot ? `📝 ${annot.note}` : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>)}
      </div>
    </div>
  );
}

function BreakdownTable({ rows, nameLabel, subLabel, subKey, dashType, convEvent }) {
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
  const convLabel = convEvent === "complete_registration" ? "Reg." : convEvent === "lead" ? "Leads" : convEvent === "purchase" ? "Purchases" : "Conv.";
  return (
    <div style={{ background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#13131f" }}>
            <th style={{ ...S.th, minWidth: 200 }}>{nameLabel}</th>
            {subLabel && <th style={S.th}>{subLabel}</th>}
            <SortTh k="spend" label="Spend" />
            <SortTh k="conversions" label={convLabel} />
            <SortTh k="conversionCost" label="CPA" />
            {dashType === "ecom" && <><SortTh k="revenue" label="Revenue" /><SortTh k="roas" label="ROAS" /></>}
            {dashType === "lead" && <SortTh k="linkClicks" label="Clicks" />}
            <SortTh k="impressions" label="Impressions" />
            <SortTh k="reach" label="Reach" />
            <SortTh k="cpm" label="CPM" />
            <SortTh k="cpc" label="CPC" />
            <SortTh k="ctr" label="CTR" />
          </tr></thead>
          <tbody>
            {sorted.length === 0
              ? <tr><td colSpan={12} style={{ ...S.td, textAlign: "center", color: "#555", padding: 20 }}>No data</td></tr>
              : sorted.map((row, i) => (
                <tr key={row.id || i} style={{ borderTop: "1px solid #1a1a2e", background: i % 2 ? "#ffffff04" : "transparent" }}>
                  <td style={{ ...S.td, fontWeight: 600, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }} title={row.name}>{row.name}</td>
                  {subLabel && <td style={{ ...S.td, color: "#888", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }} title={row[subKey]}>{row[subKey]}</td>}
                  <td style={{ ...S.td, color: "#6366f1", fontWeight: 600 }}>{fmtCurrency(row.spend)}</td>
                  <td style={{ ...S.td, color: "#10b981", fontWeight: 600 }}>{fmtNumber(row.conversions)}</td>
                  <td style={{ ...S.td, color: "#f59e0b" }}>{row.conversionCost > 0 ? fmtCurrency(row.conversionCost) : "—"}</td>
                  {dashType === "ecom" && <>
                    <td style={{ ...S.td, color: "#34d399", fontWeight: 600 }}>{fmtCurrency(row.revenue)}</td>
                    <td style={{ ...S.td, color: "#fbbf24", fontWeight: 600 }}>{fmtROAS(row.roas)}</td>
                  </>}
                  {dashType === "lead" && <td style={S.td}>{fmtNumber(row.linkClicks)}</td>}
                  <td style={S.td}>{fmtNumber(row.impressions)}</td>
                  <td style={S.td}>{fmtNumber(row.reach)}</td>
                  <td style={S.td}>{fmtCurrency(row.cpm)}</td>
                  <td style={S.td}>{fmtCurrency(row.cpc)}</td>
                  <td style={S.td}>{fmtPercent(row.ctr)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}