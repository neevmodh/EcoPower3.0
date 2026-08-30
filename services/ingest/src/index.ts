// services/ingest — MQTT subscriber, runs as service_role (#15). Consumes
// #12's simulator (and eventually real meters via #48), verifies each
// reading, computes deltas, batch-COPYs into meter_readings, UPSERTs
// meter_live_state, and broadcasts on Realtime for live dashboards (#18).

import { createClient } from "@supabase/supabase-js";
import mqtt from "mqtt";
import { Pool } from "pg";
import { verifySignature, isWithinReplayWindow, isFromTheFuture, type SignedPayload } from "./hmac.js";
import { evaluateRegister, type RegisterState } from "./monotonicity.js";
import { Batcher } from "./batcher.js";
import { copyMeterReadings, type MeterReadingRow } from "./copy-writer.js";

const MQTT_HOST = process.env.MQTT_HOST ?? "metro.proxy.rlwy.net";
const MQTT_PORT = Number(process.env.MQTT_PORT ?? "45248");
const MQTT_INGEST_USERNAME = process.env.MQTT_INGEST_USERNAME ?? "ecopower_ingest";
const MQTT_INGEST_PASSWORD = requireEnv("MQTT_INGEST_PASSWORD");
const DATABASE_URL = requireEnv("DATABASE_URL");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name}`);
  return value;
}

// Per-meter HMAC secrets. #48 (commissioning) is where real per-device
// secret retrieval from proper storage lands; meters.device_secret_hash is
// a one-way hash and cannot itself verify a signature, so a lookup table is
// the honest interim — the same deliberate-scope-limit pattern as #10/#11.
function loadDeviceSecrets(): Map<string, string> {
  const secrets = new Map<string, string>();
  for (const [key, value] of Object.entries(process.env)) {
    const match = /^METER_(.+)_SECRET$/.exec(key);
    if (match && value) {
      const serial = match[1].replace(/_/g, "-");
      secrets.set(serial, value);
    }
  }
  return secrets;
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const deviceSecrets = loadDeviceSecrets();

// meterId -> obis -> last known register state. Cold on startup — the first
// reading per meter/register always resolves to "first-reading" and is
// stored without a delta, matching evaluateRegister's contract.
const registerStates = new Map<string, RegisterState>();

const readingsBatcher = new Batcher<MeterReadingRow>({
  maxRows: 500,
  maxWaitMs: 200,
  flush: (rows) => copyMeterReadings(pool, rows),
  onError: (err, rows) => console.error(`[ingest] batch flush failed (${rows.length} rows):`, err),
});

async function quarantine(meterSerial: string, meterId: string, readingTs: string, rawPayload: unknown, reason: string) {
  console.warn(`[quarantine] ${meterSerial} ${reason}`);
  await pool.query(
    "insert into quarantine_readings (meter_id, reading_ts, raw_payload, reason) values ($1, $2, $3, $4)",
    [meterId, readingTs, JSON.stringify(rawPayload), reason],
  );
}

async function recordRollover(meterId: string, obis: string, previousValue: number, newValue: number) {
  console.warn(`[rollover] meter=${meterId} obis=${obis} ${previousValue} -> ${newValue}`);
  await pool.query(
    "insert into meter_rollover_events (meter_id, obis, previous_value, new_value) values ($1, $2, $3, $4)",
    [meterId, obis, previousValue, newValue],
  );
}

async function upsertLiveState(row: MeterReadingRow) {
  await pool.query(
    `insert into meter_live_state (meter_id, last_reading_ts, kwh_import, kwh_export, active_power_kw, voltage_r, voltage_y, voltage_b, quality, tamper_flags)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (meter_id) do update set
       last_reading_ts = excluded.last_reading_ts,
       kwh_import = excluded.kwh_import,
       kwh_export = excluded.kwh_export,
       active_power_kw = excluded.active_power_kw,
       voltage_r = excluded.voltage_r,
       voltage_y = excluded.voltage_y,
       voltage_b = excluded.voltage_b,
       quality = excluded.quality,
       tamper_flags = excluded.tamper_flags`,
    [
      row.meterId,
      row.readingTs,
      row.kwhImport,
      row.kwhExport,
      // Instantaneous active power isn't a register; approximate from current*voltage
      // for the three-phase sum, good enough for the live tile, not for billing.
      row.currentR != null && row.voltageR != null
        ? ((row.currentR + (row.currentY ?? 0) + (row.currentB ?? 0)) * row.voltageR) / 1000
        : null,
      row.voltageR,
      row.voltageY,
      row.voltageB,
      row.quality,
      row.tamperFlags,
    ],
  );
}

// Realtime Broadcast over the REST endpoint directly — no DB round trip, no
// per-row RLS, no websocket subscription lifecycle for a stateless worker
// to manage. supabase-js's channel.httpSend() wraps this same endpoint but
// its response parsing errors on this stack's 202 Accepted / empty body
// (confirmed by calling the endpoint directly, which returns 202 cleanly);
// calling it directly sidesteps that client-side bug.
async function broadcastLiveReading(meterId: string, row: MeterReadingRow) {
  const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          topic: `meter:${meterId}`,
          event: "reading",
          payload: { meterId, readingTs: row.readingTs, kwhImport: row.kwhImport, kwhExport: row.kwhExport },
        },
      ],
    }),
  });
  if (!res.ok) {
    console.error(`[realtime] broadcast failed for meter ${meterId}: ${res.status} ${await res.text()}`);
  }
}

async function handleMessage(topic: string, payloadBuf: Buffer) {
  const serialMatch = /^ecopower\/v1\/([^/]+)\/readings$/.exec(topic);
  if (!serialMatch) return;
  const serial = serialMatch[1];

  let payload: SignedPayload;
  try {
    payload = JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    console.error(`[ingest] ${serial} sent unparseable JSON, dropping`);
    return;
  }

  const secret = deviceSecrets.get(serial);
  if (!secret) {
    console.error(`[ingest] ${serial} has no known device secret, dropping`);
    return;
  }

  if (!verifySignature(payload, secret)) {
    console.error(`[ingest] ${serial} signature verification FAILED, dropping`);
    return;
  }

  if (!isWithinReplayWindow(payload.reading.timestamp)) {
    console.warn(`[ingest] ${serial} reading outside replay window, dropping as a likely replay`);
    return;
  }

  // Resolve the meter's internal uuid. meters.serial is unique (#1).
  const { data: meterRow } = await supabase.from("meters").select("id").eq("serial", serial).single();
  if (!meterRow) {
    console.error(`[ingest] ${serial} not found in meters table, dropping`);
    return;
  }
  const meterId = meterRow.id as string;

  if (isFromTheFuture(payload.reading.timestamp)) {
    await quarantine(serial, meterId, payload.reading.timestamp, payload, "reading_ts more than 5 minutes in the future");
    return;
  }

  const importRegister = payload.reading.registers.find((r) => r.obis === "1.0.1.8.0.255");
  const exportRegister = payload.reading.registers.find((r) => r.obis === "1.0.2.8.0.255");

  let deltaImportKwh: number | null = null;
  let deltaExportKwh: number | null = null;
  let intervalSeconds: number | null = null;

  if (importRegister) {
    const key = `${meterId}:${importRegister.obis}`;
    const prior = registerStates.get(key);
    const result = evaluateRegister(prior, importRegister.value, payload.reading.timestamp);
    if (result.kind === "delta") {
      deltaImportKwh = result.delta;
      // interval_seconds is an integer column; real tick timing has
      // sub-second jitter, so round rather than let COPY reject it.
      intervalSeconds = Math.round(result.intervalSeconds);
    } else if (result.kind === "rollover") {
      await recordRollover(meterId, importRegister.obis, result.previousValue, result.newValue);
    }
    registerStates.set(key, { meterId, obis: importRegister.obis, lastValue: importRegister.value, lastReadingTs: payload.reading.timestamp });
  }

  if (exportRegister) {
    const key = `${meterId}:${exportRegister.obis}`;
    const prior = registerStates.get(key);
    const result = evaluateRegister(prior, exportRegister.value, payload.reading.timestamp);
    if (result.kind === "delta") {
      deltaExportKwh = result.delta;
    } else if (result.kind === "rollover") {
      await recordRollover(meterId, exportRegister.obis, result.previousValue, result.newValue);
    }
    registerStates.set(key, { meterId, obis: exportRegister.obis, lastValue: exportRegister.value, lastReadingTs: payload.reading.timestamp });
  }

  const row: MeterReadingRow = {
    meterId,
    readingTs: payload.reading.timestamp,
    kwhImport: importRegister?.value ?? null,
    kwhExport: exportRegister?.value ?? null,
    deltaImportKwh,
    deltaExportKwh,
    intervalSeconds,
    source: "meter",
    quality: "good",
    tamperFlags: 0,
    voltageR: payload.reading.instantaneous?.voltageR ?? null,
    voltageY: payload.reading.instantaneous?.voltageY ?? null,
    voltageB: payload.reading.instantaneous?.voltageB ?? null,
    currentR: payload.reading.instantaneous?.currentR ?? null,
    currentY: payload.reading.instantaneous?.currentY ?? null,
    currentB: payload.reading.instantaneous?.currentB ?? null,
    powerFactor: payload.reading.instantaneous?.powerFactor ?? null,
    frequencyHz: payload.reading.instantaneous?.frequencyHz ?? null,
  };

  readingsBatcher.add(row);
  await upsertLiveState(row);
  await broadcastLiveReading(meterId, row);
}

function main() {
  const client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, {
    username: MQTT_INGEST_USERNAME,
    password: MQTT_INGEST_PASSWORD,
    clientId: `ingest-${Math.random().toString(16).slice(2)}`,
  });

  client.on("connect", () => {
    console.log("[mqtt] ingest worker connected");
    client.subscribe("ecopower/v1/+/readings", { qos: 0 }, (err) => {
      if (err) console.error("[mqtt] subscribe failed:", err.message);
      else console.log("[mqtt] subscribed to ecopower/v1/+/readings");
    });
  });

  client.on("message", (topic, payloadBuf) => {
    handleMessage(topic, payloadBuf).catch((err) => console.error("[ingest] handler error:", err));
  });

  client.on("error", (err) => console.error("[mqtt] error:", err.message));

  process.on("SIGINT", () => {
    readingsBatcher.flush();
    client.end();
    pool.end();
    process.exit(0);
  });
}

main();
