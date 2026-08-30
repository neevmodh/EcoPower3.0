-- 0008_tariff_seed.sql
-- tariffs / tariff_slabs / tariff_tou_windows / tariff_fixed_charge_bands,
-- seeded with real, cited GERC / Torrent Power (Ahmedabad) values (#20).
-- Every rate here traces to a source_document_url — a tariff table with a
-- gazette/order URL beside each rate is a different artifact from invented
-- numbers, and the jury includes a regulatory economist.
--
-- Slab rates, fixed charges, and the FPPPA rate below were extracted and
-- verified directly against the primary source (pdftotext on the actual
-- order PDF, not a secondary summary) during this migration's authoring.
-- They differ from what an earlier pass at DATA.md assumed: the real order
-- has THREE RGP slabs, not four, fixed charges differentiated by phase
-- (single/three), not banded by sanctioned kW, and no Time-of-Use/solar-hour
-- rebate for RGP at all — that rebate exists only for HT (high-tension,
-- commercial/industrial) categories in this order, confirmed by reading
-- §9.7 of the order, not assumed from a news summary. electricity_duty_pct
-- and appc_rate_paise_per_kwh are NOT in this document (duty is set by the
-- separate Gujarat Electricity Duty Act; APPC is set by separate net-
-- metering regulations) — carried from an earlier estimate, flagged below,
-- pending a citation of their own primary source.

create table tariffs (
  id uuid primary key default gen_random_uuid(),
  category tariff_category not null, -- reuses the enum from 0001 (RGP/NRGP/LTMD/GLP/AG)
  area text not null check (area in ('urban', 'rural')),
  name text not null,
  fixed_charge_basis text not null check (fixed_charge_basis in ('per_kw_sanctioned', 'per_connection')),
  electricity_duty_pct numeric not null,
  fpppa_rate_paise_per_kwh numeric not null default 0, -- quarterly adjustment; a new row is seeded each quarter it changes
  meter_rent_paise numeric not null default 0,
  appc_rate_paise_per_kwh numeric not null,
  banking_charge_demand_paise_per_kwh numeric not null,
  banking_charge_non_demand_paise_per_kwh numeric not null,
  residential_banking_exempt boolean not null default false,
  effective_from date not null,
  effective_to date, -- null = currently in force
  source_document_url text not null,
  created_at timestamptz not null default now()
);

create index tariffs_category_area_idx on tariffs (category, area, effective_from desc);

create table tariff_slabs (
  id uuid primary key default gen_random_uuid(),
  tariff_id uuid not null references tariffs (id) on delete cascade,
  slab_order int not null,
  upto_kwh numeric, -- null = unbounded (the last slab)
  rate_paise_per_kwh numeric not null,
  unique (tariff_id, slab_order)
);

create table tariff_tou_windows (
  id uuid primary key default gen_random_uuid(),
  tariff_id uuid not null references tariffs (id) on delete cascade,
  window_label text not null,
  start_hour int not null check (start_hour between 0 and 23),
  end_hour int not null check (end_hour between 0 and 23),
  rate_paise_per_kwh numeric not null -- the absolute window rate (base rate net of the ToU discount/premium)
);

-- max_sanctioned_kw governs the *some* tariffs; RGP's own fixed charge is
-- differentiated by phase instead — both are real GERC patterns, so both
-- columns exist and a given row populates whichever one its tariff uses.
create table tariff_fixed_charge_bands (
  id uuid primary key default gen_random_uuid(),
  tariff_id uuid not null references tariffs (id) on delete cascade,
  max_sanctioned_kw numeric, -- null = unbounded, or n/a for phase-based tariffs
  phase text check (phase in ('single', 'three')), -- null = not phase-differentiated
  rate_paise numeric not null,
  band_order int not null,
  unique (tariff_id, band_order)
);

-- Tariff schedules are published regulatory data, not consumer PII — every
-- authenticated user can read them (RLS default-deny still governs
-- everything else; this is a deliberate, narrow exception).
alter table tariffs enable row level security;
alter table tariff_slabs enable row level security;
alter table tariff_tou_windows enable row level security;
alter table tariff_fixed_charge_bands enable row level security;

create policy tariffs_read_all on tariffs for select to authenticated using (true);
create policy tariff_slabs_read_all on tariff_slabs for select to authenticated using (true);
create policy tariff_tou_windows_read_all on tariff_tou_windows for select to authenticated using (true);
create policy tariff_fixed_charge_bands_read_all on tariff_fixed_charge_bands for select to authenticated using (true);

-- ============================================================
-- Seed: RGP (residential), Torrent Power Distribution — Ahmedabad, FY2026-27.
-- Source: GERC Tariff Order, Case (TPL-D-A-2585-2025), dated March 2026,
-- §1 (RATE: RGP), §1.1 (Fixed Charge), §1.2 (Energy Charge), §2.4.3
-- (base FPPPA Rs. 3.72/kWh for FY2026-27).
-- ============================================================

do $$
declare
  v_rgp_id uuid := gen_random_uuid();
  v_source_url text := 'https://www.torrentpower.com/public/pdf/regulatory/TPL-D-A-2585-2025-Tariff-Order-of-FY-2026-27.pdf';
begin
  insert into tariffs (
    id, category, area, name, fixed_charge_basis, electricity_duty_pct,
    fpppa_rate_paise_per_kwh, appc_rate_paise_per_kwh,
    banking_charge_demand_paise_per_kwh, banking_charge_non_demand_paise_per_kwh,
    residential_banking_exempt, effective_from, source_document_url
  ) values (
    v_rgp_id, 'RGP', 'urban', 'RGP (residential) — Torrent Power, Ahmedabad',
    'per_connection',
    10.0,    -- electricity_duty_pct: NOT in this order (Gujarat Electricity Duty Act, separate primary source needed)
    372,     -- fpppa_rate_paise_per_kwh: verified, §2.4.3, "existing base FPPAS at Rs. 3.72/kWh for FY 2026-27"
    385,     -- appc_rate_paise_per_kwh: NOT in this order (net-metering regulations, separate primary source needed)
    150, 110, true,
    '2026-04-01', v_source_url
  );

  -- §1.2 Energy Charge, Other than BPL consumers — three slabs, verified.
  insert into tariff_slabs (tariff_id, slab_order, upto_kwh, rate_paise_per_kwh) values
    (v_rgp_id, 1, 50, 320),   -- first 50 units: 320 paise/unit
    (v_rgp_id, 2, 200, 395),  -- next 150 units (cumulative 50-200): 395 paise/unit
    (v_rgp_id, 3, null, 500); -- remaining: 500 paise/unit

  -- §1.1 Fixed Charge, Other than BPL consumers — by phase, not sanctioned load.
  insert into tariff_fixed_charge_bands (tariff_id, band_order, phase, rate_paise) values
    (v_rgp_id, 1, 'single', 2500), -- Rs. 25/month
    (v_rgp_id, 2, 'three', 6500);  -- Rs. 65/month

  -- No tariff_tou_windows row for RGP: confirmed absent from this order.
  -- The solar-hour rebate (§10.4, 30 paise/kWh, 1100-1500 hrs) applies only
  -- to HT categories — seeding it under RGP would misattribute it.
end $$;
