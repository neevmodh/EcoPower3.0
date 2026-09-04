-- 0034_society_common.sql
-- Two society-panel gaps: the common-area / DG-set cost split, and a notice
-- board. allocation_pct (0020) already carries each unit's share of shared
-- costs; this adds the charges to split, and a place to post a notice.
--
-- A society_admin writes both, scoped to their own org (auth_orgs). Any unit
-- owner in the society reads, via the same visible-unit set my_society_unit_ids
-- computes — no separate member-org claim needed.

create type society_charge_category as enum ('infrastructure', 'dg_fuel', 'lighting', 'other');

create table society_common_charges (
  id uuid primary key default gen_random_uuid(),
  society_org_id uuid not null references orgs (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  category society_charge_category not null,
  label text not null,
  amount_paise bigint not null check (amount_paise >= 0),
  -- 'equal' splits ÷ number of units; 'allocation' splits by allocation_pct
  split_basis text not null default 'equal' check (split_basis in ('equal', 'allocation')),
  created_at timestamptz not null default now(),
  constraint society_common_period_valid check (period_end >= period_start)
);

create index society_common_charges_org_idx on society_common_charges (society_org_id, period_start desc);

create table society_notices (
  id uuid primary key default gen_random_uuid(),
  society_org_id uuid not null references orgs (id) on delete cascade,
  title text not null,
  body text not null,
  posted_by uuid references auth.users (id),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index society_notices_org_idx on society_notices (society_org_id, created_at desc);

-- Helper: the society orgs the caller can see (as admin or as a unit owner).
create function my_society_org_ids() returns uuid[]
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(array_agg(distinct society_org_id), '{}')
  from public.service_connections
  where id = any ((select public.my_society_unit_ids())::uuid[])
    and society_org_id is not null;
$$;

revoke all on function my_society_org_ids() from public, anon;
grant execute on function my_society_org_ids() to authenticated;

alter table society_common_charges enable row level security;
alter table society_common_charges force row level security;
alter table society_notices enable row level security;
alter table society_notices force row level security;

create policy society_common_charges_read on society_common_charges
  for select to authenticated
  using ( society_org_id = any ((select my_society_org_ids())::uuid[]) );

create policy society_common_charges_admin_write on society_common_charges
  for all to authenticated
  using ( has_role('society_admin') and society_org_id = any ((select auth_orgs())::uuid[]) )
  with check ( has_role('society_admin') and society_org_id = any ((select auth_orgs())::uuid[]) );

create policy society_notices_read on society_notices
  for select to authenticated
  using ( society_org_id = any ((select my_society_org_ids())::uuid[]) );

create policy society_notices_admin_write on society_notices
  for all to authenticated
  using ( has_role('society_admin') and society_org_id = any ((select auth_orgs())::uuid[]) )
  with check ( has_role('society_admin') and society_org_id = any ((select auth_orgs())::uuid[]) );
