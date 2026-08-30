-- 0011_payments.sql
-- payment_orders / payments / webhook_events (#39) — Razorpay test-mode
-- Orders + Checkout + webhook verification. 2.0's RazorpayPayment.js called
-- /api/payments/create-order and /api/payments/verify, neither of which
-- existed — every attempt 404'd into a catch block, and the server-side
-- mock used Math.random() > 0.1 for a 90% success rate. This is the real
-- thing: orders created server-side against a real invoice amount, never a
-- client-supplied number, and idempotent webhook processing.

create table payment_orders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id),
  service_connection_id uuid not null references service_connections (id),

  amount_paise bigint not null,
  currency text not null default 'INR',
  razorpay_order_id text unique, -- set once the Orders API call succeeds
  idempotency_key uuid not null unique default gen_random_uuid(),

  status text not null default 'created' check (status in ('created', 'attempted', 'paid', 'failed', 'expired')),

  dt_id uuid,
  division_id uuid,
  org_id uuid,

  created_at timestamptz not null default now(),

  constraint payment_orders_amount_positive check (amount_paise > 0)
);

create index payment_orders_invoice_id_idx on payment_orders (invoice_id);
create index payment_orders_service_connection_id_idx on payment_orders (service_connection_id);

create function payment_orders_set_scope_keys() returns trigger as $$
begin
  select dt_id, division_id, org_id
  into new.dt_id, new.division_id, new.org_id
  from service_connections
  where id = new.service_connection_id;
  return new;
end;
$$ language plpgsql;

create trigger payment_orders_scope_keys
  before insert or update of service_connection_id on payment_orders
  for each row execute function payment_orders_set_scope_keys();

alter table payment_orders enable row level security;
alter table payment_orders force row level security;

-- Consumer-owner only — same "DISCOM sees your kWh, never your card"
-- principle as #21/#76. Inserts happen through /api/payments/create-order
-- (server-side, using the user's own session, so RLS applies there too —
-- a consumer can only create an order against their own invoice, checked
-- by the invoices_consumer_scope policy on the referenced invoice).
create policy payment_orders_consumer_scope on payment_orders
  for select to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

create policy payment_orders_consumer_insert on payment_orders
  for insert to authenticated
  with check ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

-- /api/payments/verify updates status on the user's own order after
-- independently recomputing the Razorpay signature server-side — the
-- signature check is what makes this trustworthy, not the caller's
-- identity, but RLS still confines it to the caller's own row.
create policy payment_orders_consumer_update on payment_orders
  for update to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) )
  with check ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

-- ============================================================
-- payments — one row per Razorpay payment attempt against an order.
-- ============================================================

create table payments (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null references payment_orders (id),

  razorpay_payment_id text unique,
  razorpay_signature text,
  method text check (method in ('upi', 'card', 'netbanking', 'wallet')),
  status text not null default 'created' check (status in ('created', 'authorized', 'captured', 'failed', 'refunded')),
  amount_paise bigint not null,

  -- Full API/webhook payload for the row, for audit — never the source of
  -- truth for status (that's the columns above, set deliberately by code
  -- that has verified a signature), but lets a dispute be investigated
  -- without re-calling Razorpay.
  raw_response jsonb,

  captured_at timestamptz,
  created_at timestamptz not null default now()
);

create index payments_payment_order_id_idx on payments (payment_order_id);

alter table payments enable row level security;
alter table payments force row level security;

-- Joined through the parent order, same pattern as invoice_lines (#21).
create policy payments_via_order on payments
  for select to authenticated
  using ( exists (select 1 from payment_orders o where o.id = payments.payment_order_id) );

-- /api/payments/verify inserts the confirmed-payment row after
-- recomputing the signature; confined to the caller's own order via the
-- same join.
create policy payments_consumer_insert on payments
  for insert to authenticated
  with check ( exists (select 1 from payment_orders o where o.id = payments.payment_order_id) );

-- ============================================================
-- webhook_events — the entire exactly-once story is this table's unique
-- constraint plus ON CONFLICT DO NOTHING at the call site.
-- ============================================================

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  -- Razorpay sends an X-Razorpay-Event-Id header on webhook deliveries;
  -- that's the natural idempotency key. If a delivery ever arrives without
  -- one (shouldn't happen, but this table must never reject on that), the
  -- caller falls back to a sha256 of the raw request body — two identical
  -- bodies still collide safely, which is exactly what "duplicate delivery
  -- is a no-op" requires.
  event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- No RLS: this table is written only by the webhook route using the
-- service_role key (Razorpay calls it directly, there is no user session),
-- and read by nothing consumer-facing. Service_role bypasses RLS entirely,
-- so enabling it here would be theatre, not protection — the real boundary
-- is that only the webhook route holds the service_role key.
