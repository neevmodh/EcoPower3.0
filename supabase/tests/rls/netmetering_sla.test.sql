-- netmetering SLA (#29, 0057): sla_due_at is set on submission, the sweeper
-- flags a still-pending application past due as breached exactly once, and
-- notifies every discom_admin in that division on the breach — not on every
-- subsequent sweep tick.

begin;
select plan(6);

insert into orgs (id, name, type) values ('62000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('62000000-0000-0000-0000-00000000000a', '62000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('62000000-0000-0000-0000-0000000000a1', '62000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('62000000-0000-0000-0000-0000000000a2', '62000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('62000000-0000-0000-0000-0000000000a3', '62000000-0000-0000-0000-0000000000a2', 'DT A');

insert into auth.users (id, email) values
  ('62000000-0000-0000-0000-0000000000f1', 'sla.consumer@test.local'),
  ('62000000-0000-0000-0000-0000000000f2', 'sla.admin@test.local');

-- The division head stand-in: a discom_admin scoped to Division A.
insert into user_roles (user_id, role, org_id, division_id) values
  ('62000000-0000-0000-0000-0000000000f2', 'discom_admin', '62000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-00000000000a');

insert into service_connections (id, consumer_number, dt_id, owner_user_id, tariff_category, phase, connection_type) values
  ('62000000-0000-0000-0000-0000000000c1', 'CN-SLA-01', '62000000-0000-0000-0000-0000000000a3', '62000000-0000-0000-0000-0000000000f1', 'RGP', 'single', 'postpaid');

insert into netmetering_applications (id, service_connection_id, capacity_kw) values
  ('62000000-0000-0000-0000-0000000000d1', '62000000-0000-0000-0000-0000000000c1', 5);

select ok(
  (select sla_due_at from netmetering_applications where id = '62000000-0000-0000-0000-0000000000d1') is not null,
  'sla_due_at is set automatically on submission'
);

-- Simulate a "legacy" application that predates this migration: the trigger
-- always sets sla_due_at on INSERT, so the only way to get a pending row
-- with sla_due_at null is to null it out directly, then re-run the exact
-- backfill statement 0057 runs once at deploy time.
update netmetering_applications set sla_due_at = null where id = '62000000-0000-0000-0000-0000000000d1';
update netmetering_applications
set sla_due_at = created_at + interval '15 days'
where sla_due_at is null and status in ('submitted', 'under_review');

select ok(
  (select sla_due_at = created_at + interval '15 days' from netmetering_applications where id = '62000000-0000-0000-0000-0000000000d1'),
  'the backfill statement recomputes sla_due_at (created_at + 15 days) for a pre-migration pending application'
);

-- Force it overdue — the trigger sets sla_due_at from now(), a fixture
-- can't backdate the submission itself without pre-existing readings, so
-- just move the due date into the past directly.
update netmetering_applications set sla_due_at = now() - interval '1 day'
where id = '62000000-0000-0000-0000-0000000000d1';

select sweep_netmetering_sla();

select results_eq(
  $$ select sla_breached from netmetering_applications where id = '62000000-0000-0000-0000-0000000000d1' $$,
  $$ values (true) $$,
  'the sweeper flags a still-pending application past its due date as breached'
);

select isnt_empty(
  $$ select 1 from notifications where user_id = '62000000-0000-0000-0000-0000000000f2' and type = 'netmetering_sla_breach' $$,
  'the division''s discom_admin is notified of the breach'
);

select results_eq(
  $$ select count(*)::int from notifications where user_id = '62000000-0000-0000-0000-0000000000f2' and type = 'netmetering_sla_breach' $$,
  $$ values (1) $$,
  'exactly one notification for the breach, not one per fixture'
);

-- A second sweep must not notify again — the "not sla_breached" guard in
-- the UPDATE means an already-breached row is never touched again.
select sweep_netmetering_sla();

select results_eq(
  $$ select count(*)::int from notifications where user_id = '62000000-0000-0000-0000-0000000000f2' and type = 'netmetering_sla_breach' $$,
  $$ values (1) $$,
  'a second sweep does not re-notify an already-breached application'
);

select finish();
rollback;
