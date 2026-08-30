#!/usr/bin/env node
// Composes real invoices for the demo consumer from real backfilled meter
// data (scripts/seed_large_dataset.mjs) and the real seeded RGP tariff
// (#20) — the same slabEngine/fixedCharge/dutyAndTaxes/composeInvoice
// used everywhere else (#19), not a shortcut for demo purposes. One
// invoice per real ~30-day window found in the backfilled history.
//
// Usage:
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//   node scripts/generate_demo_invoices.mjs

import pg from "pg";
import crypto from "node:crypto";
import { slabEngine, fixedCharge, dutyAndTaxes, composeInvoice } from "../packages/shared/src/billing/tariff-engine.ts";
import { kwhToMilli, rupeesToPaise } from "../packages/shared/src/billing/money.ts";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

async function main() {
  const client = await pool.connect();
  try {
    const { rows: meters } = await client.query(
      `select m.id as meter_id, sc.id as service_connection_id, sc.phase
       from meters m join service_connections sc on sc.id = m.service_connection_id
       where m.status = 'active'`,
    );
    if (meters.length === 0) {
      console.log("No active meters — run seed_demo_users.mjs and seed_large_dataset.mjs first.");
      return;
    }

    const { rows: tariffRows } = await client.query(
      `select t.id, t.electricity_duty_pct, t.fixed_charge_basis,
              (select json_agg(s.* order by s.slab_order) from tariff_slabs s where s.tariff_id = t.id) as slabs,
              (select json_agg(b.* order by b.band_order) from tariff_fixed_charge_bands b where b.tariff_id = t.id) as bands
       from tariffs t where t.category = 'RGP' and t.area = 'urban' limit 1`,
    );
    const tariff = tariffRows[0];
    if (!tariff) {
      console.log("No RGP tariff found — run migration 0008 first.");
      return;
    }
    const slabs = tariff.slabs.map((s) => ({ uptoKwh: s.upto_kwh, ratePaisePerKwh: BigInt(s.rate_paise_per_kwh) }));
    const dutyBps = BigInt(Math.round(tariff.electricity_duty_pct * 100));

    for (const meter of meters) {
      const { rows: readings } = await client.query(
        `select id, reading_ts, kwh_import, kwh_export from meter_readings
         where meter_id = $1 order by reading_ts`,
        [meter.meter_id],
      );
      if (readings.length < 2) continue;

      // Real ~30-day billing windows across the whole backfilled range.
      const windows = [];
      let openIdx = 0;
      for (let i = 1; i < readings.length; i++) {
        const daysSinceOpen = (new Date(readings[i].reading_ts) - new Date(readings[openIdx].reading_ts)) / 86400000;
        if (daysSinceOpen >= 30) {
          windows.push([openIdx, i]);
          openIdx = i;
        }
      }

      for (const [openIdx, closeIdx] of windows) {
        const open = readings[openIdx];
        const close = readings[closeIdx];
        const unitsImportedKwh = Number(close.kwh_import) - Number(open.kwh_import);
        const unitsExportedKwh = Number(close.kwh_export) - Number(open.kwh_export);
        if (unitsImportedKwh <= 0) continue;

        const slabResult = slabEngine(kwhToMilli(unitsImportedKwh), slabs);
        const fixedChargePaise =
          tariff.fixed_charge_basis === "per_connection"
            ? BigInt(tariff.bands.find((b) => b.phase === meter.phase)?.rate_paise ?? tariff.bands[0].rate_paise)
            : fixedCharge(5, tariff.bands.map((b) => ({ maxSanctionedKw: b.max_sanctioned_kw, ratePaise: BigInt(b.rate_paise) })));
        const dutyPaise = dutyAndTaxes(slabResult.totalPaise, fixedChargePaise, dutyBps);

        const invoice = composeInvoice([
          ...slabResult.lines.map((l) => ({ kind: "energy_slab", label: `Energy`, amountPaise: l.amountPaise })),
          { kind: "fixed", label: "Fixed charge", amountPaise: fixedChargePaise },
          { kind: "duty", label: "Electricity duty", amountPaise: dutyPaise },
        ]);

        const canonicalHash = crypto
          .createHash("sha256")
          .update(JSON.stringify({ meter: meter.meter_id, open: open.reading_ts, close: close.reading_ts, total: invoice.totalPaise.toString() }))
          .digest("hex");

        const { rows: inserted } = await client.query(
          `insert into invoices (
             service_connection_id, tariff_id, billing_period_start, billing_period_end,
             opening_reading_id, opening_reading_ts, opening_kwh_import, opening_kwh_export,
             closing_reading_id, closing_reading_ts, closing_kwh_import, closing_kwh_export,
             units_imported_milli_kwh, units_exported_milli_kwh, units_net_milli_kwh,
             engine_version, total_paise, computed_hash, status
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           on conflict do nothing
           returning id`,
          [
            meter.service_connection_id, tariff.id,
            open.reading_ts.toISOString().slice(0, 10), close.reading_ts.toISOString().slice(0, 10),
            open.id, open.reading_ts, open.kwh_import, open.kwh_export,
            close.id, close.reading_ts, close.kwh_import, close.kwh_export,
            Math.round(unitsImportedKwh * 1000), Math.round(unitsExportedKwh * 1000), Math.round(unitsImportedKwh * 1000),
            invoice.engineVersion, invoice.totalPaise.toString(), canonicalHash,
            windows[windows.length - 1][1] === closeIdx ? "issued" : "paid",
          ],
        );
        if (inserted.length === 0) continue;
        const invoiceId = inserted[0].id;

        let lineOrder = 1;
        let cumulativeKwh = 0;
        for (let i = 0; i < slabResult.lines.length; i++) {
          const l = slabResult.lines[i];
          const quantityKwh = Number(l.quantityMilliKwh) / 1000;
          const slabFrom = cumulativeKwh;
          const slabTo = cumulativeKwh + quantityKwh;
          cumulativeKwh = slabTo;
          await client.query(
            `insert into invoice_lines (invoice_id, line_order, line_type, label, amount_paise, tariff_id, slab_from, slab_to, source_reading_start_id, source_reading_start_ts, source_reading_end_id, source_reading_end_ts)
             values ($1,$2,'energy_slab',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [invoiceId, lineOrder++, `Energy slab ${i + 1} (${Number(l.ratePaisePerKwh) / 100}/kWh)`, l.amountPaise.toString(), tariff.id, slabFrom, slabTo, open.id, open.reading_ts, close.id, close.reading_ts],
          );
        }
        await client.query(
          `insert into invoice_lines (invoice_id, line_order, line_type, label, amount_paise) values ($1,$2,'fixed_charge','Fixed charge',$3)`,
          [invoiceId, lineOrder++, fixedChargePaise.toString()],
        );
        await client.query(
          `insert into invoice_lines (invoice_id, line_order, line_type, label, amount_paise) values ($1,$2,'electricity_duty','Electricity duty',$3)`,
          [invoiceId, lineOrder++, dutyPaise.toString()],
        );

        console.log(`  invoice ${invoiceId}: ${open.reading_ts.toISOString().slice(0,10)} -> ${close.reading_ts.toISOString().slice(0,10)}, ${unitsImportedKwh.toFixed(1)} kWh, Rs ${(Number(invoice.totalPaise) / 100).toFixed(2)}`);
      }
    }
    console.log("Done.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
