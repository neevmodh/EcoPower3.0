-- prepaid (0024): recharge RPC, daily settlement, append-only ledger, and
-- consumer/DISCOM read scoping.

begin;
select plan(9);

select create_monthly_partition(date_trunc('month', now())::date);
select create_monthly_partition((date_trunc('month', now()) - interval '1 month')::date);

insert into orgs (id, name, type) values ('b0000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('b0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-000000000001', 'Division A', 'division'),
  ('b0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001', 'Division B', 'division');
insert into substations (id, division_id, name) values ('b0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('b0000000-0000-0000-0000-0000000000a3', 'b0000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-0000000000e1', 'prepaid.owner@test.local'),
  ('b0000000-0000-0000-0000-0000000000e2', 'prepaid.other@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('b0000000-0000-0000-0000-0000000000c1', 'CN-PREPAID', 'b0000000-0000-0000-0000-0000000000a3', 'b0000000-0000-0000-0000-0000000000e1', 'RGP', 'single', 'prepaid');
insert into meters (id, serial, service_connection_id) values
  ('b0000000-0000-0000-0000-0000000000d1', 'MTR-PREPAID', 'b0000000-0000-0000-0000-0000000000c1');

-- Yesterday's consumption: 10 kWh.
insert into meter_readings (meter_id, reading_ts, delta_import_kwh) values
  ('b0000000-0000-0000-0000-0000000000d1', (now() at time zone 'utc')::date - 1 + interval '6 hours', 4),
  ('b0000000-0000-0000-0000-0000000000d1', (now() at time zone 'utc')::date - 1 + interval '18 hours', 6);

insert into prepaid_accounts (service_connection_id, balance_paise, vend_rate_paise_per_kwh, low_balance_threshold_paise)
  values ('b0000000-0000-0000-0000-0000000000c1', 20000, 650, 10000);

select is(
  (select division_id from prepaid_accounts where service_connection_id = 'b0000000-0000-0000-0000-0000000000c1'),
  'b0000000-0000-0000-0000-00000000000a'::uuid,
  'the scope-key trigger fills division_id from the DT'
);

-- Settlement: 10 kWh x 650 paise = 6500; 20000 -> 13500, still above the 10000 threshold.
select prepaid_settle_day();

select is(
  (select balance_paise from prepaid_accounts where service_connection_id = 'b0000000-0000-0000-0000-0000000000c1'),
  13500::bigint,
  'settle_day debits yesterday consumption x vend rate'
);
select is(
  (select disconnect_pending from prepaid_accounts where service_connection_id = 'b0000000-0000-0000-0000-0000000000c1'),
  false,
  'still above threshold after settlement — not flagged'
);
select is(
  (select amount_paise from prepaid_ledger where service_connection_id = 'b0000000-0000-0000-0000-0000000000c1' and kind = 'debit' order by seq desc limit 1),
  -6500::bigint,
  'the debit is recorded in the ledger as a negative amount'
);

-- A second settlement the same day is a no-op (last_settled_on guard).
select prepaid_settle_day();
select is(
  (select count(*)::int from prepaid_ledger where service_connection_id = 'b0000000-0000-0000-0000-0000000000c1'),
  1,
  'settle_day is idempotent within a day'
);

-- Recharge as the owner.
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":[],"org_ids":[],"division_ids":[]}}';

select is(
  prepaid_recharge('b0000000-0000-0000-0000-0000000000c1', 100000),
  113500::bigint,
  'recharge as the owner credits the balance and returns the new total'
);

select isnt_empty(
  $$ select 1 from prepaid_accounts where service_connection_id = 'b0000000-0000-0000-0000-0000000000c1' $$,
  'the owner can read their own prepaid account'
);

-- Recharge as someone else: rejected.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":[],"org_ids":[],"division_ids":[]}}';
select throws_ok(
  $$ select prepaid_recharge('b0000000-0000-0000-0000-0000000000c1', 5000) $$,
  'not your connection'
);
select is_empty(
  $$ select 1 from prepaid_accounts where service_connection_id = 'b0000000-0000-0000-0000-0000000000c1' $$,
  'another consumer cannot read this prepaid account'
);

select finish();
rollback;
