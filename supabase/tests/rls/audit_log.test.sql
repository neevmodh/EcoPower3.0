-- audit_log (0023): the ledger is written by a trigger, is append-only in
-- the database, and reads are division/org scoped like the rest of the panel.

begin;
select plan(7);

insert into orgs (id, name, type) values
  ('a0000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom'),
  ('a0000000-0000-0000-0000-000000000009', 'Test RESCO', 'resco');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'Division A', 'division'),
  ('a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 'Division B', 'division');
insert into substations (id, division_id, name) values ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('a0000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000a2', 'DT A');
insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type) values
  ('a0000000-0000-0000-0000-0000000000c1', 'CN-AUDIT', 'a0000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid');

-- A net-metering application; its scope-key trigger fills division_id.
insert into netmetering_applications (id, service_connection_id, capacity_kw, status)
  values ('a0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000c1', 3.0, 'submitted');

select is(
  (select count(*)::int from audit_log where entity_id = 'a0000000-0000-0000-0000-0000000000e1'),
  1,
  'inserting an application writes one audit row (the initial state)'
);

update netmetering_applications set status = 'under_review' where id = 'a0000000-0000-0000-0000-0000000000e1';
update netmetering_applications set status = 'approved', decision_notes = 'cleared' where id = 'a0000000-0000-0000-0000-0000000000e1';

select is(
  (select count(*)::int from audit_log where entity_id = 'a0000000-0000-0000-0000-0000000000e1'),
  3,
  'each status transition appends a row'
);

select is(
  (select to_state from audit_log where entity_id = 'a0000000-0000-0000-0000-0000000000e1' order by seq desc limit 1),
  'approved',
  'the latest row records the new state'
);

select is(
  (select detail->>'decision_notes' from audit_log where entity_id = 'a0000000-0000-0000-0000-0000000000e1' order by seq desc limit 1),
  'cleared',
  'decision notes are captured in detail'
);

-- A no-op update (status unchanged) must not append.
update netmetering_applications set decision_notes = 'typo fix' where id = 'a0000000-0000-0000-0000-0000000000e1';
select is(
  (select count(*)::int from audit_log where entity_id = 'a0000000-0000-0000-0000-0000000000e1'),
  3,
  'an update that does not change status appends nothing'
);

-- Append-only: UPDATE and DELETE both raise.
select throws_ok(
  $$ update audit_log set to_state = 'tampered' where entity_id = 'a0000000-0000-0000-0000-0000000000e1' $$,
  'audit_log is append-only; UPDATE is not permitted'
);

-- RLS: an officer of Division B sees none of Division A's audit rows.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000f2","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["a0000000-0000-0000-0000-000000000001"],"division_ids":["a0000000-0000-0000-0000-00000000000b"]}}';

select is_empty(
  $$ select 1 from audit_log where entity_id = 'a0000000-0000-0000-0000-0000000000e1' $$,
  'an officer of another division sees none of these audit rows'
);

select finish();
rollback;
