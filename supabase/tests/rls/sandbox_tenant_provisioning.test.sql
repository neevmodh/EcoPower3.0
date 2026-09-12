-- sandbox_tenant_provisioning (0051, #105). Two things this suite has to
-- prove that no other suite in this repo has needed to before: a trigger
-- actually fires off a real `insert into auth.users`, and an ungated
-- INSERT into that table does NOT get a sandbox built for it (the gate
-- that keeps every admin-API-created account — the 7 existing demo logins,
-- any future seed script — from silently getting a redundant tenant).

begin;
select plan(11);

-- ============================================================
-- Gate: no signup_source flag => no sandbox.
-- ============================================================

insert into auth.users (id, email) values
  ('99000000-0000-0000-0000-0000000000e1', 'sbx.ungated@test.local');

select is_empty(
  $$ select 1 from sandbox_tenants where user_id = '99000000-0000-0000-0000-0000000000e1' $$,
  'an auth.users insert with no signup_source flag gets no sandbox tenant'
);

select is_empty(
  $$ select 1 from user_roles where user_id = '99000000-0000-0000-0000-0000000000e1' $$,
  'and no roles either — the gate is a real no-op, not a partial provision'
);

-- ============================================================
-- The real path: a flagged signup provisions everything.
-- ============================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('99000000-0000-0000-0000-0000000000e2', 'sbx.real@test.local', '{"signup_source": "sandbox"}'::jsonb);

select isnt_empty(
  $$ select 1 from sandbox_tenants where user_id = '99000000-0000-0000-0000-0000000000e2' $$,
  'a flagged signup gets a sandbox_tenants tracking row'
);

select is(
  (select count(*)::int from user_roles where user_id = '99000000-0000-0000-0000-0000000000e2'),
  6,
  'exactly the 6 promised tenant-scoped roles were granted'
);

select is_empty(
  $$ select 1 from user_roles where user_id = '99000000-0000-0000-0000-0000000000e2' and role = 'platform_admin' $$,
  'platform_admin is never among them, regardless of what a client might try to pass'
);

select isnt_empty(
  $$ select 1 from service_connections where owner_user_id = '99000000-0000-0000-0000-0000000000e2' $$,
  'the user owns a real service connection (the consumer-panel view)'
);

select isnt_empty(
  $$ select 1 from service_connections sc join sandbox_tenants st on st.society_org_id = sc.society_org_id
     where st.user_id = '99000000-0000-0000-0000-0000000000e2' $$,
  'a unit exists inside the tenant''s own society (the society-panel view)'
);

select ok(
  (select count(*)::int from meter_readings mr
     join meters m on m.id = mr.meter_id
     join service_connections sc on sc.id = m.service_connection_id
     join sandbox_tenants st on st.user_id = sc.owner_user_id
   where st.user_id = '99000000-0000-0000-0000-0000000000e2') > 0,
  'real telemetry history was backfilled for the owned connection, not left empty'
);

select isnt_empty(
  $$ select 1 from work_orders wo join sandbox_tenants st on st.resco_org_id = wo.resco_org_id
     where st.user_id = '99000000-0000-0000-0000-0000000000e2' $$,
  'a work order exists in the tenant''s own RESCO org (the field/operator-panel view)'
);

select isnt_empty(
  $$ select 1 from netmetering_applications na
     join service_connections sc on sc.id = na.service_connection_id
     where sc.owner_user_id = '99000000-0000-0000-0000-0000000000e2' $$,
  'a net-metering application exists for the DISCOM officer view to decide on'
);

-- ============================================================
-- provision_sandbox_tenant() itself is not silently a no-op on conflict —
-- it's the *trigger* wrapper's job (0051) to catch and log a failure, not
-- the function's. A second direct call for an already-provisioned user
-- must still raise (sandbox_tenants.user_id is the primary key).
-- ============================================================

select throws_ok(
  $$ select provision_sandbox_tenant('99000000-0000-0000-0000-0000000000e2') $$,
  null,
  null,
  'calling provision_sandbox_tenant() twice for the same user raises — the trigger, not the function, is what must swallow this'
);

select * from finish();
rollback;
