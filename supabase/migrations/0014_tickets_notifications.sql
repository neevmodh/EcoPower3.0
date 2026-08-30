-- 0014_tickets_notifications.sql
-- support_tickets / ticket_replies (#87) and notifications (#86).
-- 2.0 had both as real, DB-backed features (2.0's audit confirmed real
-- routes/models for tickets and notifications, unlike its decorative
-- pages) — this rebuilds them with RLS from the start rather than porting
-- 2.0's Express/Mongo routes.

create type ticket_priority as enum ('low', 'medium', 'high', 'critical');
create type ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  service_connection_id uuid not null references service_connections (id),

  subject text not null,
  description text not null,
  priority ticket_priority not null default 'medium',
  status ticket_status not null default 'open',
  assignee_user_id uuid references auth.users (id),

  dt_id uuid,
  division_id uuid,
  org_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_service_connection_id_idx on support_tickets (service_connection_id);
create index support_tickets_status_idx on support_tickets (status, created_at desc);

create function support_tickets_set_scope_keys() returns trigger as $$
begin
  select dt_id, division_id, org_id
  into new.dt_id, new.division_id, new.org_id
  from service_connections
  where id = new.service_connection_id;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

-- One trigger, not two: it re-derives scope keys and stamps updated_at on
-- every insert/update. Redundant scope-key work on a plain status update
-- is cheap and simpler than tracking which columns actually changed.
create trigger support_tickets_scope_keys
  before insert or update on support_tickets
  for each row execute function support_tickets_set_scope_keys();

alter table support_tickets enable row level security;
alter table support_tickets force row level security;

-- Consumer sees/creates their own tickets — same ownership pattern as
-- everything else. Unlike billing, support IS visible to staff: a
-- support_agent (the role already exists in app_role, #2, unused until
-- now) sees and updates every ticket, because a support queue with no
-- queue isn't a support system.
create policy support_tickets_consumer_select on support_tickets
  for select to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

create policy support_tickets_consumer_insert on support_tickets
  for insert to authenticated
  with check ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

create policy support_tickets_agent_select on support_tickets
  for select to authenticated
  using ( has_role('support_agent') );

create policy support_tickets_agent_update on support_tickets
  for update to authenticated
  using ( has_role('support_agent') )
  with check ( has_role('support_agent') );

create table ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets (id) on delete cascade,
  author_user_id uuid not null references auth.users (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index ticket_replies_ticket_id_idx on ticket_replies (ticket_id, created_at);

alter table ticket_replies enable row level security;
alter table ticket_replies force row level security;

-- Joined through the parent ticket — the consumer-owner and agent
-- policies on support_tickets are what actually decide visibility here.
create policy ticket_replies_via_ticket on ticket_replies
  for select to authenticated
  using ( exists (select 1 from support_tickets t where t.id = ticket_replies.ticket_id) );

create policy ticket_replies_consumer_insert on ticket_replies
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and exists (
      select 1 from support_tickets t
      where t.id = ticket_replies.ticket_id
        and t.service_connection_id = any ((select my_service_connection_ids())::uuid[])
    )
  );

create policy ticket_replies_agent_insert on ticket_replies
  for insert to authenticated
  with check ( author_user_id = (select auth.uid()) and has_role('support_agent') );

-- ============================================================
-- notifications — real, in-app, tied to real events. No decorative bell.
-- ============================================================

create type notification_type as enum ('invoice_issued', 'ticket_reply', 'guarantee_credit', 'subscription_event', 'payment_confirmed');

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  type notification_type not null,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_idx on notifications (user_id, created_at desc) where read_at is null;

alter table notifications enable row level security;
alter table notifications force row level security;

create policy notifications_owner_select on notifications
  for select to authenticated
  using ( user_id = (select auth.uid()) );

create policy notifications_owner_update on notifications
  for update to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

-- A ticket reply from a support_agent notifies the ticket's owning
-- consumer — the one place a trigger, not the consumer's own session,
-- needs to write a notification for someone else.
create function notify_on_ticket_reply() returns trigger as $$
declare
  v_owner_user_id uuid;
  v_subject text;
begin
  select sc.owner_user_id, st.subject
  into v_owner_user_id, v_subject
  from public.support_tickets st
  join public.service_connections sc on sc.id = st.service_connection_id
  where st.id = new.ticket_id;

  if v_owner_user_id is not null and v_owner_user_id != new.author_user_id then
    insert into public.notifications (user_id, type, title, body, link)
    values (v_owner_user_id, 'ticket_reply', 'New reply on your ticket', v_subject, '/consumer/support');
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

-- No direct INSERT policy on notifications for `authenticated` — writes
-- happen only through security definer triggers/functions like this one,
-- never from a user's own session. A consumer cannot fabricate their own
-- notifications.

create trigger ticket_replies_notify
  after insert on ticket_replies
  for each row execute function notify_on_ticket_reply();
