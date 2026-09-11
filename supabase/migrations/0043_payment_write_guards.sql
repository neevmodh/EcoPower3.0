-- 0043_payment_write_guards.sql — issue #6, and a real vulnerability found
-- auditing it: payment_orders_consumer_update (0011) only checks
-- connection *ownership*, not which columns or values change. A signed-in
-- consumer could call PostgREST directly —
--   PATCH /rest/v1/payment_orders?id=eq.<their own order>
--   { "status": "paid" }
-- — and RLS would allow it: the row is theirs, the policy never asked
-- what "paid" means or who's allowed to say it. That marks an invoice
-- paid with zero rupees moving, bypassing /api/payments/verify's Razorpay
-- signature check entirely. payments_consumer_insert had the mirror gap:
-- its `exists (select 1 from payment_orders o where o.id = ...)` check
-- never filtered by ownership at all, so a client could reference *any*
-- order in the system, not just their own.
--
-- Fix: the true authorization boundary already exists (a verified Razorpay
-- signature, checked in application code) — these triggers restrict only
-- the one role a browser session can ever authenticate as: `authenticated`,
-- exactly what PostgREST sets for a normal signed-in request. Everything
-- else — service_role (the webhook, having already checked that
-- signature), migrations, direct psql/pgTAP fixture setup, superuser
-- tooling — is unaffected. That's deliberately an allowlist-by-role, not a
-- denylist-of-service_role: it can't be bypassed by a role this schema
-- hasn't been told about yet, and it doesn't require every existing seed
-- script or test fixture to run as a specific trusted role to keep working.

create function guard_payment_order_update() returns trigger
  language plpgsql
as $$
begin
  if current_user <> 'authenticated' then
    return new; -- not a browser session; already trusted by definition
  end if;

  if new.amount_paise is distinct from old.amount_paise
     or new.invoice_id is distinct from old.invoice_id
     or new.service_connection_id is distinct from old.service_connection_id
     or new.razorpay_order_id is distinct from old.razorpay_order_id then
    raise exception 'payment_orders: this field cannot be changed by a direct client update' using errcode = '42501';
  end if;

  -- The one legitimate client-side transition: /api/payments/verify moving
  -- a freshly-created order to "attempted" while it waits for the webhook.
  -- Every other status change — especially the money-shaped ones — is the
  -- webhook's word to say, not the client's.
  if new.status is distinct from old.status and not (old.status = 'created' and new.status = 'attempted') then
    raise exception 'payment_orders: status can only move created -> attempted outside the webhook (attempted % -> %)', old.status, new.status
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger payment_orders_guard_update
  before update on payment_orders
  for each row execute function guard_payment_order_update();

-- payments_consumer_insert (0011) never checked that the referenced order
-- belongs to the caller. Replace it with an ownership-checked version.
drop policy payments_consumer_insert on payments;

create policy payments_consumer_insert on payments
  for insert to authenticated
  with check (
    exists (
      select 1 from payment_orders o
      where o.id = payments.payment_order_id
        and o.service_connection_id = any ((select my_service_connection_ids())::uuid[])
    )
  );

-- And the same status-forgery gap: a client insert must claim exactly what
-- /api/payments/verify claims ('authorized'), never 'captured' — that word
-- is the webhook confirming money actually moved.
create function guard_payment_insert() returns trigger
  language plpgsql
as $$
begin
  if current_user = 'authenticated' and new.status <> 'authorized' then
    raise exception 'payments: a direct client insert may only claim status ''authorized'' (got ''%'')', new.status
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger payments_guard_insert
  before insert on payments
  for each row execute function guard_payment_insert();
