-- 0047_delete_guards.sql — the other half of #6's lesson.
--
-- 0043/0044/0046 guarded INSERT/UPDATE (and, for invoices, all writes) on
-- every billing/subscription/workflow table that had a real client-write
-- path. None of them ever considered DELETE — and per 0041's own documented
-- finding (Supabase's baseline grants give anon/authenticated
-- insert/update/delete on every public-schema table regardless of RLS,
-- proven exploitable in CI), a table having no DELETE *policy* was never
-- itself a guarantee that DELETE was blocked.
--
-- Every one of these tables is meant to be an append-only record —
-- payment history, subscription lifecycle, audit events, guarantee terms,
-- maintenance work orders, net-metering applications. No product flow ever
-- deletes a row in any of them; a client that could would be erasing its
-- own paper trail (e.g. a consumer deleting the payment_orders row for a
-- charge they'd rather dispute never happened).

revoke delete on payment_orders, payments, subscriptions, subscription_events,
  service_guarantees, work_orders, netmetering_applications
  from anon, authenticated;
