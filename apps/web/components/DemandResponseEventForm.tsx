"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Feeder = { id: string; name: string };

export function DemandResponseEventForm({
  feeders = [],
}: {
  feeders?: Feeder[];
}) {
  const router = useRouter();
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [targetKw, setTargetKw] = useState("");
  const [incentiveRupeesPerKwh, setIncentiveRupeesPerKwh] = useState("5");
  const [feederId, setFeederId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="rounded-card border card-shadow p-5 mb-6"
      style={{ borderColor: "var(--color-border)" }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/demand-response", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              startsAt: new Date(startsAt).toISOString(),
              endsAt: new Date(endsAt).toISOString(),
              targetKwReduction: Number(targetKw),
              incentivePaisePerKwh: Math.round(
                Number(incentiveRupeesPerKwh) * 100,
              ),
              feederId: feederId || undefined,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "failed to declare event");
          setStartsAt("");
          setEndsAt("");
          setTargetKw("");
          setFeederId("");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-sm font-semibold mb-3">
        Declare a demand response event
      </h2>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
      >
        <label
          className="text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Starts
          <input
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="mt-1 w-full rounded-control border px-2 py-1.5 text-sm bg-transparent"
            style={{ borderColor: "var(--color-border)" }}
          />
        </label>
        <label
          className="text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Ends
          <input
            type="datetime-local"
            required
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="mt-1 w-full rounded-control border px-2 py-1.5 text-sm bg-transparent"
            style={{ borderColor: "var(--color-border)" }}
          />
        </label>
        <label
          className="text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Target reduction (kW)
          <input
            type="number"
            min="0.1"
            step="0.1"
            required
            value={targetKw}
            onChange={(e) => setTargetKw(e.target.value)}
            className="mt-1 w-full rounded-control border px-2 py-1.5 text-sm bg-transparent"
            style={{ borderColor: "var(--color-border)" }}
          />
        </label>
        <label
          className="text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Incentive (₹/kWh reduced)
          <input
            type="number"
            min="0"
            step="0.5"
            required
            value={incentiveRupeesPerKwh}
            onChange={(e) => setIncentiveRupeesPerKwh(e.target.value)}
            className="mt-1 w-full rounded-control border px-2 py-1.5 text-sm bg-transparent"
            style={{ borderColor: "var(--color-border)" }}
          />
        </label>
        <label
          className="text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Feeder (optional)
          <select
            value={feederId}
            onChange={(e) => setFeederId(e.target.value)}
            className="mt-1 w-full rounded-control border px-2 py-1.5 text-sm bg-transparent"
            style={{ borderColor: "var(--color-border)" }}
          >
            <option value="">Division-wide</option>
            {feeders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-control px-4 py-1.5 text-xs font-semibold on-accent disabled:opacity-50"
        style={{ background: "var(--color-categorical-third)" }}
      >
        {busy ? "…" : "Declare event"}
      </button>
      {error && (
        <p
          className="text-xs mt-2"
          style={{ color: "var(--color-status-critical)" }}
        >
          {error}
        </p>
      )}
    </form>
  );
}
