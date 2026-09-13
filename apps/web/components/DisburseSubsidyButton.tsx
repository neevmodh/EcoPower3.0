"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DisburseSubsidyButton({
  applicationId,
}: { applicationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(
              `/api/netmetering/${applicationId}/disburse-subsidy`,
              { method: "POST" },
            );
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "disbursement failed");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "failed");
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-control px-3 py-1 text-xs font-semibold on-accent disabled:opacity-50"
        style={{ background: "var(--color-status-good)" }}
      >
        {busy ? "…" : "Disburse subsidy"}
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
