-- 0016_plans_public_read.sql
-- plans / plan_services were authenticated-readable only (#77) — correct
-- for the in-app catalog, but a prospective customer on the public landing
-- page isn't authenticated yet. Extending the same "published catalog
-- data" exception tariffs already has (#20) to anon: real prices on the
-- landing page, fetched live, not hand-copied numbers that can drift from
-- what a subscribing consumer actually sees.

create policy plans_anon_read on plans
  for select to anon
  using (true);

create policy plan_services_anon_read on plan_services
  for select to anon
  using (true);
