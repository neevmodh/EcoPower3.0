"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

// support_tickets_agent_update (0014) is what actually authorizes this —
// a consumer session hitting the same table update would be rejected by
// RLS regardless of what this control renders.
export function TicketStatusSelect({ ticketId, status }: { ticketId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <select
      value={status}
      disabled={busy}
      onChange={async (e) => {
        setBusy(true);
        const supabase = createClient();
        await supabase.from("support_tickets").update({ status: e.target.value }).eq("id", ticketId);
        setBusy(false);
        router.refresh();
      }}
      className="rounded-control border px-2 py-1 text-xs font-medium"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}
