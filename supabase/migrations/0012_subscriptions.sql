-- 0012_subscriptions.sql
-- service_types / plans / plan_services (#77) + subscriptions /
-- subscription_events (#78, trimmed). PS1 names the services explicitly —
-- "solar power, battery backup, lighting, cooling, or uptime guarantees" —
-- and requires the platform be "designed for scalability so it can later
-- expand to multiple services." This is that abstraction: a subscription
-- is a bundle of metered service lines, not a hardcoded solar plan.
--
-- #78 asks for the full lifecycle (transfer, buyout, commercial-model
-- switch) but depends on #22 (prepaid) and #25 (property tests / EXCLUDE
-- constraint), neither of which exist yet — PS1-PRIORITY-PLAN.md already
-- flagged "trim to upgrade/cancel if short on time" for exactly this
-- reason. Built here: subscribe, pause, resume, upgrade, cancel, with a
-- subscription_events audit chain. Transfer-on-sale and buyout wait for
-- #22/#25 to land for real, not as a rushed approximation of a 15-27 year
-- contract's hardest edge case.

-- ============================================================
-- service_types — the abstraction #77 is entirely about.
-- ============================================================

create table service_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit text not null check (unit in ('kwh', 'availability_hours', 'ton_hours', 'lumen_hours')),
  -- solar/backup are metered from real telemetry; cooling/lighting ship
  -- configured-but-unmetered — honest, and still proves the abstraction
  -- (#77's own framing: "adding cooling-as-a-service is a row in
  -- service_types, not a rewrite").
  meter_source text not null check (meter_source in ('meter_readings', 'unmetered')),
  billing_basis text not null check (billing_basis in ('included_plus_overage', 'flat')),
  created_at timestamptz not null default now()
);

insert into service_types (code, name, unit, meter_source, billing_basis) values
  ('solar_kwh', 'Solar generation', 'kwh', 'meter_readings', 'included_plus_overage'),
  ('backup_availability', 'Battery backup', 'availability_hours', 'meter_readings', 'included_plus_overage'),
  ('cooling_ton_hours', 'Cooling', 'ton_hours', 'unmetered', 'flat'),
  ('lighting', 'Lighting', 'lumen_hours', 'unmetered', 'flat');

-- ============================================================
-- plans — published catalog data, same authenticated-readable exception
-- as tariffs (#20): a consumer needs to see what they can subscribe to
-- before they have a subscription.
-- ============================================================

create table plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  price_paise_per_month bigint not null check (price_paise_per_month >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table plan_services (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans (id) on delete cascade,
  service_type_id uuid not null references service_types (id),
  included_quantity numeric not null,
  overage_rate_paise_per_unit bigint not null default 0,
  -- Optional guarantee terms bundled into the plan. Subscribing
  -- materializes these into a real service_guarantees row (#76) scoped to
  -- the subscriber's own service_connection — this table holds the
  -- template, not a live contract.
  guarantee_metric guarantee_metric,
  guarantee_contracted_value numeric,
  guarantee_rate_paise_per_unit_shortfall bigint,
  guarantee_cap_paise bigint,
  unique (plan_id, service_type_id)
);

alter table plans enable row level security;
alter table plans force row level security;
alter table plan_services enable row level security;
alter table plan_services force row level security;

create policy plans_authenticated_read on plans
  for select to authenticated
  using (true);

create policy plan_services_authenticated_read on plan_services
  for select to authenticated
  using (true);

-- Solar Basic: solar only. Solar + Backup: solar + battery with an
-- availability guarantee — the PS1 differentiator from #76, sold as part
-- of a plan, not a standalone feature. Solar + Comfort: adds cooling and
-- lighting, unmetered but real line items, proving the abstraction #77
-- exists specifically to prove.
insert into plans (code, name, description, price_paise_per_month) values
  ('solar_basic', 'Solar Basic', 'Solar generation, billed on real meter reads.', 99900),
  ('solar_backup', 'Solar + Backup', 'Solar generation plus battery backup with a 98% availability guarantee.', 249900),
  ('solar_comfort', 'Solar + Comfort', 'Solar, backup, cooling, and lighting in one subscription.', 399900);

do $$
declare
  v_solar_basic uuid; v_solar_backup uuid; v_solar_comfort uuid;
  v_solar_type uuid; v_backup_type uuid; v_cooling_type uuid; v_lighting_type uuid;
begin
  select id into v_solar_basic from plans where code = 'solar_basic';
  select id into v_solar_backup from plans where code = 'solar_backup';
  select id into v_solar_comfort from plans where code = 'solar_comfort';
  select id into v_solar_type from service_types where code = 'solar_kwh';
  select id into v_backup_type from service_types where code = 'backup_availability';
  select id into v_cooling_type from service_types where code = 'cooling_ton_hours';
  select id into v_lighting_type from service_types where code = 'lighting';

  insert into plan_services (plan_id, service_type_id, included_quantity, overage_rate_paise_per_unit) values
    (v_solar_basic, v_solar_type, 300, 500);

  insert into plan_services (plan_id, service_type_id, included_quantity, overage_rate_paise_per_unit) values
    (v_solar_backup, v_solar_type, 300, 500);
  insert into plan_services (
    plan_id, service_type_id, included_quantity, overage_rate_paise_per_unit,
    guarantee_metric, guarantee_contracted_value, guarantee_rate_paise_per_unit_shortfall, guarantee_cap_paise
  ) values (
    v_solar_backup, v_backup_type, 24, 0,
    'availability_pct', 0.98, 100000, 100000
  );

  insert into plan_services (plan_id, service_type_id, included_quantity, overage_rate_paise_per_unit) values
    (v_solar_comfort, v_solar_type, 400, 500);
  insert into plan_services (
    plan_id, service_type_id, included_quantity, overage_rate_paise_per_unit,
    guarantee_metric, guarantee_contracted_value, guarantee_rate_paise_per_unit_shortfall, guarantee_cap_paise
  ) values (
    v_solar_comfort, v_backup_type, 24, 0,
    'availability_pct', 0.98, 100000, 100000
  );
  insert into plan_services (plan_id, service_type_id, included_quantity, overage_rate_paise_per_unit) values
    (v_solar_comfort, v_cooling_type, 720, 0),
    (v_solar_comfort, v_lighting_type, 3000, 0);
end $$;

-- ============================================================
-- subscriptions — one active row per service_connection at a time
-- (the trimmed stand-in for #25's EXCLUDE constraint: a partial unique
-- index enforcing "at most one active subscription per connection" is the
-- correct-enough mechanism for upgrade/pause/cancel; the full time-range
-- EXCLUDE that #78 asks for matters once transfer-on-sale needs to reason
-- about historical, non-overlapping periods, which is out of scope here).
-- ============================================================

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  service_connection_id uuid not null references service_connections (id),
  plan_id uuid not null references plans (id),

  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),

  started_at timestamptz not null default now(),
  paused_at timestamptz,
  resumed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,

  dt_id uuid,
  division_id uuid,
  org_id uuid,

  created_at timestamptz not null default now()
);

create unique index subscriptions_one_active_per_connection
  on subscriptions (service_connection_id)
  where status in ('active', 'paused');

create index subscriptions_service_connection_id_idx on subscriptions (service_connection_id);

create function subscriptions_set_scope_keys() returns trigger as $$
begin
  select dt_id, division_id, org_id
  into new.dt_id, new.division_id, new.org_id
  from service_connections
  where id = new.service_connection_id;
  return new;
end;
$$ language plpgsql;

create trigger subscriptions_scope_keys
  before insert or update of service_connection_id on subscriptions
  for each row execute function subscriptions_set_scope_keys();

alter table subscriptions enable row level security;
alter table subscriptions force row level security;

create policy subscriptions_consumer_select on subscriptions
  for select to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

create policy subscriptions_consumer_insert on subscriptions
  for insert to authenticated
  with check ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

create policy subscriptions_consumer_update on subscriptions
  for update to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) )
  with check ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

-- ============================================================
-- subscription_events — the audit chain #78 asks for: every transition,
-- who did it, why, and what it changed.
-- ============================================================

create type subscription_event_type as enum ('created', 'paused', 'resumed', 'upgraded', 'downgraded', 'cancelled');

create table subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  event_type subscription_event_type not null,
  from_plan_id uuid references plans (id),
  to_plan_id uuid references plans (id),
  actor_user_id uuid references auth.users (id),
  reason text,
  created_at timestamptz not null default now()
);

create index subscription_events_subscription_id_idx on subscription_events (subscription_id, created_at desc);

alter table subscription_events enable row level security;
alter table subscription_events force row level security;

create policy subscription_events_via_subscription on subscription_events
  for select to authenticated
  using ( exists (select 1 from subscriptions s where s.id = subscription_events.subscription_id) );

create policy subscription_events_consumer_insert on subscription_events
  for insert to authenticated
  with check ( exists (select 1 from subscriptions s where s.id = subscription_events.subscription_id) );

-- ============================================================
-- Backfilling #76's forward-reference, exactly as that migration's own
-- comment said this one would: service_guarantees.subscription_id gets
-- its real FK now that subscriptions exists.
-- ============================================================

alter table service_guarantees
  add constraint service_guarantees_subscription_id_fkey
  foreign key (subscription_id) references subscriptions (id);

-- #76 only granted SELECT on service_guarantees — at the time nothing but
-- a future settlement worker was expected to write there. Subscribing to
-- a plan with bundled guarantee terms (#78) now writes here directly from
-- the consumer's own session, so it needs an INSERT policy too.
create policy service_guarantees_consumer_insert on service_guarantees
  for insert to authenticated
  with check ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );
