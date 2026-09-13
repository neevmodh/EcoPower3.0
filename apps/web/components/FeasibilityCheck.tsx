"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type FeasibilityCheckRow = {
  verdict: "feasible" | "infeasible" | "insufficient_data";
  verdict_detail: string;
  computed_at: string;
  rule_version: string;
};

const VERDICT_COLOR: Record<FeasibilityCheckRow["verdict"], string> = {
  feasible: "var(--color-status-good)",
  infeasible: "var(--color-status-critical)",
  insufficient_data: "var(--color-status-warning)",
};

export function FeasibilityCheck({
  applicationId,
  latest,
  readOnly = false,
}: {
  applicationId: string;
  latest: FeasibilityCheckRow | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (readOnly && !latest) return null;

  return (
    <div
      className="mt-3 pt-3"
      style={{ borderTop: "1px solid var(--color-border)" }}
    >
      {latest ? (
        <div className="mb-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium on-accent"
            style={{ background: VERDICT_COLOR[latest.verdict] }}
          >
            {latest.verdict.replace("_", " ")}
          </span>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {latest.verdict_detail} · rule {latest.rule_version} ·{" "}
            {new Date(latest.computed_at).toLocaleString("en-IN")}
          </p>
        </div>
      ) : (
        <p
          className="text-xs mb-2"
          style={{ color: "var(--color-text-secondary)" }}
        >
          No feasibility check run yet.
        </p>
      )}
      {!readOnly && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res = await fetch(
                  `/api/netmetering/${applicationId}/feasibility`,
                  { method: "POST" },
                );
                const json = await res.json();
                if (!res.ok)
                  throw new Error(json.error ?? "feasibility check failed");
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "failed");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-control px-3 py-1 text-xs font-semibold transition-colors duration-state disabled:opacity-50"
            style={{ border: "1px solid var(--color-border)" }}
          >
            {busy
              ? "…"
              : latest
                ? "Recompute feasibility"
                : "Run feasibility check"}
          </button>
          {error && (
            <p
              className="text-xs mt-1"
              style={{ color: "var(--color-status-critical)" }}
            >
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
