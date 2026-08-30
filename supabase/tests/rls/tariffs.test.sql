-- tariffs RLS (#20): published regulatory data, readable by any
-- authenticated user (a deliberate, narrow exception to default deny — a
-- consumer needs to see the rates their bill is computed from), still
-- denied to anon/no-session.

begin;
select plan(3);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from tariffs where category = 'RGP' $$,
  'any authenticated user (even with no roles/org/division claims) can read tariffs'
);

select isnt_empty(
  $$ select 1 from tariff_slabs $$,
  'any authenticated user can read tariff slabs'
);

reset request.jwt.claims;
set local role anon;

select is_empty(
  $$ select 1 from tariffs $$,
  'anon (no session) sees zero tariffs — default deny still holds outside the authenticated exception'
);

select * from finish();
rollback;
