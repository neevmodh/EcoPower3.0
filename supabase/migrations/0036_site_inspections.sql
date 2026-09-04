-- 0036_site_inspections.sql
-- Field site inspections: a technician records a structured checklist for a
-- tamper check, roof survey, commissioning or routine visit, optionally
-- linked to a work order. The checklist is jsonb so the item set can evolve
-- without a migration per inspection type.
--
-- RLS: a field technician manages their own inspections; a RESCO operator
-- reads inspections for connections its org services (asset-org join, the
-- gate 0018/0029 use). Consumer sees inspections on their own connection.

create type inspection_type as enum ('tamper', 'roof_survey', 'commissioning', 'routine');
create type inspection_status as enum ('in_progress', 'completed');

create table site_inspections (
  id uuid primary key default gen_random_uuid(),
  service_connection_id uuid not null references service_connections (id) on delete cascade,
  work_order_id uuid references work_orders (id) on delete set null,
  inspector_user_id uuid not null references auth.users (id) on delete set null,
  inspection_type inspection_type not null,
  -- [{ "item": "Meter seal intact", "ok": true, "note": "..." }, ...]
  checklist jsonb not null default '[]'::jsonb,
  findings text,
  status inspection_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint inspection_completed_consistency check ((status = 'completed') = (completed_at is not null))
);

create index site_inspections_sc_idx on site_inspections (service_connection_id, started_at desc);
create index site_inspections_inspector_idx on site_inspections (inspector_user_id, started_at desc);

alter table site_inspections enable row level security;
alter table site_inspections force row level security;

create policy site_inspections_inspector_all on site_inspections
  for all to authenticated
  using ( has_role('field_technician') and inspector_user_id = (select auth.uid()) )
  with check ( has_role('field_technician') and inspector_user_id = (select auth.uid()) );

create policy site_inspections_resco_read on site_inspections
  for select to authenticated
  using (
    (has_role('resco_ops') or has_role('resco_admin'))
    and resco_services_connection(service_connection_id)
  );

create policy site_inspections_consumer_read on site_inspections
  for select to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );
