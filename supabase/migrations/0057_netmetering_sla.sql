-- 0057_netmetering_sla.sql (#29)
-- SLA clock on the actual shipped net-metering workflow (0019): a consumer
-- submits, a discom_officer decides — submitted/under_review is the one
-- waiting stage, not the multi-stage lifecycle (scrutiny, feasibility,
-- inspection, ...) the original problem-statement doc imagined but this
-- codebase never built. sla_due_at is set once, at submission, for that one
-- waiting stage.
--
-- [external — verify] 15 calendar days from application to a DISCOM
-- decision is a representative approval-timeline figure across several
-- state net-metering regulations (exact figures vary state to state and
-- have moved with GERC/CEA amendments) — not a specific cited GERC order,
-- unlike the tariff numbers in DATA.md. Good enough for a demo SLA clock,
-- not something to defend line-by-line to a regulator.

alter table netmetering_applications add column sla_due_at timestamptz;
alter table netmetering_applications add column sla_breached boolean not null default false;

alter type notification_type add value if not exists 'netmetering_sla_breach';

-- 0052 qualified this function's table reference (public.service_connections)
-- as a root-cause fix for #142 — an unqualified reference resolves against
-- whatever search_path is active for the caller, including a temp table an
-- authenticated attacker can create, letting a forged row supply fake scope
-- keys. Keep that qualification; only add the new sla_due_at branch.
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
  end if;
  return new;
end;
$$;

-- sweep_netmetering_sla() — marks any still-pending application past its
-- due date as breached, and notifies every discom_admin in that division
-- (the stand-in "division head" role this schema actually has — there is
-- no separate title for it). Fires once per application, not every sweep:
-- the `and not sla_breached` guard means only the UPDATE that flips the flag
-- returns that row, so a division head is notified once per breach, not
-- once per 5-minute tick for as long as it stays breached.
create function sweep_netmetering_sla() returns void as $$
declare
  v_app record;
begin
  for v_app in
    update public.netmetering_applications
    set sla_breached = true
    where status in ('submitted', 'under_review')
      and sla_due_at < now()
      and not sla_breached
    returning id, division_id
  loop
    insert into public.notifications (user_id, type, title, body, link)
    select ur.user_id, 'netmetering_sla_breach', 'Net-metering application SLA breached',
      'A net-metering application has missed its 15-day approval SLA and needs attention.',
      '/discom/netmetering'
    from public.user_roles ur
    where ur.role = 'discom_admin' and ur.division_id = v_app.division_id and ur.revoked_at is null;
  end loop;
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function sweep_netmetering_sla() from public, anon, authenticated;

select cron.schedule('sweep-netmetering-sla', '*/15 * * * *', 'select public.sweep_netmetering_sla();');
