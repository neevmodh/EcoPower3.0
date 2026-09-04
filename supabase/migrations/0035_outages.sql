-- 0035_outages.sql
-- DISCOM outage management: log an outage (unplanned or planned), track its
-- estimated restoration, post updates to an append-only timeline, and mark
-- it restored. Scoped to the officer's division like every other DISCOM
-- surface. Consumers on an affected DT can see the outage and its ETR (so a
-- future dashboard tile / notification has a source) but cannot write.

create type outage_type as enum ('unplanned', 'planned');
create type outage_status as enum ('active', 'partial_restore', 'restored', 'cancelled');

create table outages (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references discom_divisions (id) on delete restrict,
  feeder_id uuid references feeders (id) on delete set null,
  dt_id uuid references distribution_transformers (id) on delete set null,
  outage_type outage_type not null,
  cause text,
  consumers_affected integer,
  started_at timestamptz not null default now(),
  estimated_restoration timestamptz,
  restored_at timestamptz,
  status outage_status not null default 'active',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),

  constraint outage_restored_consistency check (
    (status in ('restored', 'cancelled')) = (restored_at is not null)
  )
);

create index outages_division_status_idx on outages (division_id, status, started_at desc);
create index outages_dt_idx on outages (dt_id) where status <> 'restored';

create table outage_updates (
  id uuid primary key default gen_random_uuid(),
  outage_id uuid not null references outages (id) on delete cascade,
  note text not null,
  new_eta timestamptz,
  posted_by uuid references auth.users (id),
  posted_at timestamptz not null default now()
);

create index outage_updates_outage_idx on outage_updates (outage_id, posted_at);

alter table outages enable row level security;
alter table outages force row level security;
alter table outage_updates enable row level security;
alter table outage_updates force row level security;

-- DISCOM officer / admin: full CRUD within their division.
create policy outages_discom_all on outages
  for all to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  )
  with check (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );

-- Consumer: read an outage that touches their own DT.
create policy outages_consumer_read on outages
  for select to authenticated
  using (
    dt_id in (
      select sc.dt_id from service_connections sc
      where sc.id = any ((select my_service_connection_ids())::uuid[])
    )
  );

create policy outage_updates_via_outage_select on outage_updates
  for select to authenticated
  using ( exists (select 1 from outages o where o.id = outage_updates.outage_id) );

create policy outage_updates_discom_insert on outage_updates
  for insert to authenticated
  with check (
    exists (
      select 1 from outages o
      where o.id = outage_updates.outage_id
        and (has_role('discom_officer') or has_role('discom_admin'))
        and o.division_id = any ((select auth_divisions())::uuid[])
    )
  );
