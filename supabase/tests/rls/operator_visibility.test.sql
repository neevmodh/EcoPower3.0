-- operator visibility (0029): a RESCO operator can read service guarantees,
-- settlements, live meter state and readings for a connection its org
-- services (asset-org join), and nothing for a connection it does not.

begin;
select plan(4);

select create_monthly_partition(date_trunc('month', now())::date);

insert into orgs (id, name, type) values
  ('29000000-0000-0000-0000-000000000001', 'RESCO Co', 'resco'),
  ('29000000-0000-0000-0000-000000000002', 'DISCOM Co', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('29000000-0000-0000-0000-00000000000a', '29000000-0000-0000-0000-000000000002', 'A', 'division');
insert into substations (id, division_id, name) values ('29000000-0000-0000-0000-0000000000a1', '29000000-0000-0000-0000-00000000000a', 'SS');
insert into feeders (id, substation_id, name) values ('29000000-0000-0000-0000-0000000000a2', '29000000-0000-0000-0000-0000000000a1', 'F');
insert into distribution_transformers (id, feeder_id, name) values ('29000000-0000-0000-0000-0000000000a3', '29000000-0000-0000-0000-0000000000a2', 'DT');

insert into auth.users (id, email) values
  ('29000000-0000-0000-0000-0000000000e1', 'ops.ours@test.local'),
  ('29000000-0000-0000-0000-0000000000e2', 'ops.theirs@test.local');

insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type) values
  ('29000000-0000-0000-0000-0000000000c1', 'CN-29-1', '29000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid'),
  ('29000000-0000-0000-0000-0000000000c2', 'CN-29-2', '29000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid');

-- Our RESCO has a PV asset only on connection 1.
insert into assets (id, service_connection_id, asset_type, capacity_kw, resco_org_id) values
  ('29000000-0000-0000-0000-0000000000b1', '29000000-0000-0000-0000-0000000000c1', 'pv_array', 5, '29000000-0000-0000-0000-000000000001');

insert into meters (id, serial, service_connection_id) values
  ('29000000-0000-0000-0000-0000000000d1', 'MTR-29-1', '29000000-0000-0000-0000-0000000000c1'),
  ('29000000-0000-0000-0000-0000000000d2', 'MTR-29-2', '29000000-0000-0000-0000-0000000000c2');
insert into meter_readings (meter_id, reading_ts, kwh_import) values
  ('29000000-0000-0000-0000-0000000000d1', now() - interval '1 hour', 100),
  ('29000000-0000-0000-0000-0000000000d2', now() - interval '1 hour', 200);

insert into service_guarantees (service_connection_id, metric, contracted_value, measurement_window, rate_paise_per_unit_shortfall, effective_from) values
  ('29000000-0000-0000-0000-0000000000c1', 'performance_ratio', 0.95, 'monthly', 100000, current_date),
  ('29000000-0000-0000-0000-0000000000c2', 'performance_ratio', 0.95, 'monthly', 100000, current_date);

-- ---- our operator: sees only connection 1 ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"29000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["resco_ops"],"org_ids":["29000000-0000-0000-0000-000000000001"],"division_ids":[]}}';

select is((select count(*)::int from service_guarantees), 1, 'operator sees the guarantee for the connection its org services');
select is((select count(*)::int from meter_readings), 1, 'operator sees meter readings for that connection only');

-- ---- a different RESCO operator: sees nothing here ----
set local request.jwt.claims = '{"sub":"29000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["resco_ops"],"org_ids":["29000000-0000-0000-0000-000000000099"],"division_ids":[]}}';

select is((select count(*)::int from service_guarantees), 0, 'an operator whose org services neither connection sees no guarantees');
select is((select count(*)::int from meter_readings), 0, 'and no readings');

rollback;
