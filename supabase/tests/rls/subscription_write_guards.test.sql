-- subscriptions_guard_insert/_update, subscription_events ownership+actor,
-- service_guarantees_guard_insert (0044, #6 follow-up) — the sibling gaps
-- to 0043: RLS checked connection ownership but never validated the shape
-- of what was being written, so a signed-in consumer could self-upgrade,
-- forge audit events, or fabricate guarantee terms, all via direct
-- PostgREST calls that never touch the app's actual business logic.

begin;
select plan(9);

insert into orgs (id, name, type) values ('93000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('93000000-0000-0000-0000-00000000000a', '93000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('93000000-0000-0000-0000-0000000000a1', '93000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('93000000-0000-0000-0000-0000000000a2', '93000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('93000000-0000-0000-0000-0000000000a3', '93000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('93000000-0000-0000-0000-0000000000e1', 'subguard.x@test.local'),
  ('93000000-0000-0000-0000-0000000000e2', 'subguard.y@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('93000000-0000-0000-0000-0000000000c1', 'CN-X-SUBG', '93000000-0000-0000-0000-0000000000a3', '93000000-0000-0000-0000-0000000000e1', 'RGP', 'single', 'postpaid');

insert into service_types (id, code, name, unit, meter_source, billing_basis) values
  ('93000000-0000-0000-0000-0000000000t1', 'solar_kwh_guard', 'Solar', 'kwh', 'meter_readings', 'included_plus_overage');

insert into plans (id, code, name, description, price_paise_per_month) values
  ('93000000-0000-0000-0000-0000000000p1', 'guard_basic', 'Guard Basic', 'test plan', 99900);

insert into plan_services (plan_id, service_type_id, included_quantity, overage_rate_paise_per_unit, guarantee_metric, guarantee_contracted_value, guarantee_rate_paise_per_unit_shortfall, guarantee_cap_paise) values
  ('93000000-0000-0000-0000-0000000000p1', '93000000-0000-0000-0000-0000000000t1', 300, 500, 'availability_pct', 0.98, 100000, 50000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"93000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

-- subscriptions insert: a client-supplied lifecycle field is exactly what
-- /api/subscriptions never sends (it inserts {connection, plan} only).
select throws_ok(
  $$ insert into subscriptions (service_connection_id, plan_id, cancelled_at) values ('93000000-0000-0000-0000-0000000000c1', '93000000-0000-0000-0000-0000000000p1', now()) $$,
  '42501',
  null,
  'a consumer cannot insert a subscription with a lifecycle field already set'
);

select lives_ok(
  $$ insert into subscriptions (id, service_connection_id, plan_id) values ('93000000-0000-0000-0000-0000000000s1', '93000000-0000-0000-0000-0000000000c1', '93000000-0000-0000-0000-0000000000p1') $$,
  'a plain {connection, plan} insert — what /api/subscriptions actually sends — still works'
);

-- subscriptions update: the exact self-upgrade-for-free attack — changing
-- plan_id and status together in one write.
select throws_ok(
  $$ update subscriptions set plan_id = '93000000-0000-0000-0000-0000000000p1', status = 'cancelled' where id = '93000000-0000-0000-0000-0000000000s1' $$,
  '42501',
  null,
  'a consumer cannot change plan_id and status in the same write'
);

-- The legitimate active -> paused transition still works.
select lives_ok(
  $$ update subscriptions set status = 'paused' where id = '93000000-0000-0000-0000-0000000000s1' $$,
  'the legitimate active -> paused transition still works'
);

select throws_ok(
  $$ update subscriptions set status = 'active', plan_id = '93000000-0000-0000-0000-0000000000p1' where id = '93000000-0000-0000-0000-0000000000s1' $$,
  '42501',
  null,
  'resuming and changing plan in the same write is rejected (upgrade must be its own active->active write)'
);

-- subscription_events: ownership + actor identity.
select throws_ok(
  $$ insert into subscription_events (subscription_id, event_type, actor_user_id) values ('93000000-0000-0000-0000-0000000000s1', 'paused', '93000000-0000-0000-0000-0000000000e2') $$,
  '42501',
  null,
  'a consumer cannot forge an audit event attributed to someone else'
);

select lives_ok(
  $$ insert into subscription_events (subscription_id, event_type, actor_user_id) values ('93000000-0000-0000-0000-0000000000s1', 'paused', '93000000-0000-0000-0000-0000000000e1') $$,
  'a consumer can log a real audit event attributed to themselves'
);

-- service_guarantees: terms must match the plan's own catalog entry.
select throws_ok(
  $$ insert into service_guarantees (service_connection_id, subscription_id, metric, contracted_value, measurement_window, rate_paise_per_unit_shortfall, cap_paise, effective_from)
     values ('93000000-0000-0000-0000-0000000000c1', '93000000-0000-0000-0000-0000000000s1', 'availability_pct', 0.01, 'monthly', 99999999, 99999999, current_date) $$,
  '42501',
  null,
  'a consumer cannot fabricate guarantee terms unrelated to the plan they subscribed to'
);

select lives_ok(
  $$ insert into service_guarantees (service_connection_id, subscription_id, metric, contracted_value, measurement_window, rate_paise_per_unit_shortfall, cap_paise, effective_from)
     values ('93000000-0000-0000-0000-0000000000c1', '93000000-0000-0000-0000-0000000000s1', 'availability_pct', 0.98, 'monthly', 100000, 50000, current_date) $$,
  'inserting the plan''s real catalog terms verbatim (what /api/subscriptions actually does) still works'
);

select * from finish();
rollback;
