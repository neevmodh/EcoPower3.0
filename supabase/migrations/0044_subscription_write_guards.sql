-- 0044_subscription_write_guards.sql — the sibling gaps to #125/0043,
-- flagged in the #6 follow-up comment while auditing it. Same class of
-- vulnerability, same fix shape: an `authenticated`-only guard restricting
-- what a direct PostgREST write can do, everything else (migrations,
-- fixtures, other roles) unaffected.
--
-- subscriptions_consumer_insert/_update (0012) checked connection
-- ownership only. A signed-in consumer could:
--   POST /rest/v1/subscriptions { service_connection_id, plan_id, status: 'active' }
-- for any plan — upgrading themselves for free, no /api/subscriptions
-- call, no payment. Or PATCH their own row's plan_id/status directly,
-- bypassing /api/subscriptions/[id]/actions's VALID_TRANSITIONS entirely.
--
-- subscription_events_consumer_insert's `exists(select 1 from
-- subscriptions s where s.id = ...)` had no ownership filter at all — any
-- subscription_id in the system, and no check that actor_user_id was the
-- caller, so a client could forge an audit event attributed to someone
-- else.
--
-- service_guarantees_consumer_insert (0012) checked connection ownership
-- only, not that the guarantee terms actually came from the subscribed
-- plan's catalog entry — a client could insert self-serving terms (a
-- near-zero contracted_value, a large rate_paise_per_unit_shortfall)
-- entitling themselves to shortfall credits nobody ever contracted.

create function guard_subscription_insert() returns trigger
  language plpgsql
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- /api/subscriptions only ever inserts {service_connection_id, plan_id}
  -- and lets every lifecycle column take its schema default.
  if new.status <> 'active'
     or new.paused_at is not null or new.resumed_at is not null
     or new.cancelled_at is not null or new.cancel_reason is not null then
    raise exception 'subscriptions: a new subscription must start active with no lifecycle fields set' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger subscriptions_guard_insert
  before insert on subscriptions
  for each row execute function guard_subscription_insert();

create function guard_subscription_update() returns trigger
  language plpgsql
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.service_connection_id is distinct from old.service_connection_id
     or new.started_at is distinct from old.started_at then
    raise exception 'subscriptions: this field cannot be changed by a direct client update' using errcode = '42501';
  end if;

  -- Upgrade (#78): plan_id may change only while remaining active, never
  -- bundled with a status transition in the same write.
  if new.plan_id is distinct from old.plan_id and (old.status <> 'active' or new.status <> 'active') then
    raise exception 'subscriptions: plan can only change while the subscription stays active' using errcode = '42501';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'active' and new.status = 'paused')
    or (old.status = 'paused' and new.status = 'active')
    or (old.status in ('active', 'paused') and new.status = 'cancelled')
  ) then
    raise exception 'subscriptions: invalid status transition % -> %', old.status, new.status using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger subscriptions_guard_update
  before update on subscriptions
  for each row execute function guard_subscription_update();

-- subscription_events: ownership + actor identity, both fixable as a
-- policy since they're plain equality/existence checks, not multi-column
-- transition logic.
drop policy subscription_events_consumer_insert on subscription_events;

create policy subscription_events_consumer_insert on subscription_events
  for insert to authenticated
  with check (
    exists (
      select 1 from subscriptions s
      where s.id = subscription_events.subscription_id
        and s.service_connection_id = any ((select my_service_connection_ids())::uuid[])
    )
    and actor_user_id = auth.uid()
  );

-- service_guarantees: the terms must actually be the subscribed plan's own
-- catalog entry, not a client-chosen number.
drop policy service_guarantees_consumer_insert on service_guarantees;

create function guard_service_guarantee_insert() returns trigger
  language plpgsql
as $$
declare
  v_plan_id uuid;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  select plan_id into v_plan_id from subscriptions where id = new.subscription_id;
  if v_plan_id is null then
    raise exception 'service_guarantees: no such subscription' using errcode = '42501';
  end if;

  if not exists (
    select 1 from plan_services ps
    where ps.plan_id = v_plan_id
      and ps.guarantee_metric = new.metric
      and ps.guarantee_contracted_value = new.contracted_value
      and ps.guarantee_rate_paise_per_unit_shortfall = new.rate_paise_per_unit_shortfall
      and coalesce(ps.guarantee_cap_paise, -1) = coalesce(new.cap_paise, -1)
  ) then
    raise exception 'service_guarantees: terms do not match the subscription''s actual plan catalog entry' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger service_guarantees_guard_insert
  before insert on service_guarantees
  for each row execute function guard_service_guarantee_insert();

create policy service_guarantees_consumer_insert on service_guarantees
  for insert to authenticated
  with check (
    service_connection_id = any ((select my_service_connection_ids())::uuid[])
    and exists (
      select 1 from subscriptions s
      where s.id = service_guarantees.subscription_id
        and s.service_connection_id = service_guarantees.service_connection_id
    )
  );
