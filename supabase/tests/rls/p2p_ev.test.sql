-- p2p + ev (0027): open market is visible to any consumer, trades only to
-- the parties, place_order locks the listing and writes the trade, EV
-- vehicles/sessions are owner-scoped.

begin;
select plan(7);

insert into orgs (id, name, type) values ('27000000-0000-0000-0000-000000000002', 'D Co', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values ('27000000-0000-0000-0000-00000000000a', '27000000-0000-0000-0000-000000000002', 'A', 'division');
insert into substations (id, division_id, name) values ('27000000-0000-0000-0000-0000000000a1', '27000000-0000-0000-0000-00000000000a', 'SS');
insert into feeders (id, substation_id, name) values ('27000000-0000-0000-0000-0000000000a2', '27000000-0000-0000-0000-0000000000a1', 'F');
insert into distribution_transformers (id, feeder_id, name) values ('27000000-0000-0000-0000-0000000000a3', '27000000-0000-0000-0000-0000000000a2', 'DT');
insert into auth.users (id, email) values
  ('27000000-0000-0000-0000-0000000000e1', 'p2p.seller@test.local'),
  ('27000000-0000-0000-0000-0000000000e2', 'p2p.buyer@test.local'),
  ('27000000-0000-0000-0000-0000000000e3', 'p2p.stranger@test.local');
insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('27000000-0000-0000-0000-0000000000c1', 'P2P-SELL', '27000000-0000-0000-0000-0000000000a3', '27000000-0000-0000-0000-0000000000e1', 'RGP', 'single', 'postpaid'),
  ('27000000-0000-0000-0000-0000000000c2', 'P2P-BUY', '27000000-0000-0000-0000-0000000000a3', '27000000-0000-0000-0000-0000000000e2', 'RGP', 'single', 'postpaid'),
  ('27000000-0000-0000-0000-0000000000c3', 'P2P-STRANGER', '27000000-0000-0000-0000-0000000000a3', '27000000-0000-0000-0000-0000000000e3', 'RGP', 'single', 'postpaid');

set local role authenticated;

-- seller lists 10 kWh
set local request.jwt.claims = '{"sub":"27000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';
insert into p2p_listings (id, seller_connection_id, quantity_kwh, remaining_kwh, price_paise_per_kwh, delivery_window_start, delivery_window_end)
  values ('27000000-0000-0000-0000-0000000000f1', '27000000-0000-0000-0000-0000000000c1', 10, 10, 550, now(), now() + interval '6 hours');

select is(
  (select division_id from p2p_listings where id = '27000000-0000-0000-0000-0000000000f1'),
  '27000000-0000-0000-0000-00000000000a'::uuid,
  'the listing trigger fills division_id from the seller connection'
);

-- buyer sees the open market and takes 4 kWh
set local request.jwt.claims = '{"sub":"27000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';
select is((select count(*)::int from p2p_listings), 1, 'any consumer sees the open market');

select lives_ok(
  $$select p2p_place_order('27000000-0000-0000-0000-0000000000f1', '27000000-0000-0000-0000-0000000000c2', 4)$$,
  'a buyer can take part of a listing'
);
select is(
  (select status::text from p2p_listings where id = '27000000-0000-0000-0000-0000000000f1'),
  'partially_filled',
  'the listing drops to partially_filled with the remainder'
);
select is(
  (select amount_paise from p2p_trades where buyer_connection_id = '27000000-0000-0000-0000-0000000000c2'),
  2200::bigint,
  'the trade amount is quantity x price (4 x 550)'
);

-- a stranger cannot see the trade
set local request.jwt.claims = '{"sub":"27000000-0000-0000-0000-0000000000e3","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';
select is((select count(*)::int from p2p_trades), 0, 'a consumer who is not a party to the trade cannot see it');

-- EV: vehicle is owner-scoped
set local request.jwt.claims = '{"sub":"27000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';
insert into ev_vehicles (owner_user_id, make_model, battery_kwh, range_km)
  values ('27000000-0000-0000-0000-0000000000e1', 'Tata Nexon EV', 40.5, 312);
set local request.jwt.claims = '{"sub":"27000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';
select is((select count(*)::int from ev_vehicles), 0, 'a consumer cannot see another consumer''s vehicle');

rollback;
