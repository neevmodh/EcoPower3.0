-- 0051_sandbox_tenant_provisioning.sql — #105. provision_sandbox_tenant()
-- builds one full, isolated tenant (its own DISCOM division, society,
-- RESCO org, ~5 consumer connections, 14 days of real telemetry) for a
-- single signed-up user, granting them every tenant-scoped role so all 7
-- panels have real data to show — same topology shape as
-- scripts/seed_demo_users.mjs + seed_society_units.mjs, consolidated onto
-- one user instead of one demo login per role. Never platform_admin.
--
-- Gated, not automatic on every signup: the `after insert on auth.users`
-- trigger only provisions when the inserting client explicitly asked for
-- it (new.raw_user_meta_data ->> 'signup_source' = 'sandbox'). Without
-- this gate, every admin-API-created account — the 7 existing demo
-- logins, any future seed script — would silently get a redundant sandbox
-- tenant too. Nothing sets this flag yet (Phase 1's signup page doesn't
-- exist); this migration is inert until that page passes it.
--
-- Never blocks signup: provisioning failure (a bug, a full free-tier DB)
-- must not prevent the auth.users row itself from being created — that
-- would turn a sandbox bug into "nobody can sign up." The trigger function
-- catches any exception from provision_sandbox_tenant(), logs it to
-- sandbox_provisioning_errors, and returns new regardless.

create table sandbox_tenants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  discom_org_id uuid not null references orgs (id) on delete cascade,
  society_org_id uuid not null references orgs (id) on delete cascade,
  resco_org_id uuid not null references orgs (id) on delete cascade,
  division_id uuid not null references discom_divisions (id) on delete cascade,
  dt_id uuid not null references distribution_transformers (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Not user-facing yet (no client ever queries this directly), but RLS is
-- mandatory hygiene the moment a table references auth.users — same rule
-- every other table in this schema follows.
alter table sandbox_tenants enable row level security;
alter table sandbox_tenants force row level security;
revoke all on sandbox_tenants from anon, authenticated;

create table sandbox_provisioning_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  error_message text not null,
  occurred_at timestamptz not null default now()
);

alter table sandbox_provisioning_errors enable row level security;
alter table sandbox_provisioning_errors force row level security;
revoke all on sandbox_provisioning_errors from anon, authenticated;

create function provision_sandbox_tenant(p_user_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  -- gen_random_uuid() (pgcrypto) lives in the extensions schema, not
  -- public — under this function's search_path = '', an unqualified call
  -- doesn't resolve at all. Same class of bug as 0048's meters fix; caught
  -- here in CI, not by inspection.
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
    (v_conn_home, 'SBX-' || left(p_user_id::text, 8) || '-01', v_dt, p_user_id, 'RGP', 'single', 'prepaid', 5, 4.2, null, null),
    (v_conn_2, 'SBX-' || left(p_user_id::text, 8) || '-02', v_dt, null, 'RGP', 'single', 'postpaid', 4, 3.5, null, null),
    (v_conn_3, 'SBX-' || left(p_user_id::text, 8) || '-03', v_dt, null, 'NRGP', 'three', 'postpaid', 25, 21, null, null),
    (v_conn_society, 'SBX-' || left(p_user_id::text, 8) || '-04', v_dt, null, 'RGP', 'single', 'postpaid', 3, 2.6, v_society_org, 100);

  insert into public.meters (id, serial, service_connection_id, status) values
    (v_meter_home, 'SBX-MTR-' || left(v_meter_home::text, 8), v_conn_home, 'active'),
    (v_meter_2, 'SBX-MTR-' || left(v_meter_2::text, 8), v_conn_2, 'active'),
    (v_meter_3, 'SBX-MTR-' || left(v_meter_3::text, 8), v_conn_3, 'active'),
    (v_meter_society, 'SBX-MTR-' || left(v_meter_society::text, 8), v_conn_society, 'active');
  insert into public.meters (id, serial, dt_id, status) values
    (v_meter_dthead, 'SBX-MTR-' || left(v_meter_dthead::text, 8), v_dt, 'active');

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

revoke all on function provision_sandbox_tenant(uuid) from public, anon, authenticated;

create function sandbox_provision_on_signup() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'signup_source' = 'sandbox' then
    begin
      perform public.provision_sandbox_tenant(new.id);
    exception when others then
      insert into public.sandbox_provisioning_errors (user_id, error_message) values (new.id, sqlerrm);
    end;
  end if;
  return new;
end;
$$;

create trigger sandbox_provision_after_signup
  after insert on auth.users
  for each row execute function sandbox_provision_on_signup();
