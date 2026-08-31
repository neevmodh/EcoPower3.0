-- 0019_workflows.sql
-- Closes four PS1-audit gaps found by re-reading the platform against the
-- problem statement directly (not just re-reading DESIGN.md):
--   1. Outage alerts — PS1 §4 asks for "alerts and notifications for
--      outages, service status, and savings updates." Only ticket_reply
--      notifications existed; invoice/subscription/payment events and
--      outages were never wired despite the enum already having slots
--      for them (0014).
--   2. Field panel — permanently "No open work orders" because no
--      work_orders table existed. Adds a real one, RESCO-scoped like
--      assets (#18's resco_org_id pattern), with a genuine assignment
--      workflow a field_technician can act on.
--   3. Net-metering approval — PS1 §7 names this explicitly as the
--      DISCOM-integration example; issue #28 was reopened for exactly
--      this reason ("closed with no corresponding code"). Adds a real
--      submitted -> under_review -> approved/rejected state machine a
--      discom_officer can act on, division-scoped like every other
--      DISCOM read in 0004.
--   4. Annual billing cycle / pay-as-you-go — PS1 §4 asks for "tiered
--      plans, monthly/annual, pay-as-you-go." Only monthly existed.

-- ============================================================
-- notifications: new event types, matched to real triggers
-- ============================================================

alter type notification_type add value 'outage_alert';
alter type notification_type add value 'work_order_assigned';
alter type notification_type add value 'netmetering_update';

-- invoice_issued: fires only on the transition into 'issued' — a draft
-- invoice being created isn't yet something a consumer should be told
-- about, and an update that leaves status alone shouldn't re-notify.
create function notify_on_invoice_issued() returns trigger as $$
declare
  v_owner_user_id uuid;
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status is distinct from 'issued') then
    select owner_user_id into v_owner_user_id
    from public.service_connections
    where id = new.service_connection_id;

    if v_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        v_owner_user_id, 'invoice_issued', 'New bill issued',
        'Your bill for ' || to_char(new.billing_period_start, 'Mon YYYY') || ' is ready.',
        '/consumer/bills'
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

create trigger invoices_notify_issued
  after insert or update of status on invoices
  for each row execute function notify_on_invoice_issued();

-- subscription_event: reuses the same audit row subscription_events (0012)
-- already writes on every transition — one real event source, not a
-- second parallel bookkeeping table.
create function notify_on_subscription_event() returns trigger as $$
declare
  v_owner_user_id uuid;
  v_label text;
begin
  select sc.owner_user_id into v_owner_user_id
  from public.subscriptions s
  join public.service_connections sc on sc.id = s.service_connection_id
  where s.id = new.subscription_id;

  v_label := replace(new.event_type::text, '_', ' ');

  if v_owner_user_id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      v_owner_user_id, 'subscription_event', 'Subscription ' || v_label,
      'Your subscription was ' || v_label || '.',
      '/consumer/plan'
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

create trigger subscription_events_notify
  after insert on subscription_events
  for each row execute function notify_on_subscription_event();

-- payment_confirmed: fires on the transition into 'captured' — same
-- guard shape as invoice_issued, on the payments table 0011 already
-- maintains as the source of truth for gateway status.
create function notify_on_payment_captured() returns trigger as $$
declare
  v_owner_user_id uuid;
begin
  if new.status = 'captured' and (tg_op = 'INSERT' or old.status is distinct from 'captured') then
    select sc.owner_user_id into v_owner_user_id
    from public.payment_orders po
    join public.invoices i on i.id = po.invoice_id
    join public.service_connections sc on sc.id = i.service_connection_id
    where po.id = new.payment_order_id;

    if v_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        v_owner_user_id, 'payment_confirmed', 'Payment received',
        'We received your payment of ' || round(new.amount_paise / 100.0, 2) || ' rupees.',
        '/consumer/bills'
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

create trigger payments_notify_captured
  after insert or update of status on payments
  for each row execute function notify_on_payment_captured();

-- outage_alert: a meter that was `active` and has gone silent well past
-- its 15-minute expected tick is a real outage signal, not a fabricated
-- one — it reads the same last_seen_at column the Devices page (#18)
-- already renders honestly. pg_cron runs it; nothing here pretends to
-- be real-time push (that's Realtime Broadcast's job for live readings).
create extension if not exists pg_cron;

create function scan_meter_outages() returns void as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select
    sc.owner_user_id, 'outage_alert', 'Possible outage detected',
    'Your meter ' || m.serial || ' has not reported in over an hour.',
    '/consumer'
  from public.meters m
  join public.service_connections sc on sc.id = m.service_connection_id
  where m.status = 'active'
    and sc.owner_user_id is not null
    and m.last_seen_at is not null
    and m.last_seen_at < now() - interval '60 minutes'
    -- de-duplicate: don't re-notify if we already sent one for this meter
    -- in the last 6 hours.
    and not exists (
      select 1 from public.notifications n
      where n.user_id = sc.owner_user_id
        and n.type = 'outage_alert'
        and n.link = '/consumer'
        and n.body like '%' || m.serial || '%'
        and n.created_at > now() - interval '6 hours'
    );
end;
$$ language plpgsql security definer set search_path = 'public';

select cron.schedule('scan-meter-outages', '*/15 * * * *', 'select public.scan_meter_outages();');

-- ============================================================
-- work_orders — the field panel's real backing table (#18's resco_org_id
-- ownership pattern: a work order belongs to the RESCO that services the
-- site, not the DISCOM that owns the meter).
-- ============================================================

create type work_order_status as enum ('open', 'in_progress', 'completed', 'cancelled');
create type work_order_priority as enum ('low', 'medium', 'high', 'urgent');

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  resco_org_id uuid not null references orgs (id),
  service_connection_id uuid not null references service_connections (id),
  asset_id uuid references assets (id),

  title text not null,
  description text not null,
  priority work_order_priority not null default 'medium',
  status work_order_status not null default 'open',
  assigned_user_id uuid references auth.users (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index work_orders_resco_org_id_idx on work_orders (resco_org_id, status);
create index work_orders_assigned_user_id_idx on work_orders (assigned_user_id) where status in ('open', 'in_progress');

create function work_orders_touch() returns trigger as $$
begin
  new.updated_at := now();
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger work_orders_touch_updated_at
  before update on work_orders
  for each row execute function work_orders_touch();

alter table work_orders enable row level security;
alter table work_orders force row level security;

-- Same shape as assets_resco_scope (#18): resco_ops/resco_admin see and
-- manage every work order their org owns.
create policy work_orders_resco_scope on work_orders
  for select to authenticated
  using (
    (has_role('resco_ops') or has_role('resco_admin') or has_role('field_technician'))
    and resco_org_id = any ((select auth_orgs())::uuid[])
  );

create policy work_orders_resco_write on work_orders
  for insert to authenticated
  with check (
    (has_role('resco_ops') or has_role('resco_admin'))
    and resco_org_id = any ((select auth_orgs())::uuid[])
  );

-- A field_technician updates status on a work order assigned to them or
-- unassigned-but-in-their-org (claiming it); resco_ops/admin can update
-- anything in their org (reassign, cancel).
create policy work_orders_update on work_orders
  for update to authenticated
  using (
    resco_org_id = any ((select auth_orgs())::uuid[])
    and (
      has_role('resco_ops') or has_role('resco_admin')
      or (has_role('field_technician') and (assigned_user_id = (select auth.uid()) or assigned_user_id is null))
    )
  )
  with check ( resco_org_id = any ((select auth_orgs())::uuid[]) );

create function notify_on_work_order_assigned() returns trigger as $$
begin
  if new.assigned_user_id is not null and (tg_op = 'INSERT' or old.assigned_user_id is distinct from new.assigned_user_id) then
    insert into public.notifications (user_id, type, title, body, link)
    values (new.assigned_user_id, 'work_order_assigned', 'New work order assigned', new.title, '/field');
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

create trigger work_orders_notify_assigned
  after insert or update of assigned_user_id on work_orders
  for each row execute function notify_on_work_order_assigned();

-- ============================================================
-- netmetering_applications — issue #28, closed for real this time.
-- Deliberately minimal: a consumer submits, a discom_officer decides.
-- No document upload, no inspection scheduling — those are genuine future
-- work, not simulated here.
-- ============================================================

create type netmetering_status as enum ('submitted', 'under_review', 'approved', 'rejected');

create table netmetering_applications (
  id uuid primary key default gen_random_uuid(),
  service_connection_id uuid not null references service_connections (id),
  asset_id uuid references assets (id),

  capacity_kw numeric not null check (capacity_kw > 0),
  status netmetering_status not null default 'submitted',
  applicant_notes text,
  decision_notes text,
  decided_by_user_id uuid references auth.users (id),
  decided_at timestamptz,

  dt_id uuid,
  division_id uuid,
  org_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index netmetering_applications_division_id_idx on netmetering_applications (division_id, status);
create index netmetering_applications_service_connection_id_idx on netmetering_applications (service_connection_id);

create function netmetering_applications_set_scope_keys() returns trigger as $$
begin
  select dt_id, division_id, org_id
  into new.dt_id, new.division_id, new.org_id
  from service_connections
  where id = new.service_connection_id;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger netmetering_applications_scope_keys
  before insert or update on netmetering_applications
  for each row execute function netmetering_applications_set_scope_keys();

alter table netmetering_applications enable row level security;
alter table netmetering_applications force row level security;

create policy netmetering_applications_consumer_select on netmetering_applications
  for select to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

create policy netmetering_applications_consumer_insert on netmetering_applications
  for insert to authenticated
  with check ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

create policy netmetering_applications_discom_select on netmetering_applications
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );

create policy netmetering_applications_discom_decide on netmetering_applications
  for update to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  )
  with check (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );

create function notify_on_netmetering_decision() returns trigger as $$
declare
  v_owner_user_id uuid;
begin
  if new.status in ('approved', 'rejected') and old.status is distinct from new.status then
    select owner_user_id into v_owner_user_id
    from public.service_connections
    where id = new.service_connection_id;

    if v_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        v_owner_user_id, 'netmetering_update',
        'Net-metering application ' || new.status,
        coalesce(new.decision_notes, 'Your net-metering application has been ' || new.status || '.'),
        '/consumer/plan'
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

create trigger netmetering_applications_notify_decision
  after update of status on netmetering_applications
  for each row execute function notify_on_netmetering_decision();

-- ============================================================
-- billing_cycle — PS1 §4's "monthly/annual, pay-as-you-go", currently
-- monthly-only. Annual variants at a real ~2-month discount (10 months'
-- worth for 12), plus one true pay-as-you-go plan: zero base fee, billed
-- entirely through the existing overage mechanism plan_services already
-- supports (billing_basis stays 'included_plus_overage' with
-- included_quantity 0, so every unit bills at the overage rate — no new
-- billing_basis case needed).
-- ============================================================

alter table plans add column billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual'));
alter table plans add column price_paise_per_year bigint check (price_paise_per_year >= 0);

update plans set price_paise_per_year = price_paise_per_month * 10 where billing_cycle = 'monthly';

insert into plans (code, name, description, price_paise_per_month, price_paise_per_year, billing_cycle) values
  ('solar_basic_annual', 'Solar Basic (annual)', 'Solar generation, billed on real meter reads. Pay yearly, save two months.', 99900, 999000, 'annual'),
  ('solar_backup_annual', 'Solar + Backup (annual)', 'Solar plus battery backup with a 98% availability guarantee. Pay yearly, save two months.', 249900, 2499000, 'annual'),
  ('solar_payg', 'Solar Pay-As-You-Go', 'No base fee. Every kWh generated is billed at the overage rate — for low, irregular usage.', 0, 0, 'monthly');

do $$
declare
  v_basic_annual uuid; v_backup_annual uuid; v_payg uuid; v_solar_type uuid; v_backup_type uuid;
begin
  select id into v_basic_annual from plans where code = 'solar_basic_annual';
  select id into v_backup_annual from plans where code = 'solar_backup_annual';
  select id into v_payg from plans where code = 'solar_payg';
  select id into v_solar_type from service_types where code = 'solar_kwh';
  select id into v_backup_type from service_types where code = 'backup_availability';

  insert into plan_services (plan_id, service_type_id, included_quantity, overage_rate_paise_per_unit) values
    (v_basic_annual, v_solar_type, 300, 500),
    (v_payg, v_solar_type, 0, 500);

  insert into plan_services (
    plan_id, service_type_id, included_quantity, overage_rate_paise_per_unit,
    guarantee_metric, guarantee_contracted_value, guarantee_rate_paise_per_unit_shortfall, guarantee_cap_paise
  ) values (
    v_backup_annual, v_backup_type, 24, 0, 'availability_pct', 0.98, 100000, 100000
  );
  insert into plan_services (plan_id, service_type_id, included_quantity, overage_rate_paise_per_unit) values
    (v_backup_annual, v_solar_type, 300, 500);
end $$;
