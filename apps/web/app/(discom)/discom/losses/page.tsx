import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type LossRow = { dt_id: string; dt_name: string; delivered_kwh: number; consumed_kwh: number; loss_pct: number | null };

function lossColor(pct: number | null): string {
  if (pct == null) return "var(--color-text-secondary)";
  if (pct <= 12) return "var(--color-status-good)"; // RDSS pan-India target band
  if (pct <= 18) return "var(--color-status-warning)";
  return "var(--color-status-serious)";
}

export default async function DiscomLossesPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: lossRows } = await supabase.rpc("dt_loss_summary");
  const rows = (lossRows ?? []) as LossRow[];

  return (
    <PanelShell
      panel="discom"
      email={user.email ?? ""}
      nav={[
        { href: "/discom", label: "Overview" },
        { href: "/discom/connections", label: "Connections" },
        { href: "/discom/losses", label: "AT&C losses", active: true },
        { href: "/discom/netmetering", label: "Net-metering" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">DT loss map</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Delivered (DT-head meter) vs. consumed (summed consumer meters), computed from real register reads — not a
        UI badge. National AT&C average is 16.16% (Ministry of Power, FY25); RDSS targets 12–15%. Open a DT to
        localize its loss to specific consumers.
      </p>

      {rows.length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)" }}>
          No DT-head metering in this division yet — loss can't be computed without a delivered-energy reference.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                <th className="py-2 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>DT</th>
                <th className="py-2 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Delivered (kWh)</th>
                <th className="py-2 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Consumed (kWh)</th>
                <th className="py-2 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Loss</th>
                <th className="py-2 font-medium" style={{ color: "var(--color-text-secondary)" }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.dt_id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-3 pr-4 font-medium">
                    <a href={`/discom/losses/${r.dt_id}`} className="underline">
                      {r.dt_name}
                    </a>
                  </td>
                  <td className="py-3 pr-4 text-right tabular">{Number(r.delivered_kwh).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                  <td className="py-3 pr-4 text-right tabular">{Number(r.consumed_kwh).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                  <td className="py-3 pr-4 text-right tabular font-semibold" style={{ color: lossColor(r.loss_pct) }}>
                    {r.loss_pct != null ? `${r.loss_pct}%` : "—"}
                  </td>
                  <td className="py-3">
                    <div className="rounded-full overflow-hidden" style={{ width: 100, height: 6, background: "var(--color-border)" }}>
                      <div
                        style={{
                          width: `${Math.min(100, ((r.loss_pct ?? 0) / 25) * 100)}%`,
                          height: "100%",
                          background: lossColor(r.loss_pct),
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  );
}
