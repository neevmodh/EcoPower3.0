-- PM Surya Ghar subsidy (#31, 0058): subsidy_claimed_paise is computed on
-- submission from capacity_kw per the ₹30,000/₹18,000/₹78,000-cap schedule;
-- disbursement is gated on 'approved' and is idempotent (no double-credit).

begin;
select plan(6);

insert into orgs (id, name, type) values ('63000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('63000000-0000-0000-0000-00000000000a', '63000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('63000000-0000-0000-0000-0000000000a1', '63000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('63000000-0000-0000-0000-0000000000a2', '63000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('63000000-0000-0000-0000-0000000000a3', '63000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values ('63000000-0000-0000-0000-0000000000f1', 'subsidy.consumer@test.local');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('63000000-0000-0000-0000-0000000000c1', 'CN-SUB-01', '63000000-0000-0000-0000-0000000000a3', '63000000-0000-0000-0000-0000000000f1', 'RGP', 'single', 'postpaid');

-- 1kW: first band only, no cap.
insert into netmetering_applications (id, service_connection_id, capacity_kw) values
  ('63000000-0000-0000-0000-0000000000d1', '63000000-0000-0000-0000-0000000000c1', 1);
select results_eq(
  $$ select subsidy_claimed_paise from netmetering_applications where id = '63000000-0000-0000-0000-0000000000d1' $$,
  $$ values (3000000::bigint) $$,
  '1kW claims Rs 30,000 (3,000,000 paise) — first band only'
);

-- 3kW: exactly the Rs 78,000 cap (2 x 30,000 + 1 x 18,000).
insert into netmetering_applications (id, service_connection_id, capacity_kw) values
  ('63000000-0000-0000-0000-0000000000d2', '63000000-0000-0000-0000-0000000000c1', 3);
select results_eq(
  $$ select subsidy_claimed_paise from netmetering_applications where id = '63000000-0000-0000-0000-0000000000d2' $$,
  $$ values (7800000::bigint) $$,
  '3kW claims exactly Rs 78,000'
);

-- 10kW: still capped at Rs 78,000, not scaled up further.
insert into netmetering_applications (id, service_connection_id, capacity_kw) values
  ('63000000-0000-0000-0000-0000000000d3', '63000000-0000-0000-0000-0000000000c1', 10);
select results_eq(
  $$ select subsidy_claimed_paise from netmetering_applications where id = '63000000-0000-0000-0000-0000000000d3' $$,
  $$ values (7800000::bigint) $$,
  '10kW is still capped at Rs 78,000, not scaled past the cap'
);

-- Disbursement is gated on 'approved' — cannot disburse a merely-submitted application.
set local role authenticated;
set local request.jwt.claims = '{"sub":"63000000-0000-0000-0000-0000000000f2","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["63000000-0000-0000-0000-000000000001"],"division_ids":["63000000-0000-0000-0000-00000000000a"]}}';

select is_empty(
  $$ update netmetering_applications set subsidy_disbursed_paise = subsidy_claimed_paise, subsidy_disbursed_at = now() where id = '63000000-0000-0000-0000-0000000000d1' and status = 'approved' and subsidy_disbursed_at is null returning id $$,
  'disbursement filter matches nothing for a merely-submitted application'
);

update netmetering_applications set status = 'approved' where id = '63000000-0000-0000-0000-0000000000d1';

select isnt_empty(
  $$ update netmetering_applications set subsidy_disbursed_paise = subsidy_claimed_paise, subsidy_disbursed_at = now() where id = '63000000-0000-0000-0000-0000000000d1' and status = 'approved' and subsidy_disbursed_at is null returning id $$,
  'disbursement filter matches once the application is approved'
);

-- A second attempt (double-click, or two officers) is a no-op — the
-- subsidy_disbursed_at is null guard already excludes the now-disbursed row.
select is_empty(
  $$ update netmetering_applications set subsidy_disbursed_paise = subsidy_claimed_paise, subsidy_disbursed_at = now() where id = '63000000-0000-0000-0000-0000000000d1' and status = 'approved' and subsidy_disbursed_at is null returning id $$,
  'a second disbursement attempt matches nothing — no double-credit'
);

select finish();
rollback;
