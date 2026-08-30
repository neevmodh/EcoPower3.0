-- 0015_meters_consumer_rls.sql
-- meters had only a DISCOM division-scoped SELECT policy (#4/#5) — a
-- consumer could never read their own meter row at all. Silently broken
-- since #5 shipped; surfaced by building the real analytics page (#77+),
-- which needs meters.id for a consumer's own connection to call
-- daily_energy_summary(). meter_readings and meter_live_state already had
-- the matching consumer-owner policy (#5/#18); meters itself just never
-- got one.

create policy meters_consumer_scope on meters
  for select to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );
