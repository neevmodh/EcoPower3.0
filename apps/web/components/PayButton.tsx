"use client";
import { PanelIcon } from "./Icon";

// Loads the real checkout.razorpay.com SDK and opens the real Checkout
// modal against a server-created order — this is what 2.0's
// RazorpayPayment.js tried to do and failed at, because the two API routes
// it called (create-order, verify) never existed. Both exist now (#39).

import { useState } from "react";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("failed to load checkout.js"));
    document.body.appendChild(script);
  });
}

export function PayButton({ invoiceId, label = "Pay now" }: { invoiceId: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "verified">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setStatus("loading");
    setError(null);
    try {
      const orderRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error ?? "order creation failed");

      await loadCheckoutScript();

      const razorpay = new window.Razorpay({
        key: order.keyId,
        order_id: order.razorpayOrderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "EcoPower",
        description: "Energy service invoice",
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          const verifyRes = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
          if (verifyRes.ok) {
            setStatus("verified");
          } else {
            setStatus("error");
            setError("signature verification failed");
          }
        },
        modal: {
          ondismiss: () => setStatus("idle"),
        },
      });
      razorpay.open();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "payment failed to start");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handlePay}
        disabled={status === "loading"}
        className="rounded-control px-4 py-2 text-sm font-semibold on-accent transition-colors duration-state disabled:opacity-50"
        style={{ background: "var(--color-categorical-third)" }}
      >
        {status === "loading" ? (
          "Starting…"
        ) : status === "verified" ? (
          <>
            <PanelIcon name="check" size={14} />
            Paid
          </>
        ) : (
          label
        )}
      </button>
      {error && (
        <p className="text-xs mt-2" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
