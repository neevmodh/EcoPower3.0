import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentDecision = {
  orderId: string;
  invoiceId: string;
  captured: boolean;
  razorpayPaymentId: string;
  method: string | null;
  amountPaise: number;
  rawResponse: Record<string, unknown>;
};

// The payment_orders -> payments -> invoices terminal transition, shared by
// the webhook route (app/api/webhooks/razorpay) and the admin reconciliation
// route (app/api/admin/reconcile-payment) — the only two paths trusted to
// make this jump, both running as service_role.
//
// The payment_orders update is the gate: it only takes effect from
// created/attempted, so if a webhook and a manual reconcile ever race for
// the same order, whichever writes first wins and the second sees zero rows
// updated — `skipped: true` — instead of blindly re-applying a possibly
// stale decision on top of an already-resolved order.
export async function applyPaymentDecision(
  admin: SupabaseClient,
  d: PaymentDecision,
) {
  const { data: updatedOrders, error: orderUpdateError } = await admin
    .from("payment_orders")
    .update({ status: d.captured ? "paid" : "failed" })
    .eq("id", d.orderId)
    .in("status", ["created", "attempted"])
    .select("id");
  if (orderUpdateError)
    return { error: orderUpdateError, skipped: false as const };
  if (!updatedOrders || updatedOrders.length === 0) {
    return { error: null, skipped: true as const };
  }

  const { error: paymentError } = await admin.from("payments").upsert(
    {
      payment_order_id: d.orderId,
      razorpay_payment_id: d.razorpayPaymentId,
      method: d.method,
      status: d.captured ? "captured" : "failed",
      amount_paise: d.amountPaise,
      raw_response: d.rawResponse,
      captured_at: d.captured ? new Date().toISOString() : null,
    },
    { onConflict: "razorpay_payment_id", ignoreDuplicates: false },
  );
  if (paymentError) return { error: paymentError, skipped: false as const };

  if (d.captured) {
    const { error: invoiceError } = await admin
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", d.invoiceId);
    if (invoiceError) return { error: invoiceError, skipped: false as const };
  }

  return { error: null, skipped: false as const };
}
