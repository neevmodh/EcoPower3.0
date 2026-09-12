-- 0045_subscription_upgrade_rpc.sql — closes a real gap the code review
-- caught in 0044: guard_subscription_update only blocked a plan_id change
-- when it was bundled with a status change. A bare
--   PATCH /rest/v1/subscriptions?id=eq.<mine> { "plan_id": "<premium>" }
-- while status stayed 'active' sailed straight through — the exact
-- self-upgrade-for-free attack 0044's own comment claimed to close, still
-- open for the one-column case.
--
-- The reason 0044 couldn't just block plan_id changes outright: the
-- legitimate upgrade path (POST /api/subscriptions/[id]/actions) runs as
-- the user's own session too — a raw table UPDATE, indistinguishable at
-- the RLS/trigger layer from the attack. The fix is to give the
-- legitimate path its own privileged door: a SECURITY DEFINER RPC that
-- changes plan_id and writes the subscription_events row atomically, then
-- forbid every other route (bare client writes) from touching plan_id at
-- all. Inside a SECURITY DEFINER function, current_user is the function's
-- owner, not 'authenticated' — so the RPC's own internal UPDATE sails
-- through the same guard trigger that now blocks everyone else.

create or replace function guard_subscription_update() returns trigger
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

  -- Plan changes now go exclusively through upgrade_subscription() below —
  -- no direct-write exception for the active->active case anymore.
  if new.plan_id is distinct from old.plan_id then
    raise exception 'subscriptions: plan changes must go through upgrade_subscription(), not a direct update' using errcode = '42501';
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

create function upgrade_subscription(p_subscription_id uuid, p_new_plan_id uuid) returns subscriptions
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_subscription subscriptions%rowtype;
  v_old_plan_id uuid;
  v_plan_active boolean;
begin
  select * into v_subscription from subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'upgrade_subscription: no such subscription' using errcode = '42501';
  end if;

  -- Ownership: the caller must own the connection this subscription
  -- belongs to. auth.uid()/my_service_connection_ids() read the caller's
  -- own JWT regardless of this function's elevated privileges.
  if not (v_subscription.service_connection_id = any ((select my_service_connection_ids())::uuid[])) then
    raise exception 'upgrade_subscription: not your subscription' using errcode = '42501';
  end if;

  if v_subscription.status <> 'active' then
    raise exception 'upgrade_subscription: subscription must be active to change plans (is %)', v_subscription.status using errcode = '42501';
  end if;

  select active into v_plan_active from plans where id = p_new_plan_id;
  if v_plan_active is null or not v_plan_active then
    raise exception 'upgrade_subscription: target plan not found or inactive' using errcode = '42501';
  end if;

  v_old_plan_id := v_subscription.plan_id;

  update subscriptions set plan_id = p_new_plan_id where id = p_subscription_id returning * into v_subscription;

  insert into subscription_events (subscription_id, event_type, from_plan_id, to_plan_id, actor_user_id)
  values (p_subscription_id, 'upgraded', v_old_plan_id, p_new_plan_id, auth.uid());

  return v_subscription;
end;
$$;

revoke all on function upgrade_subscription(uuid, uuid) from public, anon;
grant execute on function upgrade_subscription(uuid, uuid) to authenticated;
