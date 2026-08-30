#!/usr/bin/env node
// Backfills months of real physically-modelled meter history for the demo
// consumer(s), so analytics/carbon/AI features have genuine trend data to
// show instead of one thin fixture row. This is deliberately NOT #58 (seed
// 10M+ readings for query-performance testing across every DT/division) —
// that's a separate, larger job for the demo-proof sprint. This is scoped
// to "enough real history for the consumer surfaces to be meaningful."
//
// Reuses the exact same tick() physics (#12) and copyMeterReadings() bulk
// loader (#15) the real simulator/ingest worker use — #58's own issue text
// specifically calls out 2.0's seed script for using Math.random() scatter
// instead of a real diurnal/seasonal shape; this doesn't repeat that.
//
// Usage:
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//   node scripts/seed_large_dataset.mjs [--days=120]

import pg from "pg";
import { pvYieldKw } from "../packages/shared/src/ami/pv-yield.ts";
import { deriveHouseholdProfile, householdLoadKw } from "../packages/shared/src/ami/appliance-load.ts";

// Reuses the exact same physics (#12) as apps/simulator/src/meter-tick.ts,
// recomposed locally — run via `tsx` (not plain `node`), same as every
// other TS entrypoint in this repo (services/ingest's own "start" script).
function istHour(date) {
  const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60;
  return (utcHour + 5.5) % 24;
}

function initMeterState(meter) {
  return {
    cumulativeImportKwh: 0,
    cumulativeExportKwh: 0,
    profile: deriveHouseholdProfile(meter.serial, meter.sanctionedLoadKw),
  };
}

function tick(meter, state, conditions) {
  const hourLocal = istHour(conditions.now);
  const month = conditions.now.getUTCMonth() + 1;
  const day = conditions.now.getUTCDay();
  const isWeekend = day === 0 || day === 6;

  const loadKw = householdLoadKw({
    profile: state.profile,
    hourLocal,
    isWeekend,
    ambientTempC: conditions.ambientTempC,
    month,
  });

  const pvKw =
    meter.pvCapacityKw > 0
      ? pvYieldKw({
          date: conditions.now,
          hourUTC: conditions.now.getUTCHours() + conditions.now.getUTCMinutes() / 60,
          capacityKw: meter.pvCapacityKw,
          cloudCoverFraction: conditions.cloudCoverFraction,
          ambientTempC: conditions.ambientTempC,
        })
      : 0;

  const netKw = loadKw - pvKw;

  const nextState = {
    ...state,
    cumulativeImportKwh: state.cumulativeImportKwh + Math.max(0, netKw) * conditions.tickHours,
    cumulativeExportKwh: state.cumulativeExportKwh + Math.max(0, -netKw) * conditions.tickHours,
  };

  return {
    state: nextState,
    reading: {
      instantaneous: {
        voltageR: 230 + (Math.random() - 0.5) * 4,
        voltageY: 230 + (Math.random() - 0.5) * 4,
        voltageB: 230 + (Math.random() - 0.5) * 4,
        currentR: netKw >= 0 ? (netKw * 1000) / 230 / 3 : 0,
        currentY: netKw >= 0 ? (netKw * 1000) / 230 / 3 : 0,
        currentB: netKw >= 0 ? (netKw * 1000) / 230 / 3 : 0,
        powerFactor: 0.95 + Math.random() * 0.04,
        frequencyHz: 50 + (Math.random() - 0.5) * 0.1,
      },
    },
    loadKw,
    pvKw,
    netKw,
  };
}

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const daysArg = process.argv.find((a) => a.startsWith("--days="));
const DAYS = daysArg ? Number(daysArg.split("=")[1]) : 120;
const TICK_MINUTES = 15;

const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

// Ahmedabad's real seasonal shape (DATA.md territory): hot Mar-Jun,
// monsoon-cloudy Jul-Sep, mild Nov-Feb. Deterministic per calendar day, not
// per-tick noise, so a day reads as one coherent day, not static.
function seasonalAmbientC(month) {
  const table = { 1: 20, 2: 24, 3: 30, 4: 35, 5: 38, 6: 36, 7: 30, 8: 29, 9: 30, 10: 32, 11: 27, 12: 21 };
  return table[month] ?? 28;
}
function seasonalCloudFraction(month, dayRand) {
  const monsoon = month >= 7 && month <= 9;
  const base = monsoon ? 0.55 : 0.12;
  return Math.min(0.95, Math.max(0, base + (dayRand - 0.5) * 0.4));
}

// mulberry32, same PRNG as appliance-load.ts, for reproducible day-to-day
// cloud variance without importing an internal (unexported) helper.
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

async function ensurePartitions(client, fromDate, toDate) {
  const months = new Set();
  const d = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1));
  while (d <= toDate) {
    months.add(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  for (const m of months) {
    await client.query("select create_monthly_partition($1::date)", [m]);
  }
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

async function backfillMeter(client, meter, days) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const rand = mulberry32(meter.id.split("-").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));

  let state = initMeterState({ serial: meter.serial, sanctionedLoadKw: meter.sanctioned_load_kw ?? 5 });
  const pvCapacityKw = meter.sanctioned_load_kw ? Math.min(meter.sanctioned_load_kw, 5) : 5;
  const simMeter = { serial: meter.serial, sanctionedLoadKw: meter.sanctioned_load_kw ?? 5, pvCapacityKw };

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

    const result = tick(simMeter, state, {
      now: new Date(ts),
      cloudCoverFraction,
      ambientTempC,
      tickHours: TICK_MINUTES / 60,
    });
    state = result.state;

    const deltaImport = state.cumulativeImportKwh - (rows.length ? rows[rows.length - 1]._cumImport : 0);
    const deltaExport = state.cumulativeExportKwh - (rows.length ? rows[rows.length - 1]._cumExport : 0);

    rows.push({
      meterId: meter.id,
      readingTs: ts.toISOString(),
      kwhImport: round3(state.cumulativeImportKwh),
      kwhExport: round3(state.cumulativeExportKwh),
      deltaImportKwh: round3(deltaImport),
      deltaExportKwh: round3(deltaExport),
      intervalSeconds: TICK_MINUTES * 60,
      source: "meter",
      quality: "good",
      tamperFlags: 0,
      voltageR: round3(result.reading.instantaneous.voltageR),
      voltageY: round3(result.reading.instantaneous.voltageY),
      voltageB: round3(result.reading.instantaneous.voltageB),
      currentR: round3(result.reading.instantaneous.currentR),
      currentY: round3(result.reading.instantaneous.currentY),
      currentB: round3(result.reading.instantaneous.currentB),
      powerFactor: round3(result.reading.instantaneous.powerFactor),
      frequencyHz: round3(result.reading.instantaneous.frequencyHz),
      _cumImport: state.cumulativeImportKwh,
      _cumExport: state.cumulativeExportKwh,
    });

    ts = new Date(ts.getTime() + TICK_MINUTES * 60 * 1000);
  }

  const BATCH = 3000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map(({ _cumImport, _cumExport, ...r }) => r);
    await copyMeterReadingsInline(client, batch);
    process.stdout.write(`  ${meter.serial}: ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
  }
  console.log(`  ${meter.serial}: ${rows.length} readings backfilled`);
  return rows.length;
}

const COLUMNS = [
  "meter_id", "reading_ts", "kwh_import", "kwh_export", "delta_import_kwh", "delta_export_kwh",
  "interval_seconds", "source", "quality", "tamper_flags", "voltage_r", "voltage_y", "voltage_b",
  "current_r", "current_y", "current_b", "power_factor", "frequency_hz",
];

function csvField(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function copyMeterReadingsInline(client, rows) {
  if (rows.length === 0) return;
  const { from: copyFrom } = await import("pg-copy-streams");
  await client.query("begin");
  await client.query("create temporary table _seed_batch (like meter_readings including defaults) on commit drop");
  const columnList = COLUMNS.join(", ");
  const copyStream = client.query(copyFrom(`copy _seed_batch (${columnList}) from stdin with (format csv)`));
  const csv = rows
    .map((r) =>
      [
        r.meterId, r.readingTs, r.kwhImport, r.kwhExport, r.deltaImportKwh, r.deltaExportKwh,
        r.intervalSeconds, r.source, r.quality, r.tamperFlags, r.voltageR, r.voltageY, r.voltageB,
        r.currentR, r.currentY, r.currentB, r.powerFactor, r.frequencyHz,
      ]
        .map(csvField)
        .join(","),
    )
    .join("\n");
  await new Promise((resolve, reject) => {
    copyStream.on("error", reject);
    copyStream.on("finish", resolve);
    copyStream.end(csv + "\n");
  });
  await client.query(
    `insert into meter_readings (${columnList}) select ${columnList} from _seed_batch on conflict (meter_id, reading_ts) do nothing`,
  );
  await client.query("commit");
}

async function main() {
  const client = await pool.connect();
  try {
    const now = new Date();
    const start = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000);
    console.log(`Ensuring partitions for ${DAYS} days back from now...`);
    await ensurePartitions(client, start, now);

    const { rows: meters } = await client.query(
      `select m.id, m.serial, sc.sanctioned_load_kw
       from meters m
       join service_connections sc on sc.id = m.service_connection_id
       where m.status = 'active'`,
    );

    if (meters.length === 0) {
      console.log("No active meters found — run scripts/seed_demo_users.mjs first.");
      return;
    }

    console.log(`Backfilling ${DAYS} days (15-min ticks) for ${meters.length} meter(s)...`);
    let total = 0;
    for (const meter of meters) {
      total += await backfillMeter(client, meter, DAYS);
    }
    console.log(`\nDone — ${total} readings inserted across ${meters.length} meter(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
