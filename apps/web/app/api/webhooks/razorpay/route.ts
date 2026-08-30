// Razorpay webhook receiver — the durable source of truth for payment
// state (app/api/payments/verify is UX-only; a closed tab never reaches
// it). Runs as service_role: Razorpay calls this directly, there is no
// user session to scope RLS against, and the HMAC signature check below is
// the actual authorization boundary, not a Supabase policy.
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "webhook secret not configured" }, { status: 503 });
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return Response.json({ error: "missing signature" }, { status: 400 });
  }

  const body = await request.text();
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");

  // timingSafeEqual throws on length mismatch — compare buffers of equal size.
  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

  if (!valid) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let parsed: { event?: string; payload?: { payment?: { entity?: Record<string, unknown> } } };
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
    // unique_violation on event_id — this exact delivery was already
    // processed. That IS the exactly-once story: a no-op, not an error.
    if (insertEventError.code === "23505") {
      return Response.json({ received: true, duplicate: true });
    }
    return Response.json({ error: "failed to record webhook event" }, { status: 500 });
  }

  const payment = parsed.payload?.payment?.entity;
  if (payment && typeof payment.order_id === "string" && typeof payment.id === "string") {
    const captured = eventType === "payment.captured";
    const failed = eventType === "payment.failed";

    if (captured || failed) {
      const { data: order } = await supabase
        .from("payment_orders")
        .select("id, invoice_id")
        .eq("razorpay_order_id", payment.order_id)
        .single();

      if (order) {
        await supabase.from("payments").upsert(
          {
            payment_order_id: order.id,
            razorpay_payment_id: payment.id,
            method: typeof payment.method === "string" ? payment.method : null,
            status: captured ? "captured" : "failed",
            amount_paise: typeof payment.amount === "number" ? payment.amount : 0,
            raw_response: payment,
            captured_at: captured ? new Date().toISOString() : null,
          },
          { onConflict: "razorpay_payment_id", ignoreDuplicates: false },
        );

        await supabase
          .from("payment_orders")
          .update({ status: captured ? "paid" : "failed" })
          .eq("id", order.id);

        if (captured) {
          await supabase.from("invoices").update({ status: "paid" }).eq("id", order.invoice_id);
        }
      }
    }
  }

  await supabase.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("event_id", eventId);

  return Response.json({ received: true });
}
