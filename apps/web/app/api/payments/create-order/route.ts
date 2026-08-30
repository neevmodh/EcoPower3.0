// Orders API — server-side, using the caller's own session. The amount
// comes from the invoice row RLS lets this user read, never from the
// request body: 2.0's mock gateway trusted whatever the client sent (moot,
// since the endpoint it called didn't exist) — this one can't, by
// construction, because there is no amount field to trust in the input.
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders";

export async function POST(request: Request) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return Response.json({ error: "razorpay not configured" }, { status: 503 });
  }

  let body: { invoiceId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.invoiceId) {
    return Response.json({ error: "invoiceId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  // RLS confines this to the caller's own invoice — a non-owner's
  // invoiceId simply returns no row, not someone else's amount.
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, service_connection_id, total_paise, status")
    .eq("id", body.invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return Response.json({ error: "invoice not found" }, { status: 404 });
  }
  if (invoice.status === "paid") {
    return Response.json({ error: "invoice already paid" }, { status: 409 });
  }
  if (invoice.total_paise <= 0) {
    return Response.json({ error: "invoice has no payable amount" }, { status: 422 });
  }

  const idempotencyKey = crypto.randomUUID();

  const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const orderResponse = await fetch(RAZORPAY_ORDERS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: JSON.stringify({
      amount: invoice.total_paise,
      currency: "INR",
      receipt: idempotencyKey,
    }),
  });

  if (!orderResponse.ok) {
    const detail = await orderResponse.text();
    return Response.json({ error: "razorpay order creation failed", detail }, { status: 502 });
  }

  const order = (await orderResponse.json()) as { id: string };

  const { data: paymentOrder, error: insertError } = await supabase
    .from("payment_orders")
    .insert({
      invoice_id: invoice.id,
      service_connection_id: invoice.service_connection_id,
      amount_paise: invoice.total_paise,
      razorpay_order_id: order.id,
      idempotency_key: idempotencyKey,
    })
    .select("id, razorpay_order_id, amount_paise, currency")
    .single();

  if (insertError || !paymentOrder) {
    return Response.json({ error: "failed to record payment order" }, { status: 500 });
  }

  return Response.json({
    paymentOrderId: paymentOrder.id,
    razorpayOrderId: paymentOrder.razorpay_order_id,
    amountPaise: paymentOrder.amount_paise,
    currency: paymentOrder.currency,
    keyId, // public key — safe to return, this is what Checkout needs client-side
  });
}
