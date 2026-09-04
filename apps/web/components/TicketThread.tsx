"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Reply = { id: string; author_user_id: string; body: string; created_at: string };

const STATUS_COLOR: Record<string, string> = {
  open: "var(--color-status-warning)",
  in_progress: "var(--color-categorical-consumption)",
  resolved: "var(--color-status-good)",
  closed: "var(--color-text-secondary)",
};

export function TicketThread({
  ticketId,
  status,
  currentUserId,
  replies,
}: {
  ticketId: string;
  status: string;
  currentUserId: string;
  replies: Reply[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("ticket_replies").insert({ ticket_id: ticketId, author_user_id: currentUserId, body: body.trim() });
    setBusy(false);
    setBody("");
    router.refresh();
  }

  return (
    <div>
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold on-accent mb-3"
        style={{ background: STATUS_COLOR[status] ?? "var(--color-text-secondary)" }}
      >
        {status.replace("_", " ")}
      </span>
      <div className="space-y-3 mb-4">
        {replies.map((r) => (
          <div
            key={r.id}
            className="rounded-control border p-3 text-sm"
            style={{
              borderColor: "var(--color-border)",
              background: r.author_user_id === currentUserId ? "var(--color-surface-card)" : "color-mix(in oklab, var(--color-categorical-third) 6%, var(--color-surface-card))",
            }}
          >
            <div>{r.body}</div>
            <div className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
              {new Date(r.created_at).toLocaleString("en-IN")}
            </div>
          </div>
        ))}
        {replies.length === 0 && (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            No replies yet.
          </p>
        )}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a reply…"
          className="flex-1 rounded-control border px-3 py-2 text-sm bg-transparent"
          style={{ borderColor: "var(--color-border)" }}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-control px-4 py-2 text-sm font-semibold on-accent disabled:opacity-50"
          style={{ background: "var(--color-categorical-third)" }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
