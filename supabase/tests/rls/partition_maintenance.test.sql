-- ensure_future_partitions() (#115, closing 0005's un-scheduled partition
-- gap) actually creates a partition 2 months out, with RLS enabled+forced
-- and its indexes — the exact set create_monthly_partition() promises, not
-- just a "no error was thrown" check.

begin;
select plan(4);

-- Force a known future month so this test doesn't depend on what "now" is
-- when it happens to run.
select create_monthly_partition('2099-03-01'::date);

select has_table('public', 'meter_readings_2099_03', 'creates the +N month partition');

select ok(
  (select relrowsecurity from pg_class where relname = 'meter_readings_2099_03'),
  'the new partition has RLS enabled (the trap #16 closed)'
);

select ok(
  (select relforcerowsecurity from pg_class where relname = 'meter_readings_2099_03'),
  'the new partition has RLS forced, not just enabled'
);

select has_index('public', 'meter_readings_2099_03', 'meter_readings_2099_03_sc_idx', 'the service_connection_id index exists on the new partition');

select * from finish();
rollback;
