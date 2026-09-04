"use client";

// Post a society notice (migration 0034). Only a society_admin can insert;
// RLS enforces it, so a non-admin simply never sees this form.

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function SocietyNoticeForm({ societyOrgId }: { societyOrgId: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("society_notices")
      .insert({ society_org_id: societyOrgId, title: title.trim(), body: body.trim() });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-card border card-shadow p-4 space-y-2"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
    >
      <div className="eyebrow">Post a notice</div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full rounded-control border px-3 py-1.5 text-sm"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" }}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Notice text"
        rows={3}
        className="w-full rounded-control border px-3 py-1.5 text-sm"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" }}
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-control px-3 py-1.5 text-xs font-semibold on-accent disabled:opacity-50"
        style={{ background: "#b394ff" }}
      >
        {busy ? "Posting…" : "Post"}
      </button>
      {error && (
        <p className="text-xs" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
