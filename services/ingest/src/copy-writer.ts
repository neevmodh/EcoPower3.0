// Real COPY, not a multi-row INSERT dressed up as one — the wire-protocol
// bulk-load path Postgres actually optimizes for.

import { from as copyFrom } from "pg-copy-streams";
import type { Pool } from "pg";

export interface MeterReadingRow {
  meterId: string;
  readingTs: string;
  kwhImport: number | null;
  kwhExport: number | null;
  deltaImportKwh: number | null;
  deltaExportKwh: number | null;
  intervalSeconds: number | null;
  source: "meter" | "estimated" | "manual" | "ocr";
  quality: "good" | "estimated" | "suspect" | "missing";
  tamperFlags: number;
  voltageR: number | null;
  voltageY: number | null;
  voltageB: number | null;
  currentR: number | null;
  currentY: number | null;
  currentB: number | null;
  powerFactor: number | null;
  frequencyHz: number | null;
}

const COLUMNS = [
  "meter_id",
  "reading_ts",
  "kwh_import",
  "kwh_export",
  "delta_import_kwh",
  "delta_export_kwh",
  "interval_seconds",
  "source",
  "quality",
  "tamper_flags",
  "voltage_r",
  "voltage_y",
  "voltage_b",
  "current_r",
  "current_y",
  "current_b",
  "power_factor",
  "frequency_hz",
] as const;

// CSV-escapes a single value for COPY ... WITH (FORMAT csv). Postgres NULL
// is an empty unquoted field.
function csvField(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(rows: MeterReadingRow[]): string {
  return rows
    .map((r) =>
      [
        r.meterId,
        r.readingTs,
        r.kwhImport,
        r.kwhExport,
        r.deltaImportKwh,
        r.deltaExportKwh,
        r.intervalSeconds,
        r.source,
        r.quality,
        r.tamperFlags,
        r.voltageR,
        r.voltageY,
        r.voltageB,
        r.currentR,
        r.currentY,
        r.currentB,
        r.powerFactor,
        r.frequencyHz,
      ]
        .map(csvField)
        .join(","),
    )
    .join("\n");
}

// PK is (meter_id, reading_ts); COPY has no ON CONFLICT of its own, so this
// loads into a temp table first and merges with ON CONFLICT DO NOTHING —
// the idempotency the issue specifies, preserved even on the fast path.
export async function copyMeterReadings(pool: Pool, rows: MeterReadingRow[]): Promise<void> {
  if (rows.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "create temporary table _ingest_batch (like meter_readings including defaults) on commit drop",
    );

    const columnList = COLUMNS.join(", ");
    const copyStream = client.query(copyFrom(`copy _ingest_batch (${columnList}) from stdin with (format csv)`));
    const csv = rowsToCsv(rows);

    await new Promise<void>((resolve, reject) => {
      copyStream.on("error", reject);
      copyStream.on("finish", resolve);
      copyStream.end(csv + "\n");
    });

    await client.query(
      `insert into meter_readings (${columnList})
       select ${columnList} from _ingest_batch
       on conflict (meter_id, reading_ts) do nothing`,
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
