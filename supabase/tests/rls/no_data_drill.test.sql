-- The no-data drill (#71) — DESIGN.md P1, "no component may outlive its
-- data," proven at the one layer a UI fix can't lock in by itself: the
-- data contract. dt_loss_summary() (0017) correctly returns loss_pct =
-- NULL for a DT with no measurable delivered energy — a freshly
-- commissioned DT-head meter with only a first reading (no delta yet
-- computed) is exactly this case. The real bug this drill exists to catch
-- lived one layer up: /discom's page did `Number(r.loss_pct)` before
-- checking for null, and `Number(null) === 0` in JS — so an unmeasured DT
-- rendered as "0.0% loss," sorted as the greenest bar on the chart, the
-- textbook "decorative element outlives its data" failure. Fixed in the
-- page; this test locks in the DB side of the contract that fix depends
-- on, so a future change to dt_loss_summary() can't silently reintroduce
-- a fake zero without a test failing here.

begin;
select plan(2);

insert into orgs (id, name, type) values ('94000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('94000000-0000-0000-0000-00000000000a', '94000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('94000000-0000-0000-0000-0000000000a1', '94000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('94000000-0000-0000-0000-0000000000a2', '94000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('94000000-0000-0000-0000-0000000000a3', '94000000-0000-0000-0000-0000000000a2', 'Freshly commissioned DT');

-- The DT-head meter exists and has exactly one reading — a real
-- commissioning scenario, not a missing-data one. No delta exists yet
-- because a delta needs two reads.
insert into meters (id, serial, dt_id) values ('94000000-0000-0000-0000-0000000000a6', 'DTM-FRESH', '94000000-0000-0000-0000-0000000000a3');
insert into meter_readings (meter_id, reading_ts, kwh_import, delta_import_kwh) values
  ('94000000-0000-0000-0000-0000000000a6', now(), 1250.000, null);

select results_eq(
  $$ select loss_pct is null from dt_loss_summary() where dt_id = '94000000-0000-0000-0000-0000000000a3' $$,
  $$ values (true) $$,
  'a freshly-commissioned DT with no measurable delivered energy gets loss_pct = NULL, never a fake 0'
);

select results_eq(
  $$ select delivered_kwh from dt_loss_summary() where dt_id = '94000000-0000-0000-0000-0000000000a3' $$,
  $$ values (0::numeric) $$,
  'delivered_kwh itself is honestly 0 (nothing summed yet) — it is loss_pct specifically that must not fake a ratio over it'
);

select * from finish();
rollback;
