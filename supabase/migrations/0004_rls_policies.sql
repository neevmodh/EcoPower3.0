-- 0004_rls_policies.sql
-- RLS on every table that exists so far. Default deny: ENABLE ROW LEVEL SECURITY
-- with no permissive policy means zero rows visible until a policy grants access.
-- FORCE ROW LEVEL SECURITY on the PII/scope-bearing tables so even the owning
-- role can't accidentally bypass it outside a SECURITY DEFINER RPC.
--
-- The performance-critical idiom, used everywhere a helper touches a fact table:
-- wrap it in a scalar subselect — (select auth_divisions()) — so Postgres evaluates
-- it once as an InitPlan instead of once per row.
--
-- Forward references not yet buildable (tables don't exist until a later issue):
--   - Society admin structural split (society_allocations admin-visible,
--     invoices owner-only) — society_allocations/invoices land in #50/#21.
--   - Field technician time-and-status-bounded access via work_orders — no
--     work_orders table yet.
--   - "No DISCOM policy on payments/payment_mandates at all" — those tables
--     don't exist yet either; trivially true today, restated here as a
--     constraint on whoever creates them.
-- Same pattern as #3: build the reusable pieces now, attach to the new tables
-- with a one-line policy when they land.

-- #4's custom_access_token_hook queries user_roles/discom_divisions as
-- supabase_auth_admin, which is not the table owner — FORCE ROW LEVEL SECURITY
-- below applies to it too, and with no policy granting it access it would
-- silently get zero rows back (not an error) on every login, emptying every
-- JWT claim. Making the hook SECURITY DEFINER makes it run with the function
-- owner's (postgres) privileges regardless of caller, same as any RPC that
-- needs to see past RLS on purpose.
alter function custom_access_token_hook(jsonb) security definer;

-- ============================================================
-- Reusable helper — SECURITY DEFINER so it can look up ownership without
-- being caught in the same RLS check it exists to support (a plain `stable`
-- function here would re-trigger service_connections' own policies, which
-- haven't matched yet — chicken-and-egg). Scoped strictly to the caller's
-- own rows, so bypassing RLS internally is safe.
-- ============================================================

create function my_service_connection_ids() returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(id), '{}')
  from public.service_connections
  where owner_user_id = (select auth.uid());
$$;

revoke all on function my_service_connection_ids() from public, anon;
grant execute on function my_service_connection_ids() to authenticated;

-- ============================================================
-- profiles — self only.
-- ============================================================

alter table profiles enable row level security;
alter table profiles force row level security;

create policy profiles_self_select on profiles
  for select to authenticated
  using ( id = (select auth.uid()) );

create policy profiles_self_insert on profiles
  for insert to authenticated
  with check ( id = (select auth.uid()) );

create policy profiles_self_update on profiles
  for update to authenticated
  using ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

-- ============================================================
-- orgs / discom_divisions — visible if the JWT claim covers them.
-- Low cardinality (dozens to low hundreds of rows) — no InitPlan pressure.
-- ============================================================

alter table orgs enable row level security;

create policy orgs_member_select on orgs
  for select to authenticated
  using ( id = any ((select auth_orgs())::uuid[]) );

alter table discom_divisions enable row level security;

create policy discom_divisions_scope_select on discom_divisions
  for select to authenticated
  using ( id = any ((select auth_divisions())::uuid[]) );

-- ============================================================
-- user_roles — self only. Granting/revoking is an RPC concern (#6), not a
-- direct table write; no insert/update/delete policy here at all.
-- ============================================================

alter table user_roles enable row level security;
alter table user_roles force row level security;

create policy user_roles_self_select on user_roles
  for select to authenticated
  using ( user_id = (select auth.uid()) );

-- ============================================================
-- Grid topology — substations carries division_id directly (0001). feeders
-- and distribution_transformers only carry their immediate parent id; a join
-- here is fine (topology tables are low cardinality, not the 10M-row tables
-- the InitPlan idiom exists for).
-- ============================================================

alter table substations enable row level security;

create policy substations_division_scope on substations
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );

alter table feeders enable row level security;

create policy feeders_division_scope on feeders
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and exists (
      select 1 from substations s
      where s.id = feeders.substation_id
        and s.division_id = any ((select auth_divisions())::uuid[])
    )
  );

alter table distribution_transformers enable row level security;

create policy distribution_transformers_division_scope on distribution_transformers
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and exists (
      select 1 from feeders f
      join substations s on s.id = f.substation_id
      where f.id = distribution_transformers.feeder_id
        and s.division_id = any ((select auth_divisions())::uuid[])
    )
  );

-- ============================================================
-- service_connections — the concrete example from the issue.
-- ============================================================

alter table service_connections enable row level security;
alter table service_connections force row level security;

create policy discom_officer_division_scope on service_connections
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );

create policy consumer_own_connections on service_connections
  for select to authenticated
  using ( owner_user_id = (select auth.uid()) );

-- ============================================================
-- meters — DISCOM-owned. Same division idiom as service_connections.
-- No consumer/RESCO policy: consumers and RESCOs never read the meter row
-- directly, only the readings (#16) scoped through service_connection_id.
-- ============================================================

alter table meters enable row level security;
alter table meters force row level security;

create policy meters_division_scope on meters
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );

-- ============================================================
-- assets — RESCO-owned. Consumer sees assets installed at their own
-- service connection. No RESCO-org policy yet: assets carries no
-- RESCO-ownership column (0001/0002 didn't add one) — flagged as a gap
-- for whoever adds RESCO-side asset management.
-- ============================================================

alter table assets enable row level security;
alter table assets force row level security;

create policy consumer_own_assets on assets
  for select to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );
