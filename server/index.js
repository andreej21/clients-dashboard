require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Resend } = require("resend");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
const { supabase, initDb } = require("./db");
const { authMiddleware, adminOnly } = require("./auth");

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT = process.env.PORT || 3001;
const META_BASE = "https://graph.facebook.com/v18.0";
const META_TOKEN = process.env.META_TOKEN;
const GOOGLE_ADS_BASE = "https://googleads.googleapis.com/v19";
const GOOGLE_DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

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

// ── Google Ads token helper ─────────────────────────────
async function getGoogleAccessToken() {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: params });
  const data = await r.json();
  if (!data.access_token) throw new Error("Failed to get Google access token: " + JSON.stringify(data));
  return data.access_token;
}

// ── Google Ads API query helper ─────────────────────────
// ── Google Ads API query helper ─────────────────────────
async function googleAdsQuery(customerId, query) {
  const accessToken = await getGoogleAccessToken();
  const cleanId = customerId.replace(/-/g, "");
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": GOOGLE_DEV_TOKEN,
    "Content-Type": "application/json",
  };
  if (process.env.GOOGLE_MCC_ID) {
    headers["login-customer-id"] = process.env.GOOGLE_MCC_ID.replace(/-/g, "");
  }
  const r = await fetch(`${GOOGLE_ADS_BASE}/customers/${cleanId}/googleAds:search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.results || [];
}


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

app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  try {
    const { data: user } = await supabase
      .from("users").select("id, email").eq("email", email.toLowerCase().trim()).single();
    if (!user) return res.json({ success: true });
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 1000 * 60 * 60);
    await supabase.from("password_resets").upsert({
      user_id: user.id, token, expires_at: expires.toISOString(),
    }, { onConflict: "user_id" });
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await resend.emails.send({
      from: "noreply@streetpoller.com",
      to: user.email,
      subject: "Reset your SP Media password",
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px;">
          <h2 style="color:#6366f1;margin:0 0 8px">SP Media Dashboards</h2>
          <p style="color:#aaa;margin:0 0 24px">Password reset request</p>
          <p style="color:#fff;margin:0 0 20px">Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Reset Password</a>
          <p style="color:#555;font-size:12px;margin:24px 0 0">If you didn't request this, ignore this email.</p>
        </div>
      `,
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "Token and password required" });
  try {
    const { data: reset } = await supabase
      .from("password_resets").select("*, users(id, email)").eq("token", token).single();
    if (!reset) return res.status(400).json({ error: "Invalid or expired reset link" });
    if (new Date(reset.expires_at) < new Date()) return res.status(400).json({ error: "Reset link has expired" });
    const hash = await bcrypt.hash(password, 10);
    await supabase.from("users").update({ password: hash }).eq("id", reset.user_id);
    await supabase.from("password_resets").delete().eq("token", token);
    res.json({ success: true });
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
  const { name, act_id, type = "app", conversion_event, page_token } = req.body;
  if (!name || !act_id) return res.status(400).json({ error: "Name and act_id required" });
  const isGoogle  = type === "google";
  const isOrganic = type === "organic";
  const cleanActId = (isGoogle || isOrganic) ? act_id.replace(/-/g, "") : (act_id.startsWith("act_") ? act_id : `act_${act_id}`);
  const defaultEvent = type === "app" ? "app_install" : type === "lead" ? "lead" : type === "ecom" ? "purchase" : "none";
  const insertObj = { name, act_id: cleanActId, type, conversion_event: conversion_event || defaultEvent };
  if (page_token) insertObj.page_token = page_token;
  const { data, error } = await supabase.from("dashboards")
    .insert(insertObj)
    .select().single();
  if (error) {
    if (error.code === "23505") return res.status(400).json({ error: "Act ID already exists" });
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

app.patch("/api/admin/dashboards/:id", authMiddleware, adminOnly, async (req, res) => {
  const { name, act_id, type, conversion_event, page_token } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (act_id) {
    const isOrganic = type === "organic" || type === "google";
    updates.act_id = isOrganic ? act_id.replace(/-/g, "") : (act_id.startsWith("act_") ? act_id : `act_${act_id}`);
  }
  if (type) updates.type = type;
  if (conversion_event) updates.conversion_event = conversion_event;
  if (page_token !== undefined) updates.page_token = page_token || null;
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
  const safeFields = "id, name, act_id, type, conversion_event, created_at";
  if (req.user.role === "admin") {
    const { data } = await supabase.from("dashboards").select(safeFields).order("name");
    return res.json(data || []);
  }
  const { data } = await supabase.from("dashboard_access")
    .select(`role, dashboards(${safeFields})`).eq("user_id", req.user.id);
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

// ── Google Ads Proxy ────────────────────────────────────

app.get("/api/dashboards/:id/google/account", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (!await checkDashboardAccess(req, res, dashId)) return;
  const { data: dash } = await supabase.from("dashboards").select("act_id, type").eq("id", dashId).single();
  if (!dash) return res.status(404).json({ error: "Dashboard not found" });
  const { since, until } = req.query;
  try {
    const results = await googleAdsQuery(dash.act_id, `
      SELECT
        segments.date,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_per_conversion,
        metrics.ctr,
        metrics.average_cpc,
        metrics.average_cpm
      FROM customer
      WHERE segments.date BETWEEN '${since}' AND '${until}'
      ORDER BY segments.date ASC
    `);
    const data = results.map(r => ({
      date: r.segments?.date,
      spend: (r.metrics?.costMicros || 0) / 1_000_000,
      impressions: r.metrics?.impressions || 0,
      clicks: r.metrics?.clicks || 0,
      conversions: r.metrics?.conversions || 0,
      cpa: r.metrics?.costPerConversion ? r.metrics.costPerConversion / 1_000_000 : 0,
      ctr: (r.metrics?.ctr || 0) * 100,
      cpc: (r.metrics?.averageCpc || 0) / 1_000_000,
      cpm: (r.metrics?.averageCpm || 0) / 1_000_000,
    }));
    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/dashboards/:id/google/campaigns", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (!await checkDashboardAccess(req, res, dashId)) return;
  const { data: dash } = await supabase.from("dashboards").select("act_id").eq("id", dashId).single();
  if (!dash) return res.status(404).json({ error: "Dashboard not found" });
  const { since, until } = req.query;
  try {
    const results = await googleAdsQuery(dash.act_id, `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_per_conversion,
        metrics.ctr,
        metrics.average_cpc,
        metrics.average_cpm
      FROM campaign
      WHERE segments.date BETWEEN '${since}' AND '${until}'
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
    `);
    const data = results.map(r => ({
      id: r.campaign?.id,
      name: r.campaign?.name,
      status: r.campaign?.status,
      spend: (r.metrics?.costMicros || 0) / 1_000_000,
      impressions: r.metrics?.impressions || 0,
      clicks: r.metrics?.clicks || 0,
      conversions: r.metrics?.conversions || 0,
      cpa: r.metrics?.costPerConversion ? r.metrics.costPerConversion / 1_000_000 : 0,
      ctr: (r.metrics?.ctr || 0) * 100,
      cpc: (r.metrics?.averageCpc || 0) / 1_000_000,
      cpm: (r.metrics?.averageCpm || 0) / 1_000_000,
    }));
    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/dashboards/:id/google/adgroups", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (!await checkDashboardAccess(req, res, dashId)) return;
  const { data: dash } = await supabase.from("dashboards").select("act_id").eq("id", dashId).single();
  if (!dash) return res.status(404).json({ error: "Dashboard not found" });
  const { since, until } = req.query;
  try {
    const results = await googleAdsQuery(dash.act_id, `
      SELECT
        ad_group.id,
        ad_group.name,
        campaign.name,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_per_conversion,
        metrics.ctr,
        metrics.average_cpc,
        metrics.average_cpm
      FROM ad_group
      WHERE segments.date BETWEEN '${since}' AND '${until}'
        AND ad_group.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
    `);
    const data = results.map(r => ({
      id: r.adGroup?.id,
      name: r.adGroup?.name,
      campaignName: r.campaign?.name,
      spend: (r.metrics?.costMicros || 0) / 1_000_000,
      impressions: r.metrics?.impressions || 0,
      clicks: r.metrics?.clicks || 0,
      conversions: r.metrics?.conversions || 0,
      cpa: r.metrics?.costPerConversion ? r.metrics.costPerConversion / 1_000_000 : 0,
      ctr: (r.metrics?.ctr || 0) * 100,
      cpc: (r.metrics?.averageCpc || 0) / 1_000_000,
      cpm: (r.metrics?.averageCpm || 0) / 1_000_000,
    }));
    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/dashboards/:id/google/keywords", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (!await checkDashboardAccess(req, res, dashId)) return;
  const { data: dash } = await supabase.from("dashboards").select("act_id").eq("id", dashId).single();
  if (!dash) return res.status(404).json({ error: "Dashboard not found" });
  const { since, until } = req.query;
  try {
    const results = await googleAdsQuery(dash.act_id, `
      SELECT
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group.name,
        campaign.name,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_per_conversion,
        metrics.ctr,
        metrics.average_cpc,
        metrics.average_cpm
      FROM keyword_view
      WHERE segments.date BETWEEN '${since}' AND '${until}'
        AND ad_group_criterion.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
    `);
    const data = results.map(r => ({
      keyword: r.adGroupCriterion?.keyword?.text,
      matchType: r.adGroupCriterion?.keyword?.matchType,
      adGroupName: r.adGroup?.name,
      campaignName: r.campaign?.name,
      spend: (r.metrics?.costMicros || 0) / 1_000_000,
      impressions: r.metrics?.impressions || 0,
      clicks: r.metrics?.clicks || 0,
      conversions: r.metrics?.conversions || 0,
      cpa: r.metrics?.costPerConversion ? r.metrics.costPerConversion / 1_000_000 : 0,
      ctr: (r.metrics?.ctr || 0) * 100,
      cpc: (r.metrics?.averageCpc || 0) / 1_000_000,
      cpm: (r.metrics?.averageCpm || 0) / 1_000_000,
    }));
    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Facebook OAuth flow ──────────────────────────────────

app.get("/api/facebook/auth-start", authMiddleware, adminOnly, (req, res) => {
  const { dash_id } = req.query;
  if (!dash_id) return res.status(400).json({ error: "dash_id required" });
  const params = new URLSearchParams({
    client_id:    process.env.FACEBOOK_APP_ID,
    redirect_uri: `${process.env.BACKEND_URL}/api/facebook/callback`,
    state:        dash_id,
    scope:        "pages_show_list,pages_read_engagement,pages_read_user_content,read_insights,instagram_basic,instagram_manage_insights",
    response_type: "code",
  });
  res.redirect(`https://www.facebook.com/dialog/oauth?${params}`);
});

app.get("/api/facebook/callback", async (req, res) => {
  const { code, state: dash_id, error: fbError } = req.query;
  const frontendAdmin = `${process.env.FRONTEND_URL}/admin`;
  if (fbError) return res.redirect(`${frontendAdmin}?fb_error=${encodeURIComponent(fbError)}`);
  try {
    // 1. Exchange code for short-lived user token
    const codeRes  = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&redirect_uri=${encodeURIComponent(`${process.env.BACKEND_URL}/api/facebook/callback`)}&code=${code}`);
    const codeJson = await codeRes.json();
    if (codeJson.error) throw new Error(codeJson.error.message);

    // 2. Exchange for long-lived user token (~60 days)
    const llRes  = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&fb_exchange_token=${codeJson.access_token}`);
    const llJson = await llRes.json();
    if (llJson.error) throw new Error(llJson.error.message);

    // 3. Get all pages this user manages + their Page Access Tokens
    const pagesRes  = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${llJson.access_token}`);
    const pagesJson = await pagesRes.json();
    if (pagesJson.error) throw new Error(pagesJson.error.message);

    // 4. Look up which page ID this dashboard uses
    const { data: dash } = await supabase.from("dashboards").select("act_id").eq("id", dash_id).single();
    if (!dash) throw new Error("Dashboard not found");

    // 5. Find the matching page and grab its token
    const page = (pagesJson.data || []).find(p => p.id === dash.act_id);
    if (!page) throw new Error(`Page ${dash.act_id} not found in this Facebook account. Make sure you log in as the page admin.`);

    // 6. Save Page Access Token to DB
    await supabase.from("dashboards").update({ page_token: page.access_token }).eq("id", dash_id);

    res.redirect(`${frontendAdmin}?fb_connected=1`);
  } catch (e) {
    res.redirect(`${frontendAdmin}?fb_error=${encodeURIComponent(e.message)}`);
  }
});

// ── Organic: Facebook Page ───────────────────────────────

app.get("/api/dashboards/:id/organic/facebook", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (!await checkDashboardAccess(req, res, dashId)) return;
  const { data: dash } = await supabase.from("dashboards").select("act_id, page_token").eq("id", dashId).single();
  if (!dash) return res.status(404).json({ error: "Dashboard not found" });
  if (!dash.page_token) return res.status(400).json({ error: "No page_token configured for this dashboard" });
  const pageId = dash.act_id;
  const token  = dash.page_token;
  const { since, until } = req.query;
  try {
    const timeRange = `since=${since}&until=${until}`;

    // Step 1: Exchange the stored token for a Page Access Token + get fan_count
    const pageInfoRes  = await fetch(`${META_BASE}/${pageId}?fields=fan_count,access_token&access_token=${token}`);
    const pageInfoJson = await pageInfoRes.json();
    if (pageInfoJson.error) throw new Error(`[page-info] ${pageInfoJson.error.message || JSON.stringify(pageInfoJson.error)}`);
    const pageToken = pageInfoJson.access_token || token;
    const fanCount  = pageInfoJson.fan_count || 0;

    // Step 2: Fetch ALL content types in parallel:
    //   /published_posts → regular posts, photos, links
    //   /video_posts     → Facebook Reels + native videos (NOT returned by /published_posts)
    // Merge and deduplicate by post ID.
    const postFields = "id,message,created_time,full_picture,permalink_url,reactions.summary(total_count),shares,comments.summary(total_count)";
    const [pubRes, vidRes] = await Promise.all([
      fetch(`${META_BASE}/${pageId}/published_posts?fields=${postFields}&${timeRange}&limit=100&access_token=${pageToken}`),
      fetch(`${META_BASE}/${pageId}/video_posts?fields=${postFields}&${timeRange}&limit=100&access_token=${pageToken}`),
    ]);
    const [pubJson, vidJson] = await Promise.all([pubRes.json(), vidRes.json()]);
    if (pubJson.error) throw new Error(`[posts] ${pubJson.error.message || JSON.stringify(pubJson.error)}`);
    // video_posts errors are non-fatal (page may not have videos)
    const pubPosts = pubJson.data || [];
    const vidPosts = vidJson.error ? [] : (vidJson.data || []);
    // Merge and deduplicate (video_posts and published_posts can overlap for video entries)
    const seenIds   = new Set(pubPosts.map(p => p.id));
    const allRawPosts = [...pubPosts, ...vidPosts.filter(p => !seenIds.has(p.id))];
    // Sort merged list by date descending
    allRawPosts.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));
    const postsJson = { data: allRawPosts };

    // Step 3: Probe each page-level insight metric INDIVIDUALLY (in parallel).
    // Many v1 metrics are deprecated for New Pages Experience pages in v17+.
    // We try all candidates and keep whichever ones the API accepts.
    const METRIC_CANDIDATES = [
      // ── NPE-compatible (New Pages Experience) ─────────────────
      "page_post_engagements",        // total engagements on page posts
      "page_views_total",             // total page visits/views
      "page_daily_follows",           // new followers per day (NPE replacement for page_fan_adds)
      "page_daily_unfollows",         // lost followers per day (NPE)
      "page_posts_impressions",       // impressions on page posts (NPE replacement for page_impressions)
      "page_video_views",             // video views (NPE)
      "page_content_activity",        // reactions + comments + shares on posts (NPE)
      // ── Legacy metrics (still work on classic pages) ──────────
      "page_fan_adds_unique",         // new unique followers per day (legacy)
      "page_impressions",             // total impressions (legacy)
      "page_engaged_users",           // unique engaged users (legacy)
      "page_fans",                    // cumulative fans over time (legacy)
    ];
    const metricResults = {};  // metric → array of value points (only when non-empty)
    const metricErrors  = {};  // metric → error string
    const metricNoData  = [];  // metrics that returned OK but had no values in this range
    await Promise.all(METRIC_CANDIDATES.map(async (metric) => {
      try {
        const url = `${META_BASE}/${pageId}/insights?metric=${metric}&period=day&${timeRange}&access_token=${pageToken}`;
        const r   = await fetch(url);
        const j   = await r.json();
        if (j.error) {
          metricErrors[metric] = `(${j.error.code}) ${j.error.message}`;
        } else {
          const values = j.data?.[0]?.values || [];
          if (values.length > 0) {
            metricResults[metric] = values;  // has real data
          } else {
            metricNoData.push(metric);       // API accepted metric but no data in range
          }
        }
      } catch (e) {
        metricErrors[metric] = e.message;
      }
    }));

    // Build a daily map from whichever metrics have actual data
    const dailyMap = {};
    for (const [metric, values] of Object.entries(metricResults)) {
      for (const point of values) {
        const date = point.end_time.split("T")[0];
        if (!dailyMap[date]) dailyMap[date] = { date };
        dailyMap[date][metric] = point.value;
      }
    }
    const insights         = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
    const availableMetrics = Object.keys(metricResults);  // only metrics with real data

    // Build insightsError message from what failed / returned no data
    let insightsError = null;
    if (availableMetrics.length === 0) {
      const errParts = [];
      if (Object.keys(metricErrors).length > 0)
        errParts.push(`API errors: ${JSON.stringify(metricErrors)}`);
      if (metricNoData.length > 0)
        errParts.push(`No data in range for: ${metricNoData.join(', ')}`);
      insightsError = errParts.length > 0 ? errParts.join(' | ') : 'No insight data returned';
    }

    // Summary: page_fans always from fan_count (it's a cumulative total — don't sum daily values).
    // All other metrics are daily counts so we sum them over the period.
    const summary = insights.reduce((acc, row) => {
      for (const m of availableMetrics) {
        if (m === "page_fans") continue;  // handled separately via fanCount
        acc[m] = (acc[m] || 0) + (row[m] || 0);
      }
      return acc;
    }, { page_fans: fanCount });

    // Step 4: Build posts array — reactions/shares/comments come from the posts API (reliable).
    // Per-post impressions/reach require the Insights API per post which often fails;
    // instead we use page_posts_impressions (page-level) for the total in postTotals.
    const rawPosts = postsJson.data || [];
    const posts = rawPosts.map(post => ({
      id:            post.id,
      message:       post.message || "",
      created_time:  post.created_time,
      full_picture:  post.full_picture || null,
      permalink_url: post.permalink_url,
      reactions:     post.reactions?.summary?.total_count || 0,
      shares:        post.shares?.count                   || 0,
      comments:      post.comments?.summary?.total_count  || 0,
    }));

    // Aggregate post totals from posts API (reactions/shares/comments always work).
    // For total_views use page_posts_impressions from page-level insights (reliable).
    const postTotals = posts.reduce((acc, p) => {
      acc.total_reactions += p.reactions;
      acc.total_shares    += p.shares;
      acc.total_comments  += p.comments;
      return acc;
    }, {
      total_reactions: 0,
      total_shares:    0,
      total_comments:  0,
      // page-level totals (from insights — more reliable than per-post API)
      total_views:     summary.page_posts_impressions || 0,
      total_video_views: summary.page_video_views     || 0,
    });

    res.json({ insights, summary, posts, postTotals, insightsError, availableMetrics, metricErrors, metricNoData });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Organic: Instagram ────────────────────────────────────

app.get("/api/dashboards/:id/organic/instagram", authMiddleware, async (req, res) => {
  const dashId = parseInt(req.params.id);
  if (!await checkDashboardAccess(req, res, dashId)) return;
  const { data: dash } = await supabase.from("dashboards").select("act_id, page_token").eq("id", dashId).single();
  if (!dash) return res.status(404).json({ error: "Dashboard not found" });
  if (!dash.page_token) return res.status(400).json({ error: "No page_token configured" });
  const pageId = dash.act_id;
  const token  = dash.page_token;
  const { since, until } = req.query;
  try {
    // Step 1: Exchange System User token for Page Access Token + resolve Instagram account
    const igLookupRes  = await fetch(`${META_BASE}/${pageId}?fields=access_token,instagram_business_account&access_token=${token}`);
    const igLookupJson = await igLookupRes.json();
    const pageToken = igLookupJson.access_token || token; // use Page token for subsequent calls
    if (igLookupJson.error) throw new Error(igLookupJson.error.message || JSON.stringify(igLookupJson.error));
    if (!igLookupJson.instagram_business_account?.id) {
      return res.json({ error: "not_connected" });
    }
    const igId = igLookupJson.instagram_business_account.id;
    const timeRange = `since=${since}&until=${until}`;
    // Step 2: Probe each IG metric individually (same pattern as FB — keeps whatever works).
    // NOTE: In IG API v17+, "impressions" was renamed to "views". Other new metrics added.
    const IG_METRIC_CANDIDATES = [
      "views",               // replaces "impressions" in v17+
      "reach",               // unique accounts that saw content
      "profile_views",       // profile page visits per day
      "accounts_engaged",    // accounts that interacted with content
      "total_interactions",  // likes + comments + shares + saves combined
      "follower_count",      // daily follower change (not cumulative)
      "website_clicks",      // link in bio clicks
    ];
    const igMetricResults = {};
    const igMetricErrors  = {};
    await Promise.all(IG_METRIC_CANDIDATES.map(async (metric) => {
      try {
        const url = `${META_BASE}/${igId}/insights?metric=${metric}&period=day&${timeRange}&access_token=${pageToken}`;
        const r   = await fetch(url);
        const j   = await r.json();
        if (j.error) {
          igMetricErrors[metric] = `(${j.error.code}) ${j.error.message}`;
        } else {
          const values = j.data?.[0]?.values || [];
          if (values.length > 0) igMetricResults[metric] = values;
        }
      } catch (e) { igMetricErrors[metric] = e.message; }
    }));

    // Build daily insights map from successful metrics
    const igDailyMap = {};
    for (const [metric, values] of Object.entries(igMetricResults)) {
      for (const point of values) {
        const date = point.end_time.split("T")[0];
        if (!igDailyMap[date]) igDailyMap[date] = { date };
        igDailyMap[date][metric] = point.value;
      }
    }
    const insights           = Object.values(igDailyMap).sort((a, b) => a.date.localeCompare(b.date));
    const igAvailableMetrics = Object.keys(igMetricResults);
    const summary = insights.reduce((acc, row) => {
      for (const m of igAvailableMetrics) acc[m] = (acc[m] || 0) + (row[m] || 0);
      return acc;
    }, {});

    // Step 3: Fetch IG media — reactions/saves/shares come from media fields (no insights call needed)
    const igMediaUrl = `${META_BASE}/${igId}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,permalink&${timeRange}&limit=50&access_token=${pageToken}`;
    const mediaRes  = await fetch(igMediaUrl);
    const mediaJson = await mediaRes.json();
    // media errors are non-fatal
    const media = (mediaJson.error ? [] : (mediaJson.data || [])).map(post => ({
      id:             post.id,
      caption:        post.caption        || "",
      media_type:     post.media_type,
      timestamp:      post.timestamp,
      like_count:     post.like_count     || 0,
      comments_count: post.comments_count || 0,
      thumbnail_url:  post.thumbnail_url  || null,
      permalink:      post.permalink      || null,
    }));

    res.json({ insights, summary, media, igAvailableMetrics, igMetricErrors });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Start ───────────────────────────────────────────────

initDb().then(() => {
  app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
});
