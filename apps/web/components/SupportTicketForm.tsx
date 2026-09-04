"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function SupportTicketForm({ serviceConnectionId }: { serviceConnectionId: string }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("support_tickets").insert({
      service_connection_id: serviceConnectionId,
      subject: subject.trim(),
      description: description.trim(),
      priority,
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSubject("");
    setDescription("");
    setPriority("medium");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-card border p-5 card-shadow" style={{ borderColor: "var(--color-border)" }}>
      <h2 className="text-base font-semibold mb-4">Raise a ticket</h2>
      <label className="block text-sm mb-1" htmlFor="subject">
        Subject
      </label>
      <input
        id="subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        required
        className="w-full rounded-control border px-3 py-2 mb-3 bg-transparent text-sm"
        style={{ borderColor: "var(--color-border)" }}
      />
      <label className="block text-sm mb-1" htmlFor="description">
        Description
      </label>
      <textarea
        id="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
        rows={3}
        className="w-full rounded-control border px-3 py-2 mb-3 bg-transparent text-sm"
        style={{ borderColor: "var(--color-border)" }}
      />
      <label className="block text-sm mb-1" htmlFor="priority">
        Priority
      </label>
      <select
        id="priority"
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        className="w-full rounded-control border px-3 py-2 mb-4 text-sm"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="critical">Critical</option>
      </select>
      <button
        type="submit"
        disabled={busy}
        className="rounded-control px-4 py-2 text-sm font-semibold on-accent disabled:opacity-50"
        style={{ background: "var(--color-categorical-third)" }}
      >
        {busy ? "Submitting…" : "Submit ticket"}
      </button>
      {error && (
        <p className="text-xs mt-2" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
