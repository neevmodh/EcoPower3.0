-- 0028_gujarat_utilities.sql
-- Model the real Gujarat power sector instead of one generic "Torrent Power
-- (demo)" org. GUVNL is the state holding company; under it sit a generation
-- company (GSECL), a transmission company (GETCO) and four geographic
-- distribution companies (UGVCL / MGVCL / DGVCL / PGVCL). Three private
-- licensees (Torrent Power Ahmedabad & Surat, Adani Electricity Mundra)
-- distribute inside the same state.
--
-- Every figure below is a public ballpark from GERC Multi-Year Tariff
-- orders, the Ministry of Power / PFC "DISCOM performance" ratings
-- (FY2023-24) and the companies' own sites. They are carried as DEMO SCALE,
-- not asserted as a live measurement — hence data_basis on every row, and
-- the UI must render them as "reference (FY24 filings)", never as a live
-- KPI (DESIGN.md P1).
--
-- Sources:
--   https://powerline.net.in/2025/04/04/discom-performance-mops-annual-stocktake-of-distribution-segment-health/
--   https://gercin.org/wp-content/uploads/2025/04/Tariff-Schedule-of-DGVCL-MGVCL-PGVCL-UGVCL-w.e.f.-01.04.2025.pdf
--   https://www.guvnl.com/introduction.html

-- ============================================================
-- utilities — published reference catalog (anon-readable, like tariffs/plans)
-- ============================================================

create type utility_role as enum ('holding', 'generation', 'transmission', 'distribution');

create table utilities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- UGVCL, MGVCL, TPL-A, ...
  name text not null,
  short_name text not null,
  role utility_role not null,
  ownership text not null check (ownership in ('state', 'private')),
  parent_utility_id uuid references utilities (id) on delete restrict,
  headquarters text,                         -- city
  -- districts served, in Title Case; empty for statewide gen/transmission/holding
  service_districts text[] not null default '{}',
  approx_consumers integer,                   -- null for gen/transmission/holding
  atc_loss_pct numeric,                       -- AT&C loss, null where n/a
  tariff_schedule_url text,
  data_basis text not null default 'Modelled on GERC / MoP-PFC FY2023-24 filings — reference scale, not a live measurement',
  effective_period text not null default 'FY2023-24',
  created_at timestamptz not null default now()
);

create index utilities_parent_idx on utilities (parent_utility_id);
create index utilities_role_idx on utilities (role);

alter table utilities enable row level security;
-- Published catalog data — same anon-read exception tariffs (#20) and plans (#77) use.
create policy utilities_anon_read on utilities for select to anon using (true);
create policy utilities_auth_read on utilities for select to authenticated using (true);

-- Link existing tenancy to a utility. Nullable + on delete set null so this
-- is fully additive: existing orgs keep working with utility_id null.
alter table orgs add column utility_id uuid references utilities (id) on delete set null;
create index orgs_utility_id_idx on orgs (utility_id);

-- Optional geographic label on divisions (circle city), also additive.
alter table discom_divisions add column utility_id uuid references utilities (id) on delete set null;
alter table discom_divisions add column circle_city text;
create index discom_divisions_utility_id_idx on discom_divisions (utility_id);

-- ============================================================
-- Seed — the sector
-- ============================================================

-- Holding company (fixed id so child rows and seeds can reference it)
insert into utilities (id, code, name, short_name, role, ownership, headquarters) values
  ('9d000000-0000-4000-8000-000000000001'::uuid, 'GUVNL', 'Gujarat Urja Vikas Nigam Limited', 'GUVNL', 'holding', 'state', 'Vadodara');

-- Generation + transmission (statewide, no consumers)
insert into utilities (code, name, short_name, role, ownership, parent_utility_id, headquarters) values
  ('GSECL', 'Gujarat State Electricity Corporation Limited', 'GSECL', 'generation', 'state',
     '9d000000-0000-4000-8000-000000000001'::uuid, 'Vadodara'),
  ('GETCO', 'Gujarat Energy Transmission Corporation Limited', 'GETCO', 'transmission', 'state',
     '9d000000-0000-4000-8000-000000000001'::uuid, 'Vadodara');

-- Four state DISCOMs
insert into utilities
  (code, name, short_name, role, ownership, parent_utility_id, headquarters,
   service_districts, approx_consumers, atc_loss_pct, tariff_schedule_url) values
  ('UGVCL', 'Uttar Gujarat Vij Company Limited', 'UGVCL', 'distribution', 'state',
     '9d000000-0000-4000-8000-000000000001'::uuid, 'Mehsana',
     array['Mehsana','Patan','Banaskantha','Sabarkantha','Gandhinagar','Aravalli','Mahisagar'],
     4200000, 9.35,
     'https://gercin.org/wp-content/uploads/2025/04/Tariff-Schedule-of-DGVCL-MGVCL-PGVCL-UGVCL-w.e.f.-01.04.2025.pdf'),
  ('MGVCL', 'Madhya Gujarat Vij Company Limited', 'MGVCL', 'distribution', 'state',
     '9d000000-0000-4000-8000-000000000001'::uuid, 'Vadodara',
     array['Vadodara','Anand','Kheda','Panchmahal','Dahod','Chhota Udaipur','Mahisagar'],
     3300000, 9.29,
     'https://gercin.org/wp-content/uploads/2025/04/Tariff-Schedule-of-DGVCL-MGVCL-PGVCL-UGVCL-w.e.f.-01.04.2025.pdf'),
  ('DGVCL', 'Dakshin Gujarat Vij Company Limited', 'DGVCL', 'distribution', 'state',
     '9d000000-0000-4000-8000-000000000001'::uuid, 'Surat',
     array['Surat','Bharuch','Narmada','Tapi','Navsari','Valsad','Dang'],
     4000000, 1.68,
     'https://gercin.org/wp-content/uploads/2025/04/Tariff-Schedule-of-DGVCL-MGVCL-PGVCL-UGVCL-w.e.f.-01.04.2025.pdf'),
  ('PGVCL', 'Paschim Gujarat Vij Company Limited', 'PGVCL', 'distribution', 'state',
     '9d000000-0000-4000-8000-000000000001'::uuid, 'Rajkot',
     array['Rajkot','Morbi','Jamnagar','Devbhoomi Dwarka','Porbandar','Junagadh','Gir Somnath','Amreli','Bhavnagar','Botad','Surendranagar','Kutch'],
     7000000, 18.31,
     'https://gercin.org/wp-content/uploads/2025/04/Tariff-Schedule-of-DGVCL-MGVCL-PGVCL-UGVCL-w.e.f.-01.04.2025.pdf');

-- Private licensees
insert into utilities
  (code, name, short_name, role, ownership, headquarters, service_districts, approx_consumers, atc_loss_pct) values
  ('TPL-A', 'Torrent Power Limited — Ahmedabad Licence', 'Torrent Power (Ahmedabad)', 'distribution', 'private',
     'Ahmedabad', array['Ahmedabad','Gandhinagar'], 2600000, 7.00),
  ('TPL-S', 'Torrent Power Limited — Surat Licence', 'Torrent Power (Surat)', 'distribution', 'private',
     'Surat', array['Surat'], 800000, 3.50),
  ('AEML-M', 'Adani Electricity — Mundra', 'Adani Electricity (Mundra)', 'distribution', 'private',
     'Mundra', array['Kutch'], 12000, 2.00);

-- ============================================================
-- Attach the existing demo tenancy to a real utility.
-- The demo DISCOM org was "Torrent Power (demo)" on an Ahmedabad division,
-- so it maps to the Torrent Power Ahmedabad licence.
-- ============================================================

update orgs o
  set utility_id = u.id
  from utilities u
  where u.code = 'TPL-A'
    and o.type = 'discom'
    and o.name ilike '%torrent%';

update discom_divisions d
  set utility_id = o.utility_id,
      circle_city = 'Ahmedabad'
  from orgs o
  where o.id = d.discom_org_id
    and o.utility_id is not null;
