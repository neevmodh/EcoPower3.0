-- webhook_events RLS (#41, 0055): the table was previously service_role-only
-- with no authenticated read path. Now the admin reconciliation screen reads
-- it directly, so verify platform_admin sees rows and no other role does.

begin;
select plan(3);

insert into webhook_events (event_id, event_type, payload, processed_at) values
  ('evt-test-1', 'payment.captured', '{}'::jsonb, now());

-- Inserted by the migration/seed path (service_role equivalent in this txn,
-- since the txn owner bypasses RLS by default in the test harness setup).
select isnt_empty(
  $$ select 1 from webhook_events where event_id = 'evt-test-1' $$,
  'the row exists (sanity check, run as the unrestricted test role)'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"roles":["platform_admin"],"org_ids":[],"division_ids":[]}}';

select isnt_empty(
  $$ select 1 from webhook_events where event_id = 'evt-test-1' $$,
  'platform_admin can read webhook_events'
);

set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"roles":["consumer"],"org_ids":[],"division_ids":[]}}';

select is_empty(
  $$ select 1 from webhook_events where event_id = 'evt-test-1' $$,
  'a consumer sees no rows — this ledger is admin-only'
);

select finish();
rollback;
