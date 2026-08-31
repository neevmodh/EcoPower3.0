"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

// service_connections_society_admin_update (0020) is the real gate — only
// scopes to units in the caller's own society, and only society_admin.
export function AllocationEditor({ unitId, initialPct }: { unitId: string; initialPct: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(String(initialPct ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded-control border px-2 py-1 text-sm tabular bg-transparent"
        style={{ borderColor: "var(--color-border)" }}
      />
      <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>%</span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const pct = Number(value);
          if (!(pct >= 0 && pct <= 100)) {
            setError("0-100 only");
            setBusy(false);
            return;
          }
          const supabase = createClient();
          const { error: updateError } = await supabase
            .from("service_connections")
            .update({ allocation_pct: pct })
            .eq("id", unitId);
          setBusy(false);
          if (updateError) {
            setError(updateError.message);
            return;
          }
          router.refresh();
        }}
        className="rounded-control px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--color-categorical-third)" }}
      >
        {busy ? "…" : "Save"}
      </button>
      {error && (
        <span className="text-xs" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
