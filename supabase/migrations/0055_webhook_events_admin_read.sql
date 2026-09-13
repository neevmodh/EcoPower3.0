-- 0055_webhook_events_admin_read.sql (#41)
-- webhook_events (0011) had no RLS because nothing consumer-facing read it —
-- only the webhook route, via service_role, which bypasses RLS anyway. The
-- reconciliation screen changes that: it reads this table through the
-- platform admin's own authenticated session. Enable RLS now that there's a
-- real authenticated read path; same read-only pattern as audit_log (0038).

alter table webhook_events enable row level security;
alter table webhook_events force row level security;

create policy webhook_events_platform_admin on webhook_events
  for select to authenticated
  using (is_platform_admin());
