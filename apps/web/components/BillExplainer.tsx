"use client";

import { useState } from "react";

export function BillExplainer({ invoiceId }: { invoiceId: string }) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function explain() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/bill-explainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "failed");
      setExplanation(json.explanation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  if (explanation) {
    return (
      <div
        className="w-full rounded-control border p-3 text-sm mt-1"
        style={{ borderColor: "var(--color-categorical-third)", background: "color-mix(in oklab, var(--color-categorical-third) 6%, transparent)" }}
      >
        <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-categorical-third)" }}>
          ✨ AI explanation
        </div>
        {explanation}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={explain}
        disabled={busy}
        className="rounded-control px-3 py-1.5 text-xs font-semibold border disabled:opacity-50"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
      >
        {busy ? "Explaining…" : "✨ Explain this bill"}
      </button>
      {error && (
        <p className="text-xs mt-1" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
