"use client";

// Prepaid balance (#22). The ring is the balance against the account's own
// disconnection threshold — not an arbitrary full scale — so "how close am I
// to being cut off" is the thing the shape actually encodes. Recharging calls
// prepaid_recharge(), which re-checks ownership in the database; this
// component never writes a balance itself.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatInrFromPaise } from "@ecopower/shared";
import { createClient } from "@/lib/supabase/browser";
import { PanelIcon } from "./Icon";

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
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const L = labels ?? {
    balance: "Prepaid balance",
    balanceLow: "Prepaid balance · low",
    belowThreshold: "Below the disconnection threshold — recharge to stay connected.",
  };

  const low = disconnectPending || balancePaise <= thresholdPaise;
  const accent = low ? "var(--color-status-serious)" : "var(--color-status-good)";

  // Full scale is five thresholds' worth of headroom, so the ring has room to
  // read as "comfortable" rather than pinning at full on any healthy balance.
  const scale = Math.max(thresholdPaise * 5, 1);
  const fraction = Math.max(0, Math.min(1, balancePaise / scale));
  const CIRCUMFERENCE = 2 * Math.PI * 34;

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
      className="rounded-card border p-4 card-lift relative overflow-hidden"
      style={{
        borderColor: low ? `color-mix(in oklab, ${accent} 45%, var(--color-border))` : "var(--color-border)",
        background: "var(--color-surface-card)",
      }}
    >
      {low && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
        />
      )}

      <div className="eyebrow mb-3">{low ? L.balanceLow : L.balance}</div>

      <div className="flex items-center gap-4">
        <svg width={84} height={84} viewBox="0 0 80 80" style={{ flex: "none", transform: "rotate(-90deg)" }} aria-hidden="true">
          <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-border)" strokeWidth="7" />
          <circle
            className="animate-ring"
            cx="40"
            cy="40"
            r="34"
            fill="none"
            stroke={accent}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            style={{ filter: `drop-shadow(0 0 5px ${accent})` }}
          />
        </svg>

        <div className="min-w-0">
          <div className="mono text-2xl font-semibold" style={{ color: accent }}>
            {formatInrFromPaise(BigInt(Math.round(balancePaise)))}
          </div>
          <div className="mono text-[11px] mt-1" style={{ color: "var(--color-text-tertiary)" }}>
            cut-off at {formatInrFromPaise(BigInt(Math.round(thresholdPaise)))}
          </div>
        </div>
      </div>

      {disconnectPending && (
        <div className="text-[11px] mt-3 flex items-start gap-1.5" style={{ color: accent }}>
          <span style={{ marginTop: 1 }}>
            <PanelIcon name="alert" size={13} />
          </span>
          <span style={{ textWrap: "pretty" }}>{L.belowThreshold}</span>
        </div>
      )}

      <div className="flex gap-1.5 mt-3.5">
        {AMOUNTS_PAISE.map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => recharge(amt)}
            disabled={busy !== null}
            className="flex-1 h-8 rounded-control border mono text-[11.5px] transition-colors duration-state disabled:opacity-50"
            style={{ borderColor: "var(--color-border-strong)", background: "var(--color-surface-sunken)" }}
          >
            {busy === amt ? "…" : `+ ${formatInrFromPaise(BigInt(amt))}`}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-[11px] mt-2" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
