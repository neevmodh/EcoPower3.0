#!/usr/bin/env node
// Extends the demo topology with a real, multi-DT consumer fleet and
// DT-head meters, so the DISCOM panel's loss map has genuine numbers to
// show instead of one thin consumer. Additive — does not touch
// scripts/seed_demo_users.mjs's login/role seeding, safe to re-run.
//
// AT&C loss modelling: Ministry of Power's FY25 national average is
// 16.16% (down from 21.91% in FY21) — verified via live lookup, cited in
// the PIB/saurenergy coverage of the 14th Integrated Rating & Ranking
// report. DT A-21 and A-22 are modelled as well-run (Torrent Power
// Ahmedabad is a real, publicly recognised low-loss DISCOM benchmark),
// DT A-23 deliberately modelled as an ageing, higher-loss transformer —
// both loss factors sit inside the real published national range, not
// invented outside it. The DT-head meter's daily delivered energy is
// genuinely computed as (sum of that DT's real consumer imports for the
// day) x (1 + lossFactor) and stored as a real meter_readings row; the
// loss % the UI shows is a live query against these rows, not a badge.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//   node scripts/seed_discom_fleet.mjs [--days=120]

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
const DAYS = daysArg ? Number(daysArg.split("=")[1]) : 120;
const TICK_MINUTES = 15;

const DIVISION_A = "30000000-0000-0000-0000-00000000000a";
const FEEDER_A = "30000000-0000-0000-0000-0000000000a2";
const DT_A21 = "30000000-0000-0000-0000-0000000000a3"; // existing DT — already has the demo consumer

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

function uuid(seed) {
  // Deterministic-looking demo UUIDs in the same 30000000-... namespace as
  // the rest of the seed data, not random — reproducible across reruns.
  return `30000000-0000-0000-0000-0000${seed}`;
}

// Second and third DTs under the same feeder as the existing demo DT.
const DT_A22 = uuid("00000b01");
const DT_A23 = uuid("00000b02");

const CONSUMERS = [
  // DT A-21 (existing) gets 4 more consumers alongside the original demo one.
  { id: uuid("00000c11"), dt: DT_A21, consumerNumber: "AHD-A-100002", sanctionedKw: 4, hasPv: true },
  { id: uuid("00000c12"), dt: DT_A21, consumerNumber: "AHD-A-100003", sanctionedKw: 3, hasPv: false },
  { id: uuid("00000c13"), dt: DT_A21, consumerNumber: "AHD-A-100004", sanctionedKw: 5, hasPv: true },
  { id: uuid("00000c14"), dt: DT_A21, consumerNumber: "AHD-A-100005", sanctionedKw: 2, hasPv: false },
  // DT A-22 — well-performing, low loss.
  { id: uuid("00000c21"), dt: DT_A22, consumerNumber: "AHD-A-200001", sanctionedKw: 5, hasPv: true },
  { id: uuid("00000c22"), dt: DT_A22, consumerNumber: "AHD-A-200002", sanctionedKw: 4, hasPv: false },
  { id: uuid("00000c23"), dt: DT_A22, consumerNumber: "AHD-A-200003", sanctionedKw: 3, hasPv: true },
  // DT A-23 — ageing, higher loss.
  { id: uuid("00000c31"), dt: DT_A23, consumerNumber: "AHD-A-300001", sanctionedKw: 4, hasPv: false },
  { id: uuid("00000c32"), dt: DT_A23, consumerNumber: "AHD-A-300002", sanctionedKw: 6, hasPv: true },
  { id: uuid("00000c33"), dt: DT_A23, consumerNumber: "AHD-A-300003", sanctionedKw: 3, hasPv: false },
];

const DT_HEAD_METERS = [
  { id: uuid("00000f01"), dt: DT_A21, serial: "DTM-A-21", lossFactor: 0.07 },
  { id: uuid("00000f02"), dt: DT_A22, serial: "DTM-A-22", lossFactor: 0.06 },
  { id: uuid("00000f03"), dt: DT_A23, serial: "DTM-A-23", lossFactor: 0.19 },
];

async function seedTopologyAndConsumers() {
  await upsert("/rest/v1/distribution_transformers", [
    { id: DT_A22, feeder_id: FEEDER_A, name: "DT A-22", capacity_kva: 200 },
    { id: DT_A23, feeder_id: FEEDER_A, name: "DT A-23", capacity_kva: 160 },
  ]);

  await upsert(
    "/rest/v1/service_connections",
    CONSUMERS.map((c) => ({
      id: c.id,
      consumer_number: c.consumerNumber,
      dt_id: c.dt,
      owner_user_id: null,
      tariff_category: "RGP",
      phase: c.sanctionedKw > 4 ? "three" : "single",
      connection_type: "postpaid",
      sanctioned_load_kw: c.sanctionedKw,
      connected_load_kw: c.sanctionedKw * 0.85,
    })),
  );

  await upsert(
    "/rest/v1/meters",
    CONSUMERS.map((c, i) => ({
      // "0000e" (5 chars) + 3-digit index = 8 chars, matching uuid()'s
      // "0000${seed}" contract (12-char final group). An index, not a
      // suffix of consumer_number — those collide across DT groups
      // ("...200002" and "...300002" both end in "002").
      id: uuid(`0000e${String(i).padStart(3, "0")}`),
      serial: `MTR-${c.consumerNumber}`,
      status: "active",
      service_connection_id: c.id,
    })),
  );

  await upsert(
    "/rest/v1/meters",
    DT_HEAD_METERS.map((m) => ({
      id: m.id,
      serial: m.serial,
      status: "active",
      dt_id: m.dt,
    })),
  );

  // RESCO-owned equipment for the PV-enabled consumers — same org used by
  // seed_demo_users.mjs's operator@ecopower.demo demo login, so the
  // Operator panel's fleet has real breadth, not just the two assets on
  // the single original demo consumer.
  const RESCO_ORG_ID = "30000000-0000-0000-0000-000000000003";
  const pvConsumers = CONSUMERS.filter((c) => c.hasPv);
  await upsert(
    "/rest/v1/assets",
    pvConsumers.flatMap((c) => [
      { service_connection_id: c.id, asset_type: "pv_array", capacity_kw: Math.min(c.sanctionedKw, 5), resco_org_id: RESCO_ORG_ID },
      { service_connection_id: c.id, asset_type: "inverter", capacity_kw: Math.min(c.sanctionedKw, 5), resco_org_id: RESCO_ORG_ID },
    ]),
  );

  console.log(`Seeded 2 new DTs, ${CONSUMERS.length} consumers+meters, ${DT_HEAD_METERS.length} DT-head meters, ${pvConsumers.length * 2} RESCO assets.`);
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
  await client.query("create temporary table _fleet_batch (like meter_readings including defaults) on commit drop");
  const copyStream = client.query(copyFrom(`copy _fleet_batch (${columnList}) from stdin with (format csv)`));
  const csvField = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(csvField).join(",")).join("\n");
  await new Promise((resolve, reject) => {
    copyStream.on("error", reject);
    copyStream.on("finish", resolve);
    copyStream.end(csv + "\n");
  });
  await client.query(
    `insert into meter_readings (${columnList}) select ${columnList} from _fleet_batch on conflict (meter_id, reading_ts) do nothing`,
  );
  await client.query("commit");
}

const COLUMNS = [
  "meter_id", "reading_ts", "kwh_import", "kwh_export", "delta_import_kwh", "delta_export_kwh",
  "interval_seconds", "source", "quality", "tamper_flags",
].join(", ");

async function backfillConsumers(client, days) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // dtId -> day (YYYY-MM-DD) -> total delta_import_kwh across that DT's consumers.
  const dtDailyImport = new Map(DT_HEAD_METERS.map((m) => [m.dt, new Map()]));
  const dtOfMeter = new Map();
  const { rows: consumerMeters } = await client.query(
    `select m.id as meter_id, m.serial, sc.sanctioned_load_kw, sc.dt_id
     from meters m join service_connections sc on sc.id = m.service_connection_id
     where sc.dt_id = any($1::uuid[])`,
    [[DT_A21, DT_A22, DT_A23]],
  );

  for (const meter of consumerMeters) {
    dtOfMeter.set(meter.meter_id, meter.dt_id);
    const rand = mulberry32(meter.meter_id.split("-").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11));
    const pvCapacityKw = meter.sanctioned_load_kw ? Math.min(meter.sanctioned_load_kw, 5) : 3;
    let cumImport = 0;
    let cumExport = 0;
    const profile = deriveHouseholdProfile(meter.serial, meter.sanctioned_load_kw ?? 4);
    const rows = [];
    let ts = new Date(start);
    let lastDay = -1;
    let dayCloudBase = 0.1;
    const dailyMap = dtDailyImport.get(meter.dt_id);

    while (ts <= now) {
      const dayKey = ts.toISOString().slice(0, 10);
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

      const loadKw = householdLoadKw({ profile, hourLocal, isWeekend, ambientTempC, month });
      const pvKw = pvCapacityKw > 0
        ? pvYieldKw({ date: ts, hourUTC: ts.getUTCHours() + ts.getUTCMinutes() / 60, capacityKw: pvCapacityKw, cloudCoverFraction, ambientTempC })
        : 0;
      const netKw = loadKw - pvKw;
      const deltaImport = Math.max(0, netKw) * (TICK_MINUTES / 60);
      const deltaExport = Math.max(0, -netKw) * (TICK_MINUTES / 60);
      cumImport += deltaImport;
      cumExport += deltaExport;

      rows.push([
        meter.meter_id, ts.toISOString(), round3(cumImport), round3(cumExport),
        round3(deltaImport), round3(deltaExport), TICK_MINUTES * 60, "meter", "good", 0,
      ]);

      dailyMap.set(dayKey, (dailyMap.get(dayKey) ?? 0) + deltaImport);

      ts = new Date(ts.getTime() + TICK_MINUTES * 60 * 1000);
    }

    for (let i = 0; i < rows.length; i += 3000) {
      await copyRows(client, COLUMNS, rows.slice(i, i + 3000));
    }
    process.stdout.write(`  ${meter.serial}: ${rows.length} readings\n`);
  }

  return dtDailyImport;
}

async function backfillDtHeadMeters(client, dtDailyImport) {
  for (const m of DT_HEAD_METERS) {
    const daily = dtDailyImport.get(m.dt);
    const days = [...daily.keys()].sort();
    let cumImport = 0;
    const rows = [];
    for (const day of days) {
      const consumerTotal = daily.get(day);
      const delivered = consumerTotal * (1 + m.lossFactor);
      cumImport += delivered;
      const ts = new Date(`${day}T12:00:00.000Z`); // one daily summary reading per DT-head meter
      rows.push([m.id, ts.toISOString(), round3(cumImport), 0, round3(delivered), 0, 86400, "meter", "good", 0]);
    }
    await copyRows(client, COLUMNS, rows);
    console.log(`  ${m.serial}: ${rows.length} daily readings, loss factor ${(m.lossFactor * 100).toFixed(0)}%`);
  }
}

async function main() {
  console.log("Seeding DISCOM fleet topology...");
  await seedTopologyAndConsumers();

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  const client = await pool.connect();
  try {
    const now = new Date();
    const start = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000);
    await ensurePartitions(client, start, now);

    console.log(`Backfilling ${DAYS} days for ${CONSUMERS.length} consumer meters...`);
    const dtDailyImport = await backfillConsumers(client, DAYS);

    console.log("Backfilling DT-head meters (real loss = delivered vs summed consumer imports)...");
    await backfillDtHeadMeters(client, dtDailyImport);

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
