import { redirect } from "next/navigation";
import { formatInrFromPaise } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { PanelIcon } from "@/components/Icon";
import { StatTile } from "@/components/StatTile";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const METRIC_LABEL: Record<string, string> = {
  cuf: "Capacity utilisation factor",
  performance_ratio: "Performance ratio",
  availability_pct: "Availability",
  dmge_kwh: "Deemed minimum generation",
};

type Settlement = {
  service_guarantee_id: string;
  window_start: string;
  window_end: string;
  contracted: number;
  achieved: number;
  shortfall: number;
  credit_paise: number;
};

type Guarantee = {
  id: string;
  metric: string;
  contracted_value: number;
  measurement_window: string;
  cap_paise: number | null;
  effective_from: string;
  service_connections: unknown;
};

function fmtValue(metric: string, v: number): string {
  return metric === "dmge_kwh" ? `${v.toFixed(0)} kWh` : `${(v * 100).toFixed(1)}%`;
}

export default async function OperatorGuaranteePage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  // 0029: resco_ops/resco_admin can now read service_guarantees + settlements
  // for connections the org services (asset-org join). No WHERE clause on org
  // here — RLS is the scope.
  const { data: guaranteesRaw } = await supabase
    .from("service_guarantees")
    .select("id, metric, contracted_value, measurement_window, cap_paise, effective_from, service_connections(consumer_number)")
    .order("effective_from", { ascending: false });

  const guarantees = (guaranteesRaw ?? []) as Guarantee[];

  const { data: settlementsRaw } = await supabase
    .from("guarantee_settlements")
    .select("service_guarantee_id, window_start, window_end, contracted, achieved, shortfall, credit_paise")
    .order("window_start", { ascending: false });

  const settlements = (settlementsRaw ?? []) as Settlement[];
  const latestByGuarantee = new Map<string, Settlement>();
  for (const s of settlements) {
    if (!latestByGuarantee.has(s.service_guarantee_id)) latestByGuarantee.set(s.service_guarantee_id, s);
  }

  const totalCreditPaise = settlements.reduce((sum, s) => sum + Number(s.credit_paise), 0);
  const belowGuarantee = [...latestByGuarantee.values()].filter((s) => Number(s.shortfall) > 0).length;
  const cn = (g: Guarantee) => (g.service_connections as { consumer_number: string } | null)?.consumer_number ?? "—";

  return (
    <PanelShell
      panel="operator"
      email={user.email ?? ""}
      nav={[
        { href: "/operator", label: "Fleet" },
        { href: "/operator/devices", label: "Devices" },
        { href: "/operator/guarantee", label: "Guarantees", active: true },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Performance guarantees</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        The contracted generation terms your org is the counterparty to, and every settled window. Each settlement traces
        to the two meter reads that bracket it — the same provenance an invoice line carries.
      </p>

      <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        <StatTile icon={<PanelIcon name="shield" />} label="Active guarantees" value={guarantees.length} />
        <StatTile
          icon={<PanelIcon name="alert" />}
          label="Below guarantee · latest window"
          value={latestByGuarantee.size > 0 ? belowGuarantee : null}
          state={belowGuarantee > 0 ? "warning" : undefined}
        />
        <StatTile
          icon={<PanelIcon name="rupee" />}
          label="Credit accrued · all windows"
          valuePaise={BigInt(totalCreditPaise)}
        />
        <StatTile icon={<PanelIcon name="clock" />} label="Windows settled" value={settlements.length} />
      </div>

      {guarantees.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No performance guarantees on the connections your org services.
        </p>
      ) : (
        <div
          className="rounded-card border card-shadow overflow-hidden"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                <th className="p-3 font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>Site</th>
                <th className="p-3 font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>Metric</th>
                <th className="p-3 font-medium text-xs text-right" style={{ color: "var(--color-text-secondary)" }}>Contracted</th>
                <th className="p-3 font-medium text-xs text-right" style={{ color: "var(--color-text-secondary)" }}>Latest achieved</th>
                <th className="p-3 font-medium text-xs text-right" style={{ color: "var(--color-text-secondary)" }}>Credit (window)</th>
              </tr>
            </thead>
            <tbody>
              {guarantees.map((g) => {
                const s = latestByGuarantee.get(g.id);
                const missed = s != null && Number(s.shortfall) > 0;
                return (
                  <tr key={g.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                    <td className="p-3 mono">{cn(g)}</td>
                    <td className="p-3">
                      {METRIC_LABEL[g.metric] ?? g.metric}
                      <span className="mono text-xs ml-2" style={{ color: "var(--color-text-tertiary)" }}>
                        {g.measurement_window}
                      </span>
                    </td>
                    <td className="p-3 text-right mono">{fmtValue(g.metric, Number(g.contracted_value))}</td>
                    <td className="p-3 text-right mono" style={{ color: missed ? "var(--color-status-serious)" : undefined }}>
                      {s ? fmtValue(g.metric, Number(s.achieved)) : "—"}
                    </td>
                    <td className="p-3 text-right mono">
                      {s ? formatInrFromPaise(BigInt(Number(s.credit_paise))) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  );
}
