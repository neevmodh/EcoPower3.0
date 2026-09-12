-- invoice_write_guards (0046) — invoices/invoice_lines (0009) never had an
-- INSERT/UPDATE/DELETE policy, and per 0041's own documented lesson
-- (Supabase's baseline grants let anon/authenticated write public-schema
-- tables regardless of RLS, proven exploitable there in CI), "no policy
-- exists" alone is not a guard. This locks in the fix: a signed-in
-- consumer, even the invoice's own owner, cannot write these tables at all
-- — every real write path (the billing script, the Razorpay webhook) uses
-- a service_role/raw-pg connection that this revoke does not touch.

begin;
select plan(6);

select create_monthly_partition(date '2026-08-01');

insert into orgs (id, name, type) values ('96000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('96000000-0000-0000-0000-00000000000a', '96000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('96000000-0000-0000-0000-0000000000a1', '96000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('96000000-0000-0000-0000-0000000000a2', '96000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('96000000-0000-0000-0000-0000000000a3', '96000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values ('96000000-0000-0000-0000-0000000000e1', 'invguard.x@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('96000000-0000-0000-0000-0000000000c1', 'CN-X-INVGUARD', '96000000-0000-0000-0000-0000000000a3', '96000000-0000-0000-0000-0000000000e1', 'RGP', 'single', 'postpaid');

insert into meters (id, serial, service_connection_id) values
  ('96000000-0000-0000-0000-0000000000f1', 'MTR-X-INVGUARD', '96000000-0000-0000-0000-0000000000c1');

insert into meter_readings (id, meter_id, reading_ts, kwh_import) values
  ('96000000-0000-0000-0000-0000000000d1', '96000000-0000-0000-0000-0000000000f1', '2026-08-01 00:00:00+00', 10000.000),
  ('96000000-0000-0000-0000-0000000000d2', '96000000-0000-0000-0000-0000000000f1', '2026-08-15 00:00:00+00', 10100.000);

insert into tariffs (id, category, area, name, fixed_charge_basis, electricity_duty_pct, appc_rate_paise_per_kwh, banking_charge_demand_paise_per_kwh, banking_charge_non_demand_paise_per_kwh, effective_from, source_document_url) values
  ('96000000-0000-0000-0000-0000000000fa', 'RGP', 'urban', 'Test RGP tariff', 'per_connection', 10.0, 385, 150, 110, '2026-04-01', 'https://example.test/tariff');

insert into invoices (
  id, service_connection_id, tariff_id, billing_period_start, billing_period_end,
  opening_reading_id, opening_reading_ts, opening_kwh_import, opening_kwh_export,
  closing_reading_id, closing_reading_ts, closing_kwh_import, closing_kwh_export,
  units_imported_milli_kwh, units_exported_milli_kwh, units_net_milli_kwh,
  engine_version, total_paise, computed_hash
) values (
  '96000000-0000-0000-0000-0000000000ba', '96000000-0000-0000-0000-0000000000c1', '96000000-0000-0000-0000-0000000000fa',
  '2026-08-01', '2026-08-15',
  '96000000-0000-0000-0000-0000000000d1', '2026-08-01 00:00:00+00', 10000.000, 0,
  '96000000-0000-0000-0000-0000000000d2', '2026-08-15 00:00:00+00', 10100.000, 0,
  100000, 0, 100000,
  '1.0.0', 50000, 'deadbeef'
);

insert into invoice_lines (invoice_id, line_order, line_type, label, amount_paise) values
  ('96000000-0000-0000-0000-0000000000ba', 1, 'energy_slab', 'Energy 0-50 @ 3.20', 16000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"96000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

-- The exact attack this migration closes: mark your own bill paid with no
-- payment ever recorded.
select throws_ok(
  $$ update invoices set status = 'paid' where id = '96000000-0000-0000-0000-0000000000ba' $$,
  '42501',
  null,
  'a consumer cannot PATCH their own invoice''s status directly'
);

select throws_ok(
  $$ delete from invoices where id = '96000000-0000-0000-0000-0000000000ba' $$,
  '42501',
  null,
  'a consumer cannot delete their own invoice'
);

select throws_ok(
  $$ insert into invoices (id, service_connection_id, tariff_id, billing_period_start, billing_period_end,
       opening_reading_id, opening_reading_ts, opening_kwh_import, opening_kwh_export,
       closing_reading_id, closing_reading_ts, closing_kwh_import, closing_kwh_export,
       units_imported_milli_kwh, units_exported_milli_kwh, units_net_milli_kwh, engine_version, total_paise, computed_hash)
     values ('96000000-0000-0000-0000-0000000000bb', '96000000-0000-0000-0000-0000000000c1', '96000000-0000-0000-0000-0000000000fa',
       '2026-08-01', '2026-08-15', '96000000-0000-0000-0000-0000000000d1', '2026-08-01 00:00:00+00', 10000.000, 0,
       '96000000-0000-0000-0000-0000000000d2', '2026-08-15 00:00:00+00', 10100.000, 0, 0, 0, 0, '1.0.0', 1, 'forged')
  $$,
  '42501',
  null,
  'a consumer cannot fabricate a new invoice row for their own connection'
);

select throws_ok(
  $$ update invoice_lines set amount_paise = 1 where invoice_id = '96000000-0000-0000-0000-0000000000ba' $$,
  '42501',
  null,
  'a consumer cannot alter their own invoice''s line items'
);

select throws_ok(
  $$ insert into invoice_lines (invoice_id, line_order, line_type, label, amount_paise)
     values ('96000000-0000-0000-0000-0000000000ba', 2, 'export_credit', 'forged credit', -1000000)
  $$,
  '42501',
  null,
  'a consumer cannot insert a forged line item on their own invoice'
);

select throws_ok(
  $$ delete from invoice_lines where invoice_id = '96000000-0000-0000-0000-0000000000ba' $$,
  '42501',
  null,
  'a consumer cannot delete their own invoice''s line items'
);

select * from finish();
rollback;
