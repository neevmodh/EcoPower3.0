import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { PricingTable, type PlanRow } from "@/components/marketing/PricingTable";
import { createClient } from "@/lib/supabase/server";

// Anon, published-catalog data — safe to cache for a few minutes.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pricing — EcoPower",
  description: "Subscribe to the energy, not the hardware. Real plan prices from the plans catalog.",
};

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Who owns the panels?",
    a: "EcoPower does, for the life of the agreement. You can buy them out at a depreciated price after year 5, or hand them back if you move.",
  },
  {
    q: "What if generation underperforms?",
    a: "On plans that carry an uptime guarantee, if measured generation falls below the guarantee line for a billing period, the shortfall is credited to your next invoice — computed by the guarantee engine, not adjusted by hand.",
  },
  {
    q: "Do I still get a DISCOM bill?",
    a: "Yes — for whatever you draw from the grid beyond your solar. The subscription and the grid charges appear in the same app, each line traceable to the two register reads that bracket it.",
  },
  {
    q: "Is there a lock-in?",
    a: "Annual plans commit for 12 months, then run month-to-month. Pay-as-you-go has no minimum term.",
  },
];

export default async function PricingPage() {
  // Anon-readable, same published-catalog exception as tariffs (#20) and the
  // landing page (#77) — one price list, no marketing-only copy of it.
  const supabase = await createClient();
  const { data } = await supabase
    .from("plans")
    .select(
      "id, name, description, price_paise_per_month, price_paise_per_year, billing_cycle, plan_services(included_quantity, service_types(name, unit))",
    )
    .eq("active", true)
    .order("price_paise_per_month");

  const plans: PlanRow[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price_paise_per_month: Number(p.price_paise_per_month),
    price_paise_per_year: p.price_paise_per_year == null ? null : Number(p.price_paise_per_year),
    billing_cycle: p.billing_cycle,
    services: (
      (p.plan_services ?? []) as unknown as Array<{
        included_quantity: number;
        service_types: { name: string; unit: string };
      }>
    ).map((s) => ({ name: s.service_types.name, unit: s.service_types.unit, quantity: s.included_quantity })),
  }));

  return (
    <div style={{ background: "var(--color-surface)", overflowX: "hidden" }}>
      <MarketingNav active="pricing" />

      <section className="relative overflow-hidden">
        <div className="grid-backdrop" />
        <div className="aurora" />
        <div className="relative z-10 max-w-[1000px] mx-auto px-10 pt-20 pb-12 text-center">
          <div className="eyebrow">Pricing</div>
          <h1 className="text-[52px] mt-4 font-bold leading-[1.05]" style={{ textWrap: "balance" }}>
            Subscribe to the energy, not the hardware.
          </h1>
          <p className="mt-5 text-[17px] max-w-[56ch] mx-auto" style={{ color: "var(--color-text-secondary)" }}>
            EcoPower owns and maintains the rooftop array, storage and smart meter. You pay a predictable monthly fee and
            keep what you save — no upfront cheque, no AMC, no inverter to replace in year seven.
          </p>
        </div>
      </section>

      <section className="max-w-[1100px] mx-auto px-10 pb-8">
        {plans.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)" }}>Plan catalog is being populated.</p>
        ) : (
          <PricingTable plans={plans} />
        )}
        <p className="mt-6 text-xs" style={{ color: "var(--color-text-tertiary)" }}>
          Prices shown for the Ahmedabad / North Gujarat service area and confirmed after a roof survey. Residual grid
          consumption is billed by your DISCOM at the standard GERC tariff and shown in the same app.
        </p>
      </section>

      <section className="border-t" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}>
        <div className="max-w-[1000px] mx-auto px-10 py-16">
          <h2 className="text-[26px] font-bold">Questions people ask before subscribing</h2>
          <div className="mt-8 grid md:grid-cols-2 gap-x-12 gap-y-8">
            {FAQ.map((f) => (
              <div key={f.q}>
                <h3 className="text-[15px] font-semibold">{f.q}</h3>
                <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  {f.a}
                </p>
              </div>
            ))}
          </div>

          <div
            className="mt-14 flex flex-wrap items-center gap-5 rounded-card border p-6"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <div className="flex-1 min-w-[240px]">
              <h3 className="text-[16px] font-bold">See your number in five minutes.</h3>
              <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                Sign in to the live demo — every screen, every role, real data.
              </p>
            </div>
            <Link href="/login" className="btn btn-primary h-11 px-6">
              Open live demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
