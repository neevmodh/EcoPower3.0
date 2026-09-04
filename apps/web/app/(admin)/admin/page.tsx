import { redirect } from "next/navigation";
import { formatInrFromPaise } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { adminNav } from "@/lib/panelNav";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Overview = {
  consumers: number;
  meters: number;
  meters_active: number;
  readings_total: number;
  readings_24h: number;
  utilities: number;
  divisions: number;
  invoiced_paise: number;
  collected_paise: number;
  tickets_open: number;
  outages_active: number;
  subs_active: number;
  users: number;
  p2p_open: number;
  self_reads_pending: number;
};

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
      <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </div>
      <div className="text-2xl font-semibold tabular" style={{ color: tone }}>
        {value}
      </div>
      {hint && (
        <div className="mono text-[10px] mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const [{ data: ovRaw }, { data: utilities }] = await Promise.all([
    supabase.rpc("platform_overview"),
    supabase
      .from("utilities")
      .select("code, short_name, role, headquarters, approx_consumers, atc_loss_pct")
      .order("role")
      .order("code"),
  ]);

  const ov = (ovRaw ?? {}) as Partial<Overview>;
  const collectionPct =
    ov.invoiced_paise && ov.invoiced_paise > 0
      ? ((ov.collected_paise ?? 0) / ov.invoiced_paise) * 100
      : null;

  return (
    <PanelShell
      panel="admin"
      email={user.email ?? ""}
      scopeNote="roles [platform_admin]\nno org / division claim\nfull cross-tenant access"
      nav={adminNav("/admin")}
    >
      <h1 className="text-2xl font-semibold mb-1">Platform overview</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Every tenant, every meter, every rupee — this is the one session Row-Level Security does not confine. All numbers
        below are unfiltered.
      </p>

      <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
        <Kpi label="Consumers" value={(ov.consumers ?? 0).toLocaleString("en-IN")} hint={`${ov.users ?? 0} users`} />
        <Kpi
          label="Meters"
          value={(ov.meters ?? 0).toLocaleString("en-IN")}
          hint={`${ov.meters_active ?? 0} active`}
        />
        <Kpi
          label="Readings / 24h"
          value={(ov.readings_24h ?? 0).toLocaleString("en-IN")}
          hint={`${((ov.readings_total ?? 0) / 1e6).toFixed(1)} M total`}
        />
        <Kpi label="Distribution utilities" value={String(ov.utilities ?? 0)} hint={`${ov.divisions ?? 0} divisions`} />
        <Kpi label="Invoiced (all time)" value={formatInrFromPaise(BigInt(ov.invoiced_paise ?? 0))} />
        <Kpi
          label="Collection efficiency"
          value={collectionPct != null ? `${collectionPct.toFixed(1)}%` : "—"}
          tone={collectionPct != null && collectionPct < 90 ? "var(--color-status-warning)" : "var(--color-status-good)"}
        />
        <Kpi label="Active subscriptions" value={String(ov.subs_active ?? 0)} />
        <Kpi
          label="Open tickets"
          value={String(ov.tickets_open ?? 0)}
          tone={(ov.tickets_open ?? 0) > 0 ? "var(--color-status-warning)" : undefined}
        />
        <Kpi
          label="Active outages"
          value={String(ov.outages_active ?? 0)}
          tone={(ov.outages_active ?? 0) > 0 ? "var(--color-status-serious)" : "var(--color-status-good)"}
        />
        <Kpi label="P2P open offers" value={String(ov.p2p_open ?? 0)} />
        <Kpi
          label="Self-reads pending"
          value={String(ov.self_reads_pending ?? 0)}
          tone={(ov.self_reads_pending ?? 0) > 0 ? "var(--color-status-warning)" : undefined}
        />
      </div>

      <div
        className="rounded-card border card-shadow overflow-hidden"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          <span className="eyebrow">Gujarat power sector — reference dataset</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
              <th className="p-3 font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>Code</th>
              <th className="p-3 font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>Name</th>
              <th className="p-3 font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>Role</th>
              <th className="p-3 font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>HQ</th>
              <th className="p-3 font-medium text-xs text-right" style={{ color: "var(--color-text-secondary)" }}>Consumers</th>
              <th className="p-3 font-medium text-xs text-right" style={{ color: "var(--color-text-secondary)" }}>AT&amp;C loss</th>
            </tr>
          </thead>
          <tbody>
            {(utilities ?? []).map((u) => (
              <tr key={u.code} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                <td className="p-3 mono">{u.code}</td>
                <td className="p-3">{u.short_name}</td>
                <td className="p-3" style={{ color: "var(--color-text-secondary)" }}>{u.role}</td>
                <td className="p-3 mono" style={{ color: "var(--color-text-secondary)" }}>{u.headquarters ?? "—"}</td>
                <td className="p-3 text-right mono">
                  {u.approx_consumers != null ? `${(u.approx_consumers / 100000).toFixed(0)} L` : "—"}
                </td>
                <td className="p-3 text-right mono">{u.atc_loss_pct != null ? `${u.atc_loss_pct}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}
