// Manual reconciliation (#41): re-fetches payment status from Razorpay for a
// payment_order stuck at "created"/"attempted" — the case where a webhook
// delivery was lost (venue wifi, Razorpay retry exhausted, etc). Applies the
// exact same state transition the webhook route applies, just triggered by an
// admin click instead of a Razorpay delivery.
import crypto from "node:crypto";
import { getScope } from "@/lib/auth";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

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

  // These three transitions mirror the webhook route (app/api/webhooks/razorpay)
  // exactly, and like that route they must run as service_role: the write
  // guards on payments/payment_orders (0043) and invoices (0046) reject an
  // `authenticated`-role write into a terminal status by design — only the
  // webhook path (and now this one) is trusted to make that jump.
  const admin = serviceClient();

  const { error: paymentError } = await admin.from("payments").upsert(
    {
      payment_order_id: order.id,
      razorpay_payment_id: payment.id as string,
      method: typeof payment.method === "string" ? payment.method : null,
      status: captured ? "captured" : "failed",
      amount_paise: typeof payment.amount === "number" ? payment.amount : 0,
      raw_response: payment,
      captured_at: captured ? new Date().toISOString() : null,
    },
    { onConflict: "razorpay_payment_id", ignoreDuplicates: false },
  );
  if (paymentError) {
    return Response.json(
      { error: "failed to record payment", detail: paymentError.message },
      { status: 500 },
    );
  }

  const { error: orderUpdateError } = await admin
    .from("payment_orders")
    .update({ status: captured ? "paid" : "failed" })
    .eq("id", order.id);
  if (orderUpdateError) {
    return Response.json(
      {
        error: "failed to update payment order",
        detail: orderUpdateError.message,
      },
      { status: 500 },
    );
  }

  if (captured) {
    const { error: invoiceError } = await admin
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", order.invoice_id);
    if (invoiceError) {
      return Response.json(
        { error: "failed to mark invoice paid", detail: invoiceError.message },
        { status: 500 },
      );
    }
  }

  // manual.reconcile, not payment.captured/failed — this delivery never went
  // through HMAC verification (there was no delivery), unlike every other
  // row in this table. The admin UI must not badge it "signature valid".
  const { error: webhookEventError } = await admin
    .from("webhook_events")
    .insert({
      event_id: `manual-reconcile-${order.id}-${crypto.randomUUID()}`,
      event_type: "manual.reconcile",
      payload: { payment_order_id: order.id, razorpay_response: payment },
      processed_at: new Date().toISOString(),
    });
  if (webhookEventError) {
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
