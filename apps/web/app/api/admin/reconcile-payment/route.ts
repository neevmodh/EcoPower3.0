// Manual reconciliation (#41): re-fetches payment status from Razorpay for a
// payment_order stuck at "created"/"attempted" — the case where a webhook
// delivery was lost (venue wifi, Razorpay retry exhausted, etc). Applies the
// exact same state transition the webhook route applies, just triggered by an
// admin click instead of a Razorpay delivery.
import { getScope } from "@/lib/auth";
import { applyPaymentDecision } from "@/lib/payments/applyDecision";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return Response.json({ error: "razorpay not configured" }, { status: 503 });
  }

  const supabase = await createServerClient();
  const scope = await getScope(supabase);
  if (!scope || !scope.roles.includes("platform_admin")) {
    return Response.json({ error: "not authorised" }, { status: 403 });
  }

  let body: { paymentOrderId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.paymentOrderId) {
    return Response.json({ error: "paymentOrderId required" }, { status: 400 });
  }

  // Platform-admin RLS policy (0038) lets this read across every tenant.
  const { data: order, error: orderError } = await supabase
    .from("payment_orders")
    .select("id, invoice_id, razorpay_order_id, status")
    .eq("id", body.paymentOrderId)
    .single();
  if (orderError || !order || !order.razorpay_order_id) {
    return Response.json({ error: "payment order not found" }, { status: 404 });
  }
  // Only re-apply the transition to an order that's actually stuck. A "paid"
  // or "failed" order is already terminal — reconciling it again would
  // silently re-run the transition (e.g. on a stale Razorpay response) with
  // no record of why a completed order was touched a second time.
  if (order.status !== "created" && order.status !== "attempted") {
    return Response.json(
      { error: `payment order is already ${order.status}, not stuck` },
      { status: 409 },
    );
  }

  const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const rzpRes = await fetch(
    `https://api.razorpay.com/v1/orders/${order.razorpay_order_id}/payments`,
    {
      headers: { Authorization: `Basic ${basicAuth}` },
    },
  );
  if (!rzpRes.ok) {
    const detail = await rzpRes.text();
    return Response.json(
      { error: "razorpay lookup failed", detail },
      { status: 502 },
    );
  }
  const rzp = (await rzpRes.json()) as {
    items: Array<Record<string, unknown>>;
  };

  // Razorpay's own terminal state wins: a captured payment always beats a
  // failed one if both somehow appear (e.g. a retried charge).
  const captured = rzp.items.find((p) => p.status === "captured");
  const failed = !captured && rzp.items.find((p) => p.status === "failed");
  const payment = captured ?? failed;

  if (!payment) {
    return Response.json({
      reconciled: false,
      reason: "no terminal payment found at Razorpay yet",
    });
  }

  // Same transition the webhook route applies, via the same shared function
  // — service_role, because the write guards on payments/payment_orders
  // (0043) and invoices (0046) reject an authenticated-role write into a
  // terminal status by design. The payment_orders update inside it is a
  // compare-and-swap on status, so a webhook landing concurrently for this
  // exact order is resolved by whichever write reaches Postgres first, not
  // by whichever request started first.
  const admin = serviceClient();
  const result = await applyPaymentDecision(admin, {
    orderId: order.id,
    invoiceId: order.invoice_id,
    captured: Boolean(captured),
    razorpayPaymentId: payment.id as string,
    method: typeof payment.method === "string" ? payment.method : null,
    amountPaise: typeof payment.amount === "number" ? payment.amount : 0,
    rawResponse: payment,
  });
  if (result.error) {
    return Response.json(
      {
        error: "failed to apply payment decision",
        detail: result.error.message,
      },
      { status: 500 },
    );
  }
  if (result.skipped) {
    return Response.json({
      reconciled: false,
      reason: "order was already resolved (webhook likely won the race)",
    });
  }

  // manual.reconcile, not payment.captured/failed — this delivery never went
  // through HMAC verification (there was no delivery), unlike every other
  // row in this table. The admin UI must not badge it "signature valid".
  // event_id is deterministic on the actual Razorpay payment id, not random:
  // a double-click or two admins reconciling the same stuck order collide on
  // the unique constraint and become a no-op, the same idempotency story
  // webhook_events already tells for real deliveries.
  const { error: webhookEventError } = await admin
    .from("webhook_events")
    .insert({
      event_id: `manual-reconcile-${payment.id}`,
      event_type: "manual.reconcile",
      payload: { payment_order_id: order.id, razorpay_response: payment },
      processed_at: new Date().toISOString(),
    });
  if (webhookEventError && webhookEventError.code !== "23505") {
    return Response.json(
      {
        error: "failed to record reconciliation",
        detail: webhookEventError.message,
      },
      { status: 500 },
    );
  }

  return Response.json({
    reconciled: true,
    status: captured ? "paid" : "failed",
  });
}
