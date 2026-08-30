-- 0002_scope_keys.sql
-- Denormalized scope keys (division_id, org_id, service_connection_id, dt_id) as real,
-- indexed columns on every row-secured fact table, maintained by BEFORE INSERT/UPDATE
-- triggers that walk dt -> feeder -> substation -> division. This is what lets RLS
-- policies compare columns directly instead of running a correlated subquery per row.

-- ============================================================
-- Resolvers — pure lookups, reused by every trigger below.
-- ============================================================

create function resolve_scope_from_dt(p_dt_id uuid, out division_id uuid, out org_id uuid)
returns record as $$
  select s.division_id, dv.discom_org_id
  from distribution_transformers dt
  join feeders f on f.id = dt.feeder_id
  join substations s on s.id = f.substation_id
  join discom_divisions dv on dv.id = s.division_id
  where dt.id = p_dt_id;
$$ language sql stable;

-- Resolves the full scope for a meter_id alone — walks whichever of the meter's
-- three mutually-exclusive attachment points (service_connection_id / dt_id / feeder_id)
-- is set. This is the function #16's meter_readings trigger will reuse: given only
-- meter_id, it returns service_connection_id, dt_id, division_id, org_id.
create function resolve_scope_from_meter(
  p_meter_id uuid,
  out service_connection_id uuid,
  out dt_id uuid,
  out division_id uuid,
  out org_id uuid
) as $$
declare
  v_meter meters%rowtype;
  v_scope record;
begin
  select * into v_meter from meters where id = p_meter_id;

  service_connection_id := v_meter.service_connection_id;

  if v_meter.dt_id is not null then
    dt_id := v_meter.dt_id;
  elsif v_meter.service_connection_id is not null then
    select sc.dt_id into dt_id from service_connections sc where sc.id = v_meter.service_connection_id;
  end if;

  if dt_id is not null then
    select * into v_scope from resolve_scope_from_dt(dt_id);
    division_id := v_scope.division_id;
    org_id := v_scope.org_id;
  elsif v_meter.feeder_id is not null then
    select s.division_id, dv.discom_org_id into division_id, org_id
    from feeders f
    join substations s on s.id = f.substation_id
    join discom_divisions dv on dv.id = s.division_id
    where f.id = v_meter.feeder_id;
  end if;
end;
$$ language plpgsql stable;

-- Generic trigger for any fact table shaped (meter_id, service_connection_id, dt_id,
-- division_id, org_id) — attach directly, no per-table function needed. #16 attaches
-- this to meter_readings.
create function set_scope_keys_from_meter() returns trigger as $$
declare
  v record;
begin
  select * into v from resolve_scope_from_meter(new.meter_id);
  new.service_connection_id := v.service_connection_id;
  new.dt_id := v.dt_id;
  new.division_id := v.division_id;
  new.org_id := v.org_id;
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- service_connections — scope keyed off its own dt_id.
-- ============================================================

alter table service_connections
  add column division_id uuid references discom_divisions (id),
  add column org_id uuid references orgs (id);

create index service_connections_division_id_idx on service_connections (division_id);
create index service_connections_org_id_idx on service_connections (org_id);

create function service_connections_set_scope_keys() returns trigger as $$
declare
  v_scope record;
begin
  select * into v_scope from resolve_scope_from_dt(new.dt_id);
  new.division_id := v_scope.division_id;
  new.org_id := v_scope.org_id;
  return new;
end;
$$ language plpgsql;

create trigger service_connections_scope_keys
  before insert or update of dt_id on service_connections
  for each row execute function service_connections_set_scope_keys();

-- ============================================================
-- meters — scope derived from whichever of its own attachment points is set.
-- Does not touch service_connection_id/dt_id/feeder_id themselves (the
-- exactly-one-parent CHECK from 0001 governs those).
-- ============================================================

alter table meters
  add column division_id uuid references discom_divisions (id),
  add column org_id uuid references orgs (id);

create index meters_division_id_idx on meters (division_id);
create index meters_org_id_idx on meters (org_id);

create function meters_set_scope_keys() returns trigger as $$
declare
  v_dt_id uuid;
  v_scope record;
begin
  if new.dt_id is not null then
    v_dt_id := new.dt_id;
  elsif new.service_connection_id is not null then
    select dt_id into v_dt_id from service_connections where id = new.service_connection_id;
  end if;

  if v_dt_id is not null then
    select * into v_scope from resolve_scope_from_dt(v_dt_id);
    new.division_id := v_scope.division_id;
    new.org_id := v_scope.org_id;
  elsif new.feeder_id is not null then
    select s.division_id, dv.discom_org_id into new.division_id, new.org_id
    from feeders f
    join substations s on s.id = f.substation_id
    join discom_divisions dv on dv.id = s.division_id
    where f.id = new.feeder_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger meters_scope_keys
  before insert or update of service_connection_id, dt_id, feeder_id on meters
  for each row execute function meters_set_scope_keys();

-- ============================================================
-- assets — RESCO-owned, scoped through the service_connection it's installed at.
-- ============================================================

alter table assets
  add column dt_id uuid references distribution_transformers (id),
  add column division_id uuid references discom_divisions (id),
  add column org_id uuid references orgs (id);

create index assets_dt_id_idx on assets (dt_id);
create index assets_division_id_idx on assets (division_id);
create index assets_org_id_idx on assets (org_id);

create function assets_set_scope_keys() returns trigger as $$
declare
  v_dt_id uuid;
  v_scope record;
begin
  select dt_id into v_dt_id from service_connections where id = new.service_connection_id;
  new.dt_id := v_dt_id;

  if v_dt_id is not null then
    select * into v_scope from resolve_scope_from_dt(v_dt_id);
    new.division_id := v_scope.division_id;
    new.org_id := v_scope.org_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger assets_scope_keys
  before insert or update of service_connection_id on assets
  for each row execute function assets_set_scope_keys();
