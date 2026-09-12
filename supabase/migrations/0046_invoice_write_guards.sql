-- 0046_invoice_write_guards.sql — issue #6's original ask, actually applied.
--
-- invoices/invoice_lines (0009) only ever got a SELECT policy — "DISCOM
-- sees your kWh, never your card," never a client-facing writer. Every real
-- write path (generate_demo_invoices.mjs via raw `pg`, the Razorpay webhook
-- via the service_role client in api/webhooks/razorpay) bypasses PostgREST
-- entirely, so no INSERT/UPDATE/DELETE policy was ever added either.
--
-- 0041's own comment already flagged the trap this leaves: Supabase's
-- baseline grants `insert/update/delete` on every public-schema table to
-- anon/authenticated regardless of RLS, and that was proven exploitable in
-- CI for data_provenance. invoices/invoice_lines had the exact same
-- unguarded exposure — a signed-in consumer could
--   PATCH /rest/v1/invoices?id=eq.<any-invoice-id> { status: 'paid' }
-- and mark their own (or, before scope-key enforcement quirks, another
-- connection's) bill paid with no payment ever recorded, or POST a
-- fabricated invoice row directly. Same fix as 0041: explicit revoke,
-- belt-and-suspenders on top of the RLS gap.

revoke insert, update, delete on invoices, invoice_lines from anon, authenticated;
