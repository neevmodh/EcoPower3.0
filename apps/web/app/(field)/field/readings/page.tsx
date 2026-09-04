import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { SelfReadReview } from "@/components/SelfReadReview";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  reading_kwh: number;
  ocr_raw: string | null;
  min_digit_confidence: number | null;
  corrected: boolean;
  photo_path: string | null;
  prev_reading_kwh: number | null;
  prev_reading_ts: string | null;
  submitted_at: string;
  status: string;
  review_note: string | null;
  service_connections: unknown;
};

export default async function FieldReadingsPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  // RLS (0026) returns exactly the submissions this reviewer may act on.
  const { data } = await supabase
    .from("self_read_submissions")
    .select(
      "id, reading_kwh, ocr_raw, min_digit_confidence, corrected, photo_path, prev_reading_kwh, prev_reading_ts, submitted_at, status, review_note, service_connections(consumer_number)",
    )
    .order("submitted_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as Row[];
  const pending = rows.filter((r) => r.status === "pending");
  const recent = rows.filter((r) => r.status !== "pending").slice(0, 10);

  const cn = (r: Row) => (r.service_connections as { consumer_number: string } | null)?.consumer_number ?? "—";

  return (
    <PanelShell
      panel="field"
      email={user.email ?? ""}
      nav={[
        { href: "/field", label: "My jobs" },
        { href: "/field/readings", label: "Meter reviews", active: true },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Consumer meter self-reads</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Readings submitted from the consumer app for connections without an automatic meter link. Accepting one records it
        as an estimated reading, marked as such in the consumer's history.
      </p>

      <div className="mb-6">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          {pending.length} pending
        </span>
      </div>

      {pending.length === 0 ? (
        <div
          className="rounded-card border card-shadow p-6 text-center mb-8"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          Nothing waiting for review.
        </div>
      ) : (
        <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
          {pending.map((r) => (
            <SelfReadReview
              key={r.id}
              reviewerId={user.id}
              submission={{
                id: r.id,
                reading_kwh: Number(r.reading_kwh),
                ocr_raw: r.ocr_raw,
                min_digit_confidence: r.min_digit_confidence == null ? null : Number(r.min_digit_confidence),
                corrected: r.corrected,
                photo_path: r.photo_path,
                prev_reading_kwh: r.prev_reading_kwh == null ? null : Number(r.prev_reading_kwh),
                prev_reading_ts: r.prev_reading_ts,
                submitted_at: r.submitted_at,
                consumer_number: cn(r),
              }}
            />
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <h2 className="text-base font-semibold mb-3">Recently reviewed</h2>
          <div
            className="rounded-card border card-shadow divide-y"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-4">
                <div>
                  <span className="mono text-sm">{cn(r)}</span>
                  <span className="mono text-sm ml-3" style={{ color: "var(--color-text-secondary)" }}>
                    {Number(r.reading_kwh).toLocaleString("en-IN")} kWh
                  </span>
                </div>
                <span
                  className="text-xs font-medium"
                  style={{ color: r.status === "accepted" ? "var(--color-status-good)" : "var(--color-status-serious)" }}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </PanelShell>
  );
}
