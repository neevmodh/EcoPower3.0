#!/usr/bin/env node
// Real units for the Society panel (#89/#90) — society_admin/society_member
// had zero linked service_connections before this; the panel queried
// `orgs` and had two dead nav links. Additive to seed_demo_users.mjs, safe
// to re-run.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//   services/ingest/node_modules/.bin/tsx scripts/seed_society_units.mjs [--days=21]

import pg from "pg";
import { pvYieldKw } from "../packages/shared/src/ami/pv-yield.ts";
import { deriveHouseholdProfile, householdLoadKw } from "../packages/shared/src/ami/appliance-load.ts";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required");
  process.exit(1);
}
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const daysArg = process.argv.find((a) => a.startsWith("--days="));
const DAYS = daysArg ? Number(daysArg.split("=")[1]) : 21;
const TICK_MINUTES = 15;

const SOCIETY_ORG_ID = "30000000-0000-0000-0000-000000000002";
// Sunrise Residency sits on Feeder A (same feeder as the primary demo
// consumer) but on its OWN distribution transformer with a society main
// meter — which is how a housing society is actually fed, and which keeps
// its consumption out of DT A-21's loss accounting (a shared DT with no
// head meter for the society's load would show a phantom negative loss).
const FEEDER_A = "30000000-0000-0000-0000-0000000000a2";

function uuid(seed) {
  return `30000000-0000-0000-0000-0001${seed}`;
}

const DT_SUN = uuid("00000d01"); // "DT A-24" — Sunrise Residency's own DT
const DTM_SUN = uuid("0000ed01"); // its society-main / DT-head meter
// A well-maintained in-society network: small, real distribution loss
// between the society main and the flat sub-meters.
const SOCIETY_LOSS_FACTOR = 0.025;

// Six flats, allocation_pct summing to exactly 100 — a real, checkable
// invariant the Allocation page displays and lets a society_admin edit.
const UNITS = [
  { id: uuid("00000101"), consumerNumber: "SUN-101", sanctionedKw: 3, allocationPct: 20 },
  { id: uuid("00000102"), consumerNumber: "SUN-102", sanctionedKw: 3, allocationPct: 15 },
  { id: uuid("00000103"), consumerNumber: "SUN-103", sanctionedKw: 4, allocationPct: 20 },
  { id: uuid("00000104"), consumerNumber: "SUN-104", sanctionedKw: 2, allocationPct: 10 },
  { id: uuid("00000105"), consumerNumber: "SUN-105", sanctionedKw: 4, allocationPct: 20 },
  { id: uuid("00000106"), consumerNumber: "SUN-106", sanctionedKw: 3, allocationPct: 15 },
];

async function adminFetch(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

async function upsert(path, rows) {
  const res = await adminFetch(path, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`seed failed for ${path}: ${res.status} ${JSON.stringify(res.body)}`);
}

function seasonalAmbientC(month) {
  const table = { 1: 20, 2: 24, 3: 30, 4: 35, 5: 38, 6: 36, 7: 30, 8: 29, 9: 30, 10: 32, 11: 27, 12: 21 };
  return table[month] ?? 28;
}
function seasonalCloudFraction(month, dayRand) {
  const monsoon = month >= 7 && month <= 9;
  const base = monsoon ? 0.55 : 0.12;
  return Math.min(0.95, Math.max(0, base + (dayRand - 0.5) * 0.4));
}
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

async function seedUnitsAndMeters() {
  await upsert("/rest/v1/distribution_transformers", [
    { id: DT_SUN, feeder_id: FEEDER_A, name: "DT A-24", capacity_kva: 100 },
  ]);
  await upsert("/rest/v1/meters", [
    { id: DTM_SUN, serial: "DTM-SUN", status: "active", dt_id: DT_SUN },
  ]);

  await upsert(
    "/rest/v1/service_connections",
    UNITS.map((u) => ({
      id: u.id,
      consumer_number: u.consumerNumber,
      dt_id: DT_SUN,
      owner_user_id: null,
      society_org_id: SOCIETY_ORG_ID,
      allocation_pct: u.allocationPct,
      tariff_category: "RGP",
      phase: u.sanctionedKw > 3 ? "three" : "single",
      connection_type: "postpaid",
      sanctioned_load_kw: u.sanctionedKw,
      connected_load_kw: u.sanctionedKw * 0.85,
    })),
  );

  await upsert(
    "/rest/v1/meters",
    UNITS.map((u, i) => ({
      id: uuid(`0000f${String(i).padStart(3, "0")}`),
      serial: `MTR-${u.consumerNumber}`,
      status: "active",
      service_connection_id: u.id,
    })),
  );

  const total = UNITS.reduce((sum, u) => sum + u.allocationPct, 0);
  console.log(`Seeded ${UNITS.length} society units (allocation_pct total: ${total}%).`);
}

async function ensurePartitions(client, fromDate, toDate) {
  const months = new Set();
  const d = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1));
  while (d <= toDate) {
    months.add(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  for (const m of months) await client.query("select create_monthly_partition($1::date)", [m]);
}

async function copyRows(client, columnList, rows) {
  if (rows.length === 0) return;
  const { from: copyFrom } = await import("pg-copy-streams");
  await client.query("begin");
  await client.query("create temporary table _society_batch (like meter_readings including defaults) on commit drop");
  const copyStream = client.query(copyFrom(`copy _society_batch (${columnList}) from stdin with (format csv)`));
  const csvField = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(csvField).join(",")).join("\n");
  await new Promise((resolve, reject) => {
    copyStream.on("error", reject);
    copyStream.on("finish", resolve);
    copyStream.end(`${csv}\n`);
  });
  await client.query(
    `insert into meter_readings (${columnList}) select ${columnList} from _society_batch on conflict (meter_id, reading_ts) do nothing`,
  );
  await client.query("commit");
}

const COLUMNS = [
  "meter_id", "reading_ts", "kwh_import", "kwh_export", "delta_import_kwh", "delta_export_kwh",
  "interval_seconds", "source", "quality", "tamper_flags",
].join(", ");

// Resting value for the live tile — mirrors the helper in seed_discom_fleet.mjs.
async function upsertLiveState(client, rows) {
  if (rows.length === 0) return;
  const last = rows[rows.length - 1];
  const [meterId, ts, kwhImport, kwhExport, dImp, dExp, intervalS] = last;
  const activePowerKw = round3((dImp - dExp) / (intervalS / 3600));
  await client.query(
    `insert into meter_live_state
       (meter_id, last_reading_ts, kwh_import, kwh_export, active_power_kw, quality, tamper_flags)
     values ($1, $2, $3, $4, $5, 'good', 0)
     on conflict (meter_id) do update set
       last_reading_ts = excluded.last_reading_ts,
       kwh_import      = excluded.kwh_import,
       kwh_export      = excluded.kwh_export,
       active_power_kw = excluded.active_power_kw,
       quality         = excluded.quality,
       tamper_flags    = excluded.tamper_flags`,
    [meterId, ts, kwhImport, kwhExport, activePowerKw],
  );
}

async function backfillUnits(client, days) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const { rows: unitMeters } = await client.query(
    `select m.id as meter_id, m.serial, sc.sanctioned_load_kw
     from meters m join service_connections sc on sc.id = m.service_connection_id
     where sc.society_org_id = $1`,
    [SOCIETY_ORG_ID],
  );

  // day (YYYY-MM-DD) -> summed flat consumption, for the society main meter.
  const dailyTotal = new Map();

  for (const meter of unitMeters) {
    const rand = mulberry32(meter.meter_id.split("-").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 17));
    let cumImport = 0;
    const cumExport = 0;
    const profile = deriveHouseholdProfile(meter.serial, meter.sanctioned_load_kw ?? 3);
    const rows = [];
    let ts = new Date(start);
    let lastDay = -1;
    let dayCloudBase = 0.1;

    while (ts <= now) {
      const dayOfYear = Math.floor(ts.getTime() / 86400000);
      if (dayOfYear !== lastDay) {
        dayCloudBase = rand();
        lastDay = dayOfYear;
      }
      const month = ts.getUTCMonth() + 1;
      const ambientTempC = seasonalAmbientC(month) + (rand() - 0.5) * 3;
      const cloudCoverFraction = seasonalCloudFraction(month, dayCloudBase);
      const hourLocal = (ts.getUTCHours() + ts.getUTCMinutes() / 60 + 5.5) % 24;
      const isWeekend = ts.getUTCDay() === 0 || ts.getUTCDay() === 6;

      // Residential flats, no rooftop PV of their own — consumption only,
      // same as the "unmetered" service types' honesty principle applied
      // to generation: a flat doesn't get credited kWh it doesn't produce.
      const loadKw = householdLoadKw({ profile, hourLocal, isWeekend, ambientTempC, month });
      const deltaImport = loadKw * (TICK_MINUTES / 60);
      cumImport += deltaImport;

      const dayKey = ts.toISOString().slice(0, 10);
      dailyTotal.set(dayKey, (dailyTotal.get(dayKey) ?? 0) + deltaImport);

      rows.push([
        meter.meter_id, ts.toISOString(), round3(cumImport), round3(cumExport),
        round3(deltaImport), 0, TICK_MINUTES * 60, "meter", "good", 0,
      ]);

      ts = new Date(ts.getTime() + TICK_MINUTES * 60 * 1000);
    }

    for (let i = 0; i < rows.length; i += 3000) {
      await copyRows(client, COLUMNS, rows.slice(i, i + 3000));
    }
    await upsertLiveState(client, rows);
    process.stdout.write(`  ${meter.serial}: ${rows.length} readings\n`);
  }

  // Society main meter (DT head): delivered = summed flat consumption plus
  // the small in-society distribution loss. One daily reading, same shape
  // as seed_discom_fleet.mjs's DT-head meters, so dt_loss_summary() has a
  // real delivered-vs-consumed reference for DT A-24.
  const headRows = [];
  let cumHead = 0;
  for (const day of [...dailyTotal.keys()].sort()) {
    const delivered = dailyTotal.get(day) * (1 + SOCIETY_LOSS_FACTOR);
    cumHead += delivered;
    headRows.push([
      DTM_SUN, new Date(`${day}T12:00:00.000Z`).toISOString(), round3(cumHead), 0,
      round3(delivered), 0, 86400, "meter", "good", 0,
    ]);
  }
  await copyRows(client, COLUMNS, headRows);
  await upsertLiveState(client, headRows);
  process.stdout.write(`  DTM-SUN: ${headRows.length} daily readings (society main, ${(SOCIETY_LOSS_FACTOR * 100).toFixed(1)}% loss)\n`);
}

async function main() {
  console.log("Seeding society units...");
  await seedUnitsAndMeters();

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  const client = await pool.connect();
  try {
    const now = new Date();
    const start = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000);
    await ensurePartitions(client, start, now);

    console.log(`Backfilling ${DAYS} days for ${UNITS.length} unit meters...`);
    await backfillUnits(client, DAYS);

    console.log("\nDone.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
