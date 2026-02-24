require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
const { supabase, initDb } = require("./db");
const { authMiddleware, adminOnly } = require("./auth");

const app = express();
const PORT = process.env.PORT || 3001;
const META_BASE = "https://graph.facebook.com/v18.0";
const META_TOKEN = process.env.META_TOKEN;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json());

// ── Auth ────────────────────────────────────────────────

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  try {
    const { data: user, error } = await supabase
      .from("users").select("*").eq("email", email.toLowerCase().trim()).single();
    if (error || !user) return res.status(401).json({ error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: Users ────────────────────────────────────────

app.get("/api/admin/users", authMiddleware, adminOnly, async (req, res) => {
  const { data, error } = await supabase.from("users").select("id, email, role, created_at").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/admin/users", authMiddleware, adminOnly, async (req, res) => {
  const { email, password, role = "viewer" } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from("users").insert({ email: email.toLowerCase().trim(), password: hash, role })
      .select("id, email, role").single();
    if (error) {
      if (error.code === "23505") return res.status(400).json({ error: "Email already exists" });
      return res.status(500).json({ error: error.message });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/admin/users/:id", authMiddleware, adminOnly, async (req, res) => {
  await supabase.from("users").delete().eq("id", req.params.id);
  res.json({ success: true });
});

// ── Admin: Dashboards ───────────────────────────────────

app.get("/api/admin/dashboards", authMiddleware, adminOnly, async (req, res) => {
  const { data: dashboards, error } = await supabase.from("dashboards").select("*").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const result = await Promise.all(dashboards.map(async d => {
    const { data: access } = await supabase
      .from("dashboard_access").select("role, users(id, email)").eq("dashboard_id", d.id);
    return { ...d, users: access?.map(a => ({ id: a.users.id, email: a.users.email, role: a.role })) || [] };
  }));
  res.json(result);
});

app.post("/api/admin/dashboards", authMiddleware, adminOnly, async (req, res) => {
  const { name, act_id, type = "app", conversion_event } = req.body;
  if (!name || !act_id) return res.status(400).json({ error: "Name and act_id required" });
  const cleanActId = act_id.startsWith("act_") ? act_id : `act_${act_id}`;
  const defaultEvent = type === "app" ? "app_install" : type === "lead" ? "lead" : "purchase";
  const { data, error } = await supabase.from("dashboards")
    .insert({ name, act_id: cleanActId, type, conversion_event: conversion_event || defaultEvent })
    .select().single();
  if (error) {
    if (error.code === "23505") return res.status(400).json({ error: "Act ID already exists" });
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

app.patch("/api/admin/dashboards/:id", authMiddleware, adminOnly, async (req, res) => {
  const { name, act_id, type, conversion_event } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (act_id) updates.act_id = act_id.startsWith("act_") ? act_id : `act_${act_id}`;
  if (type) updates.type = type;
  if (conversion_event) updates.conversion_event = conversion_event;
  const { data, error } = await supabase.from("dashboards").update(updates).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/admin/dashboards/:id", authMiddleware, adminOnly, async (req, res) => {
  await supabase.from("dashboards").delete().eq("id", req.params.id);
  res.json({ success: true });
});

// ── Dashboard Access ────────────────────────────────────

app.post("/api/dashboards/:id/access", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  const { user_id, role = "viewer" } = req.body;
  try {
    if (req.user.role !== "admin") {
      const { data } = await supabase.from("dashboard_access")
        .select("id").eq("dashboard_id", dashId).eq("user_id", req.user.id).eq("role", "manager").single();
      if (!data) return res.status(403).json({ error: "No permission" });
    }
    const { data, error } = await supabase.from("dashboard_access")
      .upsert({ dashboard_id: dashId, user_id, role }, { onConflict: "dashboard_id,user_id" })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/dashboards/:id/access/:userId", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  const userId = parseInt(req.params.userId);
  if (req.user.role !== "admin") {
    const { data } = await supabase.from("dashboard_access")
      .select("id").eq("dashboard_id", dashId).eq("user_id", req.user.id).eq("role", "manager").single();
    if (!data) return res.status(403).json({ error: "No permission" });
  }
  await supabase.from("dashboard_access").delete().eq("dashboard_id", dashId).eq("user_id", userId);
  res.json({ success: true });
});

// ── Client: My Dashboards ───────────────────────────────

app.get("/api/my-dashboards", authMiddleware, async (req, res) => {
  if (req.user.role === "admin") {
    const { data } = await supabase.from("dashboards").select("*").order("name");
    return res.json(data || []);
  }
  const { data } = await supabase.from("dashboard_access")
    .select("role, dashboards(*)").eq("user_id", req.user.id);
  res.json(data?.map(d => ({ ...d.dashboards, access_role: d.role })) || []);
});

app.get("/api/dashboards/:id/access", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (req.user.role !== "admin") {
    const { data } = await supabase.from("dashboard_access")
      .select("role").eq("dashboard_id", dashId).eq("user_id", req.user.id).single();
    if (!data) return res.status(403).json({ error: "No access" });
  }
  const { data } = await supabase.from("dashboard_access")
    .select("role, users(id, email)").eq("dashboard_id", dashId);
  res.json(data?.map(a => ({ id: a.users.id, email: a.users.email, role: a.role })) || []);
});

// ── Annotations ────────────────────────────────────────

app.get("/api/dashboards/:id/annotations", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (!await checkDashboardAccess(req, res, dashId)) return;
  const { data, error } = await supabase.from("annotations")
    .select("id, date, note, created_at, users(email)")
    .eq("dashboard_id", dashId).order("date");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/dashboards/:id/annotations", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (!await checkDashboardAccess(req, res, dashId)) return;
  const { date, note } = req.body;
  if (!date || !note) return res.status(400).json({ error: "Date and note required" });
  const { data, error } = await supabase.from("annotations")
    .upsert({ dashboard_id: dashId, date, note, created_by: req.user.id }, { onConflict: "dashboard_id,date" })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/dashboards/:id/annotations/:annotId", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (!await checkDashboardAccess(req, res, dashId)) return;
  await supabase.from("annotations").delete().eq("id", req.params.annotId).eq("dashboard_id", dashId);
  res.json({ success: true });
});

// ── Meta API Proxy ──────────────────────────────────────

async function fetchAllPages(url) {
  let results = [], nextUrl = url;
  while (nextUrl) {
    const res = await fetch(nextUrl);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    results = results.concat(data.data || []);
    nextUrl = data.paging?.next || null;
  }
  return results;
}

async function checkDashboardAccess(req, res, dashId) {
  if (req.user.role === "admin") return true;
  const { data } = await supabase.from("dashboard_access")
    .select("id").eq("dashboard_id", dashId).eq("user_id", req.user.id).single();
  if (!data) { res.status(403).json({ error: "No access to this dashboard" }); return false; }
  return true;
}

function getFields(type) {
  const base = "date_start,spend,impressions,reach,cpm,cost_per_unique_outbound_click,unique_outbound_clicks_ctr,actions,cost_per_action_type";
  if (type === "ecom") return base + ",action_values";
  return base;
}

app.get("/api/dashboards/:id/insights/campaigns", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (!await checkDashboardAccess(req, res, dashId)) return;
  const { data: dash } = await supabase.from("dashboards").select("act_id, type, conversion_event").eq("id", dashId).single();
  if (!dash) return res.status(404).json({ error: "Dashboard not found" });
  const { since, until } = req.query;
  const fields = `campaign_id,campaign_name,${getFields(dash.type)}`;
  const url = `${META_BASE}/${dash.act_id}/insights?fields=${fields}&level=campaign&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=100&access_token=${META_TOKEN}`;
  try {
    const data = await fetchAllPages(url);
    res.json({ data, type: dash.type, conversion_event: dash.conversion_event });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/dashboards/:id/insights/adsets", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (!await checkDashboardAccess(req, res, dashId)) return;
  const { data: dash } = await supabase.from("dashboards").select("act_id, type, conversion_event").eq("id", dashId).single();
  if (!dash) return res.status(404).json({ error: "Dashboard not found" });
  const { since, until, campaign_id } = req.query;
  const fields = `adset_id,adset_name,campaign_id,campaign_name,${getFields(dash.type)}`;
  let url = `${META_BASE}/${dash.act_id}/insights?fields=${fields}&level=adset&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=100&access_token=${META_TOKEN}`;
  if (campaign_id) url += `&filtering=${encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaign_id }]))}`;
  try {
    const data = await fetchAllPages(url);
    res.json({ data, type: dash.type, conversion_event: dash.conversion_event });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/dashboards/:id/insights/account", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (!await checkDashboardAccess(req, res, dashId)) return;
  const { data: dash } = await supabase.from("dashboards").select("act_id, type, conversion_event").eq("id", dashId).single();
  if (!dash) return res.status(404).json({ error: "Dashboard not found" });
  const { since, until } = req.query;
  const url = `${META_BASE}/${dash.act_id}/insights?fields=${getFields(dash.type)}&level=account&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&time_increment=1&limit=100&access_token=${META_TOKEN}`;
  try {
    const data = await fetchAllPages(url);
    res.json({ data, type: dash.type, conversion_event: dash.conversion_event });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/dashboards/:id/insights/ads", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (!await checkDashboardAccess(req, res, dashId)) return;
  const { data: dash } = await supabase.from("dashboards").select("act_id, type, conversion_event").eq("id", dashId).single();
  if (!dash) return res.status(404).json({ error: "Dashboard not found" });
  const { since, until } = req.query;
  const adFields = `ad_id,ad_name,adset_name,campaign_name,spend,impressions,reach,cpm,cost_per_unique_outbound_click,unique_outbound_clicks_ctr,actions,cost_per_action_type${dash.type === "ecom" ? ",action_values" : ""}`;
  const url = `${META_BASE}/${dash.act_id}/insights?fields=${adFields}&level=ad&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=100&access_token=${META_TOKEN}`;
  try {
    const data = await fetchAllPages(url);
    res.json({ data, type: dash.type, conversion_event: dash.conversion_event });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Start ───────────────────────────────────────────────

initDb().then(() => {
  app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
});