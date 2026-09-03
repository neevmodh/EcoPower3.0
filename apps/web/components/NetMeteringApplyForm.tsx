"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

// netmetering_applications_consumer_insert (0019) is the real gate — this
// just writes through the consumer's own session, same shape as every
// other consumer-owned insert in this app (support tickets, ticket replies).
export function NetMeteringApplyForm({
  serviceConnectionId,
  assetId,
  defaultCapacityKw,
}: {
  serviceConnectionId: string;
  assetId: string;
  defaultCapacityKw: number;
}) {
  const router = useRouter();
  const [capacity, setCapacity] = useState(String(defaultCapacityKw));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className="w-24 rounded-control border px-2 py-1.5 text-sm tabular bg-transparent"
          style={{ borderColor: "var(--color-border)" }}
        />
        <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          kW
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const kw = Number(capacity);
            if (!(kw > 0)) {
              setError("capacity must be greater than zero");
              setBusy(false);
              return;
            }
            const supabase = createClient();
            const { error: insertError } = await supabase.from("netmetering_applications").insert({
              service_connection_id: serviceConnectionId,
              asset_id: assetId,
              capacity_kw: kw,
            });
            setBusy(false);
            if (insertError) {
              setError(insertError.message);
              return;
            }
            router.refresh();
          }}
          className="rounded-control px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-categorical-third)" }}
        >
          {busy ? "…" : "Apply for net-metering"}
        </button>
      </div>
      {error && (
        <p className="text-xs" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
