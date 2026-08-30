-- 0009_invoice_schema.sql
-- invoices / invoice_lines — provenance-carrying billing records (#21).
-- Every invoice references the exact meter_readings rows that bracket it
-- and stamps the tariff engine version, so a consumer (or a judge) can
-- click an energy line and see the two register reads it was computed from,
-- not just a number.
--
-- meter_readings (0005) deliberately has no surrogate id — its PK is the
-- composite (meter_id, reading_ts), per #16's own spec. Provenance needs a
-- single, stable way to point at one reading row, so this migration adds a
-- surrogate `id` to meter_readings without touching that PK. Because the
-- table is partitioned by reading_ts, a uniqueness constraint on `id` alone
-- can't be enforced across partitions (same reason the PK itself carries
-- reading_ts) — so invoice_lines' provenance columns store the id *and* the
-- ts together and the FK is composite (id, reading_ts), not a bare id.

alter table meter_readings add column id uuid not null default gen_random_uuid();
alter table meter_readings add constraint meter_readings_id_ts_key unique (id, reading_ts);

-- ============================================================
-- invoices
-- ============================================================

create table invoices (
  id uuid primary key default gen_random_uuid(),
  service_connection_id uuid not null references service_connections (id),
  tariff_id uuid not null references tariffs (id),

  billing_period_start date not null,
  billing_period_end date not null,

  -- The two bracketing register reads the whole invoice is computed from.
  opening_reading_id uuid not null,
  opening_reading_ts timestamptz not null,
  opening_kwh_import numeric not null,
  opening_kwh_export numeric not null,
  closing_reading_id uuid not null,
  closing_reading_ts timestamptz not null,
  closing_kwh_import numeric not null,
  closing_kwh_export numeric not null,
  foreign key (opening_reading_id, opening_reading_ts) references meter_readings (id, reading_ts),
  foreign key (closing_reading_id, closing_reading_ts) references meter_readings (id, reading_ts),

  units_imported_milli_kwh bigint not null,
  units_exported_milli_kwh bigint not null,
  units_net_milli_kwh bigint not null,
  -- true when the closing (or opening) read was VEE-estimated rather than a
  -- real meter read (source != 'meter' on the bracketing row) — surfaced so
  -- the UI can flag "this bill uses an estimated read", not hide it.
  estimated boolean not null default false,

  banked_units_opening_milli_kwh bigint not null default 0,
  banked_units_closing_milli_kwh bigint not null default 0,

  engine_version text not null,
  total_paise bigint not null,
  -- sha256 of the canonical (sorted) JSON of {inputs, engine_version, lines,
  -- total_paise} — lets anyone recompute and verify a bill wasn't tampered
  -- with after issue, without re-running the engine against the DB.
  computed_hash text not null,

  status text not null default 'issued' check (status in ('draft', 'issued', 'paid', 'overdue')),

  -- Denormalized scope keys (#3's pattern), populated from service_connections.
  dt_id uuid,
  division_id uuid,
  org_id uuid,

  created_at timestamptz not null default now(),

  constraint invoices_period_valid check (billing_period_end > billing_period_start),
  constraint invoices_closing_after_opening check (closing_reading_ts > opening_reading_ts)
);

create index invoices_service_connection_id_idx on invoices (service_connection_id, billing_period_start desc);
create index invoices_division_id_idx on invoices (division_id);

create function invoices_set_scope_keys() returns trigger as $$
begin
  select dt_id, division_id, org_id
  into new.dt_id, new.division_id, new.org_id
  from service_connections
  where id = new.service_connection_id;
  return new;
end;
$$ language plpgsql;

create trigger invoices_scope_keys
  before insert or update of service_connection_id on invoices
  for each row execute function invoices_set_scope_keys();

alter table invoices enable row level security;
alter table invoices force row level security;

-- Consumer-owner only. No DISCOM policy, deliberately: "DISCOM sees your
-- kWh, never your card" (#5) — billing amounts and payment status are not
-- grid-operations data, and DISCOM staff get none of the RLS access other
-- service_connection-scoped tables (like meter_readings) grant them.
create policy invoices_consumer_scope on invoices
  for select to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

-- ============================================================
-- invoice_lines
-- ============================================================

create type invoice_line_type as enum (
  'energy_slab', 'fixed_charge', 'tou_adjust', 'subscription_fee', 'overage',
  'export_credit', 'banking_charge', 'electricity_duty', 'fppa', 'meter_rent',
  'gst', 'subsidy', 'arrears'
);

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  line_order int not null,

  line_type invoice_line_type not null,
  label text not null,
  amount_paise bigint not null, -- negative for credits (export_credit, subsidy)

  -- Provenance for the "click to expand" UI (#21's whole point): the exact
  -- register reads and OBIS code a line was computed from, where applicable.
  source_reading_start_id uuid,
  source_reading_start_ts timestamptz,
  source_reading_end_id uuid,
  source_reading_end_ts timestamptz,
  foreign key (source_reading_start_id, source_reading_start_ts) references meter_readings (id, reading_ts),
  foreign key (source_reading_end_id, source_reading_end_ts) references meter_readings (id, reading_ts),
  obis_ref text,

  tariff_id uuid references tariffs (id),
  tariff_slab_id uuid references tariff_slabs (id),
  slab_from numeric,
  slab_to numeric,

  unique (invoice_id, line_order)
);

create index invoice_lines_invoice_id_idx on invoice_lines (invoice_id, line_order);

alter table invoice_lines enable row level security;
alter table invoice_lines force row level security;

-- invoice_lines has no denormalized scope keys of its own — it's gated
-- through its parent invoice via a join. Line-item cardinality per invoice
-- is small (a handful of rows), unlike meter_readings, so this join is
-- cheap; denormalizing scope keys onto every line for a table this size
-- would be pure overhead.
create policy invoice_lines_via_invoice on invoice_lines
  for select to authenticated
  using ( exists (select 1 from invoices i where i.id = invoice_lines.invoice_id) );
