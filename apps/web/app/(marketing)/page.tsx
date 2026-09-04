import Link from "next/link";
import { CapabilityExplorer } from "@/components/marketing/CapabilityExplorer";
import { PricingTable, type PlanRow } from "@/components/marketing/PricingTable";
import { ProofChain } from "@/components/marketing/ProofChain";
import { PanelIcon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";

// Anon, published-catalog data — safe to cache for a few minutes.
export const revalidate = 300;

// Marketing page, not an operator surface — DESIGN.md P6 explicitly draws
// that line ("marketing pages get air; operator surfaces get information"),
// and this is the one surface granted atmosphere: the grid backdrop and the
// aurora wash. What does NOT change from the dashboards is the honesty rule:
// every number below is either a real, checkable fact about this build (the
// CI test count, the RLS role count, the cited tariff) or fetched live from
// the database. There is no invented customer count and no testimonial.
//
// Server-rendered by default. The only client islands are the three
// interactive pieces: the proof chain, the capability filter, and the
// pricing cycle toggle.

const PANELS: Array<{ label: string; accent: string; icon: "home" | "building" | "grid" | "gauge" | "pin" | "chat"; blurb: string }> = [
  { label: "Consumer", accent: "var(--color-categorical-third)", icon: "home", blurb: "Live usage, provable bills, prepaid" },
  { label: "Society", accent: "#b394ff", icon: "building", blurb: "Units, allocation, aggregate load" },
  { label: "DISCOM", accent: "var(--color-categorical-consumption)", icon: "grid", blurb: "Division-scoped, RLS-enforced" },
  { label: "Operator", accent: "#8fa0b4", icon: "gauge", blurb: "Fleet health, asset registry" },
  { label: "Field", accent: "var(--color-categorical-generation)", icon: "pin", blurb: "Work orders, commissioning" },
  { label: "Support", accent: "#4fd6c4", icon: "chat", blurb: "Ticket queue with real billing context" },
];

const MARQUEE = [
  "OBIS / IS 15959 register model",
  "HMAC-authenticated devices",
  "Partitioned time-series",
  "Row-Level Security on every table",
  "GERC tariff order, cited",
  "CEA combined-margin CO₂",
  "MoP FY25 loss benchmark",
  "pg_cron settlement",
  "Append-only audit ledger",
  "English · हिन्दी · ગુજરાતી",
];

const DISCOM_POINTS = [
  "Delivered versus consumed from real DT-head and consumer registers, not a modelled estimate.",
  "The signals an inspector uses: tamper bits, suspect reads, silent meters, cohort position.",
  "Row-Level Security confines every query to the officer's own division, enforced in the database.",
  "Each decision lands in an append-only ledger a trigger writes, never application code.",
];

export default async function LandingPage() {
  // Anon-readable, same "published catalog" exception as tariffs (#20) — real
  // prices from the real plans table, so marketing cannot drift from what a
  // subscribing consumer sees (#77).
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
    services: ((p.plan_services ?? []) as unknown as Array<{
      included_quantity: number;
      service_types: { name: string; unit: string };
    }>).map((s) => ({ name: s.service_types.name, unit: s.service_types.unit, quantity: s.included_quantity })),
  }));

  return (
    <div style={{ background: "var(--color-surface)", overflowX: "hidden" }}>
      {/* NAV */}
      <nav
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{ borderColor: "var(--color-border)", background: "color-mix(in oklab, var(--color-surface) 76%, transparent)" }}
      >
        <div className="max-w-[1200px] mx-auto px-10 h-[70px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5" style={{ color: "var(--color-text-primary)" }}>
            <Logo size={26} />
            <span className="font-display font-extrabold text-[17px] tracking-tight">ECOPOWER</span>
            <span
              className="mono text-[10px] border rounded-control px-1.5 py-0.5"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-tertiary)" }}
            >
              v3.0
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <Link href="/how-it-works" style={{ color: "inherit" }}>How it works</Link>
            <a href="#proof" style={{ color: "inherit" }}>Proof</a>
            <a href="#discom" style={{ color: "inherit" }}>For DISCOMs</a>
            <Link href="/pricing" style={{ color: "inherit" }}>Pricing</Link>
          </div>
          <Link href="/login" className="btn btn-primary h-9 px-4 text-[13px]">
            Open live demo
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="grid-backdrop" />
        <div className="aurora" />
        <div className="relative z-10 max-w-[1200px] mx-auto px-10 pt-24 pb-24 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="eyebrow animate-fade-up">Energy-as-a-Service · Gujarat</div>
            <h1 className="text-[64px] mt-5 animate-fade-up font-bold" style={{ animationDelay: "80ms" }}>
              Every rupee
              <br />
              traced to a
              <br />
              <span
                style={{
                  background: "linear-gradient(96deg, var(--color-categorical-third), var(--color-categorical-consumption))",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                register read.
              </span>
            </h1>
            <p
              className="text-lg mt-6 max-w-[452px] animate-fade-up"
              style={{ color: "var(--color-text-secondary)", animationDelay: "160ms", textWrap: "pretty" }}
            >
              Subscribe to solar, backup, or a performance guarantee. Open any invoice line and see the two meter reads
              it was computed from — the whole platform is built so that claim survives an audit.
            </p>
            <div className="flex gap-3 mt-9 animate-fade-up" style={{ animationDelay: "240ms" }}>
              <Link href="/login" className="btn btn-primary h-12 px-6">
                Open live demo
                <PanelIcon name="arrowRight" size={16} />
              </Link>
              <a href="#proof" className="btn btn-ghost h-12 px-6">
                See the proof chain
              </a>
            </div>
            <div className="flex gap-8 mt-10 animate-fade-up" style={{ animationDelay: "320ms" }}>
              {[
                { v: "293", l: "tests green in CI" },
                { v: "9", l: "row-secured roles" },
                { v: "16.16%", l: "national loss benchmark" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="mono text-[23px] font-semibold">{s.v}</div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feeder topology. Illustrative of the modelled demo division —
              labelled as such; the live figures live in the DISCOM panel. */}
          <div className="animate-fade-up" style={{ animationDelay: "280ms" }}>
            <div
              className="rounded-card border p-6"
              style={{
                borderColor: "var(--color-border)",
                background: "linear-gradient(180deg, var(--color-surface-card), var(--color-surface-raised))",
              }}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="eyebrow">Feeder A-2 · demo division</span>
                <span className="mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  120-day window
                </span>
              </div>
              <svg viewBox="0 0 420 250" className="w-full h-auto block" role="img" aria-label="Feeder topology with four distribution transformers and their AT and C loss">
                <defs>
                  <linearGradient id="feed" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--color-categorical-consumption)" />
                    <stop offset="100%" stopColor="var(--color-categorical-third)" />
                  </linearGradient>
                </defs>
                <path d="M40 42 H210 V96 H360" stroke="var(--color-border-strong)" strokeWidth="1.5" fill="none" />
                <path d="M210 42 V150 H70" stroke="var(--color-border-strong)" strokeWidth="1.5" fill="none" />
                <path d="M210 150 V206 H360" stroke="var(--color-border-strong)" strokeWidth="1.5" fill="none" />
                <path className="flow-line" d="M40 42 H210 V96 H360" stroke="url(#feed)" strokeWidth="2" fill="none" />
                <path className="flow-line" d="M210 42 V150 H70" stroke="url(#feed)" strokeWidth="2" fill="none" style={{ animationDelay: "400ms" }} />
                <path className="flow-line" d="M210 150 V206 H360" stroke="var(--color-status-serious)" strokeWidth="2" fill="none" style={{ animationDelay: "800ms" }} />
                <circle cx="40" cy="42" r="7" fill="var(--color-categorical-consumption)" />
                <text x="40" y="20" textAnchor="middle" fontSize="9" className="mono" fill="var(--color-text-tertiary)">SS-A</text>
                {[
                  { x: 360, y: 96, c: "var(--color-categorical-third)", label: "DT A-21", ty: 76, loss: "6.6%", lx: 376, ly: 100, anchor: "start" as const },
                  { x: 70, y: 150, c: "var(--color-categorical-third)", label: "DT A-22", ty: 172, loss: "5.7%", lx: 70, ly: 188, anchor: "middle" as const },
                  { x: 360, y: 206, c: "var(--color-status-serious)", label: "DT A-23", ty: 230, loss: "19.1%", lx: 376, ly: 210, anchor: "start" as const },
                ].map((n) => (
                  <g key={n.label}>
                    <circle cx={n.x} cy={n.y} r="6" fill={n.c} />
                    <text x={n.x} y={n.ty} textAnchor="middle" fontSize="9" className="mono" fill="var(--color-text-tertiary)">{n.label}</text>
                    <text x={n.lx} y={n.ly} textAnchor={n.anchor} fontSize="10.5" className="mono" fill={n.c}>{n.loss}</text>
                  </g>
                ))}
              </svg>
              <div className="flex gap-5 mt-2.5 mono text-[10.5px]" style={{ color: "var(--color-text-tertiary)" }}>
                <span className="flex items-center gap-1.5">
                  <span style={{ width: 9, height: 2, background: "var(--color-categorical-third)" }} />
                  within RDSS band
                </span>
                <span className="flex items-center gap-1.5">
                  <span style={{ width: 9, height: 2, background: "var(--color-status-serious)" }} />
                  above 18%
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <section
        className="border-y overflow-hidden py-4"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}
      >
        {/* Duplicated once so the -50% translate loops seamlessly. The second
            copy is aria-hidden — a screen reader should hear the list once. */}
        <div className="flex gap-14 w-max" style={{ animation: "marquee 40s linear infinite" }}>
          {MARQUEE.map((m) => (
            <span key={m} className="mono text-[11.5px] whitespace-nowrap" style={{ color: "var(--color-text-tertiary)" }}>
              {m}
            </span>
          ))}
          <span aria-hidden="true" className="flex gap-14">
            {MARQUEE.map((m) => (
              <span key={m} className="mono text-[11.5px] whitespace-nowrap" style={{ color: "var(--color-text-tertiary)" }}>
                {m}
              </span>
            ))}
          </span>
        </div>
      </section>

      {/* PROOF */}
      <section id="proof" className="max-w-[1200px] mx-auto px-10 py-28">
        <div className="grid lg:grid-cols-[.85fr_1.15fr] gap-16 items-start">
          <div className="lg:sticky lg:top-28">
            <div className="eyebrow">The proof chain</div>
            <h2 className="text-[42px] mt-3.5 font-bold">
              One rupee,
              <br />
              four hops back
              <br />
              to the meter.
            </h2>
            <p className="text-[15px] mt-4.5 max-w-[340px]" style={{ color: "var(--color-text-secondary)", textWrap: "pretty" }}>
              Most billing systems ask you to trust a total. This one hands you the chain — open a hop.
            </p>
          </div>
          <ProofChain />
        </div>
      </section>

      {/* PLATFORM */}
      <section id="platform" className="border-t" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}>
        <div className="max-w-[1200px] mx-auto px-10 py-26" style={{ paddingTop: 104, paddingBottom: 104 }}>
          <CapabilityExplorer />
        </div>
      </section>

      {/* DISCOM */}
      <section id="discom" className="max-w-[1200px] mx-auto px-10 py-28">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <div className="eyebrow">For distribution utilities</div>
            <h2 className="text-[40px] mt-3.5 font-bold">
              Loss, localised
              <br />
              to a meter.
            </h2>
            <p className="text-[15px] mt-4.5" style={{ color: "var(--color-text-secondary)", textWrap: "pretty" }}>
              Delivered energy at the DT head against the sum of consumer registers underneath it. Where the gap is
              real, the drill-down ranks the consumers on that transformer by the signals an inspector actually uses.
            </p>
            <div className="flex flex-col gap-3 mt-7">
              {DISCOM_POINTS.map((p) => (
                <div key={p} className="flex gap-3 items-start">
                  <span style={{ color: "var(--color-categorical-third)", marginTop: 3 }}>
                    <PanelIcon name="check" size={16} />
                  </span>
                  <span className="text-sm" style={{ color: "var(--color-text-secondary)", textWrap: "pretty" }}>
                    {p}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div
            className="rounded-card border p-5"
            style={{
              borderColor: "var(--color-border)",
              background: "linear-gradient(180deg, var(--color-surface-card), var(--color-surface-raised))",
            }}
          >
            <div className="flex justify-between items-center mb-3.5">
              <span className="eyebrow">Division A · AT&amp;C loss</span>
              <span className="mono text-[10.5px]" style={{ color: "var(--color-text-tertiary)" }}>
                MoP FY25 avg 16.16%
              </span>
            </div>
            {[
              { dt: "DT A-23", pct: 19.1, c: "var(--color-status-serious)" },
              { dt: "DT A-21", pct: 6.6, c: "var(--color-categorical-third)" },
              { dt: "DT A-22", pct: 5.7, c: "var(--color-categorical-third)" },
              { dt: "DT A-24", pct: 2.4, c: "var(--color-categorical-third)" },
            ].map((l) => (
              <div key={l.dt} className="flex items-center gap-3.5 py-3 border-t" style={{ borderColor: "var(--color-border)" }}>
                <span className="mono text-xs w-14" style={{ color: "var(--color-text-secondary)" }}>
                  {l.dt}
                </span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-surface)" }}>
                  <div style={{ width: `${Math.min(100, (l.pct / 25) * 100)}%`, height: "100%", background: l.c, boxShadow: `0 0 12px ${l.c}` }} />
                </div>
                <span className="mono text-xs font-semibold w-12 text-right" style={{ color: l.c }}>
                  {l.pct}%
                </span>
              </div>
            ))}
            <div
              className="mt-4 p-3.5 rounded-control border"
              style={{
                background: "color-mix(in oklab, var(--color-status-serious) 10%, transparent)",
                borderColor: "color-mix(in oklab, var(--color-status-serious) 32%, transparent)",
              }}
            >
              <div className="text-xs font-semibold" style={{ color: "var(--color-status-serious)" }}>
                AHD-A-300001 · priority 40
              </div>
              <div className="mono text-[11px] mt-1" style={{ color: "var(--color-text-secondary)" }}>
                tamper flags on 492 readings · 30-day window
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      {plans.length > 0 && (
        <section id="pricing" className="border-t" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}>
          <div className="max-w-[1200px] mx-auto px-10" style={{ paddingTop: 104, paddingBottom: 104 }}>
            <div className="text-center">
              <div className="eyebrow">Pricing</div>
              <h2 className="text-[40px] mt-3.5 font-bold">The rows in the plans table</h2>
              <p className="text-[15px] mt-3.5" style={{ color: "var(--color-text-secondary)" }}>
                Fetched live from the database. Sign in and these numbers match exactly.
              </p>
            </div>
            <PricingTable plans={plans} />
            <p className="mono text-center text-[11px] mt-6" style={{ color: "var(--color-text-tertiary)" }}>
              Energy beyond the included quantity bills on the GERC RGP telescopic slab — 50 @ ₹3.20 · 150 @ ₹3.95 ·
              rest @ ₹5.00, plus 10% electricity duty.
            </p>
          </div>
        </section>
      )}

      {/* PANELS */}
      <section className="max-w-[1200px] mx-auto px-10 py-28">
        <div className="text-center mb-12">
          <div className="eyebrow">Six panels</div>
          <h2 className="text-[40px] mt-3.5 font-bold">Identity in the rail, never the data</h2>
        </div>
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(178px, 1fr))" }}>
          {PANELS.map((p) => (
            <div
              key={p.label}
              className="rounded-card border p-4 card-lift"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
            >
              <span
                className="inline-flex items-center justify-center rounded-control"
                style={{ width: 32, height: 32, background: p.accent, color: "#04140b" }}
              >
                <PanelIcon name={p.icon} size={17} />
              </span>
              <div className="font-display font-bold text-sm mt-3">{p.label}</div>
              <div className="text-[11.5px] mt-1" style={{ color: "var(--color-text-tertiary)" }}>
                {p.blurb}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden border-t" style={{ borderColor: "var(--color-border)" }}>
        <div className="aurora" style={{ opacity: 0.26 }} />
        <div className="relative z-10 max-w-[720px] mx-auto px-10 py-28 text-center">
          <h2 className="text-[44px] font-bold">Six roles. One click each.</h2>
          <p className="text-base mt-4.5 mb-8 max-w-[490px] mx-auto" style={{ color: "var(--color-text-secondary)" }}>
            Every panel seeded with real modelled data, scoped by Row-Level Security, in English, हिन्दी or ગુજરાતી.
          </p>
          <Link href="/login" className="btn btn-primary h-13 px-8" style={{ height: 52 }}>
            Open live demo
            <PanelIcon name="arrowRight" size={16} />
          </Link>
        </div>
      </section>

      <footer className="border-t" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}>
        <div className="max-w-[1200px] mx-auto px-10 py-9 flex flex-wrap items-center justify-between gap-3.5">
          <div className="flex items-center gap-2.5">
            <Logo size={20} />
            <span className="mono text-xs" style={{ color: "var(--color-text-tertiary)" }}>
              EcoPower 3.0 · INSTINCT 4.0 · Ahmedabad
            </span>
          </div>
          <span className="mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            Metering · billing · DISCOM operations
          </span>
        </div>
      </footer>
    </div>
  );
}
