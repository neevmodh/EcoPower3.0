-- sweep_meter_offline_status() (0048, #17) — the meter-offline sweeper.
-- Direct function call, same pattern as prepaid_settle_day's own test:
-- pg_cron itself isn't exercised by pgTAP, but the function it schedules is.

begin;
select plan(4);

insert into orgs (id, name, type) values ('97000000-0000-0000-0000-000000000001', 'Test DISCOM', 'discom');
insert into discom_divisions (id, discom_org_id, name, level) values
  ('97000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-000000000001', 'Division A', 'division');
insert into substations (id, division_id, name) values ('97000000-0000-0000-0000-0000000000a1', '97000000-0000-0000-0000-00000000000a', 'SS A');
insert into feeders (id, substation_id, name) values ('97000000-0000-0000-0000-0000000000a2', '97000000-0000-0000-0000-0000000000a1', 'Feeder A');
insert into distribution_transformers (id, feeder_id, name) values ('97000000-0000-0000-0000-0000000000a3', '97000000-0000-0000-0000-0000000000a2', 'DT A');
insert into service_connections (id, consumer_number, dt_id, tariff_category, phase, connection_type) values
  ('97000000-0000-0000-0000-0000000000c1', 'CN-A-SWEEP', '97000000-0000-0000-0000-0000000000a3', 'RGP', 'single', 'postpaid');

-- Fresh: reported 5 minutes ago, stays active.
insert into meters (id, serial, service_connection_id, status, last_seen_at) values
  ('97000000-0000-0000-0000-0000000000f1', 'MTR-FRESH', '97000000-0000-0000-0000-0000000000c1', 'active', now() - interval '5 minutes');

-- Stale: last reported 20 minutes ago, still marked active — the exact gap.
insert into meters (id, serial, service_connection_id, status, last_seen_at) values
  ('97000000-0000-0000-0000-0000000000f2', 'MTR-STALE', '97000000-0000-0000-0000-0000000000c1', 'active', now() - interval '20 minutes');

-- Recovering: was swept offline earlier, but a reading has since landed.
insert into meters (id, serial, service_connection_id, status, last_seen_at) values
  ('97000000-0000-0000-0000-0000000000f3', 'MTR-RECOVERED', '97000000-0000-0000-0000-0000000000c1', 'offline', now() - interval '2 minutes');

-- Never reported at all: last_seen_at is null, must not be swept (nothing
-- to time out from — this is issue #71's "no-data drill" class of bug:
-- a freshly commissioned meter is not the same thing as an offline one).
insert into meters (id, serial, service_connection_id, status, last_seen_at) values
  ('97000000-0000-0000-0000-0000000000f4', 'MTR-NEW', '97000000-0000-0000-0000-0000000000c1', 'active', null);

select sweep_meter_offline_status();

select is(
  (select status from meters where id = '97000000-0000-0000-0000-0000000000f1'),
  'active',
  'a meter that reported 5 minutes ago stays active'
);

select is(
  (select status from meters where id = '97000000-0000-0000-0000-0000000000f2'),
  'offline',
  'a meter silent for 20 minutes gets swept to offline'
);

select is(
  (select status from meters where id = '97000000-0000-0000-0000-0000000000f3'),
  'active',
  'a meter that recovered (fresh last_seen_at) clears back to active on the next sweep'
);

select is(
  (select status from meters where id = '97000000-0000-0000-0000-0000000000f4'),
  'active',
  'a freshly commissioned meter with no reading yet is never swept offline'
);

select * from finish();
rollback;
