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
-- Fix: a monthly pg_cron job that keeps three months of partitions
-- (current + 2 ahead) always present. create_monthly_partition() is
-- already idempotent (`create table if not exists`), so re-running it for
-- months that already exist is a no-op.
--
-- Deliberately NOT included: dropping/detaching old partitions. invoices
-- and invoice_lines hold a composite FK into meter_readings for billing
-- provenance (0009) — silently dropping a partition a real invoice still
-- points at would break "click a line, see the two register reads" for
-- historical bills. Retention is a real product decision (how long does a
-- provable bill need to stay provable?), not something to default here.

create function ensure_future_partitions() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform public.create_monthly_partition((date_trunc('month', now()))::date);
  perform public.create_monthly_partition((date_trunc('month', now()) + interval '1 month')::date);
  perform public.create_monthly_partition((date_trunc('month', now()) + interval '2 months')::date);
end;
$$;

-- Run once now (idempotent — the current/next month already exist from
-- 0005; this only adds the +2 month partition) and then monthly on the 1st.
select ensure_future_partitions();

select cron.schedule('ensure-future-partitions', '0 0 1 * *', $$select public.ensure_future_partitions()$$);
