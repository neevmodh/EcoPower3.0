"use client";

// Consumer meter self-read (design canvas screen 15 / migration 0026), the
// way Torrent Power's app works: photograph the meter, type the digits you
// see, and the app checks them against your last reading before you submit.
// It lands in a review queue — a technician or DISCOM officer accepts it and
// only then does it become a billing reading (source='ocr', quality
// 'estimated'). No number is asserted as measured until a human confirms it.

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PanelIcon } from "./Icon";

type Props = {
  meterId: string;
  serviceConnectionId: string;
  userId: string;
  prev: { kwh: number; ts: string } | null;
};

export function SelfReadForm({ meterId, serviceConnectionId, userId, prev }: Props) {
  const [reading, setReading] = useState("");
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const value = Number(reading);
  const valid = reading !== "" && Number.isFinite(value) && value >= 0;

  const check = useMemo(() => {
    if (!valid || !prev) return null;
    const delta = value - prev.kwh;
    const days = Math.max(1, (Date.now() - new Date(prev.ts).getTime()) / 86_400_000);
    const perDay = delta / days;
    if (delta < 0) return { tone: "bad" as const, text: "Lower than your last reading — a meter register never goes backwards. Check the digits." };
    if (perDay > 60) return { tone: "warn" as const, text: `That's ${perDay.toFixed(0)} kWh/day since the last read — unusually high. Double-check before submitting.` };
    return { tone: "ok" as const, text: `${delta.toFixed(0)} kWh over ${days.toFixed(0)} days · ${perDay.toFixed(1)} kWh/day — looks plausible.` };
  }, [valid, value, prev]);

  async function submit() {
    if (!valid) return;
    setStatus("submitting");
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("self_read_submissions").insert({
      service_connection_id: serviceConnectionId,
      meter_id: meterId,
      submitted_by: userId,
      reading_kwh: value,
      ocr_raw: null,
      min_digit_confidence: null,
      corrected: false,
      photo_path: photoName,
      prev_reading_kwh: prev?.kwh ?? null,
      prev_reading_ts: prev?.ts ?? null,
    });
    if (err) {
      setStatus("error");
      setError(err.message);
      return;
    }
    setStatus("done");
  }

  if (status === "done") {
    return (
      <div
        className="rounded-card border card-shadow p-6"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span style={{ color: "var(--color-status-good)" }}>
            <PanelIcon name="check" size={18} />
          </span>
          <span className="font-semibold">Reading submitted for review</span>
        </div>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {value.toLocaleString("en-IN")} kWh is in the review queue. You'll get a notification when it's accepted; until
          then it shows as pending in your history below and is not used for billing.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-card border card-shadow p-6 max-w-md"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
    >
      <div className="eyebrow mb-4">Submit a meter reading</div>

      <div className="block text-sm mb-1.5">Photo of the meter</div>
      <label
        className="flex items-center gap-2 rounded-control border px-3 py-2 text-sm cursor-pointer mb-4"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
      >
        <PanelIcon name="eye" size={15} />
        {photoName ?? "Take or choose a photo"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
        />
      </label>

      <label className="block text-sm mb-1.5" htmlFor="self-read-value">
        Reading shown on the meter (kWh)
      </label>
      <input
        id="self-read-value"
        inputMode="numeric"
        value={reading}
        onChange={(e) => setReading(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder={prev ? `last: ${prev.kwh.toLocaleString("en-IN")}` : "e.g. 42571"}
        className="w-full rounded-control border px-3 py-2 mono text-lg mb-2"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" }}
      />

      {check && (
        <p
          className="text-xs mb-3"
          style={{
            color:
              check.tone === "bad"
                ? "var(--color-status-serious)"
                : check.tone === "warn"
                  ? "var(--color-status-warning)"
                  : "var(--color-status-good)",
          }}
        >
          {check.text}
        </p>
      )}
      {!prev && valid && (
        <p className="text-xs mb-3" style={{ color: "var(--color-text-tertiary)" }}>
          No previous reading on record — the reviewer will check this one against the meter directly.
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!valid || status === "submitting" || check?.tone === "bad"}
        className="w-full rounded-control px-4 py-2.5 text-sm font-semibold on-accent transition-colors duration-state disabled:opacity-50"
        style={{ background: "var(--color-categorical-third)" }}
      >
        {status === "submitting" ? "Submitting…" : "Submit for review"}
      </button>
      {error && (
        <p className="text-xs mt-2" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}
      <p className="text-[11px] mt-3" style={{ color: "var(--color-text-tertiary)" }}>
        Your reading isn't billed until a technician or DISCOM officer accepts it — then it's recorded as an estimated
        read, marked as such in your history.
      </p>
    </div>
  );
}
