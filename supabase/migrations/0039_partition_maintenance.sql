-- 0039_partition_maintenance.sql
--
-- Closes a real gap found in the 2026-09-11 review: 0005 calls
-- create_monthly_partition() twice at migration time (current + next month)
-- and its own comment says "scheduling itself is #17's job" — but #17 never
-- landed a schedule. Left as-is, the first insert after the second month
-- rolls over fails with "no partition of relation meter_readings found for
-- row." Not a code bug that needs a new deploy to trigger — the calendar
-- triggers it.
--
-- Fix: extend the horizon by one more month now (0005 already has current +
-- next), and a monthly pg_cron job that keeps the same 3-month horizon
-- going forward. create_monthly_partition() is already idempotent
-- (`create table if not exists`), so this mirrors the exact call form 0005
-- itself uses at the top level — no wrapper function, no extra
-- search_path/security-definer surface to get wrong.
--
-- Deliberately NOT included: dropping/detaching old partitions. invoices
-- and invoice_lines hold a composite FK into meter_readings for billing
-- provenance (0009) — silently dropping a partition a real invoice still
-- points at would break "click a line, see the two register reads" for
-- historical bills. Retention is a real product decision (how long does a
-- provable bill need to stay provable?), not something to default here.

select create_monthly_partition((date_trunc('month', now()) + interval '2 months')::date);

select cron.schedule(
  'ensure-future-partitions',
  '0 0 1 * *',
  $$select create_monthly_partition((date_trunc('month', now()) + interval '2 months')::date)$$
);
