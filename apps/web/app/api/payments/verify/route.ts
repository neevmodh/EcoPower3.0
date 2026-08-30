// Verifies the signature Razorpay Checkout hands back to the browser on
// success, for immediate UI feedback. This is NOT the durable source of
// truth for "was this actually paid" — a closed tab after payment but
// before this call fires would never reach it. The webhook
// (app/api/webhooks/razorpay) is what actually marks the invoice paid;
// this route only updates the caller's own payment_order/payments rows,
// confined by RLS, and is safe to skip or retry.
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return Response.json({ error: "razorpay not configured" }, { status: 503 });
  }

  let body: {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return Response.json({ error: "missing razorpay fields" }, { status: 400 });
  }

  // Razorpay's documented Checkout verification formula: HMAC-SHA256 of
  // "{order_id}|{payment_id}" using the key secret.
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const sigBuf = Buffer.from(razorpay_signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

  if (!valid) {
    return Response.json({ error: "signature mismatch" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data: paymentOrder, error: orderError } = await supabase
    .from("payment_orders")
    .select("id, amount_paise")
    .eq("razorpay_order_id", razorpay_order_id)
    .single();

  if (orderError || !paymentOrder) {
    return Response.json({ error: "payment order not found" }, { status: 404 });
  }

  await supabase.from("payment_orders").update({ status: "attempted" }).eq("id", paymentOrder.id);

  const { error: paymentInsertError } = await supabase.from("payments").insert({
    payment_order_id: paymentOrder.id,
    razorpay_payment_id,
    razorpay_signature,
    status: "authorized", // "captured" is set by the webhook once Razorpay confirms capture
    amount_paise: paymentOrder.amount_paise,
  });

  if (paymentInsertError) {
    return Response.json({ error: "failed to record payment" }, { status: 500 });
  }

  return Response.json({ verified: true });
}
