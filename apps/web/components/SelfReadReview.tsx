"use client";

// Reviewer side of the consumer meter self-read queue (migration 0026).
// Accept goes through the accept_self_read() RPC — it writes the
// meter_readings row and flips the submission atomically, re-checking the
// caller's role server-side. Reject is a plain scoped update.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PanelIcon } from "./Icon";

type Submission = {
  id: string;
  reading_kwh: number;
  ocr_raw: string | null;
  min_digit_confidence: number | null;
  corrected: boolean;
  photo_path: string | null;
  prev_reading_kwh: number | null;
  prev_reading_ts: string | null;
  submitted_at: string;
  consumer_number: string;
};

export function SelfReadReview({ submission, reviewerId }: { submission: Submission; reviewerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const s = submission;
  const delta = s.prev_reading_kwh != null ? s.reading_kwh - s.prev_reading_kwh : null;
  const days =
    s.prev_reading_ts != null
      ? Math.max(1, (new Date(s.submitted_at).getTime() - new Date(s.prev_reading_ts).getTime()) / 86_400_000)
      : null;
  const perDay = delta != null && days != null ? delta / days : null;
  const suspicious = delta != null && delta < 0;

  async function accept() {
    setBusy("accept");
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("accept_self_read", { p_id: s.id, p_note: note || null });
    if (err) {
      setError(err.message);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  async function reject() {
    setBusy("reject");
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("self_read_submissions")
      .update({
        status: "rejected",
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        review_note: note || "Reading could not be verified.",
      })
      .eq("id", s.id);
    if (err) {
      setError(err.message);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  return (
    <div
      className="rounded-card border card-shadow p-5"
      style={{ borderColor: suspicious ? "var(--color-status-serious)" : "var(--color-border)", background: "var(--color-surface-card)" }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="mono text-sm">{s.consumer_number}</div>
          <div className="mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }} suppressHydrationWarning>
            submitted {new Date(s.submitted_at).toLocaleString("en-GB")}
          </div>
        </div>
        {s.photo_path && (
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
            <PanelIcon name="eye" size={13} />
            {s.photo_path}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-3 mb-3">
        <span className="mono text-2xl font-semibold">{s.reading_kwh.toLocaleString("en-IN")}</span>
        <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>kWh submitted</span>
        {s.ocr_raw && s.ocr_raw !== String(s.reading_kwh) && (
          <span className="mono text-[11px]" style={{ color: "var(--color-status-warning)" }}>
            OCR read {s.ocr_raw}{s.corrected ? " · consumer corrected" : ""}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs mb-4">
        <div className="flex justify-between">
          <span style={{ color: "var(--color-text-secondary)" }}>Previous reading</span>
          <span className="mono">{s.prev_reading_kwh != null ? s.prev_reading_kwh.toLocaleString("en-IN") : "none"}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "var(--color-text-secondary)" }}>Consumption</span>
          <span className="mono" style={{ color: suspicious ? "var(--color-status-serious)" : undefined }}>
            {delta != null ? `${delta.toFixed(0)} kWh` : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "var(--color-text-secondary)" }}>Per day</span>
          <span className="mono">{perDay != null ? `${perDay.toFixed(1)} kWh` : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "var(--color-text-secondary)" }}>OCR confidence</span>
          <span className="mono">
            {s.min_digit_confidence != null ? `${Math.round(s.min_digit_confidence * 100)}%` : "manual entry"}
          </span>
        </div>
      </div>

      {suspicious && (
        <p className="text-xs mb-3" style={{ color: "var(--color-status-serious)" }}>
          The reading is lower than the previous register value — a physical meter cannot go backwards. Reject unless a
          meter change explains it.
        </p>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Review note (optional)"
        className="w-full rounded-control border px-3 py-1.5 text-xs mb-3"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" }}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={busy !== null}
          className="rounded-control px-3 py-1.5 text-xs font-semibold on-accent disabled:opacity-50"
          style={{ background: "var(--color-status-good)" }}
        >
          {busy === "accept" ? "Accepting…" : "Accept as reading"}
        </button>
        <button
          type="button"
          onClick={reject}
          disabled={busy !== null}
          className="rounded-control border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ borderColor: "var(--color-status-serious)", color: "var(--color-status-serious)" }}
        >
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {error && (
        <p className="text-xs mt-2" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
