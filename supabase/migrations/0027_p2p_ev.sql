-- 0027_p2p_ev.sql
-- Two consumer-facing services 2.0 projected and 3.0 had not built: peer-to-
-- peer solar trading, and EV charging.
--
-- Honesty notes (DESIGN.md P1): the *prices* in P2P and the charging-station
-- catalogue are demo-scale reference data, tagged as such — a consumer's own
-- listings, trades, vehicles and sessions are real rows they created. A
-- listing can only offer as much as the seller's metered export supports (the
-- place_order RPC does not check that yet — flagged below), and every trade
-- and session is a plain append row, not a derived headline.

-- ===========================================================================
-- P2P solar trading
-- ===========================================================================

create type p2p_listing_status as enum ('open', 'partially_filled', 'filled', 'expired', 'cancelled');
create type p2p_trade_status as enum ('confirmed', 'settled', 'cancelled');

create table p2p_listings (
  id uuid primary key default gen_random_uuid(),
  seller_connection_id uuid not null references service_connections (id) on delete cascade,
  quantity_kwh numeric not null check (quantity_kwh > 0),
  remaining_kwh numeric not null check (remaining_kwh >= 0),
  price_paise_per_kwh integer not null check (price_paise_per_kwh > 0),
  delivery_window_start timestamptz not null,
  delivery_window_end timestamptz not null,
  status p2p_listing_status not null default 'open',
  created_at timestamptz not null default now(),

  -- denormalized scope keys (trigger below)
  dt_id uuid,
  division_id uuid,

  constraint p2p_window_valid check (delivery_window_end > delivery_window_start),
  constraint p2p_remaining_le_quantity check (remaining_kwh <= quantity_kwh)
);

create table p2p_trades (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references p2p_listings (id) on delete restrict,
  buyer_connection_id uuid not null references service_connections (id) on delete cascade,
  seller_connection_id uuid not null references service_connections (id) on delete cascade,
  quantity_kwh numeric not null check (quantity_kwh > 0),
  price_paise_per_kwh integer not null check (price_paise_per_kwh > 0),
  amount_paise bigint not null,
  status p2p_trade_status not null default 'confirmed',
  traded_at timestamptz not null default now(),
  division_id uuid
);

create index p2p_listings_status_idx on p2p_listings (status, delivery_window_start) where status in ('open', 'partially_filled');
create index p2p_listings_seller_idx on p2p_listings (seller_connection_id, created_at desc);
create index p2p_trades_buyer_idx on p2p_trades (buyer_connection_id, traded_at desc);
create index p2p_trades_seller_idx on p2p_trades (seller_connection_id, traded_at desc);

create function p2p_listing_scope_keys() returns trigger as $$
begin
  select sc.dt_id, sc.division_id into new.dt_id, new.division_id
  from service_connections sc where sc.id = new.seller_connection_id;
  return new;
end;
$$ language plpgsql;

create trigger p2p_listings_scope before insert on p2p_listings
  for each row execute function p2p_listing_scope_keys();

-- p2p_place_order — a buyer takes some of a listing. Client-generated is not
-- possible here (needs the listing lock), so it's an RPC. Last-writer safety
-- via SELECT ... FOR UPDATE on the listing.
create function p2p_place_order(p_listing_id uuid, p_buyer_connection_id uuid, p_quantity_kwh numeric)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_listing p2p_listings%rowtype;
  v_trade_id uuid;
  v_amount bigint;
begin
  if p_quantity_kwh is null or p_quantity_kwh <= 0 then
    raise exception 'quantity must be positive';
  end if;
  if not (p_buyer_connection_id = any ((select my_service_connection_ids())::uuid[])) then
    raise exception 'not your connection' using errcode = '42501';
  end if;

  select * into v_listing from p2p_listings where id = p_listing_id for update;
  if not found then raise exception 'listing not found'; end if;
  if v_listing.status not in ('open', 'partially_filled') then
    raise exception 'listing is %', v_listing.status;
  end if;
  if v_listing.seller_connection_id = p_buyer_connection_id then
    raise exception 'cannot buy your own listing';
  end if;
  if p_quantity_kwh > v_listing.remaining_kwh then
    raise exception 'only % kWh remaining', v_listing.remaining_kwh;
  end if;

  v_amount := round(p_quantity_kwh * v_listing.price_paise_per_kwh);

  insert into p2p_trades (listing_id, buyer_connection_id, seller_connection_id, quantity_kwh, price_paise_per_kwh, amount_paise, division_id)
  values (p_listing_id, p_buyer_connection_id, v_listing.seller_connection_id, p_quantity_kwh, v_listing.price_paise_per_kwh, v_amount, v_listing.division_id)
  returning id into v_trade_id;

  update p2p_listings
     set remaining_kwh = remaining_kwh - p_quantity_kwh,
         status = case when remaining_kwh - p_quantity_kwh <= 0 then 'filled'::p2p_listing_status else 'partially_filled'::p2p_listing_status end
   where id = p_listing_id;

  return v_trade_id;
end;
$$;

revoke all on function p2p_place_order(uuid, uuid, numeric) from public, anon;
grant execute on function p2p_place_order(uuid, uuid, numeric) to authenticated;

alter table p2p_listings enable row level security;
alter table p2p_listings force row level security;
alter table p2p_trades enable row level security;
alter table p2p_trades force row level security;

-- Any consumer can browse the open market and see their own listings.
create policy p2p_listings_market_select on p2p_listings
  for select to authenticated
  using ( status in ('open', 'partially_filled') or seller_connection_id = any ((select my_service_connection_ids())::uuid[]) );

create policy p2p_listings_seller_insert on p2p_listings
  for insert to authenticated
  with check ( seller_connection_id = any ((select my_service_connection_ids())::uuid[]) and remaining_kwh = quantity_kwh );

create policy p2p_listings_seller_update on p2p_listings
  for update to authenticated
  using ( seller_connection_id = any ((select my_service_connection_ids())::uuid[]) )
  with check ( seller_connection_id = any ((select my_service_connection_ids())::uuid[]) );

-- DISCOM officers see the market in their division (oversight, read only).
create policy p2p_listings_discom_select on p2p_listings
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );

create policy p2p_trades_party_select on p2p_trades
  for select to authenticated
  using (
    buyer_connection_id = any ((select my_service_connection_ids())::uuid[])
    or seller_connection_id = any ((select my_service_connection_ids())::uuid[])
    or ((has_role('discom_officer') or has_role('discom_admin')) and division_id = any ((select auth_divisions())::uuid[]))
  );

-- ===========================================================================
-- EV charging
-- ===========================================================================

create table charging_stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  operator text not null,
  area text not null,                       -- e.g. "Vastrapur, Ahmedabad"
  lat numeric,
  lng numeric,
  connector_type text not null,             -- CCS2 / Type2 / Bharat DC-001
  price_paise_per_kwh integer not null,
  fast_charge boolean not null default false,
  bays integer not null default 2,
  data_basis text not null default 'Demo reference data — representative Gujarat public-charging tariffs',
  created_at timestamptz not null default now()
);

create type ev_session_status as enum ('scheduled', 'charging', 'completed', 'cancelled');

create table ev_vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  service_connection_id uuid references service_connections (id) on delete set null,
  make_model text not null,
  battery_kwh numeric not null check (battery_kwh > 0),
  range_km integer,
  created_at timestamptz not null default now()
);

create table ev_sessions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references ev_vehicles (id) on delete cascade,
  station_id uuid references charging_stations (id) on delete set null,  -- null = home charging
  preferred_source text not null default 'any' check (preferred_source in ('solar', 'grid', 'any')),
  scheduled_for timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  energy_kwh numeric,
  cost_paise bigint,
  status ev_session_status not null default 'scheduled',
  created_at timestamptz not null default now()
);

create index ev_vehicles_owner_idx on ev_vehicles (owner_user_id);
create index ev_sessions_vehicle_idx on ev_sessions (vehicle_id, created_at desc);

alter table charging_stations enable row level security;
create policy charging_stations_anon_read on charging_stations for select to anon using (true);
create policy charging_stations_auth_read on charging_stations for select to authenticated using (true);

alter table ev_vehicles enable row level security;
alter table ev_vehicles force row level security;
create policy ev_vehicles_owner_all on ev_vehicles
  for all to authenticated
  using ( owner_user_id = (select auth.uid()) )
  with check ( owner_user_id = (select auth.uid()) );

alter table ev_sessions enable row level security;
alter table ev_sessions force row level security;
create policy ev_sessions_owner_all on ev_sessions
  for all to authenticated
  using ( vehicle_id in (select id from ev_vehicles where owner_user_id = (select auth.uid())) )
  with check ( vehicle_id in (select id from ev_vehicles where owner_user_id = (select auth.uid())) );

-- ===========================================================================
-- Seed — charging stations (demo reference), representative of Ahmedabad
-- public charging. Tariffs are in the ballpark of GEDA / Tata Power EZ /
-- Statiq listings; tagged data_basis.
-- ===========================================================================
insert into charging_stations (name, operator, area, lat, lng, connector_type, price_paise_per_kwh, fast_charge, bays) values
  ('SG Highway Hub', 'Tata Power EZ', 'Bodakdev, Ahmedabad', 23.031, 72.507, 'CCS2', 2100, true, 4),
  ('Vastrapur Lake P1', 'Statiq', 'Vastrapur, Ahmedabad', 23.038, 72.527, 'Type2', 1600, false, 2),
  ('Alpha One Mall', 'ChargeZone', 'Vastrapur, Ahmedabad', 23.039, 72.530, 'CCS2', 2250, true, 6),
  ('GEDA Bhavan', 'GEDA', 'Sector 11, Gandhinagar', 23.223, 72.650, 'Bharat DC-001', 1400, false, 2),
  ('Riverfront East', 'Ather Grid', 'Ellis Bridge, Ahmedabad', 23.022, 72.575, 'Type2', 1500, false, 3);
