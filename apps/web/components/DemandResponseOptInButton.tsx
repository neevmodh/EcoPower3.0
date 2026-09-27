"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DemandResponseOptInButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown immediately so the click feels acknowledged instead of the button
  // just disappearing into router.refresh()'s next server render — that
  // render still runs and replaces this whole component with the "you're
  // opted in" state a moment later, this just covers the gap.
  const [justOptedIn, setJustOptedIn] = useState(false);

  if (justOptedIn) {
    return (
      <p
        className="text-sm"
        style={{ color: "var(--color-status-good)" }}
      >
        Opted in.
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/demand-response/${eventId}/opt-in`, {
              method: "POST",
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "opt-in failed");
            setJustOptedIn(true);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "failed");
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-control px-3 py-1 text-xs font-semibold on-accent disabled:opacity-50"
        style={{ background: "var(--color-categorical-third)" }}
      >
        {busy ? "…" : "Opt in"}
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
