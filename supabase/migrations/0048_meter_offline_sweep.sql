-- 0048_meter_offline_sweep.sql — issue #17's "meter-offline sweeper," the
-- one item on that checklist 2.0 never had at all: nothing ever set
-- meters.status to reflect that a meter has actually gone silent.
--
-- scan_meter_outages() (0019) already reads last_seen_at to *notify* a
-- consumer of a possible outage, but it never touches meters.status —
-- every other panel that renders m.status (the RESCO Devices page, this
-- migration's own dt_consumer_breakdown-style scoring, platform_admin's
-- meters_active count) keeps calling a meter that hasn't reported in hours
-- "active," because nothing else ever flips it. This is that flip.
--
-- Self-healing by construction: the sweep runs both directions every 5
-- minutes, so a meter that starts reporting again clears back to 'active'
-- on its own next tick — no ingest-worker change needed, since last_seen_at
-- is already updated on every real reading.

alter table meters drop constraint meters_status_check;
alter table meters add constraint meters_status_check
  check (status in ('active', 'inactive', 'offline', 'faulty', 'decommissioned'));

create function sweep_meter_offline_status() returns void as $$
begin
  update meters
  set status = 'offline'
  where status = 'active'
    and last_seen_at is not null
    and last_seen_at < now() - interval '15 minutes';

  update meters
  set status = 'active'
  where status = 'offline'
    and last_seen_at is not null
    and last_seen_at >= now() - interval '15 minutes';
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function sweep_meter_offline_status() from public, anon, authenticated;

select cron.schedule('sweep-meter-offline-status', '*/5 * * * *', 'select public.sweep_meter_offline_status();');
