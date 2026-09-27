// Razorpay webhook receiver — the durable source of truth for payment
// state (app/api/payments/verify is UX-only; a closed tab never reaches
// it). Runs as service_role: Razorpay calls this directly, there is no
// user session to scope RLS against, and the HMAC signature check below is
// the actual authorization boundary, not a Supabase policy.
import crypto from "node:crypto";
import { applyPaymentDecision } from "@/lib/payments/applyDecision";
import { serviceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "webhook secret not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return Response.json({ error: "missing signature" }, { status: 400 });
  }

  const body = await request.text();
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  // timingSafeEqual throws on length mismatch — compare buffers of equal size.
  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  const valid =
    sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

  if (!valid) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let parsed: {
    event?: string;
    payload?: { payment?: { entity?: Record<string, unknown> } };
  };
  try {
    parsed = JSON.parse(body);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const eventType = parsed.event ?? "unknown";
  // Razorpay sends X-Razorpay-Event-Id on deliveries; fall back to a body
  // hash so an unlikely missing header still can't defeat idempotency —
  // two identical bodies hash identically and collide safely.
  const eventId =
    request.headers.get("x-razorpay-event-id") ??
    crypto.createHash("sha256").update(body).digest("hex");

  const supabase = serviceClient();

  const { error: insertEventError } = await supabase
    .from("webhook_events")
    .insert({ event_id: eventId, event_type: eventType, payload: parsed })
    .select("id")
    .single();

  if (insertEventError) {
    // unique_violation on event_id — this exact delivery was seen before.
    // NOT necessarily "already processed": if the previous attempt threw
    // (a network-level exception, not a query error — applyPaymentDecision
    // itself never throws) between this insert and processed_at being set
    // below, that prior row exists with processed_at still null and this
    // delivery was never actually applied. Only a row that reached
    // processed_at is a genuine no-op; anything else must still be
    // processed, or a transient failure becomes permanently unretriable —
    // this exact delivery's event_id can never be inserted again, so
    // Razorpay's own retry can never get a fresh attempt at it.
    if (insertEventError.code === "23505") {
      const { data: existing } = await supabase
        .from("webhook_events")
        .select("processed_at")
        .eq("event_id", eventId)
        .single();
      if (existing?.processed_at) {
        return Response.json({ received: true, duplicate: true });
      }
      // else: fall through and process it now, same as a fresh delivery.
    } else {
      return Response.json(
        { error: "failed to record webhook event" },
        { status: 500 },
      );
    }
  }

  const payment = parsed.payload?.payment?.entity;
  let applyError: { message: string } | null = null;

  if (
    payment &&
    typeof payment.order_id === "string" &&
    typeof payment.id === "string"
  ) {
    const captured = eventType === "payment.captured";
    const failed = eventType === "payment.failed";

    if (captured || failed) {
      const { data: order } = await supabase
        .from("payment_orders")
        .select("id, invoice_id")
        .eq("razorpay_order_id", payment.order_id)
        .single();

      if (order) {
        const result = await applyPaymentDecision(supabase, {
          orderId: order.id,
          invoiceId: order.invoice_id,
          captured,
          razorpayPaymentId: payment.id,
          method: typeof payment.method === "string" ? payment.method : null,
          amountPaise: typeof payment.amount === "number" ? payment.amount : 0,
          rawResponse: payment,
        });
        if (result.error) applyError = result.error;
      }
    }
  }

  // A real failure here must NOT mark this event processed — leaving
  // processed_at null is what lets a retried delivery (or the 23505 path
  // above, on the next delivery of the same event_id) actually try again,
  // instead of the order/invoice staying permanently out of sync with a
  // payment Razorpay considers settled.
  if (applyError) {
    return Response.json(
      { error: "failed to apply payment decision" },
      { status: 500 },
    );
  }

  await supabase
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", eventId);

  return Response.json({ received: true });
}
