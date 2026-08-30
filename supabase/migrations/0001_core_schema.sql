-- 0001_core_schema.sql
-- Identity & tenancy, grid topology, meters vs assets.

create extension if not exists "pgcrypto";

-- ============================================================
-- Identity & tenancy
-- ============================================================

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Deliberately no role column here — roles live in user_roles, scoped per org/division.

create type org_type as enum ('discom', 'resco', 'society', 'business');

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type org_type not null,
  created_at timestamptz not null default now()
);

create table discom_divisions (
  id uuid primary key default gen_random_uuid(),
  discom_org_id uuid not null references orgs (id) on delete cascade,
  parent_division_id uuid references discom_divisions (id) on delete restrict,
  name text not null,
  level text not null check (level in ('circle', 'division', 'subdivision')),
  created_at timestamptz not null default now()
);

create type app_role as enum (
  'consumer',
  'society_admin',
  'society_member',
  'discom_officer',
  'discom_admin',
  'resco_admin',
  'resco_ops',
  'field_technician',
  'support_agent'
);

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role app_role not null,
  org_id uuid references orgs (id) on delete cascade,
  division_id uuid references discom_divisions (id) on delete cascade,
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index user_roles_user_id_idx on user_roles (user_id) where revoked_at is null;
create index user_roles_org_id_idx on user_roles (org_id) where revoked_at is null;
create index user_roles_division_id_idx on user_roles (division_id) where revoked_at is null;

-- ============================================================
-- Grid topology
-- ============================================================

create table substations (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references discom_divisions (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now()
);

create table feeders (
  id uuid primary key default gen_random_uuid(),
  substation_id uuid not null references substations (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now()
);

create table distribution_transformers (
  id uuid primary key default gen_random_uuid(),
  feeder_id uuid not null references feeders (id) on delete restrict,
  name text not null,
  capacity_kva numeric,
  created_at timestamptz not null default now()
);

create type tariff_category as enum ('RGP', 'NRGP', 'LTMD', 'GLP', 'AG');
create type connection_type as enum ('prepaid', 'postpaid');

create table service_connections (
  id uuid primary key default gen_random_uuid(),
  consumer_number text not null unique,
  dt_id uuid not null references distribution_transformers (id) on delete restrict,
  owner_user_id uuid references auth.users (id) on delete set null, -- nullable: unclaimed until OCR/KYC links it
  sanctioned_load_kw numeric,
  connected_load_kw numeric,
  tariff_category tariff_category not null,
  phase text not null check (phase in ('single', 'three')),
  connection_type connection_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_connections_dt_id_idx on service_connections (dt_id);
create index service_connections_owner_user_id_idx on service_connections (owner_user_id);

-- ============================================================
-- Meters vs assets — deliberate split.
-- DISCOM owns the meter; the RESCO owns the panels.
-- ============================================================

create table meters (
  id uuid primary key default gen_random_uuid(),
  serial text not null unique,
  make text,
  model text,
  firmware text,
  ct_ratio text,
  pt_ratio text,
  meter_constant numeric,
  nic_id text,
  comm_protocol text,
  device_secret_hash text,
  key_version integer not null default 1,
  last_seen_at timestamptz,
  status text not null default 'active' check (status in ('active', 'inactive', 'faulty', 'decommissioned')),
  service_connection_id uuid references service_connections (id) on delete restrict,
  dt_id uuid references distribution_transformers (id) on delete restrict,
  feeder_id uuid references feeders (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint meters_exactly_one_parent check (
    (case when service_connection_id is not null then 1 else 0 end)
    + (case when dt_id is not null then 1 else 0 end)
    + (case when feeder_id is not null then 1 else 0 end)
    = 1
  )
);

create index meters_service_connection_id_idx on meters (service_connection_id);
create index meters_dt_id_idx on meters (dt_id);
create index meters_feeder_id_idx on meters (feeder_id);

create table assets (
  id uuid primary key default gen_random_uuid(),
  service_connection_id uuid not null references service_connections (id) on delete cascade,
  asset_type text not null check (asset_type in ('pv_array', 'inverter', 'battery', 'acdb')),
  capacity_kw numeric,
  warranty_expires_on date,
  commissioning_ref text,
  created_at timestamptz not null default now()
);

create index assets_service_connection_id_idx on assets (service_connection_id);

-- ============================================================
-- updated_at maintenance
-- ============================================================

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();

create trigger service_connections_set_updated_at before update on service_connections
  for each row execute function set_updated_at();
