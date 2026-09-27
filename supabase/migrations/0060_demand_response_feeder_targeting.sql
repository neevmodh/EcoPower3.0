-- 0060_demand_response_feeder_targeting.sql (#33 follow-up)
-- Closes one of the two limitations 0059 documented deliberately: feeder_id
-- on demand_response_events had real schema + a division-wide default, but
-- nothing in the API or UI could actually set it, and the opt-in INSERT
-- policy never checked it — a feeder-targeted event (if one had existed)
-- would have silently accepted opt-ins from the whole division anyway.
--
-- service_connections has no feeder_id column of its own (0001) — a
-- connection's feeder is derived via dt_id -> distribution_transformers.feeder_id.
-- distribution_transformers_division_scope (0004) restricts a plain SELECT
-- on that table to discom_officer/discom_admin roles, so a consumer's own
-- with-check evaluation can't read it directly — same reason
-- my_service_connection_ids() (0004) is security definer rather than a
-- plain view: this needs the same bypass, scoped to just one column.

create function dt_feeder_id(p_dt_id uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select feeder_id from public.distribution_transformers where id = p_dt_id;
$$;

revoke all on function dt_feeder_id(uuid) from public, anon;
grant execute on function dt_feeder_id(uuid) to authenticated;

drop policy dr_participations_consumer_insert on dr_participations;

create policy dr_participations_consumer_insert on dr_participations
  for insert to authenticated
  with check (
    service_connection_id = any ((select my_service_connection_ids())::uuid[])
    and exists (
      select 1
      from demand_response_events e
      join service_connections sc on sc.id = dr_participations.service_connection_id
      where e.id = dr_participations.event_id
      and e.division_id = sc.division_id
      and e.starts_at > now()
      and e.status = 'scheduled'
      and (e.feeder_id is null or e.feeder_id = (select dt_feeder_id(sc.dt_id)))
    )
  );
