-- 0056_dt_feasibility_check.sql (#30)
-- A DT feasibility verdict for a net-metering application, computed from
-- real measured data rather than a dropdown: dt_capacity_kva (nameplate,
-- the hard equipment limit), existing_solar_kw (already-installed rooftop
-- capacity on the same DT), the proposed capacity, and dt_peak_load_kw
-- (measured from the DT-head meter's active_power_kw, not nameplate).
--
-- Two independent checks, both real DISCOM planning constraints, not one:
-- 1. Individual cap — proposed capacity can't exceed the applicant's own
--    sanctioned load. [external — verify against the current GERC Rooftop
--    Solar PV Grid Interactive Systems Regulations; 100% of sanctioned load
--    is the common norm across most state regulations as of this writing.]
-- 2. DT aggregate penetration — (existing + proposed) / dt_capacity_kva.
--    Above a threshold, voltage-rise and protection-coordination risk from
--    reverse power flow needs a further study before connection.
--    [external — verify against CEA / GERC DG interconnection technical
--    guidelines for the exact threshold; 80% is a representative planning
--    figure for a hackathon demo, not a cited regulatory number.]
--
-- Headroom is deliberately NOT "nameplate capacity minus total solar" — it's
-- "measured peak load minus total solar". The real technical risk at a DT is
-- whether local daytime demand can absorb rooftop generation before it
-- reverse-flows onto the feeder; a transformer's kVA rating says nothing
-- about that, only the DT's actual load profile does. That's what makes this
-- number defensible in front of a jury that knows the domain.

create table dt_feasibility_checks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references netmetering_applications (id),
  dt_id uuid not null references distribution_transformers (id),

  dt_capacity_kva numeric,
  existing_solar_kw numeric not null,
  proposed_kw numeric not null,
  dt_peak_load_kw numeric,
  headroom_kw numeric,
  penetration_pct numeric,

  verdict text not null check (verdict in ('feasible', 'infeasible', 'insufficient_data')),
  verdict_detail text not null,
  rule_version text not null,

  computed_at timestamptz not null default now(),
  computed_by_user_id uuid references auth.users (id)
);

create index dt_feasibility_checks_application_id_idx on dt_feasibility_checks (application_id, computed_at desc);

alter table dt_feasibility_checks enable row level security;
alter table dt_feasibility_checks force row level security;

-- Same visibility as the application itself: the owning consumer can see
-- their own application's checks, the deciding division's officers can see
-- every check in their division. Joined through netmetering_applications
-- rather than duplicating its scope-key trigger onto a second table.
create policy dt_feasibility_checks_via_application on dt_feasibility_checks
  for select to authenticated
  using (
    exists (
      select 1 from netmetering_applications na
      where na.id = dt_feasibility_checks.application_id
      and (
        na.service_connection_id = any ((select my_service_connection_ids())::uuid[])
        or (
          (has_role('discom_officer') or has_role('discom_admin'))
          and na.division_id = any ((select auth_divisions())::uuid[])
        )
      )
    )
  );

-- SECURITY DEFINER: aggregating existing_solar_kw needs to read every
-- consumer's assets on the DT, not just the caller's own (assets has no
-- discom-scoped RLS policy — only consumer-own and RESCO-scope, #18/0004).
-- Re-asserts the caller's authorization itself rather than relying on the
-- table grants a plain SELECT would need widened for every discom_officer.
create function run_dt_feasibility_check(p_application_id uuid) returns dt_feasibility_checks
language plpgsql security definer set search_path = public
as $$
declare
  v_app netmetering_applications;
  v_sc service_connections;
  v_dt_capacity_kva numeric;
  v_existing_solar_kw numeric;
  v_peak_load_kw numeric;
  v_total_solar_kw numeric;
  v_penetration_pct numeric;
  v_headroom_kw numeric;
  v_verdict text;
  v_detail text;
  v_row dt_feasibility_checks;

  -- See module comment above for sourcing on both thresholds.
  c_rule_version constant text := '1.0.0';
  c_penetration_cap_pct constant numeric := 80;
begin
  select * into v_app from netmetering_applications where id = p_application_id;
  if v_app is null then
    raise exception 'no such application %', p_application_id;
  end if;

  if not (
    (has_role('discom_officer') or has_role('discom_admin') or is_platform_admin())
    and (is_platform_admin() or v_app.division_id = any (auth_divisions()))
  ) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select * into v_sc from service_connections where id = v_app.service_connection_id;
  select capacity_kva into v_dt_capacity_kva from distribution_transformers where id = v_app.dt_id;

  -- Every already-installed pv_array on the DT counts, including one on the
  -- applicant's own connection: an `assets` row only exists once a system is
  -- actually commissioned, so a prior approved-and-installed array here is
  -- real existing capacity, wholly separate from the not-yet-installed
  -- proposed_kw this application is asking for. Excluding the applicant's
  -- own connection would understate a repeat applicant's true footprint.
  select coalesce(sum(a.capacity_kw), 0) into v_existing_solar_kw
  from assets a
  join service_connections sc on sc.id = a.service_connection_id
  where sc.dt_id = v_app.dt_id and a.asset_type = 'pv_array';

  -- Measured, not nameplate: the DT-head meter's own instantaneous readings
  -- over the last 30 days, same meters.dt_id join dt_loss_summary() (0017)
  -- uses for delivered_kwh.
  select max(mr.active_power_kw) into v_peak_load_kw
  from meter_readings mr
  join meters m on m.id = mr.meter_id
  where m.dt_id = v_app.dt_id and mr.reading_ts >= now() - interval '30 days';

  v_total_solar_kw := v_existing_solar_kw + v_app.capacity_kw;

  if v_peak_load_kw is null or coalesce(v_dt_capacity_kva, 0) <= 0 or v_sc.sanctioned_load_kw is null then
    v_verdict := 'insufficient_data';
    v_detail := 'Missing one of: measured DT peak load (no readings in the last 30 days), a valid (non-zero) DT nameplate capacity, or the applicant''s sanctioned load.';
    v_penetration_pct := null;
    v_headroom_kw := null;
  else
    v_penetration_pct := round(100 * v_total_solar_kw / v_dt_capacity_kva, 1);
    v_headroom_kw := round(v_peak_load_kw - v_total_solar_kw, 1);

    if v_app.capacity_kw > v_sc.sanctioned_load_kw then
      v_verdict := 'infeasible';
      v_detail := format('Proposed %s kW exceeds the applicant''s sanctioned load of %s kW.', v_app.capacity_kw, v_sc.sanctioned_load_kw);
    elsif v_penetration_pct > c_penetration_cap_pct then
      v_verdict := 'infeasible';
      v_detail := format('%s%% aggregate DT penetration would exceed the %s%% planning threshold.', v_penetration_pct, c_penetration_cap_pct);
    elsif v_headroom_kw < 0 then
      v_verdict := 'infeasible';
      v_detail := format('Measured peak DT load (%s kW) cannot absorb %s kW of total rooftop solar — %s kW short.', v_peak_load_kw, v_total_solar_kw, abs(v_headroom_kw));
    else
      v_verdict := 'feasible';
      v_detail := format('%s%% aggregate DT penetration, %s kW measured headroom.', v_penetration_pct, v_headroom_kw);
    end if;
  end if;

  insert into dt_feasibility_checks (
    application_id, dt_id, dt_capacity_kva, existing_solar_kw, proposed_kw,
    dt_peak_load_kw, headroom_kw, penetration_pct, verdict, verdict_detail,
    rule_version, computed_by_user_id
  ) values (
    p_application_id, v_app.dt_id, v_dt_capacity_kva, v_existing_solar_kw, v_app.capacity_kw,
    v_peak_load_kw, v_headroom_kw, v_penetration_pct, v_verdict, v_detail,
    c_rule_version, auth.uid()
  ) returning * into v_row;

  return v_row;
end;
$$;

revoke all on function run_dt_feasibility_check(uuid) from public, anon;
grant execute on function run_dt_feasibility_check(uuid) to authenticated;
