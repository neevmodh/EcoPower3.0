-- data_provenance (#74/#75, DATA.md §1): a public disclosure surface, not a
-- scoped one — /about-the-data must render for a logged-out visitor, so
-- unlike every other table in this schema, anon reading it is the correct
-- behaviour, not a gap.

begin;
select plan(3);

select isnt_empty(
  $$ select 1 from data_provenance $$,
  'the seeded provenance rows exist (0041)'
);

set local role anon;

select isnt_empty(
  $$ select 1 from data_provenance $$,
  'anon (no session) can read data_provenance — this is a public disclosure page, not a scoped one'
);

-- 2-arg throws_ok matches the SECOND arg against the real error message,
-- not a free-text label (confirmed the hard way in CI) — use the plain
-- 1-arg form: "this throws something," regardless of exact wording.
select throws_ok(
  $$ insert into data_provenance (entity, kind, description) values ('x', 'real_cited', 'x') $$
);

select * from finish();
rollback;
