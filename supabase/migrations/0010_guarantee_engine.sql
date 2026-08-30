-- 0010_guarantee_engine.sql
-- service_guarantees / guarantee_settlements (#76) — the performance and
-- uptime guarantee engine. PS1 explicitly names "uptime guarantees" as a
-- subscribable service; this is what makes it a settled contract rather
-- than a marketing line, computed from real meter data.
--
-- subscription_id is deliberately NOT an FK yet: the `subscriptions` table
-- is #78's, sequenced after this issue in Sprint 3.5. Guarantees are scoped
-- by service_connection_id today (a real, enforced FK — every other
-- billing table in this schema is scoped the same way), with a bare
-- subscription_id column left for #78 to backfill and constrain once that
-- table exists. This is the same kind of forward-reference #16 documented
-- for meters -> service_connections.

create type guarantee_metric as enum ('cuf', 'performance_ratio', 'availability_pct', 'dmge_kwh');
create type guarantee_window as enum ('daily', 'monthly');

create table service_guarantees (
  id uuid primary key default gen_random_uuid(),
  service_connection_id uuid not null references service_connections (id),
  subscription_id uuid, -- see note above: FK added once #78 ships subscriptions

  metric guarantee_metric not null,
  contracted_value numeric not null, -- fraction (0-1) for cuf/performance_ratio/availability_pct, kWh for dmge_kwh
  measurement_window guarantee_window not null,
  -- paise credited per unit of shortfall (per 1.0 of fraction, or per kWh for dmge_kwh) —
  -- the engine (guarantee-engine.ts) is the source of truth for how this composes; this
  -- column is the contracted rate, not a formula string, so it can't drift from what's billed.
  rate_paise_per_unit_shortfall bigint not null,
  cap_paise bigint, -- null = uncapped

  effective_from date not null,
  effective_to date,

  dt_id uuid,
  division_id uuid,
  org_id uuid,

  created_at timestamptz not null default now(),

  constraint service_guarantees_contracted_value_valid check (
    metric = 'dmge_kwh' or (contracted_value >= 0 and contracted_value <= 1)
  )
);

create index service_guarantees_service_connection_id_idx on service_guarantees (service_connection_id);

create function service_guarantees_set_scope_keys() returns trigger as $$
begin
  select dt_id, division_id, org_id
  into new.dt_id, new.division_id, new.org_id
  from service_connections
  where id = new.service_connection_id;
  return new;
end;
$$ language plpgsql;

create trigger service_guarantees_scope_keys
  before insert or update of service_connection_id on service_guarantees
  for each row execute function service_guarantees_set_scope_keys();

alter table service_guarantees enable row level security;
alter table service_guarantees force row level security;

-- Consumer-owner only, same as invoices (#21) — a guarantee's contracted
-- terms and settlement credits are billing data, not grid-operations data.
create policy service_guarantees_consumer_scope on service_guarantees
  for select to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

-- ============================================================
-- guarantee_settlements — one row per measurement window, computed from
-- real meter reads and traceable to them exactly like an invoice line.
-- ============================================================

create table guarantee_settlements (
  id uuid primary key default gen_random_uuid(),
  service_guarantee_id uuid not null references service_guarantees (id) on delete cascade,

  window_start date not null,
  window_end date not null,

  contracted numeric not null,
  achieved numeric not null,
  shortfall numeric not null,
  credit_paise bigint not null,

  reading_start_id uuid,
  reading_start_ts timestamptz,
  reading_end_id uuid,
  reading_end_ts timestamptz,
  foreign key (reading_start_id, reading_start_ts) references meter_readings (id, reading_ts),
  foreign key (reading_end_id, reading_end_ts) references meter_readings (id, reading_ts),

  invoice_line_id uuid references invoice_lines (id), -- null until the credit is applied to an issued invoice
  settled_at timestamptz,

  created_at timestamptz not null default now(),

  constraint guarantee_settlements_window_valid check (window_end > window_start),
  constraint guarantee_settlements_shortfall_nonneg check (shortfall >= 0),
  constraint guarantee_settlements_credit_nonneg check (credit_paise >= 0),
  unique (service_guarantee_id, window_start)
);

create index guarantee_settlements_guarantee_id_idx on guarantee_settlements (service_guarantee_id, window_start desc);

alter table guarantee_settlements enable row level security;
alter table guarantee_settlements force row level security;

-- Joined through the parent guarantee, same pattern as invoice_lines
-- through invoices (#21) — low cardinality, a join is cheap and correct.
create policy guarantee_settlements_via_guarantee on guarantee_settlements
  for select to authenticated
  using ( exists (select 1 from service_guarantees g where g.id = guarantee_settlements.service_guarantee_id) );
