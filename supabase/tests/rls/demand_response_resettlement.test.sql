-- Demand response late-reading resettlement (#163, 0061): a participant who
-- settles unverified because their meter reading for the event window
-- hadn't landed yet at sweep time gets one more chance within 24h of the
-- event completing, if real data has since arrived. A settlement outside
-- that window, or one already meter-verified, must never be touched again.

begin;
select plan(5);

select create_monthly_partition(date_trunc('month', now())::date);
select create_monthly_partition((date_trunc('month', now()) - interval '1 month')::date);

insert into orgs (id, name, type) values ('65000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('65000000-0000-0000-0000-00000000000a', '65000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('65000000-0000-0000-0000-0000000000a1', '65000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('65000000-0000-0000-0000-0000000000a2', '65000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('65000000-0000-0000-0000-0000000000a3', '65000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('65000000-0000-0000-0000-0000000000f1', 'resettle.consumer1@test.local'),
  ('65000000-0000-0000-0000-0000000000f2', 'resettle.consumer2@test.local');

-- c1: event ended 2h ago, well within the 24h resettlement window — a late
-- reading for it should get picked up.
insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('65000000-0000-0000-0000-0000000000c1', 'CN-RS-01', '65000000-0000-0000-0000-0000000000a3', '65000000-0000-0000-0000-0000000000f1', 'RGP', 'single', 'postpaid');
insert into meters (id, serial, service_connection_id) values
  ('65000000-0000-0000-0000-0000000000e1', 'MTR-RS-01', '65000000-0000-0000-0000-0000000000c1');

-- c2: event ended 30h ago — outside the 24h window even though its
-- readings will also arrive "late".
insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('65000000-0000-0000-0000-0000000000c2', 'CN-RS-02', '65000000-0000-0000-0000-0000000000a3', '65000000-0000-0000-0000-0000000000f2', 'RGP', 'single', 'postpaid');
insert into meters (id, serial, service_connection_id) values
  ('65000000-0000-0000-0000-0000000000e2', 'MTR-RS-02', '65000000-0000-0000-0000-0000000000c2');

-- Event 1: ended 2 hours ago. No meter readings exist yet anywhere for c1 —
-- the first sweep must settle it unverified.
insert into demand_response_events (id, division_id, starts_at, ends_at, target_kw_reduction, incentive_paise_per_kwh) values
  ('65000000-0000-0000-0000-0000000000e9', '65000000-0000-0000-0000-00000000000a', now() - interval '3 hours', now() - interval '2 hours', 2, 500);
insert into dr_participations (event_id, service_connection_id) values
  ('65000000-0000-0000-0000-0000000000e9', '65000000-0000-0000-0000-0000000000c1');

-- Event 2: ended 30 hours ago — same shape, but outside the resettlement
-- window by the time we get to the second sweep below.
insert into demand_response_events (id, division_id, starts_at, ends_at, target_kw_reduction, incentive_paise_per_kwh) values
  ('65000000-0000-0000-0000-0000000000ea', '65000000-0000-0000-0000-00000000000a', now() - interval '31 hours', now() - interval '30 hours', 2, 500);
insert into dr_participations (event_id, service_connection_id) values
  ('65000000-0000-0000-0000-0000000000ea', '65000000-0000-0000-0000-0000000000c2');

-- First sweep: neither c1 nor c2 has any meter reading yet — both settle
-- unverified.
select sweep_demand_response_events();

select results_eq(
  $$ select verified_by_meter, achieved_reduction_kwh is null from dr_participations where event_id = '65000000-0000-0000-0000-0000000000e9' and service_connection_id = '65000000-0000-0000-0000-0000000000c1' $$,
  $$ values (false, true) $$,
  'first sweep: no data yet, c1 settles unverified'
);

-- Now the "late" readings land for both connections — 7 prior days at
-- 10 kWh each (baseline), plus 4 kWh actually used during the event
-- window (a real 6kWh reduction), identical shape for both c1 and c2.
-- Anchored to starts_at (not ends_at) + 1 minute, same convention as
-- 0059's own test: that lands each reading just inside the window from
-- its lower (inclusive) bound, not 1 minute past its upper (exclusive) one.
insert into meter_readings (meter_id, reading_ts, delta_import_kwh)
select '65000000-0000-0000-0000-0000000000e1', (now() - interval '3 hours') - (n || ' days')::interval + interval '1 minute', 10
from generate_series(1, 7) n;
insert into meter_readings (meter_id, reading_ts, delta_import_kwh) values
  ('65000000-0000-0000-0000-0000000000e1', now() - interval '2 hours 40 minutes', 4);

insert into meter_readings (meter_id, reading_ts, delta_import_kwh)
select '65000000-0000-0000-0000-0000000000e2', (now() - interval '31 hours') - (n || ' days')::interval + interval '1 minute', 10
from generate_series(1, 7) n;
insert into meter_readings (meter_id, reading_ts, delta_import_kwh) values
  ('65000000-0000-0000-0000-0000000000e2', now() - interval '30 hours 40 minutes', 4);

-- Second sweep: resettlement pass should now pick up c1 (event 1 hour age is
-- well under 24h) and correct it to a real, verified 6kWh reduction.
select sweep_demand_response_events();

select results_eq(
  $$ select verified_by_meter from dr_participations where event_id = '65000000-0000-0000-0000-0000000000e9' and service_connection_id = '65000000-0000-0000-0000-0000000000c1' $$,
  $$ values (true) $$,
  'resettlement: c1''s late-arriving reading gets picked up within the 24h window'
);

select ok(
  (select abs(achieved_reduction_kwh - 6) < 0.01 from dr_participations where event_id = '65000000-0000-0000-0000-0000000000e9' and service_connection_id = '65000000-0000-0000-0000-0000000000c1'),
  'resettlement: achieved reduction is baseline (10kWh) minus actual (4kWh) = 6kWh, same arithmetic as the original sweep'
);

-- c2's event is 30h old — outside the 24h resettlement window — so its
-- identically-shaped late reading must NOT be picked up.
select results_eq(
  $$ select verified_by_meter, achieved_reduction_kwh is null from dr_participations where event_id = '65000000-0000-0000-0000-0000000000ea' and service_connection_id = '65000000-0000-0000-0000-0000000000c2' $$,
  $$ values (false, true) $$,
  'resettlement: an event outside the 24h window is never revisited, even with real data now available'
);

-- Regression: re-running the sweep a third time must not touch c1 again —
-- once verified, a settlement is never revisited or overwritten, even if
-- (hypothetically) more readings show up.
insert into meter_readings (meter_id, reading_ts, delta_import_kwh) values
  ('65000000-0000-0000-0000-0000000000e1', now() - interval '2 hours 10 minutes', 999);
select sweep_demand_response_events();

select ok(
  (select abs(achieved_reduction_kwh - 6) < 0.01 from dr_participations where event_id = '65000000-0000-0000-0000-0000000000e9' and service_connection_id = '65000000-0000-0000-0000-0000000000c1'),
  'regression: an already-verified settlement is never revisited by a later sweep, even if more readings appear'
);

select finish();
rollback;
