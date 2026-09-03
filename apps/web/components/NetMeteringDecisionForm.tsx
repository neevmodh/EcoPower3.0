"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NetMeteringDecisionForm({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/netmetering/${applicationId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: notes.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "decision failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Decision notes (optional)…"
        rows={2}
        className="w-full rounded-control border px-3 py-2 text-sm bg-transparent mb-2"
        style={{ borderColor: "var(--color-border)" }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("approved")}
          className="rounded-control px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-status-good)" }}
        >
          {busy ? "…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("rejected")}
          className="rounded-control px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-status-critical)" }}
        >
          {busy ? "…" : "Reject"}
        </button>
      </div>
      {error && (
        <p className="text-xs mt-1" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
