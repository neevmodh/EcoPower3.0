-- 0007_realtime_authorization.sql
-- Private Realtime Broadcast channels (#18) — a subscriber can only join
-- meter:{id} if RLS on realtime.messages says they're allowed to. The
-- ingest worker (#15) publishes as service_role, which bypasses this
-- entirely; this policy governs who's allowed to *listen*.
--
-- meter_readings itself must never enter the supabase_realtime publication
-- (Realtime evaluates RLS per subscriber per change; at 1Hz x 500 meters
-- that exhausts the monthly quota in about an hour). Broadcast is
-- server-authored specifically to avoid that per-row cost.

-- RLS is already enabled on realtime.messages by default in this Supabase
-- version; the table is owned by supabase_realtime_admin, not postgres, so
-- re-enabling it here would fail with "must be owner of table messages".

create policy meter_broadcast_authorization on realtime.messages
  for select
  to authenticated
  using (
    topic like 'meter:%'
    and exists (
      select 1
      from meter_live_state m
      where 'meter:' || m.meter_id::text = realtime.topic()
        and (
          (
            (has_role('discom_officer') or has_role('discom_admin'))
            and m.division_id = any ((select auth_divisions())::uuid[])
          )
          or m.service_connection_id = any ((select my_service_connection_ids())::uuid[])
        )
    )
  );
