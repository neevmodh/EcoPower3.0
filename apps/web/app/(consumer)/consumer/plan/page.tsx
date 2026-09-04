import { redirect } from "next/navigation";
import { formatInrFromPaise } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { consumerNav } from "@/lib/panelNav";
import { PanelIcon, type IconName } from "@/components/Icon";
import { SubscribeButton, SubscriptionLifecycleActions } from "@/components/SubscriptionActions";
import { NetMeteringApplyForm } from "@/components/NetMeteringApplyForm";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const SERVICE_ICON: Record<string, IconName> = {
  solar_kwh: "sun",
  backup_availability: "battery",
  cooling_ton_hours: "gauge",
  lighting: "bolt",
};

const UNIT_LABEL: Record<string, string> = {
  kwh: "kWh",
  availability_hours: "hrs",
  ton_hours: "ton-hrs",
  lumen_hours: "lumen-hrs",
};

const CYCLE_TABS = [
  { key: "monthly", label: "Monthly" },
  { key: "annual", label: "Annual" },
  { key: "payg", label: "Pay-as-you-go" },
] as const;

export default async function ConsumerPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleParam } = await searchParams;
  const cycle = CYCLE_TABS.find((t) => t.key === cycleParam)?.key ?? "monthly";

  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  const { data: connections } = await supabase
    .from("service_connections")
    .select("id, consumer_number")
    .order("consumer_number");

  const connectionIds = (connections ?? []).map((c) => c.id);

  const { data: activeSubscription } =
    connectionIds.length > 0
      ? await supabase
          .from("subscriptions")
          .select("id, status, plan_id, started_at, paused_at, plans(name, price_paise_per_month)")
          .in("service_connection_id", connectionIds)
          .in("status", ["active", "paused"])
          .maybeSingle()
      : { data: null };

  const { data: allPlans } = await supabase
    .from("plans")
    .select(
      "id, code, name, description, price_paise_per_month, price_paise_per_year, billing_cycle, plan_services(included_quantity, guarantee_metric, guarantee_contracted_value, service_types(code, name, unit))",
    )
    .eq("active", true)
    .order("price_paise_per_month");

  const { data: pvAsset } =
    connectionIds.length > 0
      ? await supabase.from("assets").select("id, capacity_kw").eq("asset_type", "pv_array").in("service_connection_id", connectionIds).maybeSingle()
      : { data: null };

  const { data: netmeteringApp } =
    connectionIds.length > 0
      ? await supabase
          .from("netmetering_applications")
          .select("id, status, capacity_kw, decision_notes")
          .in("service_connection_id", connectionIds)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

  const plans = (allPlans ?? []).filter((p) =>
    cycle === "payg" ? p.code === "solar_payg" : p.billing_cycle === cycle && p.code !== "solar_payg",
  );

  const currentPlanId = activeSubscription?.plan_id;
  const currentPlan = activeSubscription?.plans as unknown as { name: string; price_paise_per_month: number } | null;
  const otherPlans = (allPlans ?? [])
    .filter((p) => p.id !== currentPlanId)
    .map((p) => ({ id: p.id, name: p.name }));

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      nav={consumerNav("/consumer/plan")}
    >
      <h1 className="text-2xl font-semibold mb-2">Your plan</h1>
      <p className="text-sm mb-8" style={{ color: "var(--color-text-secondary)" }}>
        Solar, backup, cooling, and lighting — one subscription, billed on real meter reads.
      </p>

      {activeSubscription && currentPlan ? (
        <div
          className="rounded-card border card-shadow p-6 mb-10"
          style={{
            borderColor: "var(--color-categorical-third)",
            background: "color-mix(in oklab, var(--color-categorical-third) 6%, var(--color-surface-card))",
          }}
        >
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold on-accent"
                  style={{ background: "var(--color-categorical-third)" }}
                >
                  {activeSubscription.status === "active" ? "Active" : "Paused"}
                </span>
                <span className="text-lg font-semibold">{currentPlan.name}</span>
              </div>
              <div className="text-sm tabular" style={{ color: "var(--color-text-secondary)" }}>
                {formatInrFromPaise(BigInt(currentPlan.price_paise_per_month))}/month · since{" "}
                {new Date(activeSubscription.started_at).toLocaleDateString("en-IN")}
              </div>
            </div>
            <SubscriptionLifecycleActions
              subscriptionId={activeSubscription.id}
              status={activeSubscription.status}
              otherPlans={otherPlans}
            />
          </div>
        </div>
      ) : connectionIds.length === 0 ? (
        <p className="mb-10 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No connection linked to this account yet — nothing to subscribe.
        </p>
      ) : (
        <p className="mb-10 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No active subscription. Pick a plan below.
        </p>
      )}

      {pvAsset && (
        <div className="rounded-card border card-shadow p-5 mb-10" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="text-sm font-semibold mb-1">Net-metering</h2>
          {netmeteringApp ? (
            <div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium on-accent mb-2"
                style={{
                  background:
                    netmeteringApp.status === "approved"
                      ? "var(--color-status-good)"
                      : netmeteringApp.status === "rejected"
                        ? "var(--color-status-critical)"
                        : "var(--color-status-warning)",
                }}
              >
                {netmeteringApp.status.replace("_", " ")}
              </span>
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                {netmeteringApp.capacity_kw} kW application
                {netmeteringApp.decision_notes ? ` — ${netmeteringApp.decision_notes}` : ""}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>
                Your {pvAsset.capacity_kw} kW rooftop array isn&apos;t registered for net-metering yet.
              </p>
              <NetMeteringApplyForm
                serviceConnectionId={connectionIds[0]}
                assetId={pvAsset.id}
                defaultCapacityKw={pvAsset.capacity_kw}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {CYCLE_TABS.map((t) => (
          <a
            key={t.key}
            href={`/consumer/plan?cycle=${t.key}`}
            className="rounded-control px-4 py-2 text-sm font-semibold transition-colors duration-state"
            style={
              cycle === t.key
                ? { background: "var(--color-categorical-third)", color: "#fff" }
                : { border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }
            }
          >
            {t.label}
          </a>
        ))}
      </div>

      {cycle === "annual" && (
        <p className="text-xs mb-4" style={{ color: "var(--color-text-secondary)" }}>
          Billed once a year — two months cheaper than paying monthly.
        </p>
      )}
      {cycle === "payg" && (
        <p className="text-xs mb-4" style={{ color: "var(--color-text-secondary)" }}>
          No base fee. Every kWh is billed at the overage rate — for low, irregular usage.
        </p>
      )}

      <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {plans.length === 0 && (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            No plans on this cycle yet.
          </p>
        )}
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const services = (plan.plan_services ?? []) as unknown as Array<{
            included_quantity: number;
            guarantee_metric: string | null;
            guarantee_contracted_value: number | null;
            service_types: { code: string; name: string; unit: string };
          }>;

          return (
            <div
              key={plan.id}
              className="rounded-card border card-shadow p-6 flex flex-col"
              style={{
                borderColor: isCurrent ? "var(--color-categorical-third)" : "var(--color-border)",
                borderWidth: isCurrent ? 2 : 1,
                background: "var(--color-surface-card)",
              }}
            >
              <div className="mb-4">
                <div className="text-lg font-semibold mb-1">{plan.name}</div>
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  {plan.description}
                </p>
              </div>

              <div className="text-3xl font-semibold tracking-tight mb-1 tabular">
                {cycle === "annual" && plan.price_paise_per_year != null
                  ? formatInrFromPaise(BigInt(plan.price_paise_per_year))
                  : formatInrFromPaise(BigInt(plan.price_paise_per_month))}
              </div>
              <div className="text-xs mb-5" style={{ color: "var(--color-text-secondary)" }}>
                {cycle === "annual" ? "per year" : cycle === "payg" ? "base fee — usage billed separately" : "per month"}
              </div>

              <ul className="flex-1 space-y-2.5 mb-6">
                {services.map((s) => (
                  <li key={s.service_types.code} className="flex items-start gap-2 text-sm">
                    <span style={{ color: "var(--color-categorical-third)" }}>
                      <PanelIcon name={SERVICE_ICON[s.service_types.code] ?? "check"} size={15} />
                    </span>
                    <span>
                      {s.service_types.name} —{" "}
                      <span className="tabular font-medium">
                        {s.included_quantity} {UNIT_LABEL[s.service_types.unit] ?? s.service_types.unit}
                      </span>
                      {s.guarantee_metric && s.guarantee_contracted_value != null && (
                        <span
                          className="block text-xs mt-0.5"
                          style={{ color: "var(--color-categorical-third)" }}
                        >
                          {(s.guarantee_contracted_value * 100).toFixed(0)}% availability guarantee, settled
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div
                  className="text-center text-sm font-semibold rounded-control py-2.5"
                  style={{ color: "var(--color-categorical-third)", border: "1px solid var(--color-categorical-third)" }}
                >
                  Current plan
                </div>
              ) : !activeSubscription && connectionIds[0] ? (
                <SubscribeButton planId={plan.id} serviceConnectionId={connectionIds[0]} />
              ) : (
                <div
                  className="text-center text-sm rounded-control py-2.5"
                  style={{ color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                >
                  Switch from your plan card above
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}
