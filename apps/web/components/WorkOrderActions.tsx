"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function callAction(workOrderId: string, action: string) {
  const res = await fetch(`/api/work-orders/${workOrderId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "action failed");
}

function ActionButton({ label, tone, onClick }: { label: string; tone: "primary" | "neutral" | "danger"; onClick: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const background = tone === "primary" ? "var(--color-categorical-third)" : tone === "danger" ? "var(--color-status-critical)" : "transparent";
  const color = tone === "neutral" ? "var(--color-text-primary)" : "#fff";
  const border = tone === "neutral" ? "1px solid var(--color-border)" : "none";

  return (
    <div>
      <button
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
        className="rounded-control px-3 py-1.5 text-xs font-semibold transition-colors duration-state disabled:opacity-50"
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

export function WorkOrderActions({ workOrderId, status, isAssignedToMe }: { workOrderId: string; status: string; isAssignedToMe: boolean }) {
  const router = useRouter();
  const run = (action: string) => async () => {
    await callAction(workOrderId, action);
    router.refresh();
  };

  if (status === "completed" || status === "cancelled") return null;

  return (
    <div className="flex items-center gap-2">
      {status === "open" && !isAssignedToMe && <ActionButton label="Claim" tone="neutral" onClick={run("claim")} />}
      {status === "open" && <ActionButton label="Start" tone="primary" onClick={run("start")} />}
      {status === "in_progress" && <ActionButton label="Complete" tone="primary" onClick={run("complete")} />}
      <ActionButton label="Cancel" tone="danger" onClick={run("cancel")} />
    </div>
  );
}
