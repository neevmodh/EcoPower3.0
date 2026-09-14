-- 0059_demand_response.sql (#33)
-- Demand response, meter-verified — not a button. A discom_officer
-- declares a peak event; consumers in that division opt in before it
-- starts; once it ends, a sweeper computes each participant's baseline
-- from their own historical load shape, measures actual consumption
-- during the event window from their real meter reads, and only credits
-- the shortfall that's actually there. National Portal / OpenADR / IEEE
-- 2030.5 integration is out of scope — the measurement and settlement
-- arithmetic underneath it is what's real here.
--
-- Credit is NOT wired into invoice generation as a line item: the
-- guarantee engine (#76, 0010) — a materially more mature, already-shipped
-- feature — has the identical `invoice_line_id uuid references
-- invoice_lines (id)` column sitting permanently null for the same reason.
-- Following that precedent rather than inventing a half-tested new path
-- into the billing engine for this issue.

create type dr_event_status as enum ('scheduled', 'active', 'completed', 'cancelled');

create table demand_response_events (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references discom_divisions (id),
  feeder_id uuid references feeders (id), -- null = division-wide

  event_type text not null default 'peak_shave',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  target_kw_reduction numeric not null check (target_kw_reduction > 0),
  incentive_paise_per_kwh bigint not null check (incentive_paise_per_kwh >= 0),
  status dr_event_status not null default 'scheduled',

  created_by_user_id uuid references auth.users (id),
  created_at timestamptz not null default now(),

  constraint demand_response_events_window_valid check (ends_at > starts_at)
);

create index demand_response_events_division_id_idx on demand_response_events (division_id, starts_at desc);

alter table demand_response_events enable row level security;
alter table demand_response_events force row level security;

create policy dr_events_discom on demand_response_events
  for all to authenticated
  using ((has_role('discom_officer') or has_role('discom_admin')) and division_id = any ((select auth_divisions())::uuid[]))
  with check ((has_role('discom_officer') or has_role('discom_admin')) and division_id = any ((select auth_divisions())::uuid[]));

-- Read-only: a consumer needs to see an event to opt into it, never to
-- create or edit one.
create policy dr_events_consumer_visibility on demand_response_events
  for select to authenticated
  using (
    exists (
      select 1 from service_connections sc
      where sc.id = any ((select my_service_connection_ids())::uuid[])
      and sc.division_id = demand_response_events.division_id
    )
  );

-- ============================================================
-- dr_participations
-- ============================================================

create table dr_participations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references demand_response_events (id),
  service_connection_id uuid not null references service_connections (id),

  opted_in boolean not null default true,

  -- Set only by sweep_demand_response_events() once the event ends —
  -- never client-writable, see the guard trigger below.
  baseline_kw numeric,
  achieved_reduction_kwh numeric,
  incentive_paise bigint,
  verified_by_meter boolean not null default false,
  settled_at timestamptz,

  division_id uuid,
  org_id uuid,

  created_at timestamptz not null default now(),

  unique (event_id, service_connection_id)
);

create index dr_participations_event_id_idx on dr_participations (event_id);
create index dr_participations_division_id_idx on dr_participations (division_id);

create function dr_participations_set_scope_keys() returns trigger as $$
begin
  select division_id, org_id
  into new.division_id, new.org_id
  from public.service_connections
  where id = new.service_connection_id;
  return new;
end;
$$ language plpgsql;

create trigger dr_participations_scope_keys
  before insert or update of service_connection_id on dr_participations
  for each row execute function dr_participations_set_scope_keys();

-- Same shape as guard_payment_order_update (0043): the true authorization
-- boundary here is "computed from a real meter read," which no browser
-- session gets to assert about itself. A signed-in consumer may only ever
-- toggle their own opt-in, and only before the event they're opting into
-- has started — every settlement field is the sweep's word to say, not
-- the client's.
create function guard_dr_participation_update() returns trigger
  language plpgsql
as $$
declare
  v_starts_at timestamptz;
begin
  if current_user <> 'authenticated' then
    return new; -- the sweep runs unrestricted, not as a browser session
  end if;

  if new.event_id is distinct from old.event_id
     or new.service_connection_id is distinct from old.service_connection_id
     or new.baseline_kw is distinct from old.baseline_kw
     or new.achieved_reduction_kwh is distinct from old.achieved_reduction_kwh
     or new.incentive_paise is distinct from old.incentive_paise
     or new.verified_by_meter is distinct from old.verified_by_meter
     or new.settled_at is distinct from old.settled_at then
    raise exception 'dr_participations: this field can only be set by the settlement sweep' using errcode = '42501';
  end if;

  select starts_at into v_starts_at from public.demand_response_events where id = old.event_id;
  if new.opted_in is distinct from old.opted_in and v_starts_at <= now() then
    raise exception 'dr_participations: cannot change opt-in status after the event has started' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger dr_participations_guard_update
  before update on dr_participations
  for each row execute function guard_dr_participation_update();

alter table dr_participations enable row level security;
alter table dr_participations force row level security;

-- Ownership alone isn't enough here: without the event join, a consumer
-- could opt into ANY division's event (not just their own — the visibility
-- policy above scopes SELECT, not this INSERT), or opt in after the event
-- has already started/ended, since the update guard only restricts changing
-- opted_in post-start, not the initial insert.
create policy dr_participations_consumer_insert on dr_participations
  for insert to authenticated
  with check (
    service_connection_id = any ((select my_service_connection_ids())::uuid[])
    and exists (
      select 1 from demand_response_events e
      join service_connections sc on sc.id = dr_participations.service_connection_id
      where e.id = dr_participations.event_id
      and e.division_id = sc.division_id
      and e.starts_at > now()
    )
  );

create policy dr_participations_consumer_select on dr_participations
  for select to authenticated
  using (service_connection_id = any ((select my_service_connection_ids())::uuid[]));

create policy dr_participations_consumer_update on dr_participations
  for update to authenticated
  using (service_connection_id = any ((select my_service_connection_ids())::uuid[]))
  with check (service_connection_id = any ((select my_service_connection_ids())::uuid[]));

create policy dr_participations_discom_select on dr_participations
  for select to authenticated
  using ((has_role('discom_officer') or has_role('discom_admin')) and division_id = any ((select auth_divisions())::uuid[]));

-- ============================================================
-- Sweep: lifecycle transitions + meter-verified settlement.
-- ============================================================

-- [external — verify against a real DR baseline standard, e.g. PJM's
-- Customer Baseline Load] baseline here is the average of this connection's
-- own metered consumption during the identical clock-time window on each
-- of the 7 days immediately preceding the event — a simplified same-time
-- historical average, not a specific cited utility methodology.
create function sweep_demand_response_events() returns void as $$
declare
  v_event record;
  v_participation record;
  v_duration_hours numeric;
  v_baseline_kwh numeric;
  v_actual_kwh numeric;
  v_reading_count integer;
  v_achieved_reduction_kwh numeric;
begin
  update public.demand_response_events
  set status = 'active'
  where status = 'scheduled' and starts_at <= now() and ends_at > now();

  for v_event in
    select * from public.demand_response_events
    where status in ('scheduled', 'active') and ends_at <= now()
  loop
    v_duration_hours := extract(epoch from (v_event.ends_at - v_event.starts_at)) / 3600.0;

    for v_participation in
      select * from public.dr_participations
      where event_id = v_event.id and opted_in and settled_at is null
    loop
      -- 7 prior days, same clock-time window each day, averaged.
      select avg(daily.kwh) into v_baseline_kwh
      from (
        select coalesce(sum(mr.delta_import_kwh), 0) as kwh
        from generate_series(1, 7) as offset_days
        left join public.meters m on m.service_connection_id = v_participation.service_connection_id
        left join public.meter_readings mr on mr.meter_id = m.id
          and mr.reading_ts >= v_event.starts_at - (offset_days || ' days')::interval
          and mr.reading_ts < v_event.ends_at - (offset_days || ' days')::interval
        group by offset_days
      ) daily;

      select coalesce(sum(mr.delta_import_kwh), 0), count(mr.*)
      into v_actual_kwh, v_reading_count
      from public.meters m
      join public.meter_readings mr on mr.meter_id = m.id
        and mr.reading_ts >= v_event.starts_at and mr.reading_ts < v_event.ends_at
      where m.service_connection_id = v_participation.service_connection_id;

      if v_baseline_kwh is null or v_reading_count = 0 then
        -- No real meter data covering the baseline window or the event
        -- window itself — never falls back to a self-reported number.
        update public.dr_participations
        set verified_by_meter = false, achieved_reduction_kwh = null, incentive_paise = 0, settled_at = now()
        where id = v_participation.id;
      else
        v_achieved_reduction_kwh := greatest(0, v_baseline_kwh - v_actual_kwh);
        update public.dr_participations
        set baseline_kw = case when v_duration_hours > 0 then v_baseline_kwh / v_duration_hours else null end,
            achieved_reduction_kwh = v_achieved_reduction_kwh,
            incentive_paise = round(v_achieved_reduction_kwh * v_event.incentive_paise_per_kwh),
            verified_by_meter = true,
            settled_at = now()
        where id = v_participation.id;
      end if;
    end loop;

    update public.demand_response_events set status = 'completed' where id = v_event.id;
  end loop;
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function sweep_demand_response_events() from public, anon, authenticated;

select cron.schedule('sweep-demand-response-events', '*/15 * * * *', 'select public.sweep_demand_response_events();');
