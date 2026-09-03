"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function callAction(subscriptionId: string, action: string, body?: Record<string, unknown>) {
  const res = await fetch(`/api/subscriptions/${subscriptionId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "action failed");
}

function ActionButton({
  label,
  onClick,
  tone = "neutral",
}: {
  label: string;
  onClick: () => Promise<void>;
  tone?: "primary" | "neutral" | "danger";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const background =
    tone === "primary"
      ? "var(--color-categorical-third)"
      : tone === "danger"
        ? "var(--color-status-critical)"
        : "transparent";
  const color = tone === "neutral" ? "var(--color-text-primary)" : "#fff";
  const border = tone === "neutral" ? "1px solid var(--color-border)" : "none";

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onClick();
          } catch (err) {
            setError(err instanceof Error ? err.message : "failed");
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-control px-4 py-2 text-sm font-semibold transition-colors duration-state disabled:opacity-50"
        style={{ background, color, border }}
      >
        {busy ? "…" : label}
      </button>
      {error && (
        <p className="text-xs mt-1" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export function SubscribeButton({ planId, serviceConnectionId }: { planId: string; serviceConnectionId: string }) {
  const router = useRouter();
  return (
    <ActionButton
      label="Subscribe"
      tone="primary"
      onClick={async () => {
        const res = await fetch("/api/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, serviceConnectionId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "subscribe failed");
        router.refresh();
      }}
    />
  );
}

export function SubscriptionLifecycleActions({
  subscriptionId,
  status,
  otherPlans,
}: {
  subscriptionId: string;
  status: "active" | "paused" | "cancelled";
  otherPlans: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [upgradeTarget, setUpgradeTarget] = useState("");

  if (status === "cancelled") {
    return (
      <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        Cancelled.
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "active" && (
        <ActionButton
          label="Pause"
          onClick={async () => {
            await callAction(subscriptionId, "pause");
            router.refresh();
          }}
        />
      )}
      {status === "paused" && (
        <ActionButton
          label="Resume"
          tone="primary"
          onClick={async () => {
            await callAction(subscriptionId, "resume");
            router.refresh();
          }}
        />
      )}
      {status === "active" && otherPlans.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={upgradeTarget}
            onChange={(e) => setUpgradeTarget(e.target.value)}
            className="rounded-control border px-2 py-2 text-sm"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            <option value="">Change plan…</option>
            {otherPlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ActionButton
            label="Switch"
            onClick={async () => {
              if (!upgradeTarget) throw new Error("choose a plan first");
              await callAction(subscriptionId, "upgrade", { toPlanId: upgradeTarget });
              router.refresh();
            }}
          />
        </div>
      )}
      <ActionButton
        label="Cancel"
        tone="danger"
        onClick={async () => {
          await callAction(subscriptionId, "cancel", { reason: "consumer requested" });
          router.refresh();
        }}
      />
    </div>
  );
}
