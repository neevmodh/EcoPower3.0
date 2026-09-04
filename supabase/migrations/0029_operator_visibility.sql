-- 0029_operator_visibility.sql
-- The RESCO operator panel could see its assets and the meters attached to
-- them (0018) but nothing coming off those meters, and none of the service
-- guarantees it is the counterparty to. That left the Operator surface
-- unable to show generation performance or its own guarantee exposure.
--
-- This grants resco_ops / resco_admin a READ scope on live meter state,
-- meter readings, service guarantees and their settlements — always via the
-- same gate 0018 established: the RESCO's org must own an asset on that
-- service connection. No write access; no consumer PII beyond what the
-- meter itself carries.

-- ---------------------------------------------------------------------------
-- helper: does one of the caller's orgs service this connection?
-- ---------------------------------------------------------------------------
create function resco_services_connection(p_service_connection_id uuid)
  returns boolean
  language sql
  stable
as $$
  select exists (
    select 1 from assets a
    where a.service_connection_id = p_service_connection_id
      and a.resco_org_id = any ((select auth_orgs())::uuid[])
  );
$$;

revoke all on function resco_services_connection(uuid) from public, anon;
grant execute on function resco_services_connection(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- meter_live_state — low cardinality, already in the realtime publication.
-- ---------------------------------------------------------------------------
create policy meter_live_state_resco_scope on meter_live_state
  for select to authenticated
  using (
    (has_role('resco_ops') or has_role('resco_admin'))
    and resco_services_connection(service_connection_id)
  );

-- ---------------------------------------------------------------------------
-- meter_readings — parent policy, inherited by every partition (0005).
-- ---------------------------------------------------------------------------
create policy meter_readings_resco_scope on meter_readings
  for select to authenticated
  using (
    (has_role('resco_ops') or has_role('resco_admin'))
    and resco_services_connection(service_connection_id)
  );

-- ---------------------------------------------------------------------------
-- service_guarantees + guarantee_settlements — the RESCO is the party that
-- pays the credit, so it sees the contracted terms and each settlement.
-- ---------------------------------------------------------------------------
create policy service_guarantees_resco_scope on service_guarantees
  for select to authenticated
  using (
    (has_role('resco_ops') or has_role('resco_admin'))
    and resco_services_connection(service_connection_id)
  );

create policy guarantee_settlements_resco_scope on guarantee_settlements
  for select to authenticated
  using (
    (has_role('resco_ops') or has_role('resco_admin'))
    and exists (
      select 1 from service_guarantees g
      where g.id = guarantee_settlements.service_guarantee_id
        and resco_services_connection(g.service_connection_id)
    )
  );
