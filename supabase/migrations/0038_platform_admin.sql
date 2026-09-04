-- 0038_platform_admin.sql
-- The platform operator. Every other role is scoped — a DISCOM officer to a
-- division, a RESCO to its assets, a consumer to one connection. platform_admin
-- is scoped to nothing: full visibility across every tenant, and CRUD on the
-- operational tables.
--
-- What it deliberately CANNOT do: rewrite history. The append-only, trigger-
-- written ledgers (audit_log, prepaid_ledger, the meter readings themselves,
-- guarantee settlements) stay SELECT-only even here — that immutability is the
-- product's central claim and no role is allowed to break it.

alter type app_role add value if not exists 'platform_admin';

create function is_platform_admin() returns boolean
  language sql stable
as $$
  select 'platform_admin' = any (auth_roles());
$$;

revoke all on function is_platform_admin() from public, anon;
grant execute on function is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Blanket policies. One per RLS'd table, uniform name so they are easy to
-- audit. Additive — every existing scoped policy is untouched; PostgreSQL
-- ORs permissive policies, so this only ever widens access for the admin.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  -- SELECT only for the admin — immutable or purely-derived state.
  read_only text[] := array[
    'audit_log', 'prepaid_ledger', 'meter_readings', 'meter_live_state',
    'meter_rollover_events', 'quarantine_readings', 'guarantee_settlements',
    'subscription_events'
  ];
  all_tables text[] := array[
    'profiles', 'orgs', 'discom_divisions', 'user_roles', 'utilities',
    'substations', 'feeders', 'distribution_transformers', 'service_connections',
    'meters', 'assets', 'meter_readings', 'meter_live_state', 'meter_rollover_events',
    'quarantine_readings', 'tariffs', 'tariff_slabs', 'tariff_tou_windows',
    'tariff_fixed_charge_bands', 'invoices', 'invoice_lines', 'payments',
    'payment_orders', 'service_guarantees', 'guarantee_settlements',
    'subscriptions', 'subscription_events', 'plans', 'plan_services',
    'netmetering_applications', 'support_tickets', 'ticket_replies',
    'notifications', 'work_orders', 'audit_log', 'prepaid_accounts',
    'prepaid_ledger', 'self_read_submissions', 'p2p_listings', 'p2p_trades',
    'charging_stations', 'ev_vehicles', 'ev_sessions', 'kb_articles',
    'society_common_charges', 'society_notices', 'outages', 'outage_updates',
    'site_inspections'
  ];
begin
  foreach t in array all_tables loop
    execute format('drop policy if exists %I on public.%I', t || '_platform_admin', t);
    if t = any (read_only) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.is_platform_admin())',
        t || '_platform_admin', t);
    else
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
        t || '_platform_admin', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- platform_overview() — the cross-tenant KPI bundle for /admin. SECURITY
-- INVOKER: with the policies above the admin's own session already sees
-- everything, so a plain aggregate is correct and stays honest.
-- ---------------------------------------------------------------------------
create function platform_overview() returns jsonb
  language plpgsql stable
as $$
declare v jsonb;
begin
  if not is_platform_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'consumers',       (select count(*) from service_connections),
    'meters',          (select count(*) from meters),
    'meters_active',   (select count(*) from meters where status = 'active'),
    'readings_total',  (select count(*) from meter_readings),
    'readings_24h',    (select count(*) from meter_readings where reading_ts >= now() - interval '24 hours'),
    'utilities',       (select count(*) from utilities where role = 'distribution'),
    'divisions',       (select count(*) from discom_divisions),
    'invoiced_paise',  (select coalesce(sum(total_paise), 0) from invoices),
    'collected_paise', (select coalesce(sum(amount_paise), 0) from payments where status = 'captured'),
    'tickets_open',    (select count(*) from support_tickets where status in ('open', 'in_progress')),
    'outages_active',  (select count(*) from outages where status in ('active', 'partial_restore')),
    'subs_active',     (select count(*) from subscriptions where status = 'active'),
    'users',           (select count(distinct user_id) from user_roles where revoked_at is null),
    'p2p_open',        (select count(*) from p2p_listings where status in ('open', 'partially_filled')),
    'self_reads_pending', (select count(*) from self_read_submissions where status = 'pending')
  ) into v;
  return v;
end;
$$;

revoke all on function platform_overview() from public, anon;
grant execute on function platform_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- User / role administration. SECURITY DEFINER so the admin can write
-- user_roles even though the row's scope is another tenant's; re-checks the
-- caller and validates the grant.
-- ---------------------------------------------------------------------------
create function admin_grant_role(
  p_user_id uuid, p_role app_role, p_org_id uuid default null, p_division_id uuid default null
) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not is_platform_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'no such user %', p_user_id;
  end if;

  insert into user_roles (user_id, role, org_id, division_id, granted_by, granted_at)
  values (p_user_id, p_role, p_org_id, p_division_id, auth.uid(), now())
  returning id into v_id;
  return v_id;
end;
$$;

-- Users + their active role grants, for the /admin/users CRUD. auth.users is
-- not PostgREST-exposed, so this SECURITY DEFINER function is the read path.
create function admin_list_users() returns table (
  user_id uuid, email text, created_at timestamptz,
  grants jsonb
)
  language sql security definer set search_path = public, auth stable
as $$
  select
    u.id, u.email::text, u.created_at,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'role', r.role, 'org_id', r.org_id, 'division_id', r.division_id, 'granted_at', r.granted_at
    ) order by r.granted_at) filter (where r.id is not null), '[]'::jsonb)
  from auth.users u
  left join public.user_roles r on r.user_id = u.id and r.revoked_at is null
  where public.is_platform_admin()
  group by u.id, u.email, u.created_at
  order by u.created_at;
$$;

revoke all on function admin_list_users() from public, anon;
grant execute on function admin_list_users() to authenticated;

create function admin_revoke_role(p_user_role_id uuid) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  update user_roles set revoked_at = now() where id = p_user_role_id and revoked_at is null;
end;
$$;

revoke all on function admin_grant_role(uuid, app_role, uuid, uuid) from public, anon;
revoke all on function admin_revoke_role(uuid) from public, anon;
grant execute on function admin_grant_role(uuid, app_role, uuid, uuid) to authenticated;
grant execute on function admin_revoke_role(uuid) to authenticated;
