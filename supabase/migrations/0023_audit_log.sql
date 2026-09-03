-- 0023_audit_log.sql
-- Append-only audit ledger (#34). Every state transition on a
-- decision-bearing table — a net-metering approval/rejection, a work-order
-- claim/complete/cancel — lands here as an immutable row, written by a
-- database trigger, not application code. That placement is the point: a
-- direct psql session or a leaked service key can change the source row
-- but cannot suppress or rewrite the audit entry.

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,  -- total order even within one transaction
  occurred_at timestamptz not null default clock_timestamp(),  -- wall clock at write, not txn time
  actor_user_id uuid,               -- auth.uid() at write time; null for a system/cron actor
  entity_type text not null,        -- 'netmetering_application', 'work_order', ...
  entity_id uuid not null,
  action text not null,             -- 'status_change'
  from_state text,
  to_state text,
  detail jsonb not null default '{}',
  division_id uuid,                 -- scope keys copied from the source row for RLS
  org_id uuid
);

create index audit_log_entity_idx on audit_log (entity_type, entity_id, occurred_at desc);
create index audit_log_division_idx on audit_log (division_id, occurred_at desc);
create index audit_log_org_idx on audit_log (org_id, occurred_at desc);

-- Immutable: UPDATE and DELETE both raise, for everyone, including the
-- table owner and SECURITY DEFINER callers. Inserts are the only mutation.
create function audit_log_reject_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only; % is not permitted', tg_op;
end;
$$;

create trigger audit_log_no_update_or_delete
  before update or delete on audit_log
  for each row execute function audit_log_reject_mutation();

alter table audit_log enable row level security;
alter table audit_log force row level security;

-- Read scoped like every other table in the panel. No INSERT policy for
-- `authenticated`: rows are only ever written by the SECURITY DEFINER
-- trigger below.
create policy audit_log_discom_read on audit_log
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );

create policy audit_log_resco_read on audit_log
  for select to authenticated
  using (
    (has_role('resco_ops') or has_role('resco_admin'))
    and org_id = any ((select auth_orgs())::uuid[])
  );

-- ============================================================
-- audit_status_change() — generic recorder. tg_argv[0] is the entity_type
-- label. Reads columns off to_jsonb(new/old) so one function serves every
-- table. SECURITY DEFINER (to write past audit_log's no-insert RLS) with
-- search_path='' — so it must not call has_role()/auth_*(), and it doesn't:
-- only auth.uid() and built-ins, every reference schema-qualified.
-- ============================================================
create function audit_status_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_entity text := tg_argv[0];
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
  if tg_op = 'UPDATE' and (v_new->>'status') is not distinct from (v_old->>'status') then
    return new;
  end if;

  insert into public.audit_log (
    actor_user_id, entity_type, entity_id, action, from_state, to_state, division_id, org_id, detail
  )
  values (
    auth.uid(),
    v_entity,
    (v_new->>'id')::uuid,
    'status_change',
    v_old->>'status',
    v_new->>'status',
    nullif(v_new->>'division_id', '')::uuid,
    coalesce(nullif(v_new->>'org_id', ''), nullif(v_new->>'resco_org_id', ''))::uuid,
    jsonb_strip_nulls(jsonb_build_object(
      'decision_notes', v_new->>'decision_notes',
      'assigned_user_id', v_new->>'assigned_user_id',
      'consumer_number', v_new->>'consumer_number'
    ))
  );
  return new;
end;
$$;

create trigger netmetering_applications_audit
  after insert or update of status on netmetering_applications
  for each row execute function audit_status_change('netmetering_application');

create trigger work_orders_audit
  after insert or update of status on work_orders
  for each row execute function audit_status_change('work_order');

revoke all on function audit_status_change() from public, anon;
