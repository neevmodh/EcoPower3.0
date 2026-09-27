-- prepaid_settle_day fault isolation + catch-up (0063): a runtime error
-- settling one account must not roll back another account's settlement in
-- the same tick, and an account behind by several days must catch up in
-- one tick rather than staying permanently stuck on the day it first
-- failed (or was simply never run) to settle.

begin;
select plan(6);

select create_monthly_partition(date_trunc('month', now())::date);
select create_monthly_partition((date_trunc('month', now()) - interval '1 month')::date);

insert into orgs (id, name, type) values ('bb000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('bb000000-0000-0000-0000-00000000000a', 'bb000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('bb000000-0000-0000-0000-0000000000a1', 'bb000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('bb000000-0000-0000-0000-0000000000a2', 'bb000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('bb000000-0000-0000-0000-0000000000a3', 'bb000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('bb000000-0000-0000-0000-0000000000e1', 'fault.healthy@test.local'),
  ('bb000000-0000-0000-0000-0000000000e2', 'fault.poison@test.local'),
  ('bb000000-0000-0000-0000-0000000000e3', 'fault.catchup@test.local');

-- Account A ("healthy"): a completely ordinary account with a normal
-- yesterday's reading — must settle successfully regardless of what
-- happens to account B below.
insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('bb000000-0000-0000-0000-0000000000c1', 'CN-FAULT-A', 'bb000000-0000-0000-0000-0000000000a3', 'bb000000-0000-0000-0000-0000000000e1', 'RGP', 'single', 'prepaid');
insert into meters (id, serial, service_connection_id) values
  ('bb000000-0000-0000-0000-0000000000d1', 'MTR-FAULT-A', 'bb000000-0000-0000-0000-0000000000c1');
insert into meter_readings (meter_id, reading_ts, delta_import_kwh) values
  ('bb000000-0000-0000-0000-0000000000d1', (now() at time zone 'utc')::date - 1 + interval '12 hours', 10);
insert into prepaid_accounts (service_connection_id, balance_paise, vend_rate_paise_per_kwh, low_balance_threshold_paise)
  values ('bb000000-0000-0000-0000-0000000000c1', 100000, 650, 10000);

-- Account B ("poison"): an absurd reading combined with a near-bigint-max
-- vend rate so round(kwh * rate) overflows bigint at the v_charge
-- assignment — a genuine, deterministic runtime error inside the loop,
-- not a contrived trigger. This is what proves fault isolation: it must
-- error out for THIS account without touching A's or C's work.
insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('bb000000-0000-0000-0000-0000000000c2', 'CN-FAULT-B', 'bb000000-0000-0000-0000-0000000000a3', 'bb000000-0000-0000-0000-0000000000e2', 'RGP', 'single', 'prepaid');
insert into meters (id, serial, service_connection_id) values
  ('bb000000-0000-0000-0000-0000000000d2', 'MTR-FAULT-B', 'bb000000-0000-0000-0000-0000000000c2');
insert into meter_readings (meter_id, reading_ts, delta_import_kwh) values
  ('bb000000-0000-0000-0000-0000000000d2', (now() at time zone 'utc')::date - 1 + interval '12 hours', 999999999999);
insert into prepaid_accounts (service_connection_id, balance_paise, vend_rate_paise_per_kwh, low_balance_threshold_paise)
  values ('bb000000-0000-0000-0000-0000000000c2', 100000, 9223372036854775807, 10000);

-- Account C ("catch-up"): already settled up through 3 days before
-- yesterday, with real readings on each of the 3 missed days plus
-- yesterday — must catch up all 4 days in one tick, not just the most
-- recent one.
insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('bb000000-0000-0000-0000-0000000000c3', 'CN-FAULT-C', 'bb000000-0000-0000-0000-0000000000a3', 'bb000000-0000-0000-0000-0000000000e3', 'RGP', 'single', 'prepaid');
insert into meters (id, serial, service_connection_id) values
  ('bb000000-0000-0000-0000-0000000000d3', 'MTR-FAULT-C', 'bb000000-0000-0000-0000-0000000000c3');
insert into meter_readings (meter_id, reading_ts, delta_import_kwh)
select 'bb000000-0000-0000-0000-0000000000d3', (now() at time zone 'utc')::date - n + interval '12 hours', 5
from generate_series(1, 4) n; -- yesterday, and the 3 days before it
insert into prepaid_accounts (service_connection_id, balance_paise, vend_rate_paise_per_kwh, low_balance_threshold_paise, last_settled_on)
  values ('bb000000-0000-0000-0000-0000000000c3', 100000, 650, 10000, (now() at time zone 'utc')::date - 5);

select prepaid_settle_day();

select is(
  (select last_settled_on from prepaid_accounts where service_connection_id = 'bb000000-0000-0000-0000-0000000000c1'),
  ((now() at time zone 'utc')::date - 1),
  'account A settles normally despite account B failing in the same tick'
);

select is(
  (select count(*)::int from prepaid_ledger where service_connection_id = 'bb000000-0000-0000-0000-0000000000c1'),
  1,
  'account A gets exactly its own one ledger entry, unaffected by B'
);

select isnt(
  coalesce((select last_settled_on from prepaid_accounts where service_connection_id = 'bb000000-0000-0000-0000-0000000000c2')::text, 'null'),
  ((now() at time zone 'utc')::date - 1)::text,
  'account B (the one that genuinely errors) is NOT marked settled — left retriable, not silently wrong'
);

select is(
  (select count(*)::int from prepaid_ledger where service_connection_id = 'bb000000-0000-0000-0000-0000000000c2'),
  0,
  'account B has no ledger entry from the failed attempt — no partial/wrong charge'
);

select is(
  (select last_settled_on from prepaid_accounts where service_connection_id = 'bb000000-0000-0000-0000-0000000000c3'),
  ((now() at time zone 'utc')::date - 1),
  'account C catches up all the way to yesterday in one tick, not just one day'
);

select is(
  (select count(*)::int from prepaid_ledger where service_connection_id = 'bb000000-0000-0000-0000-0000000000c3'),
  4,
  'account C gets one ledger entry per caught-up day (4), not just the most recent'
);

select finish();
rollback;
