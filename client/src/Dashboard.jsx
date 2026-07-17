import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import spLogo from "./assets/sp-logo.png";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import API from "./config";

export const fmtCurrency = v => `$${parseFloat(v || 0).toFixed(2)}`;
export const fmtNumber   = v => parseInt(v || 0).toLocaleString();
export const fmtPercent  = v => `${parseFloat(v || 0).toFixed(2)}%`;
export const fmtROAS     = v => `${parseFloat(v || 0).toFixed(2)}x`;
export const toYMD = d => d.toISOString().split("T")[0];

const INSTALL_TYPES = ["omni_app_install", "mobile_app_install", "app_install"];
const findAction = (arr, types) => arr?.find(x => (Array.isArray(types) ? types : [types]).includes(x.action_type));

export function getMetrics(type, convEvent) {
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

export function parseRow(day, type, convEvent, actionTypes) {
  const convTypes = actionTypes || (type === "app" ? INSTALL_TYPES : type === "lead" ? [convEvent || "lead"] : ["purchase", "omni_purchase"]);
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
    frequency: (parseInt(day.reach) || 0) > 0 ? (parseInt(day.impressions) || 0) / (parseInt(day.reach) || 0) : 0,
    cpm: parseFloat(day.cpm) || 0,
    cpc: parseFloat(day.cost_per_unique_outbound_click?.[0]?.value) || 0,
    ctr: parseFloat(day.unique_outbound_clicks_ctr?.[0]?.value) || 0,
    linkClicks: parseInt(lc?.value) || 0, addToCart: parseInt(atc?.value) || 0,
    checkouts: parseInt(chk?.value) || 0, revenue, roas,
  };
}

export function computeTotals(rows) {
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

// Month-end pacing forecast from the selected period's daily run-rate.
// Projects month-to-date actuals + (avg/day × remaining days of the month).
function computeForecast(rows) {
  if (!rows || rows.length === 0) return null;
  const days = rows.length;
  const avg = k => rows.reduce((s, r) => s + (r[k] || 0), 0) / days;
  const sum = (arr, k) => arr.reduce((s, r) => s + (r[k] || 0), 0);
  const lastDate = new Date(rows[rows.length - 1].date + "T12:00:00");
  const y = lastDate.getFullYear(), mo = lastDate.getMonth();
  const daysInMonth   = new Date(y, mo + 1, 0).getDate();
  const dayOfMonth    = lastDate.getDate();
  const remainingDays = Math.max(0, daysInMonth - dayOfMonth);
  const mtd      = rows.filter(r => { const d = new Date(r.date + "T12:00:00"); return d.getMonth() === mo && d.getFullYear() === y; });
  const projSpend = sum(mtd, "spend")       + avg("spend")       * remainingDays;
  const projConv  = sum(mtd, "conversions") + avg("conversions") * remainingDays;
  const projRev   = sum(mtd, "revenue")     + avg("revenue")     * remainingDays;
  return {
    days, remainingDays, daysInMonth, dayOfMonth,
    monthLabel:    lastDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    monthEndLabel: new Date(y, mo, daysInMonth).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    avgSpend: avg("spend"), avgConv: avg("conversions"),
    projSpend, projConv, projRev,
    projCpa:  projConv  > 0 ? projSpend / projConv : 0,
    projRoas: projSpend > 0 ? projRev / projSpend : 0,
    mtdSpend: sum(mtd, "spend"), mtdConv: sum(mtd, "conversions"), mtdRev: sum(mtd, "revenue"),
  };
}

export const S = {
  card: { background: "#1e1e2e", border: "1px solid #2a2a3e", borderRadius: 12 },
  inp:  { background: "#13131f", border: "1px solid #2a2a3e", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none" },
  th:   { padding: "9px 14px", textAlign: "left", color: "#555", fontWeight: 600, whiteSpace: "nowrap", fontSize: 12 },
  td:   { padding: "8px 14px", whiteSpace: "nowrap", fontSize: 13 },
  btn:  (color = "#2a2a3e", textColor = "#aaa") => ({ background: color, border: "none", borderRadius: 7, padding: "9px 14px", color: textColor, cursor: "pointer", fontSize: 12, fontWeight: 600 }),
};

const authHeaders = token => ({ Authorization: `Bearer ${token}` });
const typeBadge = { app: { label: "App", color: "#6366f1" }, lead: { label: "Lead Gen", color: "#10b981" }, ecom: { label: "Ecom", color: "#f59e0b" }, google: { label: "Google", color: "#4285f4" }, organic: { label: "Organic", color: "#10b981" }, auto: { label: "Meta", color: "#1877f2" } };

function exportCSV(rows, dashName, metrics) {
  const headers = ["Date", ...metrics.map(m => m.label)];
  const csvRows = rows.map(r => [r.date, ...metrics.map(m => r[m.key] ?? "")]);
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

export default function Dashboard({ auth, onLogout, myDashboards = [], folders = [], activeDash, setActiveDash }) {
  const nav = useNavigate();
  const { id } = useParams();
  const [tab, setTab]                   = useState("account");
  const [rows, setRows]                 = useState(null);
  const [ads, setAds]                   = useState(null);
  const [campaigns, setCampaigns]       = useState(null);
  const [adsets, setAdsets]             = useState(null);
  const [creatives, setCreatives]       = useState(null);
  const [creativesDebug, setCreativesDebug] = useState(null);
  const [structure, setStructure]       = useState(null);
  const [treeBusyId, setTreeBusyId]     = useState(null);
  const [dashType, setDashType]         = useState("app");
  const [convEvent, setConvEvent]       = useState("app_install");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [activeMetric, setActive]       = useState("spend");
  const [sortKey, setSortKey]           = useState("conversionCost_asc");
  const [compare, setCompare]           = useState(false);
  const [forecast, setForecast]         = useState(false);
  const [prevTotals, setPrevTotals]     = useState(null);
  const [prevRows, setPrevRows]         = useState(null);
  const [annotations, setAnnotations]   = useState([]);
  const [showAnnotPanel, setAnnotPanel] = useState(false);
  const [newAnnotDate, setNewAnnotDate] = useState("");
  const [newAnnotNote, setNewAnnotNote] = useState("");
  const [annotLoading, setAnnotLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("collapsedFolders") || "[]")); }
    catch { return new Set(); }
  });
  const [goalGroups, setGoalGroups]     = useState(null);
  const [activeGoalKey, setActiveGoalKey] = useState(null);
  const [showSharePanel, setSharePanel] = useState(false);
  const [shares, setShares]             = useState([]);
  const [shareBusy, setShareBusy]       = useState(false);
  const [copiedId, setCopiedId]         = useState(null);
  const [budget, setBudget]             = useState(null);
  const [mtd, setMtd]                   = useState(null);
  const [budgetInput, setBudgetInput]   = useState("");
  const [budgetEditing, setBudgetEditing] = useState(false);

  const canShare = auth.user.role === "admin" || activeDash?.access_role === "manager";
  const canManage = canShare;

  const defEnd = new Date(); defEnd.setDate(defEnd.getDate() - 1);
  const defStart = new Date(defEnd); defStart.setDate(defStart.getDate() - 6);
  const [startDate, setStartDate] = useState(toYMD(defStart));
  const [endDate,   setEndDate]   = useState(toYMD(defEnd));
  const [activePreset, setActivePreset] = useState(7);

  const h = authHeaders(auth.token);

  // Set activeDash from myDashboards + URL id
  useEffect(() => {
    if (!myDashboards.length) return;
    const target = id ? myDashboards.find(d => d.id === parseInt(id)) : myDashboards[0];
    if (target) {
      setActiveDash(target);
      if (!id) nav(`/dashboards/${target.id}`, { replace: true });
    }
  }, [myDashboards, id]);

  useEffect(() => {
    if (!activeDash) return;
    fetch(`${API}/dashboards/${activeDash.id}/annotations`, { headers: h })
      .then(r => r.json()).then(data => setAnnotations(Array.isArray(data) ? data : []));
  }, [activeDash]);

  // Budget + month-to-date spend for pacing
  useEffect(() => {
    if (!activeDash) return;
    setBudget(activeDash.monthly_budget ?? null);
    setBudgetInput(activeDash.monthly_budget != null ? String(activeDash.monthly_budget) : "");
    setBudgetEditing(false);
    setMtd(null);
    fetch(`${API}/dashboards/${activeDash.id}/mtd-spend`, { headers: h })
      .then(r => r.json()).then(d => { if (d && !d.error) setMtd(d); }).catch(() => {});
  }, [activeDash?.id]);

  const saveBudget = async () => {
    const val = budgetInput.trim() === "" ? null : parseFloat(budgetInput);
    const res = await fetch(`${API}/dashboards/${activeDash.id}/budget`, {
      method: "PATCH", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ monthly_budget: val }),
    });
    const d = await res.json();
    if (!d.error) { setBudget(d.monthly_budget); setBudgetEditing(false); }
  };

  useEffect(() => {
    setGoalGroups(null); setActiveGoalKey(null);
    if (!activeDash || activeDash.type !== "auto") return;
    fetch(`${API}/dashboards/${activeDash.id}/goal-groups`, { headers: h })
      .then(r => r.json())
      .then(groups => {
        if (Array.isArray(groups) && groups.length > 0) {
          setGoalGroups(groups);
          setActiveGoalKey(groups[0].key);
        } else {
          setGoalGroups([]);
        }
      })
      .catch(() => setGoalGroups([]));
  }, [activeDash?.id]);

  const applyPreset = days => {
    const e = new Date(); e.setDate(e.getDate() - 1);
    const s = new Date(e);
    if (days > 1) s.setDate(s.getDate() - (days - 1));
    setStartDate(toYMD(s)); setEndDate(toYMD(e));
    setActivePreset(days);
  };

  const fetchData = useCallback(async (goalKeyOverride) => {
    if (!activeDash) return;
    setLoading(true); setError("");
    setRows(null); setAds(null); setCampaigns(null); setAdsets(null); setCreatives(null); setStructure(null);
    setPrevTotals(null); setPrevRows(null);
    // Campaign structure (status + budgets, not date-ranged) — best-effort, non-blocking
    fetch(`${API}/dashboards/${activeDash.id}/structure`, { headers: h })
      .then(r => r.json())
      .then(s => { if (s && !s.error) setStructure(s); })
      .catch(() => {});
    // Creative thumbnails (not date-ranged) — best-effort, non-blocking
    setCreativesDebug(null);
    fetch(`${API}/dashboards/${activeDash.id}/ad-creatives`, { headers: h })
      .then(r => r.json())
      .then(cj => {
        const map = {};
        for (const c of (cj.data || [])) if (c.thumbnail_url) map[c.id] = c;
        setCreatives(map);
        setCreativesDebug(cj.debug || null);
        if (cj.debug) console.log("[ad-creatives debug]", cj.debug);
      })
      .catch(() => setCreatives({}));
    try {
      const goalKey = goalKeyOverride !== undefined ? goalKeyOverride : activeGoalKey;
      const activeGoal = goalGroups?.find(g => g.key === goalKey);
      const goalFilter = activeGoal?.campaign_ids?.length
        ? `&campaign_ids=${activeGoal.campaign_ids.join(",")}` : "";
      const params = `since=${startDate}&until=${endDate}${goalFilter}`;
      const dayDiff = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
      const prevEnd = new Date(startDate); prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (dayDiff - 1));
      const prevParams = `since=${toYMD(prevStart)}&until=${toYMD(prevEnd)}${goalFilter}`;
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
      const type = activeGoal ? activeGoal.type : (d1.type || "app");
      const conv = activeGoal ? activeGoal.conv_event : (d1.conversion_event || "app_install");
      const actionTypes = activeGoal?.action_types || null;
      setDashType(type); setConvEvent(conv);
      setRows((d1.data || []).map(r => parseRow(r, type, conv, actionTypes)).sort((a, b) => a.date.localeCompare(b.date)));
      setAds((d2.data || []).map(r => parseRow(r, type, conv, actionTypes)));
      setCampaigns((d3.data || []).map(r => parseRow(r, type, conv, actionTypes)));
      setAdsets((d4.data || []).map(r => parseRow(r, type, conv, actionTypes)));
      setActive("conversions");
      setSortKey(type === "ecom" ? "roas_desc" : "conversionCost_asc");
      if (compare && d5) {
        const pRows = (d5.data || []).map(r => parseRow(r, type, conv, actionTypes));
        setPrevTotals(computeTotals(pRows)); setPrevRows(pRows);
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [activeDash, startDate, endDate, compare, activeGoalKey, goalGroups]);

  const switchDash = dash => {
    setActiveDash(dash); setRows(null); setAds(null); setCampaigns(null); setAdsets(null);
    setError(""); setTab("account"); setAnnotations([]);
    setGoalGroups(null); setActiveGoalKey(null);
    setSidebarOpen(false);
    nav(`/dashboards/${dash.id}`);
  };

  const switchGoal = (key) => {
    setActiveGoalKey(key);
    if (rows !== null) fetchData(key);
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

  const openSharePanel = async () => {
    const opening = !showSharePanel;
    setSharePanel(opening);
    if (opening && activeDash) {
      const res = await fetch(`${API}/dashboards/${activeDash.id}/shares`, { headers: h });
      const data = await res.json();
      setShares(Array.isArray(data) ? data : []);
    }
  };

  const createShare = async (expires_in_days) => {
    setShareBusy(true);
    const res = await fetch(`${API}/dashboards/${activeDash.id}/shares`, {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ expires_in_days: expires_in_days || null }),
    });
    const data = await res.json();
    if (!data.error) setShares(prev => [data, ...prev]);
    setShareBusy(false);
  };

  const revokeShare = async (shareId) => {
    await fetch(`${API}/dashboards/${activeDash.id}/shares/${shareId}`, { method: "DELETE", headers: h });
    setShares(prev => prev.filter(s => s.id !== shareId));
  };

  const copyShare = (s) => {
    navigator.clipboard?.writeText(s.url);
    setCopiedId(s.id);
    setTimeout(() => setCopiedId(c => (c === s.id ? null : c)), 1600);
  };

  const hdFetcher = useCallback(async (adId) => {
    if (!activeDash) return null;
    try {
      const r = await fetch(`${API}/dashboards/${activeDash.id}/creative-hd/${adId}`, { headers: authHeaders(auth.token) });
      const j = await r.json();
      return j.url || null;
    } catch { return null; }
  }, [activeDash?.id, auth.token]);

  const updateStructureEntity = (id, patch) => {
    setStructure(prev => {
      if (!prev) return prev;
      const upd = arr => arr.map(e => e.id === id ? { ...e, ...patch } : e);
      return { campaigns: upd(prev.campaigns), adsets: upd(prev.adsets), ads: upd(prev.ads) };
    });
  };

  const setEntityStatus = async (entity, newStatus) => {
    const verb = newStatus === "PAUSED" ? "Pause" : "Activate";
    if (!window.confirm(`${verb} "${entity.name}"?\n\nThis changes your LIVE Meta account immediately.`)) return;
    setTreeBusyId(entity.id);
    try {
      const res = await fetch(`${API}/dashboards/${activeDash.id}/entity/${entity.id}/status`, {
        method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }),
      });
      const d = await res.json();
      if (d.error) { alert(`Failed: ${d.error}`); return; }
      updateStructureEntity(entity.id, { status: newStatus });
    } finally { setTreeBusyId(null); }
  };

  const setEntityBudget = async (entity, budgetType) => {
    const current = budgetType === "daily" ? entity.daily_budget : entity.lifetime_budget;
    const input = window.prompt(`New ${budgetType} budget for "${entity.name}" ($):`, current != null ? String(current) : "");
    if (input == null) return;
    const amount = parseFloat(input);
    if (isNaN(amount) || amount <= 0) { alert("Enter a valid amount greater than 0"); return; }
    if (!window.confirm(`Set ${budgetType} budget to $${amount.toFixed(2)} for "${entity.name}"?\n\nThis changes your LIVE Meta account immediately.`)) return;
    setTreeBusyId(entity.id);
    try {
      const res = await fetch(`${API}/dashboards/${activeDash.id}/entity/${entity.id}/budget`, {
        method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ budget_type: budgetType, amount }),
      });
      const d = await res.json();
      if (d.error) { alert(`Failed: ${d.error}`); return; }
      updateStructureEntity(entity.id, budgetType === "daily" ? { daily_budget: amount } : { lifetime_budget: amount });
    } finally { setTreeBusyId(null); }
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
  const visibleAnnotations = annotations.filter(a => a.date >= startDate && a.date <= endDate);

  const fc = forecast && rows && rows.length > 1 ? computeForecast(rows) : null;
  const chartData = (() => {
    if (!rows) return [];
    const base = rows.map((r, i) => ({ ...r, prev: prevRows?.[i]?.[activeMetric] ?? null }));
    if (!fc || fc.remainingDays <= 0 || !base.length) return base;
    const projVal = rows.reduce((s, r) => s + (r[activeMetric] || 0), 0) / rows.length;
    base[base.length - 1] = { ...base[base.length - 1], projected: base[base.length - 1][activeMetric] };
    const last = new Date(rows[rows.length - 1].date + "T12:00:00");
    for (let i = 1; i <= fc.remainingDays; i++) {
      const d = new Date(last); d.setDate(d.getDate() + i);
      base.push({
        date: toYMD(d),
        label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        projected: projVal,
      });
    }
    return base;
  })();

  const genInsights = () => {
    if (!rows || rows.length === 0) return [];
    const out = [];
    const days = rows.length;
    out.push({ icon: "💰", color: "#8b5cf6", text: `${fmtCurrency(totals.spend)} spent over ${days} day${days !== 1 ? "s" : ""} · avg ${fmtCurrency(totals.spend / days)}/day` });
    const daysC = rows.filter(r => r.conversions > 0);
    if (daysC.length > 0) {
      const best  = daysC.reduce((a, b) => a.conversionCost < b.conversionCost ? a : b);
      const worst = daysC.reduce((a, b) => a.conversionCost > b.conversionCost ? a : b);
      out.push({ icon: "🎯", color: "#10b981", text: `Best day: ${best.label} — ${fmtCurrency(best.conversionCost)} CPA with ${best.conversions} conv` });
      if (best.date !== worst.date)
        out.push({ icon: "⚠️", color: "#f59e0b", text: `Worst day: ${worst.label} — ${fmtCurrency(worst.conversionCost)} CPA` });
    } else {
      out.push({ icon: "📊", color: "#555", text: "No conversions recorded in this period" });
    }
    if (totals.ctr > 0) {
      const [ico, lvl, col] = totals.ctr >= 3 ? ["✅", "excellent", "#10b981"] : totals.ctr >= 2 ? ["📊", "good", "#6366f1"] : totals.ctr >= 1 ? ["📊", "average", "#f59e0b"] : ["⚠️", "below average — consider refreshing creatives", "#ef4444"];
      out.push({ icon: ico, color: col, text: `CTR of ${fmtPercent(totals.ctr)} is ${lvl}` });
    }
    if (totals.cpm > 0) {
      const [ico, lvl, col] = totals.cpm < 10 ? ["✅", "low — great audience efficiency", "#10b981"] : totals.cpm < 20 ? ["📊", "moderate", "#f59e0b"] : ["⚠️", "high — consider audience or creative changes", "#ef4444"];
      out.push({ icon: ico, color: col, text: `CPM of ${fmtCurrency(totals.cpm)} is ${lvl}` });
    }
    if (ads && ads.length > 0) {
      const adsC = ads.filter(a => a.conversions > 0 && a.spend > 0);
      if (adsC.length > 0) {
        const top = adsC.reduce((a, b) => a.conversionCost < b.conversionCost ? a : b);
        out.push({ icon: "🏆", color: "#6366f1", text: `Top ad: "${top.name?.slice(0,40)}${top.name?.length > 40 ? "…" : ""}" · ${fmtCurrency(top.conversionCost)} CPA` });
      }
    }
    if (compare && prevTotals && prevTotals.spend > 0) {
      if (prevTotals.conversionCost > 0 && totals.conversionCost > 0) {
        const d = ((totals.conversionCost - prevTotals.conversionCost) / prevTotals.conversionCost) * 100;
        const good = d < 0;
        out.push({ icon: good ? "📈" : "📉", color: good ? "#10b981" : "#ef4444", text: `CPA ${good ? "improved" : "worsened"} ${Math.abs(d).toFixed(1)}% vs previous period (${fmtCurrency(prevTotals.conversionCost)} → ${fmtCurrency(totals.conversionCost)})` });
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
        <button onClick={() => setSidebarOpen(false)} style={{ display: "none", background: "none", border: "none", color: "#555", fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }} className="sidebar-close">✕</button>
      </div>
      <div style={{ flex: 1, padding: "8px 10px", overflowY: "auto" }}>
        {folders.length > 0 && (
          <p style={{ fontSize: 9, color: "#333", padding: "2px 6px", margin: "0 0 4px", fontFamily: "monospace" }}>
            {folders.length}f · {myDashboards.filter(d => d.folder_id).length}/{myDashboards.length} assigned
          </p>
        )}
        {(() => {
          const toggleFolder = key => {
            setCollapsedFolders(prev => {
              const next = new Set(prev);
              next.has(key) ? next.delete(key) : next.add(key);
              localStorage.setItem("collapsedFolders", JSON.stringify([...next]));
              return next;
            });
          };
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
          const renderFolder = (key, label, dashes, accent = "#555") => {
            if (!dashes.length) return null;
            const isCollapsed = collapsedFolders.has(key);
            return (
              <div key={key} style={{ marginBottom: 4 }}>
                <button onClick={() => toggleFolder(key)} style={{
                  width: "100%", background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5, padding: "5px 6px 3px",
                }}>
                  <span style={{ color: "#444", fontSize: 9, lineHeight: 1 }}>{isCollapsed ? "▶" : "▼"}</span>
                  <span style={{ color: accent, fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" }}>{label}</span>
                  <span style={{ color: "#333", fontSize: 10, marginLeft: "auto" }}>{dashes.length}</span>
                </button>
                {!isCollapsed && dashes.map(renderBtn)}
              </div>
            );
          };

          if (folders.length > 0) {
            // Folder-based grouping
            const unfoldered = myDashboards.filter(d => !d.folder_id);
            return (<>
              {folders.map(f => renderFolder(f.id, f.name, myDashboards.filter(d => d.folder_id === f.id)))}
              {renderFolder("__other", "Other", unfoldered)}
            </>);
          }

          // Default: Meta / Google / Organic grouping
          const metaDashes    = myDashboards.filter(d => ["app","lead","ecom","auto"].includes(d.type));
          const googleDashes  = myDashboards.filter(d => d.type === "google");
          const organicDashes = myDashboards.filter(d => d.type === "organic");
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
          .sidebar-close { display: block !important; }
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
            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>☰</button>
            <img src={spLogo} alt="SPMP" style={{ height: 24, width: "auto" }} />
            <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}><span style={{ color: "#6366f1" }}>SPMP</span> Dashboards</p>
          </div>

          <div className="main-content" style={{ padding: "24px 20px", overflowX: "hidden" }}>

            {activeDash && (
              <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeDash.name}</h1>
                  <p style={{ color: "#555", fontSize: 12, margin: "3px 0 0", fontFamily: "monospace" }}>{activeDash.act_id}</p>
                </div>
                {activeDash.type && (
                  <span style={{ fontSize: 12, color: typeBadge[activeDash.type]?.color, background: typeBadge[activeDash.type]?.color + "22", borderRadius: 6, padding: "3px 10px", fontWeight: 600, flexShrink: 0 }}>
                    {typeBadge[activeDash.type]?.label}
                  </span>
                )}
                {canShare && (
                  <button onClick={openSharePanel} style={{
                    ...S.btn(showSharePanel ? "#22c55e22" : "#2a2a3e", showSharePanel ? "#22c55e" : "#aaa"),
                    border: `1px solid ${showSharePanel ? "#22c55e" : "transparent"}`, flexShrink: 0,
                  }}>
                    🔗 Share
                  </button>
                )}
              </div>
            )}

            {showSharePanel && activeDash && (
              <div style={{ ...S.card, padding: 20, marginBottom: 20, borderColor: "#22c55e44" }}>
                <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 14, color: "#22c55e" }}>🔗 Public Share Links</p>
                <p style={{ margin: "0 0 14px", fontSize: 12, color: "#666" }}>
                  Anyone with the link sees a live, read-only view of this dashboard — no login required. Revoke any time.
                </p>
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <button onClick={() => createShare(null)} disabled={shareBusy} style={{ ...S.btn("#22c55e", "#fff"), opacity: shareBusy ? 0.6 : 1 }}>
                    {shareBusy ? "Creating…" : "+ Create link (never expires)"}
                  </button>
                  <button onClick={() => createShare(30)} disabled={shareBusy} style={S.btn("#2a2a3e", "#aaa")}>+ 30-day link</button>
                  <button onClick={() => createShare(7)} disabled={shareBusy} style={S.btn("#2a2a3e", "#aaa")}>+ 7-day link</button>
                </div>
                {shares.length === 0
                  ? <p style={{ color: "#555", fontSize: 13, margin: 0 }}>No active links yet</p>
                  : shares.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid #1a1a2e", flexWrap: "wrap" }}>
                      <input readOnly value={s.url} onFocus={e => e.target.select()} style={{ ...S.inp, flex: 1, minWidth: 220, fontSize: 12, color: "#8b9cf8" }} />
                      <button onClick={() => copyShare(s)} style={S.btn(copiedId === s.id ? "#052e16" : "#2a2a3e", copiedId === s.id ? "#10b981" : "#aaa")}>
                        {copiedId === s.id ? "✓ Copied" : "Copy"}
                      </button>
                      <span style={{ fontSize: 11, color: "#555", minWidth: 90 }}>
                        {s.expires_at ? `Expires ${new Date(s.expires_at).toLocaleDateString()}` : "No expiry"}
                      </span>
                      <button onClick={() => revokeShare(s.id)} style={S.btn("#3f0f0f22", "#f87171")}>Revoke</button>
                    </div>
                  ))
                }
              </div>
            )}

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
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {[{ label: "Yesterday", d: 1 }, { label: "7d", d: 7 }, { label: "14d", d: 14 }, { label: "30d", d: 30 }].map(({ label, d }) => (
                    <button key={d} onClick={() => applyPreset(d)} style={{ ...S.btn(activePreset === d ? "#6c63ff" : "#2a2a3e", activePreset === d ? "#fff" : "#aaa"), border: `1px solid ${activePreset === d ? "#6c63ff" : "transparent"}` }}>{label}</button>
                  ))}
                  <button onClick={() => setCompare(c => !c)} style={{
                    ...S.btn(compare ? "#f59e0b22" : "#2a2a3e", compare ? "#f59e0b" : "#aaa"),
                    border: `1px solid ${compare ? "#f59e0b" : "transparent"}`,
                  }}>
                    {compare ? "⚡ Comparing" : "Compare"}
                  </button>
                  <button onClick={() => setForecast(f => !f)} style={{
                    ...S.btn(forecast ? "#22d3ee22" : "#2a2a3e", forecast ? "#22d3ee" : "#aaa"),
                    border: `1px solid ${forecast ? "#22d3ee" : "transparent"}`,
                  }}>
                    {forecast ? "🔮 Forecasting" : "Forecast"}
                  </button>
                  <button onClick={fetchData} disabled={loading || !activeDash} style={{ ...S.btn("#6366f1", "#fff"), opacity: loading ? 0.6 : 1, fontSize: 13 }}>
                    {loading ? "Loading…" : "Fetch Data"}
                  </button>
                  {rows && <>
                    <button onClick={() => exportCSV(rows, activeDash?.name, metrics)} style={S.btn("#052e16", "#10b981")}>↓ CSV</button>
                    <button onClick={() => exportPDF(activeDash?.name, startDate, endDate, totals, metrics, rows, annotations)} style={S.btn("#1e1b4b", "#818cf8")}>↓ PDF</button>
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

            {activeDash?.type === "auto" && goalGroups && goalGroups.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: "0 0 8px", fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: ".06em" }}>GOAL</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {goalGroups.map(g => (
                    <button key={g.key} onClick={() => switchGoal(g.key)} style={{
                      background: activeGoalKey === g.key ? "#1877f222" : "#2a2a3e",
                      border: `1px solid ${activeGoalKey === g.key ? "#1877f2" : "transparent"}`,
                      borderRadius: 8, padding: "8px 14px",
                      color: activeGoalKey === g.key ? "#4b9cf5" : "#aaa",
                      cursor: "pointer", fontSize: 12, fontWeight: activeGoalKey === g.key ? 700 : 400,
                    }}>
                      {g.label}
                      {g.campaign_ids.length > 1 && <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.6 }}>({g.campaign_ids.length})</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeDash?.type === "auto" && !goalGroups && (
              <p style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>Detecting campaign goals…</p>
            )}

            {!rows && !loading && !error && (
              <div style={{ textAlign: "center", color: "#444", marginTop: 80 }}>
                <div style={{ fontSize: 52 }}>📊</div>
                <p style={{ marginTop: 12, fontSize: 14 }}>Pick a date range and hit <strong style={{ color: "#fff" }}>Fetch Data</strong></p>
              </div>
            )}

            {rows && (
              <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
                {[
                  { key: "account",   label: "📊 Account" },
                  { key: "campaigns", label: `🎯 Campaigns${campaigns ? ` (${campaigns.length})` : ""}` },
                  { key: "adsets",    label: `📁 Ad Sets${adsets ? ` (${adsets.length})` : ""}` },
                  { key: "ads",       label: `🎨 Ads${ads ? ` (${ads.filter(a => a.spend > 0).length})` : ""}` },
                  { key: "creative",  label: `🖼️ Creatives` },
                ].map(t => (
                  <button key={t.key} onClick={() => setTab(t.key)} style={{
                    background: tab === t.key ? "#6366f1" : "#2a2a3e", border: "none", borderRadius: 8,
                    padding: "9px 14px", color: tab === t.key ? "#fff" : "#aaa",
                    cursor: "pointer", fontSize: 12, fontWeight: tab === t.key ? 700 : 400,
                  }}>{t.label}</button>
                ))}
                <button onClick={() => setAnnotPanel(p => !p)} style={{
                  ...S.btn(showAnnotPanel ? "#fef3c722" : "#2a2a3e", showAnnotPanel ? "#fbbf24" : "#aaa"),
                  border: `1px solid ${showAnnotPanel ? "#fbbf24" : "transparent"}`, marginLeft: "auto",
                }}>
                  📝 Notes {annotations.length > 0 ? `(${annotations.length})` : ""}
                </button>
              </div>
            )}

            {showAnnotPanel && activeDash && (
              <div style={{ ...S.card, padding: 20, marginBottom: 20, borderColor: "#fbbf2444" }}>
                <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14, color: "#fbbf24" }}>📝 Chart Annotations</p>
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <input type="date" value={newAnnotDate} onChange={e => setNewAnnotDate(e.target.value)}
                    min={startDate} max={endDate} style={{ ...S.inp, flex: "0 0 160px" }} />
                  <input placeholder="Add a note…" value={newAnnotNote}
                    onChange={e => setNewAnnotNote(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveAnnotation()}
                    style={{ ...S.inp, flex: 1, minWidth: 180 }} />
                  <button onClick={saveAnnotation} disabled={annotLoading || !newAnnotDate || !newAnnotNote.trim()}
                    style={{ ...S.btn("#6366f1", "#fff"), opacity: (!newAnnotDate || !newAnnotNote.trim()) ? 0.5 : 1 }}>
                    {annotLoading ? "Saving…" : "Add Note"}
                  </button>
                </div>
                {annotations.length === 0
                  ? <p style={{ color: "#555", fontSize: 13, margin: 0 }}>No notes yet</p>
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

            {tab === "campaigns" && rows && (() => {
              if (!campaigns?.length) return <div style={{ textAlign: "center", color: "#555", marginTop: 40, fontSize: 14 }}>No campaign data returned</div>;
              const getHealth = c => {
                let score = 100;
                const avgCpa = totals.conversionCost;
                if (c.conversions > 0 && avgCpa > 0) {
                  const r = c.conversionCost / avgCpa;
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
                          <div><p style={{ margin: 0, fontSize: 9, color: "#555", letterSpacing: ".04em" }}>CPA</p><p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: h.color }}>{c.conversionCost > 0 ? fmtCurrency(c.conversionCost) : "—"}</p></div>
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
                <CampaignTree structure={structure} campaigns={campaigns} adsets={adsets} ads={ads}
                  dashType={dashType} canManage={canManage} busyId={treeBusyId}
                  onStatus={setEntityStatus} onBudget={setEntityBudget}
                  actId={activeDash?.act_id?.replace("act_", "")} />
              </>);
            })()}
            {tab === "adsets" && rows && (
              adsets?.length > 0
                ? <BreakdownTable rows={adsets} nameLabel="Ad Set" subLabel="Campaign" subKey="campaignName" dashType={dashType} convEvent={convEvent} />
                : <div style={{ textAlign: "center", color: "#555", marginTop: 40, fontSize: 14 }}>No ad set data returned</div>
            )}
            {tab === "ads" && rows && (
              ads?.filter(a => a.spend > 0).length > 0
                ? <BreakdownTable rows={ads.filter(a => a.spend > 0)} nameLabel="Ad" subLabel="Ad Set" subKey="adsetName" dashType={dashType} convEvent={convEvent} />
                : <div style={{ textAlign: "center", color: "#555", marginTop: 40, fontSize: 14 }}>No ad data returned</div>
            )}
            {tab === "creative" && rows && (
              <CreativeCockpit ads={ads} creatives={creatives} dashType={dashType} debug={creativesDebug} hdFetcher={hdFetcher} />
            )}

            {tab === "account" && totals && (<>
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
              {(budget != null || canManage) && (() => {
                const b = budget;
                const projected = mtd && mtd.dayOfMonth > 0 ? mtd.mtdSpend / mtd.dayOfMonth * mtd.daysInMonth : null;
                const usedPct = b > 0 && mtd ? (mtd.mtdSpend / b) * 100 : 0;
                const elapsedPct = mtd ? (mtd.dayOfMonth / mtd.daysInMonth) * 100 : 0;
                let status = null;
                if (b > 0 && projected != null) {
                  if (projected > b * 1.05)      status = { label: "Over pace",  color: "#ef4444" };
                  else if (projected < b * 0.9)  status = { label: "Under pace", color: "#f59e0b" };
                  else                           status = { label: "On track",   color: "#10b981" };
                }
                const barColor = status ? status.color : "#6366f1";
                return (
                  <div style={{ ...S.card, padding: "16px 18px", marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>💸 Budget Pacing <span style={{ color: "#555", fontWeight: 400, fontSize: 12 }}>· {mtd?.monthLabel || "this month"} · account total</span></p>
                      {status && <span style={{ fontSize: 11, fontWeight: 700, color: status.color, background: status.color + "22", borderRadius: 6, padding: "3px 10px" }}>{status.label}</span>}
                      {canManage && !budgetEditing && (
                        <button onClick={() => setBudgetEditing(true)} style={{ ...S.btn("#2a2a3e", "#aaa"), marginLeft: "auto" }}>{b != null ? "Edit budget" : "Set budget"}</button>
                      )}
                    </div>
                    {canManage && budgetEditing && (
                      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                        <input type="number" placeholder="Monthly budget ($)" value={budgetInput} onChange={e => setBudgetInput(e.target.value)} style={{ ...S.inp, flex: "0 0 200px" }} />
                        <button onClick={saveBudget} style={S.btn("#6366f1", "#fff")}>Save</button>
                        <button onClick={() => { setBudgetEditing(false); setBudgetInput(b != null ? String(b) : ""); }} style={S.btn("#2a2a3e", "#aaa")}>Cancel</button>
                      </div>
                    )}
                    {b == null
                      ? <p style={{ color: "#555", fontSize: 13, margin: 0 }}>No monthly budget set{canManage ? " — set one to track pacing and get over/underspend warnings." : "."}</p>
                      : !mtd
                        ? <p style={{ color: "#555", fontSize: 13, margin: 0 }}>Loading month-to-date spend…</p>
                        : (<>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                              <span style={{ color: "#aaa" }}>{fmtCurrency(mtd.mtdSpend)} spent</span>
                              <span style={{ color: "#555" }}>of {fmtCurrency(b)} ({usedPct.toFixed(0)}%)</span>
                            </div>
                            <div style={{ position: "relative", height: 10, background: "#13131f", borderRadius: 6, overflow: "hidden", marginBottom: 4 }}>
                              <div style={{ width: `${Math.min(100, usedPct)}%`, height: "100%", background: barColor, borderRadius: 6 }} />
                              <div style={{ position: "absolute", top: -2, bottom: -2, left: `${Math.min(100, elapsedPct)}%`, width: 2, background: "#ffffffaa" }} title="Month elapsed to today" />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", marginBottom: 14 }}>
                              <span>Day {mtd.dayOfMonth} of {mtd.daysInMonth}</span>
                              <span>{elapsedPct.toFixed(0)}% of month elapsed (white line)</span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 12 }}>
                              <div style={{ background: "#13131f", borderRadius: 10, padding: "10px 12px" }}>
                                <p style={{ margin: "0 0 4px", fontSize: 10, color: "#666", fontWeight: 600 }}>PROJECTED SPEND</p>
                                <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: barColor }}>{projected != null ? fmtCurrency(projected) : "—"}</p>
                              </div>
                              <div style={{ background: "#13131f", borderRadius: 10, padding: "10px 12px" }}>
                                <p style={{ margin: "0 0 4px", fontSize: 10, color: "#666", fontWeight: 600 }}>{projected > b ? "PROJECTED OVER BY" : "PROJECTED UNDER BY"}</p>
                                <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: projected > b ? "#ef4444" : "#10b981" }}>{projected != null ? fmtCurrency(Math.abs(projected - b)) : "—"}</p>
                              </div>
                              <div style={{ background: "#13131f", borderRadius: 10, padding: "10px 12px" }}>
                                <p style={{ margin: "0 0 4px", fontSize: 10, color: "#666", fontWeight: 600 }}>BUDGET REMAINING</p>
                                <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{fmtCurrency(Math.max(0, b - mtd.mtdSpend))}</p>
                              </div>
                            </div>
                          </>)
                    }
                  </div>
                );
              })()}
              {fc && (() => {
                const isEcom = dashType === "ecom";
                const tiles = [
                  { label: "Proj. Spend", value: fmtCurrency(fc.projSpend), mtd: `${fmtCurrency(fc.mtdSpend)} so far`, color: "#6366f1" },
                  { label: isEcom ? "Proj. Purchases" : "Proj. Conversions", value: fmtNumber(Math.round(fc.projConv)), mtd: `${fmtNumber(fc.mtdConv)} so far`, color: "#10b981" },
                  { label: "Proj. CPA", value: fc.projCpa > 0 ? fmtCurrency(fc.projCpa) : "—", mtd: `${fmtCurrency(fc.avgSpend)}/day avg`, color: "#f59e0b" },
                  ...(isEcom ? [
                    { label: "Proj. Revenue", value: fmtCurrency(fc.projRev), mtd: `${fmtCurrency(fc.mtdRev)} so far`, color: "#34d399" },
                    { label: "Proj. ROAS", value: fmtROAS(fc.projRoas), mtd: "at current pace", color: "#fbbf24" },
                  ] : []),
                ];
                return (
                  <div style={{ ...S.card, padding: "16px 18px", marginBottom: 20, border: "1px solid #22d3ee44", background: "#22d3ee0a" }}>
                    <p style={{ margin: "0 0 3px", fontWeight: 700, fontSize: 14, color: "#22d3ee" }}>🔮 {fc.monthLabel} Forecast</p>
                    <p style={{ margin: "0 0 14px", fontSize: 11, color: "#666" }}>
                      Projected through {fc.monthEndLabel} · {fc.remainingDays} day{fc.remainingDays !== 1 ? "s" : ""} left · based on {fc.days}-day run-rate
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 12 }}>
                      {tiles.map(t => (
                        <div key={t.label} style={{ background: "#13131f", borderRadius: 10, padding: "12px 14px" }}>
                          <p style={{ margin: "0 0 4px", fontSize: 10, color: "#666", fontWeight: 600, letterSpacing: ".04em" }}>{t.label.toUpperCase()}</p>
                          <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: t.color }}>{t.value}</p>
                          <p style={{ margin: "4px 0 0", fontSize: 10, color: "#555" }}>{t.mtd}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 10, marginBottom: 20 }}>
                {metrics.map(m => {
                  const active = activeMetric === m.key;
                  const curr = totals[m.key] || 0;
                  const prev = prevTotals?.[m.key] || 0;
                  const pct  = compare && prev > 0 ? ((curr - prev) / prev) * 100 : null;
                  const costMetric = ["conversionCost","cpm","cpc"].includes(m.key);
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
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: isGood ? "#10b981" : "#f87171" }}>
                            {isGood ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
                          </span>
                          <span style={{ fontSize: 10, color: "#555" }}>{m.format(prev)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ ...S.card, padding: 16, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
                    {activeMeta.label} <span style={{ color: "#555", fontWeight: 400, fontSize: 12 }}>— daily</span>
                  </p>
                  {(compare && prevRows || fc) && (
                    <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                      <span style={{ color: activeMeta.color }}>— Current</span>
                      {compare && prevRows && <span style={{ color: "#f59e0b" }}>-- Previous</span>}
                      {fc && fc.remainingDays > 0 && <span style={{ color: "#22d3ee" }}>-- Projected</span>}
                    </div>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#1e1e2e" />
                    <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 9 }} />
                    <YAxis tick={{ fill: "#555", fontSize: 9 }} width={55} tickFormatter={v => activeMeta.format(v)} />
                    <Tooltip
                      contentStyle={{ background: "#13131f", border: `1px solid ${activeMeta.color}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(v, name) => [activeMeta.format(v), name === "prev" ? "Previous Period" : name === "projected" ? "Projected" : "Current Period"]}
                      labelFormatter={(label, payload) => {
                        const date = payload?.[0]?.payload?.date;
                        const annot = visibleAnnotations.find(a => a.date === date);
                        return annot ? `${label} · 📝 ${annot.note}` : label;
                      }}
                    />
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
                    {fc && fc.remainingDays > 0 && (
                      <Line type="monotone" dataKey="projected" stroke="#22d3ee" strokeWidth={2} strokeDasharray="3 6" dot={false} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ ...S.card, marginBottom: 20, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #2a2a3e", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Top 5 Ads</p>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                      <th style={S.th}>CPM</th><th style={S.th}>CPC</th><th style={S.th}>CTR</th><th style={S.th}>Freq</th><th style={S.th}>Impressions</th>
                    </tr></thead>
                    <tbody>
                      {sortedAds.length === 0
                        ? <tr><td colSpan={10} style={{ ...S.td, textAlign: "center", color: "#555", padding: 20 }}>No ad data</td></tr>
                        : sortedAds.map((ad, i) => (
                          <tr key={ad.id || i} style={{ borderTop: "1px solid #1a1a2e" }}>
                            <td style={{ ...S.td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={ad.name}>
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
                            <td style={{ ...S.td, color: ad.frequency >= 3 ? "#f97316" : "#fff", fontWeight: ad.frequency >= 3 ? 700 : 400 }}>{ad.frequency ? `${ad.frequency.toFixed(1)}x` : "—"}</td>
                            <td style={S.td}>{fmtNumber(ad.impressions)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(() => {
                const daysWithConv = rows.filter(r => r.conversions > 0);
                const bestDate  = daysWithConv.length > 0 ? daysWithConv.reduce((a, b) => a.conversionCost < b.conversionCost ? a : b).date : rows.reduce((a, b) => a.impressions > b.impressions ? a : b, rows[0])?.date;
                const worstDate = daysWithConv.length > 0 ? daysWithConv.reduce((a, b) => a.conversionCost > b.conversionCost ? a : b).date : rows.reduce((a, b) => a.impressions < b.impressions ? a : b, rows[0])?.date;
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
                          <th style={S.th}>Date</th><th style={S.th}>Conversions</th><th style={S.th}>CPA</th><th style={S.th}>Spend</th>
                          {dashType === "ecom" && <><th style={S.th}>Revenue</th><th style={S.th}>ROAS</th></>}
                          {dashType === "lead" && <th style={S.th}>Link Clicks</th>}
                          <th style={S.th}>Impressions</th><th style={S.th}>Reach</th>
                          <th style={S.th}>CPM</th><th style={S.th}>CPC</th><th style={S.th}>CTR</th>
                          <th style={S.th}>Notes</th>
                        </tr></thead>
                        <tbody>
                          {rows.map((row, i) => {
                            const annot   = annotations.find(a => a.date === row.date);
                            const isBest  = row.date === bestDate;
                            const isWorst = row.date === worstDate;
                            const bg = isBest ? "#10b98112" : isWorst ? "#ef444412" : i % 2 ? "#ffffff04" : "transparent";
                            const borderLeft = isBest ? "3px solid #10b981" : isWorst ? "3px solid #ef4444" : "3px solid transparent";
                            return (
                              <tr key={row.date} style={{ borderTop: "1px solid #1a1a2e", background: bg, borderLeft }}>
                                <td style={S.td}>
                                  {isBest && <span style={{ marginRight: 4 }}>🟢</span>}
                                  {isWorst && <span style={{ marginRight: 4 }}>🔴</span>}
                                  {row.label}
                                </td>
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
                                <td style={{ ...S.td, color: "#fbbf24", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }} title={annot?.note}>
                                  {annot ? `📝 ${annot.note}` : ""}
                                </td>
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
                  if (!dayRows.length) return { day, count: 0, spend: null, clicks: null, conversions: null, conversionCost: null, ctr: null };
                  const n = dayRows.length;
                  const sum = k => dayRows.reduce((s, r) => s + (r[k] || 0), 0);
                  const daysC = dayRows.filter(r => r.conversions > 0);
                  return {
                    day, count: n,
                    spend: sum("spend") / n,
                    clicks: sum("clicks") / n,
                    conversions: sum("conversions") / n,
                    conversionCost: daysC.length > 0 ? daysC.reduce((s, r) => s + r.conversionCost, 0) / daysC.length : null,
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
                const dowMetrics = [
                  { label: "Avg Spend",  key: "spend",           fmt: fmtCurrency,         lowerBetter: false },
                  { label: "Avg Clicks", key: "clicks",           fmt: v => fmtNumber(Math.round(v)), lowerBetter: false },
                  { label: "Avg Conv",   key: "conversions",      fmt: v => v.toFixed(1),   lowerBetter: false },
                  { label: "Avg CPA",    key: "conversionCost",   fmt: v => v ? fmtCurrency(v) : "—", lowerBetter: true  },
                  { label: "Avg CTR",    key: "ctr",              fmt: fmtPercent,          lowerBetter: false },
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
                          {dowMetrics.map(m => {
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
          </div>
        </div>
      </div>
    </>
  );
}

function CockpitMetric({ label, value, color }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 9, color: "#555", letterSpacing: ".04em" }}>{label.toUpperCase()}</p>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color }}>{value}</p>
    </div>
  );
}

// Thumbnail with lazy loading, placeholder fallback, and optional HD upgrade for
// videos whose only preview is a low-res auto-frame (needsHd).
function CreativeThumb({ creative, alt, hdFetcher }) {
  const [broken, setBroken] = useState(false);
  const [hd, setHd] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (creative?.needsHd && creative?.id && hdFetcher) {
      hdFetcher(creative.id).then(url => { if (!cancelled && url) setHd(url); });
    }
    return () => { cancelled = true; };
  }, [creative?.id, creative?.needsHd, hdFetcher]);
  const src = hd || creative?.thumbnail_url;
  if (!src || broken) return <span style={{ fontSize: 40, opacity: 0.25 }}>🖼️</span>;
  // absolutely positioned so it fills the square box and doesn't stretch the card
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={() => setBroken(true)} />;
}

const COCKPIT_PER_PAGE = 12;

export function CreativeCockpit({ ads, creatives, dashType, debug, hdFetcher }) {
  const isEcom = dashType === "ecom";
  const [sortKey, setSortKey] = useState(isEcom ? "roas_desc" : "spend_desc");
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [sortKey]);
  const list = (ads || []).filter(a => a.spend > 0);

  // Benchmarks used to award badges
  const convAds  = list.filter(a => a.conversions > 0);
  const avgCpa   = convAds.length ? convAds.reduce((s, a) => s + a.conversionCost, 0) / convAds.length : 0;
  const avgSpend = list.length ? list.reduce((s, a) => s + a.spend, 0) / list.length : 0;
  const roasAds  = list.filter(a => a.roas > 0);
  const avgRoas  = roasAds.length ? roasAds.reduce((s, a) => s + a.roas, 0) / roasAds.length : 0;
  const ctrAds   = list.filter(a => a.ctr > 0);
  const avgCtr   = ctrAds.length ? ctrAds.reduce((s, a) => s + a.ctr, 0) / ctrAds.length : 0;

  // Fatigue: same people seeing the ad a lot (high frequency) AND engagement below
  // the account average (falling CTR) → the creative is worn out and needs refreshing.
  const fatigueOf = a => {
    if (a.frequency >= 3 && a.ctr > 0 && avgCtr > 0 && a.ctr < avgCtr) return { label: "🔥 Fatigued", color: "#f97316" };
    return null;
  };

  const badgeFor = a => {
    if (isEcom) {
      if (a.roas > 0 && avgRoas > 0 && a.roas >= avgRoas * 1.3) return { label: "🏆 Top ROAS", color: "#10b981" };
      if (a.spend >= avgSpend && (a.roas === 0 || a.roas < avgRoas * 0.5)) return { label: "💸 Draining", color: "#ef4444" };
    } else {
      if (a.conversions > 0 && avgCpa > 0 && a.conversionCost <= avgCpa * 0.7) return { label: "🏆 Winner", color: "#10b981" };
      if (a.spend >= avgSpend * 1.2 && a.conversions === 0)                    return { label: "💸 No conv.", color: "#ef4444" };
      if (a.conversions > 0 && avgCpa > 0 && a.conversionCost >= avgCpa * 1.5) return { label: "⚠️ High CPA", color: "#f59e0b" };
    }
    return null;
  };

  const sorts = [
    { key: "spend_desc", label: "Spend" },
    ...(isEcom
      ? [{ key: "roas_desc", label: "ROAS" }, { key: "revenue_desc", label: "Revenue" }]
      : [{ key: "conversions_desc", label: "Conversions" }, { key: "conversionCost_asc", label: "Best CPA" }]),
    { key: "ctr_desc", label: "CTR" },
    { key: "frequency_desc", label: "🔥 Fatigue" },
  ];
  const sorted = [...list].sort((a, b) => {
    const [k, dir] = sortKey.split("_");
    if (dir === "asc") { const v = r => (!r[k] || r[k] === 0) ? Infinity : r[k]; return v(a) - v(b); }
    return (b[k] || 0) - (a[k] || 0);
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / COCKPIT_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = sorted.slice(safePage * COCKPIT_PER_PAGE, safePage * COCKPIT_PER_PAGE + COCKPIT_PER_PAGE);

  if (!list.length) return <div style={{ textAlign: "center", color: "#555", marginTop: 40, fontSize: 14 }}>No ads with spend in this period</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>🖼️ Creative Cockpit <span style={{ color: "#555", fontWeight: 400, fontSize: 12 }}>· {list.length} ads · benchmarked vs account avg</span></p>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#555" }}>Sort:</span>
          {sorts.map(s => (
            <button key={s.key} onClick={() => setSortKey(s.key)} style={{ background: sortKey === s.key ? "#6366f1" : "#2a2a3e", border: "none", borderRadius: 6, padding: "5px 10px", color: sortKey === s.key ? "#fff" : "#aaa", cursor: "pointer", fontSize: 11 }}>{s.label}</button>
          ))}
        </div>
      </div>
      {creatives === null && <p style={{ color: "#555", fontSize: 12, marginBottom: 12 }}>Loading thumbnails…</p>}
      {creatives !== null && debug && debug.withThumb === 0 && (
        <div style={{ ...S.card, padding: "12px 16px", marginBottom: 14, border: "1px solid #ef444455", background: "#ef44440a" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#f87171", fontWeight: 700 }}>⚠️ No thumbnails resolved</p>
          {debug.error
            ? <p style={{ margin: 0, fontSize: 12, color: "#aaa" }}>Meta API error: {debug.error}</p>
            : <p style={{ margin: 0, fontSize: 12, color: "#aaa" }}>Checked {debug.totalAds} ads — Meta returned no usable image field. Raw sample of the first creative below (paste this to debug):</p>}
          {debug.sampleCreative && (
            <pre style={{ margin: "8px 0 0", padding: 10, background: "#000", borderRadius: 8, fontSize: 11, color: "#8b9cf8", overflowX: "auto", maxHeight: 220 }}>
              {JSON.stringify(debug.sampleCreative, null, 2)}
            </pre>
          )}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 14 }}>
        {shown.map((a, i) => {
          const cr = creatives?.[a.id];
          const badge = badgeFor(a);
          const fat = fatigueOf(a);
          return (
            <div key={a.id || i} style={{ background: "#1e1e2e", border: `1px solid ${badge ? badge.color + "66" : "#2a2a3e"}`, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "relative", background: "#13131f", aspectRatio: "1 / 1", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CreativeThumb creative={cr} alt={a.name} hdFetcher={hdFetcher} />
                {badge && <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10, fontWeight: 700, color: badge.color, background: "#000000cc", borderRadius: 6, padding: "3px 8px" }}>{badge.label}</span>}
                {fat && <span style={{ position: "absolute", top: 8, right: 8, fontSize: 10, fontWeight: 700, color: fat.color, background: "#000000cc", borderRadius: 6, padding: "3px 8px" }} title={`Frequency ${a.frequency.toFixed(1)}x with below-average CTR — consider refreshing`}>{fat.label}</span>}
              </div>
              <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#ddd", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={a.name}>{a.name}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 10px", marginTop: "auto" }}>
                  <CockpitMetric label="Spend" value={fmtCurrency(a.spend)} color="#8b5cf6" />
                  {isEcom
                    ? <><CockpitMetric label="ROAS" value={fmtROAS(a.roas)} color="#fbbf24" /><CockpitMetric label="Revenue" value={fmtCurrency(a.revenue)} color="#34d399" /><CockpitMetric label="Purch." value={fmtNumber(a.conversions)} color="#10b981" /></>
                    : <><CockpitMetric label="Conv." value={fmtNumber(a.conversions)} color="#10b981" /><CockpitMetric label="CPA" value={a.conversionCost > 0 ? fmtCurrency(a.conversionCost) : "—"} color="#f59e0b" /><CockpitMetric label="CTR" value={fmtPercent(a.ctr)} color="#f97316" /></>}
                  <CockpitMetric label="Freq" value={a.frequency ? `${a.frequency.toFixed(1)}x` : "—"} color={fat ? "#f97316" : "#888"} />
                </div>
                {(cr?.permalink || cr?.landing) && (
                  <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                    {cr?.permalink && <a href={cr.permalink} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#4b9cf5", textDecoration: "none", fontWeight: 600 }}>👁 View on Facebook ↗</a>}
                    {cr?.landing && <a href={cr.landing} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#777", textDecoration: "none" }}>Landing page ↗</a>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {pageCount > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 18 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}
            style={{ ...S.btn(safePage === 0 ? "#1a1a2e" : "#2a2a3e", safePage === 0 ? "#444" : "#ddd"), cursor: safePage === 0 ? "default" : "pointer" }}>← Prev</button>
          <span style={{ fontSize: 12, color: "#888" }}>Page {safePage + 1} of {pageCount} · {sorted.length} ads</span>
          <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}
            style={{ ...S.btn(safePage >= pageCount - 1 ? "#1a1a2e" : "#2a2a3e", safePage >= pageCount - 1 ? "#444" : "#ddd"), cursor: safePage >= pageCount - 1 ? "default" : "pointer" }}>Next →</button>
        </div>
      )}
    </div>
  );
}

// Compact on/off switch
function StatusSwitch({ on, disabled, busy, onToggle, title }) {
  return (
    <button disabled={disabled || busy} onClick={onToggle} title={title}
      style={{ width: 34, height: 19, borderRadius: 10, border: "none", flexShrink: 0,
        cursor: disabled || busy ? "default" : "pointer", position: "relative",
        background: on ? "#10b981" : "#4b5563", opacity: busy ? 0.5 : 1, transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 17 : 2, width: 15, height: 15, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
    </button>
  );
}

// Expandable campaign → ad set → ad hierarchy with live status/budget controls
function CampaignTree({ structure, campaigns, adsets, ads, dashType, canManage, busyId, onStatus, onBudget, actId }) {
  const [openC, setOpenC] = useState(() => new Set());
  const [openA, setOpenA] = useState(() => new Set());
  const isEcom = dashType === "ecom";

  if (!structure) return <p style={{ color: "#555", fontSize: 13, margin: "16px 0" }}>Loading campaign structure…</p>;
  if (!structure.campaigns?.length) return <p style={{ color: "#555", fontSize: 13, margin: "16px 0" }}>No campaigns found on this account.</p>;

  const perfC  = Object.fromEntries((campaigns || []).map(c => [c.id, c]));
  const perfAS = Object.fromEntries((adsets || []).map(a => [a.id, a]));
  const perfAD = Object.fromEntries((ads || []).map(a => [a.id, a]));
  const toggleSet = (set, setter, id) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n); };

  const GRID = "minmax(150px,1fr) 104px 82px 66px 82px 58px 46px";
  const cellR = { fontSize: 11, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  const headStyle = { ...cellR, color: "#666", fontWeight: 700, fontSize: 10, letterSpacing: ".04em" };

  const amUrl = (level, id) => {
    const seg = level === 0 ? "campaigns" : level === 1 ? "adsets" : "ads";
    const key = level === 0 ? "selected_campaign_ids" : level === 1 ? "selected_adset_ids" : "selected_ad_ids";
    return `https://adsmanager.facebook.com/adsmanager/manage/${seg}?act=${actId}&${key}=${id}`;
  };

  const Row = ({ level, entity, perf, hasChildren, isOpen, onArrow }) => {
    const pad = level * 20;
    const paused = entity.effective_status && entity.effective_status !== "ACTIVE";
    const bg = level === 0 ? "#13131f" : level === 1 ? "#ffffff04" : "transparent";
    const b = entity.daily_budget != null ? { v: entity.daily_budget, t: "daily", sfx: "/d" }
            : entity.lifetime_budget != null ? { v: entity.lifetime_budget, t: "lifetime", sfx: " life" } : null;
    return (
      <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "7px 12px", borderTop: "1px solid #1a1a2e", background: bg }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, paddingLeft: pad, minWidth: 0 }}>
          {hasChildren
            ? <button onClick={onArrow} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 10, width: 12, flexShrink: 0, padding: 0 }}>{isOpen ? "▼" : "▶"}</button>
            : <span style={{ width: 12, flexShrink: 0 }} />}
          <StatusSwitch on={entity.status === "ACTIVE"} disabled={!canManage} busy={busyId === entity.id}
            onToggle={() => onStatus(entity, entity.status === "ACTIVE" ? "PAUSED" : "ACTIVE")}
            title={canManage ? (entity.status === "ACTIVE" ? "Pause" : "Activate") : "Read-only"} />
          <span title={entity.name} style={{ minWidth: 0, fontSize: level === 0 ? 13 : 12, fontWeight: level === 0 ? 700 : 500, color: paused ? "#777" : "#eee", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entity.name}{paused && <span style={{ color: "#555", fontWeight: 400, marginLeft: 6, fontSize: 10 }}>paused</span>}
          </span>
          <a href={amUrl(level, entity.id)} target="_blank" rel="noreferrer" title="Open in Ads Manager" style={{ color: "#4b9cf5", textDecoration: "none", fontSize: 12, flexShrink: 0 }}>↗</a>
        </div>
        <span style={{ ...cellR, color: "#ddd" }}>
          {b ? <>{fmtCurrency(b.v)}<span style={{ color: "#555" }}>{b.sfx}</span>{canManage && <button onClick={() => onBudget(entity, b.t)} title="Edit budget" style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: 12, marginLeft: 3, padding: 0 }}>✎</button>}</> : "—"}
        </span>
        <span style={{ ...cellR, color: "#8b5cf6", fontWeight: 700 }}>{perf ? fmtCurrency(perf.spend) : "—"}</span>
        <span style={{ ...cellR, color: isEcom ? "#fbbf24" : "#10b981", fontWeight: 700 }}>{perf ? (isEcom ? fmtROAS(perf.roas) : fmtNumber(perf.conversions)) : "—"}</span>
        <span style={{ ...cellR, color: isEcom ? "#34d399" : "#f59e0b" }}>{perf ? (isEcom ? fmtCurrency(perf.revenue) : (perf.conversionCost > 0 ? fmtCurrency(perf.conversionCost) : "—")) : "—"}</span>
        <span style={{ ...cellR, color: "#bbb" }}>{perf ? fmtPercent(perf.ctr) : "—"}</span>
        <span style={{ ...cellR, color: perf && perf.frequency >= 3 ? "#f97316" : "#999" }}>{perf && perf.frequency ? `${perf.frequency.toFixed(1)}x` : "—"}</span>
      </div>
    );
  };

  return (
    <div style={{ ...S.card, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #2a2a3e", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>🗂️ Campaign Structure</p>
        <span style={{ fontSize: 11, color: "#555" }}>· expand to drill in{canManage ? " · toggle to pause/activate · ✎ edit budget (live)" : ""} · ↗ Ads Manager</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 700 }}>
          <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, alignItems: "center", padding: "8px 12px", background: "#13131f", borderBottom: "1px solid #2a2a3e", position: "sticky", top: 0 }}>
            <span style={{ ...headStyle, textAlign: "left" }}>NAME</span>
            <span style={headStyle}>BUDGET</span>
            <span style={headStyle}>SPEND</span>
            <span style={headStyle}>{isEcom ? "ROAS" : "CONV"}</span>
            <span style={headStyle}>{isEcom ? "REVENUE" : "CPA"}</span>
            <span style={headStyle}>CTR</span>
            <span style={headStyle}>FREQ</span>
          </div>
          {structure.campaigns.map(c => {
            const cOpen = openC.has(c.id);
            const cAdsets = structure.adsets.filter(a => a.campaign_id === c.id);
            return (
              <div key={c.id}>
                <Row level={0} entity={c} perf={perfC[c.id]} hasChildren={cAdsets.length > 0} isOpen={cOpen} onArrow={() => toggleSet(openC, setOpenC, c.id)} />
                {cOpen && cAdsets.map(as => {
                  const aOpen = openA.has(as.id);
                  const asAds = structure.ads.filter(ad => ad.adset_id === as.id);
                  return (
                    <div key={as.id}>
                      <Row level={1} entity={as} perf={perfAS[as.id]} hasChildren={asAds.length > 0} isOpen={aOpen} onArrow={() => toggleSet(openA, setOpenA, as.id)} />
                      {aOpen && asAds.map(ad => (
                        <Row key={ad.id} level={2} entity={ad} perf={perfAD[ad.id]} hasChildren={false} />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
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
            <th style={{ ...S.th, minWidth: 180 }}>{nameLabel}</th>
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
            <SortTh k="frequency" label="Freq" />
          </tr></thead>
          <tbody>
            {sorted.length === 0
              ? <tr><td colSpan={13} style={{ ...S.td, textAlign: "center", color: "#555", padding: 20 }}>No data</td></tr>
              : sorted.map((row, i) => (
                <tr key={row.id || i} style={{ borderTop: "1px solid #1a1a2e", background: i % 2 ? "#ffffff04" : "transparent" }}>
                  <td style={{ ...S.td, fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={row.name}>{row.name}</td>
                  {subLabel && <td style={{ ...S.td, color: "#888", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={row[subKey]}>{row[subKey]}</td>}
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
                  <td style={{ ...S.td, color: row.frequency >= 3 ? "#f97316" : "#fff", fontWeight: row.frequency >= 3 ? 700 : 400 }}>{row.frequency ? `${row.frequency.toFixed(1)}x` : "—"}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}