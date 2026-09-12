-- sandbox_isolation (#106) — provisions two real sandbox tenants (via the
-- same auth.users trigger #142 ships, not a hand-built fixture) and proves
-- every tenant-scoped role provision_sandbox_tenant() grants stays scoped
-- to its own tenant: reads 0 rows of the other tenant's data, still reads
-- its own, and cannot write into the other tenant's rows either.
--
-- Unlike every other fixture-based RLS test in this suite, the scope ids
-- here (org/division ids) are randomly generated per tenant by
-- provision_sandbox_tenant() itself, not fixed UUIDs. sandbox_tenants
-- itself is revoked from anon/authenticated (0051) — not user-facing — so
-- its ids are captured into psql variables via \gset *before* switching to
-- the authenticated role below; every later query references those
-- variables instead of querying sandbox_tenants directly under a role that
-- has no privileges on it.

begin;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('9a000000-0000-0000-0000-0000000000a1', 'sbx.isoa@test.local', '{"signup_source": "sandbox"}'::jsonb),
  ('9a000000-0000-0000-0000-0000000000b1', 'sbx.isob@test.local', '{"signup_source": "sandbox"}'::jsonb);

select isnt_empty(
  $$ select 1 from sandbox_tenants where user_id = '9a000000-0000-0000-0000-0000000000a1' $$,
  'tenant A provisioned'
);
select diag(coalesce(
  (select 'tenant A provisioning failed: ' || error_message from sandbox_provisioning_errors where user_id = '9a000000-0000-0000-0000-0000000000a1'),
  'tenant A: no provisioning error logged'
));
select diag(coalesce(
  (select 'tenant B provisioning failed: ' || error_message from sandbox_provisioning_errors where user_id = '9a000000-0000-0000-0000-0000000000b1'),
  'tenant B: no provisioning error logged'
));

select isnt_empty(
  $$ select 1 from sandbox_tenants where user_id = '9a000000-0000-0000-0000-0000000000b1' $$,
  'tenant B provisioned'
);

-- Scalar subqueries, not a plain SELECT ... WHERE — guarantees exactly one
-- row (nulls if provisioning silently failed) so \gset itself can never
-- abort the file; a failed provision surfaces as ordinary failed
-- assertions below instead, with the diag() above already naming why.
select
  (select discom_org_id from sandbox_tenants where user_id = '9a000000-0000-0000-0000-0000000000a1') as a_discom_org_id,
  (select society_org_id from sandbox_tenants where user_id = '9a000000-0000-0000-0000-0000000000a1') as a_society_org_id,
  (select resco_org_id from sandbox_tenants where user_id = '9a000000-0000-0000-0000-0000000000a1') as a_resco_org_id,
  (select division_id from sandbox_tenants where user_id = '9a000000-0000-0000-0000-0000000000a1') as a_division_id,
  (select dt_id from sandbox_tenants where user_id = '9a000000-0000-0000-0000-0000000000a1') as a_dt_id,
  (select discom_org_id from sandbox_tenants where user_id = '9a000000-0000-0000-0000-0000000000b1') as b_discom_org_id,
  (select society_org_id from sandbox_tenants where user_id = '9a000000-0000-0000-0000-0000000000b1') as b_society_org_id,
  (select resco_org_id from sandbox_tenants where user_id = '9a000000-0000-0000-0000-0000000000b1') as b_resco_org_id,
  (select division_id from sandbox_tenants where user_id = '9a000000-0000-0000-0000-0000000000b1') as b_division_id,
  (select dt_id from sandbox_tenants where user_id = '9a000000-0000-0000-0000-0000000000b1') as b_dt_id
\gset

-- ============================================================
-- Tenant A as discom_officer: sees tenant A's own service_connections,
-- sees none of tenant B's.
-- ============================================================

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '9a000000-0000-0000-0000-0000000000a1', 'role', 'authenticated',
    'app_metadata', jsonb_build_object('roles', array['discom_officer'], 'org_ids', array[:'a_discom_org_id'::uuid], 'division_ids', array[:'a_division_id'::uuid])
  )::text,
  true
);
set local role authenticated;

select ok(
  (select count(*) from service_connections where dt_id = :'a_dt_id'::uuid) > 0,
  'tenant A''s discom_officer sees tenant A''s own connections'
);

select is_empty(
  format($$ select 1 from service_connections where dt_id = %L::uuid $$, :'b_dt_id'),
  'tenant A''s discom_officer sees zero of tenant B''s connections'
);

select is_empty(
  format($$ select 1 from meter_readings mr join meters m on m.id = mr.meter_id
       where m.dt_id = %L::uuid
          or m.service_connection_id in (select id from service_connections where dt_id = %L::uuid) $$,
    :'b_dt_id', :'b_dt_id'),
  'tenant A''s discom_officer reads zero of tenant B''s meter_readings'
);

select is_empty(
  format($$ select 1 from work_orders where resco_org_id = %L::uuid $$, :'b_resco_org_id'),
  'tenant A''s discom_officer (not a RESCO role) sees zero work orders anywhere, let alone tenant B''s'
);

-- discom_officer has no UPDATE policy on service_connections at all (only
-- society_admin does, 0020) — under RLS this matches zero rows rather than
-- throwing, so verify the row is genuinely untouched with RLS bypassed,
-- same pattern technician.test.sql already uses for this exact shape.
update service_connections set sanctioned_load_kw = 999 where dt_id = :'b_dt_id'::uuid;

reset role;
select isnt(
  (select sanctioned_load_kw from service_connections where dt_id = :'b_dt_id'::uuid limit 1),
  999,
  'tenant A''s discom_officer''s write attempt on tenant B''s connection matched zero rows under RLS'
);
set local role authenticated;

-- ============================================================
-- Tenant A as resco_ops: sees tenant A's work order, none of tenant B's.
-- ============================================================

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '9a000000-0000-0000-0000-0000000000a1', 'role', 'authenticated',
    'app_metadata', jsonb_build_object('roles', array['resco_ops'], 'org_ids', array[:'a_resco_org_id'::uuid], 'division_ids', '{}'::uuid[])
  )::text,
  true
);

select ok(
  (select count(*) from work_orders where resco_org_id = :'a_resco_org_id'::uuid) > 0,
  'tenant A''s resco_ops sees tenant A''s own work order'
);

select is_empty(
  format($$ select 1 from work_orders where resco_org_id = %L::uuid $$, :'b_resco_org_id'),
  'tenant A''s resco_ops sees zero of tenant B''s work orders'
);

-- ============================================================
-- Tenant A as society_admin: sees tenant A's society unit, none of B's.
-- ============================================================

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '9a000000-0000-0000-0000-0000000000a1', 'role', 'authenticated',
    'app_metadata', jsonb_build_object('roles', array['society_admin'], 'org_ids', array[:'a_society_org_id'::uuid], 'division_ids', '{}'::uuid[])
  )::text,
  true
);

select ok(
  (select count(*) from service_connections where society_org_id = :'a_society_org_id'::uuid) > 0,
  'tenant A''s society_admin sees tenant A''s own society unit'
);

select is_empty(
  format($$ select 1 from service_connections where society_org_id = %L::uuid $$, :'b_society_org_id'),
  'tenant A''s society_admin sees zero of tenant B''s society units'
);

-- ============================================================
-- Tenant A as consumer: sees their own connection, not tenant B's owner's.
-- ============================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"9a000000-0000-0000-0000-0000000000a1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}',
  true
);

select isnt_empty(
  $$ select 1 from service_connections where owner_user_id = '9a000000-0000-0000-0000-0000000000a1' $$,
  'tenant A''s consumer sees their own connection'
);

select is_empty(
  $$ select 1 from service_connections where owner_user_id = '9a000000-0000-0000-0000-0000000000b1' $$,
  'tenant A''s consumer sees zero of tenant B''s owned connection'
);

-- ============================================================
-- No provisioned tenant role ever includes platform_admin.
-- ============================================================

reset role;
select is_empty(
  $$ select 1 from user_roles where user_id in ('9a000000-0000-0000-0000-0000000000a1', '9a000000-0000-0000-0000-0000000000b1') and role = 'platform_admin' $$,
  'neither sandbox tenant was ever granted platform_admin'
);

select * from finish();
rollback;
