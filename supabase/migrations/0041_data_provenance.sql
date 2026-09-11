-- 0041_data_provenance.sql — issues #74/#75, and DATA.md §1's own promise
-- ("A data_provenance table records, for every seeded fact, the generator
-- version and the source of every parameter it used") never actually built.
--
-- Public-readable by design — this is a disclosure surface, not a scoped
-- one. The rule this table exists to enforce structurally: synthetic
-- *series*, real *parameters*, cited *everywhere*.

create table data_provenance (
  id uuid primary key default gen_random_uuid(),
  entity text not null,                    -- what this row is about, e.g. 'meter_readings', 'tariff_slabs'
  kind text not null check (kind in ('synthetic_series', 'real_cited')),
  generator_version text,                  -- set for synthetic_series rows
  calibrated_to text,                      -- what published aggregate the synthesis is checked against
  description text not null,
  source_document_url text,                -- set for real_cited rows
  created_at timestamptz not null default now()
);

alter table data_provenance enable row level security;
alter table data_provenance force row level security;

create policy data_provenance_public_read on data_provenance
  for select using (true);

grant select on data_provenance to anon, authenticated;

insert into data_provenance (entity, kind, generator_version, calibrated_to, description, source_document_url) values

('meter_readings — solar generation', 'synthetic_series', 'v1.2',
 'Full-year integration: 1,695 kWh/kWp vs. ~1,600 kWh/kWp published target for Ahmedabad',
 'Clear-sky irradiance (Cooper declination + hour angle, Haurwitz model) x live Open-Meteo cloud cover x panel temperature derate. No consumer''s actual generation exists in this table — the physics does.',
 null),

('meter_readings — household load', 'synthetic_series', 'v1.2',
 'Diurnal/seasonal shape checked against typical Indian residential load curves',
 'Stochastic appliance-level model seeded per meter, conditioned on sanctioned load and month — morning and evening peaks, weekday/weekend variation.',
 null),

('tariff_slabs — GERC RGP-Urban FY26', 'real_cited', null, null,
 'Torrent Power Ahmedabad residential slabs, phase-based fixed charge, and FPPPA — read directly from the primary tariff order via pdftotext, not a secondary summary.',
 'https://www.torrentpower.com/public/pdf/regulatory/TPL-D-A-2585-2025-Tariff-Order-of-FY-2026-27.pdf'),

('AT&C loss factors — DT fleet seed', 'synthetic_series', 'v1.0',
 'Per-DT loss factors drawn from a range around the Ministry of Power FY25 national average (16.16%, down from 21.91% in FY21)',
 'scripts/seed_discom_fleet.mjs assigns each demo DT a loss factor inside the real published national range, not an arbitrary number.',
 null),

('carbon avoided — CO2 factor', 'real_cited', null, null,
 'India grid emission factor, Combined Margin methodology (the correct CEA/CDM basis for avoided-emissions accounting, not the weighted-average grid factor).',
 'CEA CO2 Baseline Database for the Indian Power Sector, v20 (provisional): Combined Margin 0.7383 tCO2/MWh'),

('the AHD-A-300001 planted theft defect', 'synthetic_series', 'v1.0',
 'A deliberate, disclosed anomaly — not a hidden bug',
 'A partial CT bypass modelled for 30 days: ~40% of physically-flowing energy never reaches the register, tamper bit 0x08 raised on ~18% of readings in that window. Exists so dt_loss_summary() and dt_consumer_breakdown() have something real to find, per DATA.md §4.3.',
 null);
