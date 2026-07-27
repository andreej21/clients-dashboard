require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function initDb() {
  // Create tables via Supabase SQL
  const { error: e1 } = await supabase.rpc("exec_sql", {
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS dashboards (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        act_id TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS dashboard_access (
        id SERIAL PRIMARY KEY,
        dashboard_id INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'viewer',
        UNIQUE(dashboard_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS dashboard_shares (
        id SERIAL PRIMARY KEY,
        dashboard_id INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        label TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        revoked BOOLEAN DEFAULT FALSE
      );
      ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS monthly_budget NUMERIC;
      ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS pixel_id TEXT UNIQUE;
      CREATE TABLE IF NOT EXISTS pixel_events (
        id BIGSERIAL PRIMARY KEY,
        dashboard_id INTEGER REFERENCES dashboards(id) ON DELETE CASCADE,
        visitor_id TEXT,
        event_name TEXT NOT NULL,
        value NUMERIC,
        currency TEXT,
        click_id TEXT,
        click_platform TEXT,
        utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
        landing_page TEXT, page_url TEXT, referrer TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pixel_events_dash_time ON pixel_events (dashboard_id, created_at DESC);
    `
  });

  // If rpc not available, create tables directly
  await supabase.from("users").select("id").limit(1).then(async ({ error }) => {
    if (error && error.code === "42P01") {
      console.log("Tables need to be created manually in Supabase SQL editor");
    }
  });

  // Seed admin
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", process.env.ADMIN_EMAIL)
    .single();

  if (!existing) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    const { error } = await supabase
      .from("users")
      .insert({ email: process.env.ADMIN_EMAIL, password: hash, role: "admin" });
    if (!error) console.log(`✅ Admin user created: ${process.env.ADMIN_EMAIL}`);
    else console.log("Admin seed error:", error.message);
  }

  console.log("✅ Database ready");
}

module.exports = { supabase, initDb };