import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import spLogo from "./assets/sp-logo.png";
import API from "./config";
import {
  fmtCurrency, fmtNumber, fmtPercent, fmtROAS, toYMD,
  getMetrics, parseRow, computeTotals, CreativeCockpit, S,
} from "./Dashboard";

const typeBadge = {
  app: { label: "App", color: "#6366f1" }, lead: { label: "Lead Gen", color: "#10b981" },
  ecom: { label: "Ecom", color: "#f59e0b" }, auto: { label: "Meta", color: "#1877f2" },
};

export default function PublicDashboard() {
  const { token } = useParams();
  const [bundle, setBundle]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [activeMetric, setActive] = useState("conversions");
  const [activeGoalKey, setGoalKey] = useState(null);

  const defEnd = new Date(); defEnd.setDate(defEnd.getDate() - 1);
  const defStart = new Date(defEnd); defStart.setDate(defStart.getDate() - 6);
  const [startDate, setStartDate] = useState(toYMD(defStart));
  const [endDate, setEndDate]     = useState(toYMD(defEnd));
  const [preset, setPreset]       = useState(7);

  const load = useCallback(async (goalKeyOverride) => {
    setLoading(true); setError("");
    try {
      const goalKey = goalKeyOverride !== undefined ? goalKeyOverride : activeGoalKey;
      const groups = bundle?.goalGroups || [];
      const goal = groups.find(g => g.key === goalKey);
      const filter = goal?.campaign_ids?.length ? `&campaign_ids=${goal.campaign_ids.join(",")}` : "";
      const res = await fetch(`${API}/public/${token}?since=${startDate}&until=${endDate}${filter}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBundle(prev => ({ ...data, goalGroups: data.goalGroups?.length ? data.goalGroups : (prev?.goalGroups || []) }));
      if (goalKey === null && data.goalGroups?.length) setGoalKey(data.goalGroups[0].key);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [token, startDate, endDate, activeGoalKey, bundle?.goalGroups]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [startDate, endDate]);

  const applyPreset = days => {
    const e = new Date(); e.setDate(e.getDate() - 1);
    const s = new Date(e); if (days > 1) s.setDate(s.getDate() - (days - 1));
    setStartDate(toYMD(s)); setEndDate(toYMD(e)); setPreset(days);
  };

  const type = bundle?.dashboard?.type || "app";
  const conv = bundle?.dashboard?.conversion_event || "app_install";
  const goal = (bundle?.goalGroups || []).find(g => g.key === activeGoalKey);
  const actionTypes = goal?.action_types || null;
  const effType = goal ? goal.type : type;
  const effConv = goal ? goal.conv_event : conv;

  const rows = bundle ? (bundle.account || []).map(r => parseRow(r, effType, effConv, actionTypes)).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const ads  = bundle ? (bundle.ads || []).map(r => parseRow(r, effType, effConv, actionTypes)) : [];
  const totals = rows.length ? computeTotals(rows) : null;
  const metrics = getMetrics(effType, effConv);
  const activeMeta = metrics.find(m => m.key === activeMetric) || metrics[0];
  const creativeMap = {};
  for (const c of (bundle?.creatives || [])) if (c.thumbnail_url) creativeMap[c.id] = c;

  if (loading && !bundle) return <Centered><div style={{ fontSize: 44 }}>📊</div><p style={{ color: "#888", marginTop: 12 }}>Loading dashboard…</p></Centered>;
  if (error && !bundle) return <Centered><div style={{ fontSize: 44 }}>🔒</div><p style={{ color: "#f87171", marginTop: 12, maxWidth: 380, textAlign: "center" }}>{error}</p></Centered>;

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#fff", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ borderBottom: "1px solid #2a2a3e", background: "#1e1e2e" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <img src={spLogo} alt="SP" style={{ height: 30 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bundle?.dashboard?.name}</h1>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#22c55e" }}>● Live read-only view</p>
          </div>
          {typeBadge[type] && (
            <span style={{ fontSize: 12, color: typeBadge[type].color, background: typeBadge[type].color + "22", borderRadius: 6, padding: "3px 10px", fontWeight: 600 }}>{typeBadge[type].label}</span>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px" }}>
        <div style={{ ...S.card, padding: 14, marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div><p style={{ margin: "0 0 5px", fontSize: 11, color: "#888" }}>START</p><input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPreset(0); }} style={S.inp} /></div>
          <div><p style={{ margin: "0 0 5px", fontSize: 11, color: "#888" }}>END</p><input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPreset(0); }} style={S.inp} /></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[{ l: "Yesterday", d: 1 }, { l: "7d", d: 7 }, { l: "14d", d: 14 }, { l: "30d", d: 30 }].map(({ l, d }) => (
              <button key={d} onClick={() => applyPreset(d)} style={{ ...S.btn(preset === d ? "#6c63ff" : "#2a2a3e", preset === d ? "#fff" : "#aaa"), border: `1px solid ${preset === d ? "#6c63ff" : "transparent"}` }}>{l}</button>
            ))}
          </div>
          {loading && <span style={{ fontSize: 12, color: "#666" }}>Refreshing…</span>}
        </div>

        {(bundle?.goalGroups || []).length > 0 && (
          <div style={{ marginBottom: 18, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {bundle.goalGroups.map(g => (
              <button key={g.key} onClick={() => { setGoalKey(g.key); load(g.key); }} style={{
                background: activeGoalKey === g.key ? "#1877f222" : "#2a2a3e",
                border: `1px solid ${activeGoalKey === g.key ? "#1877f2" : "transparent"}`,
                borderRadius: 8, padding: "8px 14px", color: activeGoalKey === g.key ? "#4b9cf5" : "#aaa",
                cursor: "pointer", fontSize: 12, fontWeight: activeGoalKey === g.key ? 700 : 400,
              }}>{g.label}</button>
            ))}
          </div>
        )}

        {!totals && !loading && <p style={{ color: "#555", textAlign: "center", marginTop: 60 }}>No data for this period</p>}

        {totals && (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 10, marginBottom: 20 }}>
            {metrics.map(m => {
              const active = activeMetric === m.key;
              return (
                <div key={m.key} onClick={() => setActive(m.key)} style={{
                  ...S.card, padding: "12px 14px", cursor: "pointer",
                  border: `1px solid ${active ? m.color : "#2a2a3e"}`,
                  background: active ? m.color + "18" : "#1e1e2e",
                }}>
                  <p style={{ margin: "0 0 4px", fontSize: 10, color: active ? m.color : "#666", fontWeight: 600 }}>{m.label.toUpperCase()}</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{m.format(totals[m.key] || 0)}</p>
                </div>
              );
            })}
          </div>

          <div style={{ ...S.card, padding: 16, marginBottom: 20 }}>
            <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>{activeMeta.label} <span style={{ color: "#555", fontWeight: 400, fontSize: 12 }}>— daily</span></p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={rows}>
                <CartesianGrid stroke="#1e1e2e" />
                <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 9 }} />
                <YAxis tick={{ fill: "#555", fontSize: 9 }} width={55} tickFormatter={v => activeMeta.format(v)} />
                <Tooltip contentStyle={{ background: "#13131f", border: `1px solid ${activeMeta.color}`, borderRadius: 8, fontSize: 12 }} formatter={v => [activeMeta.format(v), activeMeta.label]} />
                <Line type="monotone" dataKey={activeMetric} stroke={activeMeta.color} strokeWidth={2.5} dot={{ r: 3, fill: activeMeta.color }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {ads.filter(a => a.spend > 0).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <CreativeCockpit ads={ads} creatives={creativeMap} dashType={effType} />
            </div>
          )}
        </>)}

        <p style={{ textAlign: "center", color: "#444", fontSize: 11, marginTop: 30 }}>Powered by SP Media Dashboards</p>
      </div>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#fff", fontFamily: "system-ui,sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      {children}
    </div>
  );
}
