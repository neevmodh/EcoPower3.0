import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type BreakdownRow = {
  service_connection_id: string;
  consumer_number: string;
  meter_serial: string;
  meter_status: string;
  sanctioned_load_kw: number | null;
  consumed_kwh: number;
  last_reading_ts: string | null;
  tamper_events: number;
  suspect_readings: number;
  suspicion_score: number;
  suspicion_reasons: string[];
};

function scoreColor(score: number): string {
  if (score >= 40) return "var(--color-status-serious)";
  if (score >= 20) return "var(--color-status-warning)";
  if (score > 0) return "var(--color-status-warning)";
  return "var(--color-status-good)";
}

export default async function DtLossDrilldownPage({ params }: { params: Promise<{ dtId: string }> }) {
  const { dtId } = await params;
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  // RLS scopes this to the officer's own division — a DT id from another
  // division returns no rows, same as every other query in this panel.
  const { data: dt } = await supabase
    .from("distribution_transformers")
    .select("id, name")
    .eq("id", dtId)
    .maybeSingle();

  const { data: lossRows } = await supabase.rpc("dt_loss_summary");
  const lossRow = (lossRows ?? []).find((r: { dt_id: string }) => r.dt_id === dtId) as
    | { delivered_kwh: number; consumed_kwh: number; loss_pct: number | null }
    | undefined;

  const { data: breakdown } = await supabase.rpc("dt_consumer_breakdown", { p_dt_id: dtId });
  const rows = (breakdown ?? []) as BreakdownRow[];

  const nav = [
    { href: "/discom", label: "Overview" },
    { href: "/discom/connections", label: "Connections" },
    { href: "/discom/losses", label: "AT&C losses", active: true },
    { href: "/discom/netmetering", label: "Net-metering" },
    { href: "/discom/audit", label: "Audit log" },
  ];

  if (!dt) {
    return (
      <PanelShell panel="discom" email={user.email ?? ""} nav={nav}>
        <h1 className="text-2xl font-semibold mb-1">DT not found</h1>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No transformer with this id in your division. <a href="/discom/losses" className="underline">Back to the loss map →</a>
        </p>
      </PanelShell>
    );
  }

  const unaccountedKwh =
    lossRow != null ? Math.max(0, Number(lossRow.delivered_kwh) - Number(lossRow.consumed_kwh)) : null;
  const flagged = rows.filter((r) => r.suspicion_score > 0);

  return (
    <PanelShell panel="discom" email={user.email ?? ""} nav={nav}>
      <a href="/discom/losses" className="text-sm underline" style={{ color: "var(--color-text-secondary)" }}>
        ← Loss map
      </a>
      <h1 className="text-2xl font-semibold mt-2 mb-1">{dt.name} — loss localization</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        {lossRow != null ? (
          <>
            {Number(lossRow.delivered_kwh).toLocaleString("en-IN", { maximumFractionDigits: 0 })} kWh delivered at the
            DT head vs {Number(lossRow.consumed_kwh).toLocaleString("en-IN", { maximumFractionDigits: 0 })} kWh metered
            across {rows.length} consumers —{" "}
            <strong>{unaccountedKwh?.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kWh unaccounted</strong>{" "}
            ({lossRow.loss_pct != null ? `${lossRow.loss_pct}%` : "—"}). The ranking below is the meter signals an
            investigator would use to decide whom to visit first — it does not by itself prove theft.
          </>
        ) : (
          "No DT-head metering for this transformer — loss can't be attributed without a delivered-energy reference."
        )}
      </p>

      {rows.length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)" }}>No consumer meters on this DT yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                {["Consumer", "Meter", "Consumed (kWh)", "Signals", "Priority"].map((h) => (
                  <th key={h} className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.service_connection_id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-3 pr-4 font-medium">{r.consumer_number}</td>
                  <td className="py-3 pr-4 tabular" style={{ color: "var(--color-text-secondary)" }}>
                    {r.meter_serial}
                    {r.meter_status !== "active" && (
                      <span style={{ color: "var(--color-status-serious)" }}> · {r.meter_status}</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 tabular">
                    {Number(r.consumed_kwh).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-3 pr-4">
                    {r.suspicion_reasons.length === 0 ? (
                      <span style={{ color: "var(--color-text-secondary)" }}>—</span>
                    ) : (
                      <ul className="list-disc list-inside">
                        {r.suspicion_reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular"
                      style={{
                        color: scoreColor(r.suspicion_score),
                        background: `color-mix(in oklab, ${scoreColor(r.suspicion_score)} 12%, transparent)`,
                      }}
                    >
                      {r.suspicion_score}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {flagged.length === 0 && rows.length > 0 && (
        <p className="text-sm mt-4" style={{ color: "var(--color-text-secondary)" }}>
          No consumer on this DT is carrying a loss signal right now — the unaccounted energy is more likely technical
          (transformer/line losses) than commercial.
        </p>
      )}
    </PanelShell>
  );
}
