-- 0058_pm_surya_ghar_subsidy.sql (#31)
-- PM Surya Ghar Muft Bijli Yojana central subsidy on the actual shipped
-- net-metering workflow. National Portal integration is mocked (there's no
-- such API to call in a demo) — the arithmetic and the disbursement gate
-- are real.
--
-- [external — verify against the current MNRE CFA order] the schedule as
-- of this scheme's 2024 launch: ₹30,000/kW for the first 2kW, ₹18,000 for
-- the third kW, nothing beyond 3kW, capped at ₹78,000 total regardless of
-- system size. Government subsidy schedules can be revised.
--
-- Disbursement is gated on 'approved', not a separate 'inspected' stage —
-- this codebase's net-metering state machine (0019) never built the
-- multi-stage lifecycle (scrutiny, feasibility, inspection, ...) the
-- original problem-statement doc imagined. 'approved' is the closest real
-- signal this schema has to "DISCOM has signed off"; see #29's SLA clock
-- migration for the same scoping call on the same workflow.

alter table netmetering_applications add column subsidy_scheme text not null default 'PM_SURYA_GHAR';
alter table netmetering_applications add column subsidy_claimed_paise bigint not null default 0;
alter table netmetering_applications add column subsidy_disbursed_paise bigint;
alter table netmetering_applications add column subsidy_disbursed_at timestamptz;

-- Same trigger 0057 already extended for sla_due_at — one more INSERT-only
-- branch rather than a second trigger on the same table.
create or replace function netmetering_applications_set_scope_keys() returns trigger
language plpgsql
as $$
begin
  select dt_id, division_id, org_id
  into new.dt_id, new.division_id, new.org_id
  from public.service_connections
  where id = new.service_connection_id;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.sla_due_at := now() + interval '15 days';
    -- ₹30,000/kW for the first 2kW + ₹18,000 for the third kW, capped at
    -- ₹78,000. greatest/least clamp each band to [0, band width] so this
    -- holds for any capacity_kw, fractional or beyond 3kW, with no branch.
    new.subsidy_claimed_paise := least(
      78000 * 100,
      round(
        (least(new.capacity_kw, 2) * 30000
         + greatest(least(new.capacity_kw, 3) - 2, 0) * 18000) * 100
      )
    )::bigint;
  end if;
  return new;
end;
$$;
