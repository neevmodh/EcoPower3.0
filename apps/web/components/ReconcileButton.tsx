"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReconcileButton({
  paymentOrderId,
}: { paymentOrderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/admin/reconcile-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paymentOrderId }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "reconcile failed");
            if (!json.reconciled)
              throw new Error(json.reason ?? "nothing to reconcile yet");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "failed");
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-control px-3 py-1 text-xs font-semibold transition-colors duration-state disabled:opacity-50"
        style={{ background: "var(--color-categorical-third)", color: "#fff" }}
      >
        {busy ? "…" : "Reconcile"}
      </button>
      {error && (
        <p
          className="text-xs mt-1"
          style={{ color: "var(--color-status-critical)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
