-- inject_scenario() (#13/#40) — platform_admin only, and a real anomaly
-- lands in meter_readings with the exact signal dt_loss_summary() /
-- dt_consumer_breakdown() are built to surface, not just "no error thrown."

begin;
select plan(6);

insert into orgs (id, name, type) values ('91000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('91000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values
  ('91000000-0000-0000-0000-0000000000a1', '91000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values
  ('91000000-0000-0000-0000-0000000000a2', '91000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values
  ('91000000-0000-0000-0000-0000000000a3', '91000000-0000-0000-0000-0000000000a2', 'DT A');
insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('91000000-0000-0000-0000-0000000000a4', 'CN-SCEN-001', '91000000-0000-0000-0000-0000000000a3', null, 'RGP', 'single', 'postpaid');
insert into meters (id, serial, service_connection_id) values
  ('91000000-0000-0000-0000-0000000000a5', 'MTR-SCEN-001', '91000000-0000-0000-0000-0000000000a4');
insert into meter_readings (meter_id, reading_ts, delta_import_kwh) values
  ('91000000-0000-0000-0000-0000000000a5', now() - interval '1 day', 4.0),
  ('91000000-0000-0000-0000-0000000000a5', now() - interval '2 days', 4.2);

-- A discom_officer (not platform_admin) is refused.
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["91000000-0000-0000-0000-000000000001"],"division_ids":["91000000-0000-0000-0000-00000000000a"]}}';

select throws_ok(
  $$ select inject_scenario('MTR-SCEN-001', 'theft', 0.5) $$,
  '42501',
  'not authorised',
  'a discom_officer cannot inject a scenario'
);

reset role;

-- platform_admin can, and the anomaly lands for real.
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-0000-0000-0000000000f2","role":"authenticated","app_metadata":{"roles":["platform_admin"]}}';

select lives_ok(
  $$ select inject_scenario('MTR-SCEN-001', 'theft', 0.5) $$,
  'platform_admin can inject a scenario'
);

select ok(
  (select count(*) from meter_readings where meter_id = '91000000-0000-0000-0000-0000000000a5' and tamper_flags = 8) = 1,
  'theft writes one reading with tamper_flags 0x08 (matches the seeded AHD-A-300001 convention)'
);

select ok(
  (select delta_import_kwh from meter_readings
     where meter_id = '91000000-0000-0000-0000-0000000000a5' and tamper_flags = 8)
    < (select avg(delta_import_kwh) from meter_readings
         where meter_id = '91000000-0000-0000-0000-0000000000a5' and tamper_flags = 0),
  'the injected reading under-reports relative to the meter''s own baseline'
);

select ok(
  (select count(*) from scenario_events where meter_id = '91000000-0000-0000-0000-0000000000a5' and scenario = 'theft') = 1,
  'the injection is logged to scenario_events'
);

-- scenario_events is platform_admin-only to read.
set local request.jwt.claims = '{"sub":"91000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["91000000-0000-0000-0000-000000000001"],"division_ids":["91000000-0000-0000-0000-00000000000a"]}}';

select is_empty(
  $$ select 1 from scenario_events where meter_id = '91000000-0000-0000-0000-0000000000a5' $$,
  'a discom_officer cannot read the scenario_events audit trail'
);

select finish();
rollback;
