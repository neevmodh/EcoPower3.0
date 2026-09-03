"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatInrFromPaise } from "@ecopower/shared";
import { createClient } from "@/lib/supabase/browser";

const AMOUNTS_PAISE = [10000, 20000, 50000];

export function PrepaidBalanceCard({
  connectionId,
  balancePaise,
  thresholdPaise,
  disconnectPending,
  labels,
}: {
  connectionId: string;
  balancePaise: number;
  thresholdPaise: number;
  disconnectPending: boolean;
  labels?: { balance: string; balanceLow: string; belowThreshold: string };
}) {
  const L = labels ?? {
    balance: "Prepaid balance",
    balanceLow: "Prepaid balance · low",
    belowThreshold: "Below the disconnection threshold — recharge to stay connected.",
  };
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const low = disconnectPending || balancePaise <= thresholdPaise;

  async function recharge(amountPaise: number) {
    setBusy(amountPaise);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("prepaid_recharge", {
      p_connection_id: connectionId,
      p_amount_paise: amountPaise,
    });
    setBusy(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div
      className="rounded-card border card-shadow p-4"
      style={{
        borderColor: low ? "var(--color-status-serious)" : "var(--color-border)",
        background: low
          ? "color-mix(in oklab, var(--color-status-serious) 6%, var(--color-surface-card))"
          : "var(--color-surface-card)",
      }}
    >
      <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>
        {low ? L.balanceLow : L.balance}
      </div>
      <div
        className="text-2xl font-semibold tabular"
        style={{ color: low ? "var(--color-status-serious)" : "var(--color-text-primary)" }}
      >
        {formatInrFromPaise(BigInt(Math.round(balancePaise)))}
      </div>
      {disconnectPending && (
        <div className="text-xs mt-1" style={{ color: "var(--color-status-serious)" }}>
          {L.belowThreshold}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        {AMOUNTS_PAISE.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => recharge(amt)}
            disabled={busy !== null}
            className="rounded-control border px-2.5 py-1 text-xs font-semibold transition-colors duration-state disabled:opacity-50"
            style={{ borderColor: "var(--color-border)" }}
          >
            {busy === amt ? "…" : `+ ${formatInrFromPaise(BigInt(amt))}`}
          </button>
        ))}
      </div>
      {error && (
        <div className="text-xs mt-2" style={{ color: "var(--color-status-serious)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
