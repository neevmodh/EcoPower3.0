-- Demand response (#33, 0059): baseline is the average of a consumer's own
-- metered consumption over the same clock-time window on the 7 preceding
-- days; achieved reduction and incentive are only ever set by the sweep
-- from real meter reads, never by the client directly.

begin;
select plan(12);

-- Readings span up to 9 days back from "now" — pre-create this month's and
-- last month's partitions in case the suite runs near a boundary.
select create_monthly_partition(date_trunc('month', now())::date);
select create_monthly_partition((date_trunc('month', now()) - interval '1 month')::date);

insert into orgs (id, name, type) values ('64000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('64000000-0000-0000-0000-00000000000a', '64000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('64000000-0000-0000-0000-0000000000a1', '64000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('64000000-0000-0000-0000-0000000000a2', '64000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('64000000-0000-0000-0000-0000000000a3', '64000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('64000000-0000-0000-0000-0000000000f1', 'dr.consumer1@test.local'),
  ('64000000-0000-0000-0000-0000000000f2', 'dr.consumer2@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('64000000-0000-0000-0000-0000000000c1', 'CN-DR-01', '64000000-0000-0000-0000-0000000000a3', '64000000-0000-0000-0000-0000000000f1', 'RGP', 'single', 'postpaid'),
  ('64000000-0000-0000-0000-0000000000c2', 'CN-DR-02', '64000000-0000-0000-0000-0000000000a3', '64000000-0000-0000-0000-0000000000f2', 'RGP', 'single', 'postpaid');

insert into meters (id, serial, service_connection_id) values
  ('64000000-0000-0000-0000-0000000000e1', 'MTR-DR-01', '64000000-0000-0000-0000-0000000000c1');
-- Consumer 2 has no meter at all — the "insufficient data" path.

-- A second division, for the cross-division opt-in test below.
insert into discom_divisions (id, discom_org_id, name, level) values
  ('64000000-0000-0000-0000-00000000000b', '64000000-0000-0000-0000-000000000001', 'Division B', 'division');
insert into substations (id, division_id, name) values ('64000000-0000-0000-0000-0000000000b1', '64000000-0000-0000-0000-00000000000b', 'SS B');
insert into feeders (id, substation_id, name) values ('64000000-0000-0000-0000-0000000000b2', '64000000-0000-0000-0000-0000000000b1', 'Feeder B');
insert into distribution_transformers (id, feeder_id, name) values ('64000000-0000-0000-0000-0000000000b3', '64000000-0000-0000-0000-0000000000b2', 'DT B');

-- A third connection, for the "opt into an event that already started"
-- INSERT test below (c1 already has a row for the e9 event).
insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('64000000-0000-0000-0000-0000000000c3', 'CN-DR-03', '64000000-0000-0000-0000-0000000000a3', '64000000-0000-0000-0000-0000000000f1', 'RGP', 'single', 'postpaid');

-- A fourth connection with a real meter that genuinely used zero energy
-- during both the baseline days and the event — distinct from consumer 2's
-- "no meter at all" case: this one IS meter-verified, just with a real
-- zero, not a fabricated one from missing data.
insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('64000000-0000-0000-0000-0000000000c4', 'CN-DR-04', '64000000-0000-0000-0000-0000000000a3', '64000000-0000-0000-0000-0000000000f1', 'RGP', 'single', 'postpaid');
insert into meters (id, serial, service_connection_id) values
  ('64000000-0000-0000-0000-0000000000e4', 'MTR-DR-04', '64000000-0000-0000-0000-0000000000c4');
insert into meter_readings (meter_id, reading_ts, delta_import_kwh)
select '64000000-0000-0000-0000-0000000000e4', (now() - interval '25 hours') - (n || ' days')::interval + interval '1 minute', 0
from generate_series(1, 7) n;
insert into meter_readings (meter_id, reading_ts, delta_import_kwh) values
  ('64000000-0000-0000-0000-0000000000e4', now() - interval '20 hours', 0);

-- Event: already ended (25h ago -> 1h ago), Rs 5/kWh incentive.
insert into demand_response_events (id, division_id, starts_at, ends_at, target_kw_reduction, incentive_paise_per_kwh) values
  ('64000000-0000-0000-0000-0000000000e9', '64000000-0000-0000-0000-00000000000a', now() - interval '25 hours', now() - interval '1 hour', 2, 500);

-- 7 prior days, same window, 10 kWh each -> baseline average 10 kWh.
insert into meter_readings (meter_id, reading_ts, delta_import_kwh)
select '64000000-0000-0000-0000-0000000000e1', (now() - interval '25 hours') - (n || ' days')::interval + interval '1 minute', 10
from generate_series(1, 7) n;

-- Actual consumption during the event window itself: 4 kWh (a real reduction).
insert into meter_readings (meter_id, reading_ts, delta_import_kwh) values
  ('64000000-0000-0000-0000-0000000000e1', now() - interval '20 hours', 4);

insert into dr_participations (event_id, service_connection_id) values
  ('64000000-0000-0000-0000-0000000000e9', '64000000-0000-0000-0000-0000000000c1'),
  ('64000000-0000-0000-0000-0000000000e9', '64000000-0000-0000-0000-0000000000c2'),
  ('64000000-0000-0000-0000-0000000000e9', '64000000-0000-0000-0000-0000000000c4');

-- A future, not-yet-started Division B event — for the cross-division
-- opt-in test below.
insert into demand_response_events (id, division_id, starts_at, ends_at, target_kw_reduction, incentive_paise_per_kwh) values
  ('64000000-0000-0000-0000-0000000000eb', '64000000-0000-0000-0000-00000000000b', now() + interval '1 day', now() + interval '2 days', 2, 500);

-- A future, not-yet-started Division A event that gets cancelled before
-- anyone opts in — for the cancelled-event opt-in test below.
insert into demand_response_events (id, division_id, starts_at, ends_at, target_kw_reduction, incentive_paise_per_kwh, status) values
  ('64000000-0000-0000-0000-0000000000ec', '64000000-0000-0000-0000-00000000000a', now() + interval '1 day', now() + interval '2 days', 2, 500, 'cancelled');

select sweep_demand_response_events();

select results_eq(
  $$ select status from demand_response_events where id = '64000000-0000-0000-0000-0000000000e9' $$,
  $$ values ('completed'::dr_event_status) $$,
  'the sweep completes an event once its ends_at has passed'
);

select ok(
  (select abs(achieved_reduction_kwh - 6) < 0.01 from dr_participations where event_id = '64000000-0000-0000-0000-0000000000e9' and service_connection_id = '64000000-0000-0000-0000-0000000000c1'),
  'achieved reduction is baseline (10kWh) minus actual (4kWh) = 6kWh'
);

select results_eq(
  $$ select incentive_paise from dr_participations where event_id = '64000000-0000-0000-0000-0000000000e9' and service_connection_id = '64000000-0000-0000-0000-0000000000c1' $$,
  $$ values (3000::bigint) $$,
  '6kWh x Rs 5/kWh (500 paise) = 3000 paise incentive'
);

select results_eq(
  $$ select verified_by_meter from dr_participations where event_id = '64000000-0000-0000-0000-0000000000e9' and service_connection_id = '64000000-0000-0000-0000-0000000000c1' $$,
  $$ values (true) $$,
  'consumer 1 (real meter data both sides) is verified_by_meter'
);

select results_eq(
  $$ select verified_by_meter, achieved_reduction_kwh is null from dr_participations where event_id = '64000000-0000-0000-0000-0000000000e9' and service_connection_id = '64000000-0000-0000-0000-0000000000c2' $$,
  $$ values (false, true) $$,
  'consumer 2 (no meter at all) settles as unverified with no achieved figure — never a self-reported fallback'
);

select results_eq(
  $$ select verified_by_meter, achieved_reduction_kwh from dr_participations where event_id = '64000000-0000-0000-0000-0000000000e9' and service_connection_id = '64000000-0000-0000-0000-0000000000c4' $$,
  $$ values (true, 0::numeric) $$,
  'consumer 4 (real meter, genuinely zero usage throughout) is verified with a real zero, not conflated with consumer 2''s missing-data case'
);

-- Write guard: a consumer cannot set their own achieved_reduction_kwh.
set local role authenticated;
set local request.jwt.claims = '{"sub":"64000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select throws_ok(
  $$ update dr_participations set achieved_reduction_kwh = 999 where event_id = '64000000-0000-0000-0000-0000000000e9' and service_connection_id = '64000000-0000-0000-0000-0000000000c1' $$,
  '42501',
  null,
  'a consumer cannot set their own achieved_reduction_kwh — that is the sweep''s word to say'
);

-- Write guard: cannot flip opted_in after the event has started (this
-- event ended long ago).
select throws_ok(
  $$ update dr_participations set opted_in = false where event_id = '64000000-0000-0000-0000-0000000000e9' and service_connection_id = '64000000-0000-0000-0000-0000000000c1' $$,
  '42501',
  null,
  'a consumer cannot change their opt-in status after the event has started'
);

-- INSERT guard: cannot opt into an event that has already started (c3 has
-- no existing row for e9, so this is a fresh insert, not an update).
select throws_ok(
  $$ insert into dr_participations (event_id, service_connection_id) values ('64000000-0000-0000-0000-0000000000e9', '64000000-0000-0000-0000-0000000000c3') $$,
  '42501',
  null,
  'a consumer cannot opt into an event that has already started'
);

-- INSERT guard: cannot opt into another division's event, even with a
-- valid own-connection id and a future (not-yet-started) event.
select throws_ok(
  $$ insert into dr_participations (event_id, service_connection_id) values ('64000000-0000-0000-0000-0000000000eb', '64000000-0000-0000-0000-0000000000c1') $$,
  '42501',
  null,
  'a consumer cannot opt into another division''s event'
);

-- INSERT guard: cannot opt into an event a discom_admin already cancelled,
-- even though it hasn't started yet and is in the caller's own division.
select throws_ok(
  $$ insert into dr_participations (event_id, service_connection_id) values ('64000000-0000-0000-0000-0000000000ec', '64000000-0000-0000-0000-0000000000c1') $$,
  '42501',
  null,
  'a consumer cannot opt into a cancelled event'
);

reset role;
select isnt_empty(
  $$ select 1 from dr_participations where event_id = '64000000-0000-0000-0000-0000000000e9' and service_connection_id = '64000000-0000-0000-0000-0000000000c1' and settled_at is not null $$,
  'the sweep itself (not an authenticated session) can freely write the settlement fields'
);

select finish();
rollback;
