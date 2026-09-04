import { redirect } from "next/navigation";
import { formatInrFromPaise } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { SocietyNoticeForm } from "@/components/SocietyNoticeForm";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const CATEGORY_LABEL: Record<string, string> = {
  infrastructure: "Infrastructure",
  dg_fuel: "DG set",
  lighting: "Lighting",
  other: "Other",
};

type Charge = {
  id: string;
  label: string;
  category: string;
  amount_paise: number;
  split_basis: string;
  society_org_id: string;
};

export default async function SocietyCommonPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;
  const isAdmin = scope.roles.includes("society_admin");

  const { data: units } = await supabase
    .from("service_connections")
    .select("id, consumer_number, allocation_pct, society_org_id");
  const flats = units ?? [];
  const societyOrgId = flats.find((u) => u.society_org_id)?.society_org_id ?? null;
  const unitCount = flats.length;

  const { data: chargesRaw } = await supabase
    .from("society_common_charges")
    .select("id, label, category, amount_paise, split_basis, society_org_id")
    .order("period_start", { ascending: false });
  const charges = (chargesRaw ?? []) as Charge[];

  const { data: notices } = await supabase
    .from("society_notices")
    .select("id, title, body, pinned, created_at")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  const totalPaise = charges.reduce((s, c) => s + Number(c.amount_paise), 0);

  // Per-flat share: equal charges ÷ unitCount; allocation charges × alloc%.
  function shareForFlat(allocPct: number): number {
    return charges.reduce((sum, c) => {
      const amt = Number(c.amount_paise);
      if (c.split_basis === "allocation") return sum + amt * (allocPct / 100);
      return sum + (unitCount > 0 ? amt / unitCount : 0);
    }, 0);
  }

  return (
    <PanelShell
      panel="society"
      email={user.email ?? ""}
      nav={[
        { href: "/society", label: "Overview" },
        { href: "/society/units", label: "Units" },
        { href: "/society/allocation", label: "Allocation" },
        { href: "/society/common", label: "Common area", active: true },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">Common area &amp; notices</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Shared costs — lifts, pumps, lighting, DG — split across {unitCount} flats. Fixed infra is split equally; DG
        run-hours split by each flat&apos;s allocation share.
      </p>

      {charges.length === 0 ? (
        <p className="text-sm mb-8" style={{ color: "var(--color-text-secondary)" }}>
          No common charges recorded for the current period.
        </p>
      ) : (
        <div className="grid gap-6 mb-10" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <div
            className="rounded-card border card-shadow p-5"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <div className="eyebrow mb-3">This period&apos;s charges</div>
            {charges.map((c) => (
              <div key={c.id} className="flex justify-between py-2 border-b last:border-b-0 text-sm" style={{ borderColor: "var(--color-border)" }}>
                <span>
                  {c.label}
                  <span className="mono text-[11px] ml-2" style={{ color: "var(--color-text-tertiary)" }}>
                    {CATEGORY_LABEL[c.category] ?? c.category} · {c.split_basis === "allocation" ? "by share" : "equal split"}
                  </span>
                </span>
                <span className="mono">{formatInrFromPaise(BigInt(Number(c.amount_paise)))}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 mt-1 text-sm font-semibold">
              <span>Total</span>
              <span className="mono">{formatInrFromPaise(BigInt(totalPaise))}</span>
            </div>
          </div>

          <div
            className="rounded-card border card-shadow p-5"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <div className="eyebrow mb-3">Per-flat split</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                  <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Flat</th>
                  <th className="py-1.5 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Share %</th>
                  <th className="py-1.5 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Common charge</th>
                </tr>
              </thead>
              <tbody>
                {flats.map((u) => (
                  <tr key={u.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                    <td className="py-1 pr-4 mono">{u.consumer_number}</td>
                    <td className="py-1 pr-4 text-right mono">{u.allocation_pct != null ? `${u.allocation_pct}%` : "—"}</td>
                    <td className="py-1 text-right mono">
                      {formatInrFromPaise(BigInt(Math.round(shareForFlat(Number(u.allocation_pct ?? 0)))))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">Notice board</h2>
      </div>
      <div className="grid gap-6" style={{ gridTemplateColumns: isAdmin ? "repeat(auto-fit, minmax(280px, 1fr))" : "1fr" }}>
        <div className="space-y-3">
          {(notices ?? []).length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              No notices posted.
            </p>
          ) : (
            (notices ?? []).map((n) => (
              <div
                key={n.id}
                className="rounded-card border card-shadow p-4"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  {n.pinned && (
                    <span className="mono text-[10px] rounded-full px-2 py-0.5" style={{ background: "var(--color-surface-sunken)", color: "#b394ff" }}>
                      pinned
                    </span>
                  )}
                  <span className="text-sm font-medium">{n.title}</span>
                </div>
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  {n.body}
                </p>
                <div className="mono text-[10px] mt-2" style={{ color: "var(--color-text-tertiary)" }} suppressHydrationWarning>
                  {new Date(n.created_at).toLocaleDateString("en-GB")}
                </div>
              </div>
            ))
          )}
        </div>
        {isAdmin && societyOrgId && <SocietyNoticeForm societyOrgId={societyOrgId} />}
      </div>
    </PanelShell>
  );
}
