-- 0054_sandbox_consumer_number_collision.sql — real bug caught by #143's
-- own isolation test, not a fixture artifact: provision_sandbox_tenant()
-- (0051) built each connection's consumer_number from just the first 8 hex
-- characters of the user's uuid (`left(p_user_id::text, 8)`). 8 hex chars
-- is 32 bits of entropy — a real collision risk at scale (birthday paradox
-- puts a 50% collision chance around ~65k signups, not an exotic edge
-- case for a public sandbox), and #143's own two test users happened to
-- share that exact prefix, hitting
-- "duplicate key value violates unique constraint
-- service_connections_consumer_number_key" for the second tenant
-- immediately.
--
-- Fix: use the full uuid, not a truncated prefix. consumer_number has no
-- length constraint (`text not null unique`), so there's no reason to have
-- ever truncated it. Guaranteed unique per user as long as auth.users.id
-- itself is (it's the primary key).

create or replace function provision_sandbox_tenant(p_user_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_discom_org   uuid := extensions.gen_random_uuid();
  v_society_org  uuid := extensions.gen_random_uuid();
  v_resco_org    uuid := extensions.gen_random_uuid();
  v_division     uuid := extensions.gen_random_uuid();
  v_substation   uuid := extensions.gen_random_uuid();
  v_feeder       uuid := extensions.gen_random_uuid();
  v_dt           uuid := extensions.gen_random_uuid();
  v_conn_home    uuid := extensions.gen_random_uuid();  -- the signed-up user's own connection
  v_conn_2       uuid := extensions.gen_random_uuid();
  v_conn_3       uuid := extensions.gen_random_uuid();
  v_conn_society uuid := extensions.gen_random_uuid();  -- lives in the sandbox's own society
  v_meter_home   uuid := extensions.gen_random_uuid();
  v_meter_2      uuid := extensions.gen_random_uuid();
  v_meter_3      uuid := extensions.gen_random_uuid();
  v_meter_society uuid := extensions.gen_random_uuid();
  v_meter_dthead uuid := extensions.gen_random_uuid();
  v_pv_asset     uuid := extensions.gen_random_uuid();
begin
  insert into public.orgs (id, name, type) values
    (v_discom_org, 'Your Sandbox DISCOM', 'discom'),
    (v_society_org, 'Your Sandbox Society', 'society'),
    (v_resco_org, 'Your Sandbox RESCO', 'resco');

  insert into public.discom_divisions (id, discom_org_id, name, level)
  values (v_division, v_discom_org, 'Sandbox Division', 'division');

  insert into public.substations (id, division_id, name) values (v_substation, v_division, 'Sandbox Substation');
  insert into public.feeders (id, substation_id, name) values (v_feeder, v_substation, 'Sandbox Feeder');
  insert into public.distribution_transformers (id, feeder_id, name, capacity_kva)
  values (v_dt, v_feeder, 'Sandbox DT', 250);

  insert into public.service_connections
    (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type, sanctioned_load_kw, connected_load_kw, society_org_id, allocation_pct)
  values
    (v_conn_home, 'SBX-' || p_user_id::text || '-01', v_dt, p_user_id, 'RGP', 'single', 'prepaid', 5, 4.2, null, null),
    (v_conn_2, 'SBX-' || p_user_id::text || '-02', v_dt, null, 'RGP', 'single', 'postpaid', 4, 3.5, null, null),
    (v_conn_3, 'SBX-' || p_user_id::text || '-03', v_dt, null, 'NRGP', 'three', 'postpaid', 25, 21, null, null),
    (v_conn_society, 'SBX-' || p_user_id::text || '-04', v_dt, null, 'RGP', 'single', 'postpaid', 3, 2.6, v_society_org, 100);

  insert into public.meters (id, serial, service_connection_id, status) values
    (v_meter_home, 'SBX-MTR-' || v_meter_home::text, v_conn_home, 'active'),
    (v_meter_2, 'SBX-MTR-' || v_meter_2::text, v_conn_2, 'active'),
    (v_meter_3, 'SBX-MTR-' || v_meter_3::text, v_conn_3, 'active'),
    (v_meter_society, 'SBX-MTR-' || v_meter_society::text, v_conn_society, 'active');
  insert into public.meters (id, serial, dt_id, status) values
    (v_meter_dthead, 'SBX-MTR-' || v_meter_dthead::text, v_dt, 'active');

  insert into public.assets (id, service_connection_id, asset_type, capacity_kw, commissioning_ref, resco_org_id) values
    (v_pv_asset, v_conn_home, 'pv_array', 5, 'SBX-COM-001', v_resco_org),
    (extensions.gen_random_uuid(), v_conn_home, 'inverter', 5, 'SBX-COM-001', v_resco_org);

  -- Every tenant-scoped role the sandbox promises, all pointed at this
  -- tenant's own division/orgs. Never platform_admin — that stays a
  -- separately provisioned, cross-tenant, non-signup account.
  insert into public.user_roles (user_id, role, org_id, division_id) values
    (p_user_id, 'consumer', null, null),
    (p_user_id, 'society_admin', v_society_org, null),
    (p_user_id, 'discom_officer', v_discom_org, v_division),
    (p_user_id, 'resco_ops', v_resco_org, null),
    (p_user_id, 'field_technician', v_resco_org, v_division),
    (p_user_id, 'support_agent', null, null);

  insert into public.work_orders (resco_org_id, service_connection_id, asset_id, title, description, priority, assigned_user_id)
  values (v_resco_org, v_conn_home, v_pv_asset, 'Inspect inverter fault code E-04',
          'Consumer reported an intermittent inverter fault via the support ticket queue.', 'high', p_user_id);

  insert into public.support_tickets (service_connection_id, subject, description, priority)
  values (v_conn_home, 'Inverter fault code E-04', 'Getting an intermittent fault light on the inverter since yesterday evening.', 'high');

  insert into public.netmetering_applications (service_connection_id, asset_id, capacity_kw, applicant_notes)
  values (v_conn_home, v_pv_asset, 5, '5kW rooftop array, commissioned under SBX-COM-001.');

  insert into public.prepaid_accounts (service_connection_id, balance_paise, vend_rate_paise_per_kwh, low_balance_threshold_paise, disconnect_pending)
  values (v_conn_home, 8000, 650, 10000, true);
  insert into public.prepaid_ledger (service_connection_id, kind, amount_paise, balance_after_paise, detail) values
    (v_conn_home, 'recharge', 50000, 50000, '{"source": "sandbox"}'),
    (v_conn_home, 'debit', -42000, 8000, '{"note": "cumulative daily settlement"}');

  -- 14 days of real solar+load history (0050) — same physics 0037's demo
  -- self-seed uses, scoped automatically to exactly the meters just
  -- created above (nothing else in the system is unbackfilled at this
  -- exact moment for this transaction, and the function's own scope is
  -- "meters with zero readings" regardless).
  perform public.backfill_unseeded_meter_readings(14);

  insert into public.sandbox_tenants (user_id, discom_org_id, society_org_id, resco_org_id, division_id, dt_id)
  values (p_user_id, v_discom_org, v_society_org, v_resco_org, v_division, v_dt);
end;
$$;
