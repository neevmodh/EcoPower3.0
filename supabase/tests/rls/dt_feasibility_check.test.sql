-- dt_feasibility_check (#30, 0056): run_dt_feasibility_check() computes a
-- verdict from measured DT peak load + existing installed solar + the
-- applicant's sanctioned load, not a dropdown. Verifies the arithmetic for
-- both a feasible and an infeasible case, that only discom_officer/admin can
-- run it (not the applicant themselves), and that dt_feasibility_checks RLS
-- mirrors netmetering_applications' own visibility.

begin;
select plan(9);

-- Readings are dated relative to now() (they feed the function's own
-- "last 30 days" window), so pre-create this month's partition and last
-- month's in case the suite runs near a month boundary.
select create_monthly_partition(date_trunc('month', now())::date);
select create_monthly_partition((date_trunc('month', now()) - interval '1 month')::date);

insert into orgs (id, name, type) values ('61000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('61000000-0000-0000-0000-00000000000a', '61000000-0000-0000-0000-000000000001', 'Division A', 'division'),
  ('61000000-0000-0000-0000-00000000000b', '61000000-0000-0000-0000-000000000001', 'Division B', 'division');
insert into substations (id, division_id, name) values ('61000000-0000-0000-0000-0000000000a1', '61000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('61000000-0000-0000-0000-0000000000a2', '61000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name, capacity_kva) values
  ('61000000-0000-0000-0000-0000000000a3', '61000000-0000-0000-0000-0000000000a2', 'DT A', 100);

insert into auth.users (id, email) values
  ('61000000-0000-0000-0000-0000000000f1', 'feas.consumer@test.local'),
  ('61000000-0000-0000-0000-0000000000f2', 'feas.officer@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, sanctioned_load_kw, tariff_category, phase, connection_type) values
  ('61000000-0000-0000-0000-0000000000c1', 'CN-FEAS-01', '61000000-0000-0000-0000-0000000000a3', '61000000-0000-0000-0000-0000000000f1', 10, 'RGP', 'single', 'postpaid');

-- The DT-head meter (dt_id set, no service_connection_id) — its readings
-- are the "measured, not nameplate" peak load input.
insert into meters (id, serial, dt_id) values ('61000000-0000-0000-0000-0000000000e1', 'MTR-DT-A', '61000000-0000-0000-0000-0000000000a3');
insert into meter_readings (meter_id, reading_ts, active_power_kw) values
  ('61000000-0000-0000-0000-0000000000e1', now() - interval '1 day', 50),
  ('61000000-0000-0000-0000-0000000000e1', now() - interval '2 days', 40);

insert into netmetering_applications (id, service_connection_id, capacity_kw) values
  ('61000000-0000-0000-0000-0000000000d1', '61000000-0000-0000-0000-0000000000c1', 8);

-- The applicant themselves cannot run the check — this is a DISCOM decision
-- tool, not a self-service one.
set local role authenticated;
set local request.jwt.claims = '{"sub":"61000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select throws_ok(
  $$ select run_dt_feasibility_check('61000000-0000-0000-0000-0000000000d1') $$,
  '42501',
  null,
  'a consumer cannot run the feasibility check on their own application'
);

-- A Division A officer runs it: 8kW proposed + 0 existing = 8% of 100 kVA
-- (well under the 80% threshold), and 8kW is under the 10kW sanctioned
-- load, and the 50kW measured peak load comfortably absorbs 8kW of solar.
set local request.jwt.claims = '{"sub":"61000000-0000-0000-0000-0000000000f2","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["61000000-0000-0000-0000-000000000001"],"division_ids":["61000000-0000-0000-0000-00000000000a"]}}';

select results_eq(
  $$ select verdict from run_dt_feasibility_check('61000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('feasible'::text) $$,
  'well within every threshold — feasible'
);

select isnt_empty(
  $$ select 1 from dt_feasibility_checks where application_id = '61000000-0000-0000-0000-0000000000d1' and verdict = 'feasible' $$,
  'the check was actually persisted to dt_feasibility_checks'
);

-- An already-installed array on the applicant's OWN connection (an assets
-- row, not another application) must still count as existing_solar_kw —
-- regression test for a fix that used to exclude the applicant's own
-- connection entirely. 75kW existing + 10kW proposed = 85% of 100 kVA,
-- over the 80% threshold, even though 10kW alone is well under it.
insert into assets (service_connection_id, asset_type, capacity_kw) values
  ('61000000-0000-0000-0000-0000000000c1', 'pv_array', 75);
insert into netmetering_applications (id, service_connection_id, capacity_kw) values
  ('61000000-0000-0000-0000-0000000000d3', '61000000-0000-0000-0000-0000000000c1', 10);

select results_eq(
  $$ select existing_solar_kw, verdict from run_dt_feasibility_check('61000000-0000-0000-0000-0000000000d3') $$,
  $$ values (75::numeric, 'infeasible'::text) $$,
  'an already-installed array on the applicant''s own connection still counts toward existing_solar_kw'
);

-- A DT with capacity_kva = 0 (bad data, not NULL) must degrade to
-- insufficient_data, not divide-by-zero.
insert into distribution_transformers (id, feeder_id, name, capacity_kva) values
  ('61000000-0000-0000-0000-0000000000a4', '61000000-0000-0000-0000-0000000000a2', 'DT Zero', 0);
insert into service_connections (id, consumer_number, dt_id, sanctioned_load_kw, tariff_category, phase, connection_type) values
  ('61000000-0000-0000-0000-0000000000c2', 'CN-FEAS-02', '61000000-0000-0000-0000-0000000000a4', 10, 'RGP', 'single', 'postpaid');
insert into meters (id, serial, dt_id) values ('61000000-0000-0000-0000-0000000000e2', 'MTR-DT-ZERO', '61000000-0000-0000-0000-0000000000a4');
insert into meter_readings (meter_id, reading_ts, active_power_kw) values
  ('61000000-0000-0000-0000-0000000000e2', now() - interval '1 day', 20);
insert into netmetering_applications (id, service_connection_id, capacity_kw) values
  ('61000000-0000-0000-0000-0000000000d4', '61000000-0000-0000-0000-0000000000c2', 5);

select results_eq(
  $$ select verdict from run_dt_feasibility_check('61000000-0000-0000-0000-0000000000d4') $$,
  $$ values ('insufficient_data'::text) $$,
  'a zero (not just NULL) DT capacity degrades to insufficient_data instead of a divide-by-zero error'
);

-- A second application for 15kW — exceeds the 10kW sanctioned load.
insert into netmetering_applications (id, service_connection_id, capacity_kw) values
  ('61000000-0000-0000-0000-0000000000d2', '61000000-0000-0000-0000-0000000000c1', 15);

select results_eq(
  $$ select verdict from run_dt_feasibility_check('61000000-0000-0000-0000-0000000000d2') $$,
  $$ values ('infeasible'::text) $$,
  'proposed capacity exceeding sanctioned load is infeasible regardless of DT headroom'
);

-- RLS on dt_feasibility_checks: the owning consumer can see their own
-- application's checks.
set local request.jwt.claims = '{"sub":"61000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from dt_feasibility_checks where application_id = '61000000-0000-0000-0000-0000000000d1' $$,
  'the applicant can see the feasibility check on their own application'
);

-- A Division B officer sees nothing — wrong division.
set local request.jwt.claims = '{"sub":"61000000-0000-0000-0000-0000000000f3","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["61000000-0000-0000-0000-000000000001"],"division_ids":["61000000-0000-0000-0000-00000000000b"]}}';

select is_empty(
  $$ select 1 from dt_feasibility_checks where application_id = '61000000-0000-0000-0000-0000000000d1' $$,
  'an officer of a different division sees none of these feasibility checks'
);

select throws_ok(
  $$ select run_dt_feasibility_check('61000000-0000-0000-0000-0000000000d1') $$,
  '42501',
  null,
  'an officer of a different division cannot run the check either'
);

select finish();
rollback;
