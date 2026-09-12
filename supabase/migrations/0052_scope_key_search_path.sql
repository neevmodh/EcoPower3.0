-- 0052_scope_key_search_path.sql — root-cause fix for a latent bug #142's
-- CI run just found: every scope-key resolver/trigger function in this
-- schema (0002, and the per-table set_scope_keys functions added in
-- 0009/0010/0011/0012/0014/0019/0026/0027) was created with no search_path
-- override at all, calling resolve_scope_from_dt()/resolve_scope_from_meter()
-- or referencing service_connections/meters unqualified. That's fine for
-- every caller so far — ordinary PostgREST/API-route inserts run with the
-- normal default search_path, which reaches `public` — but any
-- SECURITY DEFINER function created with `set search_path = ''` (the
-- hardened pattern this codebase otherwise uses everywhere, e.g. 0020's
-- my_society_unit_ids) pushes that empty search_path onto the GUC stack for
-- its *entire* execution, including every trigger it fires. #105's
-- provision_sandbox_tenant() inserting into service_connections is the
-- first thing in this codebase to actually hit it: the BEFORE INSERT
-- trigger calls resolve_scope_from_dt(new.dt_id) unqualified, which cannot
-- even be looked up under an empty search_path, so it throws immediately
-- — before this migration, the *only* place this codebase had already hit
-- (and fixed) this exact class of bug was 0024's prepaid_set_scope_keys(),
-- whose own comment already names the precise mechanism and the fix
-- shape this migration applies everywhere else: full `public.` qualification
-- plus an explicit `set search_path = ''`, so these functions behave
-- identically regardless of what search_path the calling context is in.
--
-- Behavior-preserving for every existing caller — none of these functions
-- referenced anything outside `public` to begin with, so pinning that down
-- explicitly changes nothing for a normal-search-path caller and fixes
-- everything for an empty-search-path one.

create or replace function resolve_scope_from_dt(p_dt_id uuid, out division_id uuid, out org_id uuid)
returns record
language sql
set search_path = ''
as $$
  select s.division_id, dv.discom_org_id
  from public.distribution_transformers dt
  join public.feeders f on f.id = dt.feeder_id
  join public.substations s on s.id = f.substation_id
  join public.discom_divisions dv on dv.id = s.division_id
  where dt.id = p_dt_id;
$$;

create or replace function resolve_scope_from_meter(
  p_meter_id uuid,
  out service_connection_id uuid,
  out dt_id uuid,
  out division_id uuid,
  out org_id uuid
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_meter public.meters%rowtype;
  v_scope record;
begin
  select * into v_meter from public.meters where id = p_meter_id;

  service_connection_id := v_meter.service_connection_id;

  if v_meter.dt_id is not null then
    dt_id := v_meter.dt_id;
  elsif v_meter.service_connection_id is not null then
    select sc.dt_id into dt_id from public.service_connections sc where sc.id = v_meter.service_connection_id;
  end if;

  if dt_id is not null then
    select * into v_scope from public.resolve_scope_from_dt(dt_id);
    division_id := v_scope.division_id;
    org_id := v_scope.org_id;
  elsif v_meter.feeder_id is not null then
    select s.division_id, dv.discom_org_id into division_id, org_id
    from public.feeders f
    join public.substations s on s.id = f.substation_id
    join public.discom_divisions dv on dv.id = s.division_id
    where f.id = v_meter.feeder_id;
  end if;
end;
$$;

create or replace function set_scope_keys_from_meter() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v record;
begin
  select * into v from public.resolve_scope_from_meter(new.meter_id);
  new.service_connection_id := v.service_connection_id;
  new.dt_id := v.dt_id;
  new.division_id := v.division_id;
  new.org_id := v.org_id;
  return new;
end;
$$;

create or replace function service_connections_set_scope_keys() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_scope record;
begin
  select * into v_scope from public.resolve_scope_from_dt(new.dt_id);
  new.division_id := v_scope.division_id;
  new.org_id := v_scope.org_id;
  return new;
end;
$$;

create or replace function meters_set_scope_keys() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_dt_id uuid;
  v_scope record;
begin
  if new.dt_id is not null then
    v_dt_id := new.dt_id;
  elsif new.service_connection_id is not null then
    select dt_id into v_dt_id from public.service_connections where id = new.service_connection_id;
  end if;

  if v_dt_id is not null then
    select * into v_scope from public.resolve_scope_from_dt(v_dt_id);
    new.division_id := v_scope.division_id;
    new.org_id := v_scope.org_id;
  elsif new.feeder_id is not null then
    select s.division_id, dv.discom_org_id into new.division_id, new.org_id
    from public.feeders f
    join public.substations s on s.id = f.substation_id
    join public.discom_divisions dv on dv.id = s.division_id
    where f.id = new.feeder_id;
  end if;

  return new;
end;
$$;

create or replace function assets_set_scope_keys() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_dt_id uuid;
  v_scope record;
begin
  select dt_id into v_dt_id from public.service_connections where id = new.service_connection_id;
  new.dt_id := v_dt_id;

  if v_dt_id is not null then
    select * into v_scope from public.resolve_scope_from_dt(v_dt_id);
    new.division_id := v_scope.division_id;
    new.org_id := v_scope.org_id;
  end if;

  return new;
end;
$$;

create or replace function invoices_set_scope_keys() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select dt_id, division_id, org_id
  into new.dt_id, new.division_id, new.org_id
  from public.service_connections
  where id = new.service_connection_id;
  return new;
end;
$$;

create or replace function service_guarantees_set_scope_keys() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select dt_id, division_id, org_id
  into new.dt_id, new.division_id, new.org_id
  from public.service_connections
  where id = new.service_connection_id;
  return new;
end;
$$;

create or replace function payment_orders_set_scope_keys() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select dt_id, division_id, org_id
  into new.dt_id, new.division_id, new.org_id
  from public.service_connections
  where id = new.service_connection_id;
  return new;
end;
$$;

create or replace function subscriptions_set_scope_keys() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select dt_id, division_id, org_id
  into new.dt_id, new.division_id, new.org_id
  from public.service_connections
  where id = new.service_connection_id;
  return new;
end;
$$;

create or replace function support_tickets_set_scope_keys() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select dt_id, division_id, org_id
  into new.dt_id, new.division_id, new.org_id
  from public.service_connections
  where id = new.service_connection_id;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function netmetering_applications_set_scope_keys() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select dt_id, division_id, org_id
  into new.dt_id, new.division_id, new.org_id
  from public.service_connections
  where id = new.service_connection_id;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function self_read_set_scope_keys() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select m.dt_id, sc.division_id, sc.org_id
    into new.dt_id, new.division_id, new.org_id
  from public.meters m
  join public.service_connections sc on sc.id = m.service_connection_id
  where m.id = new.meter_id;
  return new;
end;
$$;

create or replace function p2p_listing_scope_keys() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select sc.dt_id, sc.division_id into new.dt_id, new.division_id
  from public.service_connections sc where sc.id = new.seller_connection_id;
  return new;
end;
$$;
