-- society RLS: org membership visibility. The full structural split
-- (society_allocations admin-visible, invoices owner-only) can't be tested
-- yet — those tables land with #50/#21, both blocked by #16 and #19. This
-- covers what's buildable today: org-level visibility scoped by the JWT's
-- org_ids claim, same as any other role.

begin;
select plan(3);

insert into orgs (id, name, type) values
  ('50000000-0000-0000-0000-000000000001', 'Sunrise Residency', 'society'),
  ('50000000-0000-0000-0000-000000000002', 'Unrelated Society', 'society');

set local role authenticated;
set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"roles":["society_admin"],"org_ids":["50000000-0000-0000-0000-000000000001"],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from orgs where id = '50000000-0000-0000-0000-000000000001' $$,
  'society_admin sees their own society org'
);

select is_empty(
  $$ select 1 from orgs where id = '50000000-0000-0000-0000-000000000002' $$,
  'society_admin does not see an unrelated society org'
);

set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"roles":["society_admin"],"org_ids":[],"division_ids":[]}}';
select is_empty(
  $$ select 1 from orgs $$,
  'a society_admin with no org claim sees zero orgs'
);

select * from finish();
rollback;
