-- 0020_society_units.sql
-- The Society panel (previously a real gap, found while auditing #89):
-- society_admin/society_member have existed as roles since 0001 with zero
-- RLS granting them anything — the page queried `orgs` (the caller's own
-- org row, one line) and linked to /society/units and /society/allocation,
-- neither of which existed. PS1's own background section names "housing
-- societies" explicitly as a target consumer segment, so this is a real
-- product gap, not a cosmetic one.
--
-- Model: a service_connection can optionally belong to a society (a flat
-- in a housing society), via society_org_id — same shape as #18's
-- resco_org_id on assets, a direct ownership FK, not a derived scope key.
-- allocation_pct is each unit's share of the society's common-area/shared
-- generation costs — a real number a society_admin sets and consumers can
-- see, not a placeholder.

alter table service_connections add column society_org_id uuid references orgs (id);
alter table service_connections add column allocation_pct numeric check (allocation_pct >= 0 and allocation_pct <= 100);
create index service_connections_society_org_id_idx on service_connections (society_org_id);

-- my_service_connection_ids() (0004) is the consumer-ownership equivalent
-- this mirrors: one stable, security-definer function computing the
-- visible-unit set once, reused across service_connections/meters/
-- meter_readings rather than three separate ad hoc joins.
-- Deliberately inlines the has_role()/auth_orgs() logic against auth.jwt()
-- directly rather than calling those functions: has_role()'s own body
-- calls unqualified auth_roles(), and Postgres's SQL-function inlining
-- executes that inner call under *this* function's search_path (empty,
-- for security-definer safety) rather than has_role()'s own — so a plain
-- call to public.has_role() from here fails to resolve auth_roles() at
-- all. auth.jwt() is schema-qualified and has no such problem.
create function my_society_unit_ids() returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(id), '{}')
  from public.service_connections
  where
    (
      'society_admin' = any (array(select jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'roles')))
      and society_org_id = any (array(select jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'org_ids'))::uuid[])
    )
    or (owner_user_id = (select auth.uid()) and society_org_id is not null);
$$;

revoke all on function my_society_unit_ids() from public, anon;
grant execute on function my_society_unit_ids() to authenticated;

create policy service_connections_society_scope on service_connections
  for select to authenticated
  using ( id = any ((select my_society_unit_ids())::uuid[]) );

-- Real, narrow write surface: a society_admin can update allocation_pct
-- (and only meaningfully that — nothing else on this row is theirs to
-- change) for units in their own society.
create policy service_connections_society_admin_update on service_connections
  for update to authenticated
  using ( has_role('society_admin') and society_org_id = any ((select auth_orgs())::uuid[]) )
  with check ( has_role('society_admin') and society_org_id = any ((select auth_orgs())::uuid[]) );

create policy meters_society_scope on meters
  for select to authenticated
  using ( service_connection_id = any ((select my_society_unit_ids())::uuid[]) );

create policy meter_readings_society_scope on meter_readings
  for select to authenticated
  using ( service_connection_id = any ((select my_society_unit_ids())::uuid[]) );
