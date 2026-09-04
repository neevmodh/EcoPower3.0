"use client";

// Real rows from the plans table, passed in from the server component that
// queried them (#77). The monthly/annual toggle filters on the plan's own
// billing_cycle column — there is no second, marketing-only price list that
// could drift from what a subscribing consumer actually sees.

import { useState } from "react";
import { formatInrFromPaise } from "@ecopower/shared";
import { PanelIcon } from "@/components/Icon";

export type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  price_paise_per_month: number;
  price_paise_per_year: number | null;
  billing_cycle: string;
  services: Array<{ name: string; unit: string; quantity: number }>;
};

const UNIT_LABEL: Record<string, string> = {
  kwh: "kWh",
  availability_hours: "hrs",
  ton_hours: "ton-hrs",
  lumen_hours: "lumen-hrs",
};

export function PricingTable({ plans }: { plans: PlanRow[] }) {
  const cycles = Array.from(new Set(plans.map((p) => p.billing_cycle)));
  const [cycle, setCycle] = useState(cycles.includes("monthly") ? "monthly" : (cycles[0] ?? "monthly"));

  const shown = plans.filter((p) => p.billing_cycle === cycle);
  // The zero-base-fee plan is the entry point in either cycle — it has no
  // annual variant, so it would silently disappear from the annual view.
  const payg = plans.find((p) => p.price_paise_per_month === 0 && p.billing_cycle !== cycle);
  const list = payg ? [payg, ...shown] : shown;

  return (
    <div>
      {cycles.length > 1 && (
        <div className="flex gap-2 justify-center mt-7">
          {cycles.map((c) => (
            <button key={c} type="button" className={`chip h-9 ${cycle === c ? "chip-on" : ""}`} onClick={() => setCycle(c)}>
              {c === "monthly" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 mt-9 items-start" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(252px, 1fr))" }}>
        {list.map((plan) => {
          const annual = plan.billing_cycle === "annual" && plan.price_paise_per_year != null;
          const price = annual ? BigInt(plan.price_paise_per_year ?? 0) : BigInt(plan.price_paise_per_month);
          const free = plan.price_paise_per_month === 0 && !annual;
          const featured = !free && plan.price_paise_per_month === Math.min(...list.filter((p) => p.price_paise_per_month > 0).map((p) => p.price_paise_per_month));

          return (
            <div
              key={plan.id}
              className="rounded-card border p-6 card-lift relative"
              style={{
                borderColor: featured ? "var(--color-categorical-third)" : "var(--color-border)",
                background: "var(--color-surface-card)",
              }}
            >
              {featured && (
                <span
                  className="mono absolute -top-2.5 left-5 text-[9.5px] font-semibold px-2.5 py-0.5 rounded-control"
                  style={{ background: "var(--color-categorical-third)", color: "#04140b", letterSpacing: ".12em" }}
                >
                  ENTRY PLAN
                </span>
              )}
              <div className="font-display font-semibold text-base">{plan.name}</div>
              <p className="text-xs mt-2 min-h-[52px]" style={{ color: "var(--color-text-secondary)", textWrap: "pretty" }}>
                {plan.description}
              </p>
              <div className="mono text-3xl font-semibold mt-2">
                {formatInrFromPaise(price)}
                <span className="text-xs font-normal" style={{ color: "var(--color-text-tertiary)" }}>
                  {free ? " base" : annual ? " /year" : " /month"}
                </span>
              </div>

              <div className="h-px my-5" style={{ background: "var(--color-border)" }} />

              {plan.services.length === 0 ? (
                <div className="flex gap-2.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  <span style={{ color: "var(--color-categorical-third)", marginTop: 1 }}>
                    <PanelIcon name="check" size={15} />
                  </span>
                  Metered usage only — no included quantity
                </div>
              ) : (
                plan.services.map((s) => (
                  <div key={s.name} className="flex gap-2.5 text-xs mb-2.5" style={{ color: "var(--color-text-secondary)" }}>
                    <span
                      style={{ color: featured ? "var(--color-categorical-third)" : "var(--color-text-tertiary)", marginTop: 1 }}
                    >
                      <PanelIcon name="check" size={15} />
                    </span>
                    <span>
                      {s.name} — <span className="mono">{s.quantity}</span> {UNIT_LABEL[s.unit] ?? s.unit}
                    </span>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
