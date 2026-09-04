import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";

export const metadata: Metadata = {
  title: "How it works — EcoPower",
  description: "From 'check my roof' to clean power in about three weeks — and where EcoPower sits between you and the grid.",
};

const STEPS: Array<{ n: string; title: string; body: string; when: string; color: string }> = [
  {
    n: "1",
    title: "Check my roof",
    body: "Address and last six bills. We model generation from satellite irradiance and your real consumption, and quote a monthly fee. Free, no visit.",
    when: "~5 minutes",
    color: "var(--color-categorical-third)",
  },
  {
    n: "2",
    title: "Survey & sign",
    body: "An engineer confirms shading, roof condition and the meter position. You e-sign the service agreement; the quote is locked.",
    when: "Day 3–7",
    color: "var(--color-categorical-consumption)",
  },
  {
    n: "3",
    title: "Install & connect",
    body: "Array, inverter and — on higher plans — battery go up in a day. EcoPower files net-metering and the electrical-inspector clearance with your DISCOM and tracks it in your app.",
    when: "Day 10–18",
    color: "var(--color-categorical-generation)",
  },
  {
    n: "4",
    title: "Live — and monitored",
    body: "A bidirectional smart meter goes in. Generation, savings and carbon show live; faults raise their own tickets; the guarantee is checked every billing cycle.",
    when: "Day 18–21",
    color: "var(--color-diverging-export)",
  },
];

export default function HowItWorksPage() {
  return (
    <div style={{ background: "var(--color-surface)", overflowX: "hidden" }}>
      <MarketingNav active="how" />

      <section className="relative overflow-hidden">
        <div className="grid-backdrop" />
        <div className="aurora" />
        <div className="relative z-10 max-w-[1000px] mx-auto px-10 pt-20 pb-10 text-center">
          <div className="eyebrow">How it works</div>
          <h1 className="text-[48px] mt-4 font-bold leading-[1.06]" style={{ textWrap: "balance" }}>
            From “check my roof” to clean power in about three weeks.
          </h1>
          <p className="mt-4 text-[16px] max-w-[54ch] mx-auto" style={{ color: "var(--color-text-secondary)" }}>
            You do two things — approve a quote and sign. EcoPower does the survey, the install, the DISCOM paperwork and
            every rupee of maintenance after that.
          </p>
        </div>
      </section>

      <section className="max-w-[1100px] mx-auto px-10 pb-14">
        <div className="grid md:grid-cols-4 gap-4">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="rounded-card border card-shadow p-5"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
            >
              <span
                className="inline-flex items-center justify-center rounded-control font-display font-bold on-accent"
                style={{ width: 34, height: 34, background: s.color, fontSize: 15 }}
              >
                {s.n}
              </span>
              <h3 className="mt-3.5 text-[16px] font-semibold">{s.title}</h3>
              <p className="mt-2 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                {s.body}
              </p>
              <div className="mt-3 mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                {s.when}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}>
        <div className="max-w-[1100px] mx-auto px-10 py-16">
          <h2 className="text-[26px] font-bold max-w-[22ch]">Where EcoPower sits between you and the grid</h2>

          <div
            className="mt-8 rounded-card border p-8"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <svg viewBox="0 0 900 250" className="w-full h-auto" role="img" aria-label="Solar covers your load first; surplus exports to the grid for a net-metering credit; anything short is drawn back. The meter measures both directions and every kWh flows into the ledger that produces your bill.">
              <defs>
                <marker id="hiw-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0 0 L8 4 L0 8 z" fill="var(--color-text-tertiary)" />
                </marker>
              </defs>
              <rect
                x="20"
                y="30"
                width="860"
                height="30"
                rx="8"
                fill="color-mix(in oklab, var(--color-categorical-third) 12%, transparent)"
                stroke="color-mix(in oklab, var(--color-categorical-third) 45%, transparent)"
              />
              <text x="450" y="50" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="12" fill="var(--color-diverging-export)">
                EcoPower platform — telemetry · billing · net-metering · guarantee · support
              </text>

              {[
                { x: 20, label: "Rooftop array" },
                { x: 250, label: "Inverter · battery" },
                { x: 480, label: "Bidirectional meter" },
                { x: 710, label: "DISCOM grid" },
              ].map((box) => (
                <g key={box.label}>
                  <rect
                    x={box.x}
                    y={80}
                    width={150}
                    height={100}
                    rx={12}
                    fill="var(--color-surface-sunken)"
                    stroke="var(--color-border)"
                  />
                  <text x={box.x + 75} y={202} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="12" fill="var(--color-text-secondary)">
                    {box.label}
                  </text>
                </g>
              ))}
              <path d="M50 110 h90 M50 128 h90 M50 146 h60" stroke="var(--color-categorical-third)" strokeWidth="3" strokeLinecap="round" />
              <circle cx="300" cy="120" r="16" fill="none" stroke="var(--color-categorical-consumption)" strokeWidth="3" />
              <rect x="335" y="104" width="30" height="32" rx="4" fill="none" stroke="var(--color-categorical-generation)" strokeWidth="3" />
              <rect x="512" y="96" width="86" height="30" rx="4" fill="var(--color-text-primary)" />
              <text x="555" y="116" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="13" fill="var(--color-surface)" letterSpacing="2">
                42571
              </text>
              <path d="M770 96 l-14 30 h20 l-14 30" fill="none" stroke="var(--color-text-secondary)" strokeWidth="3" strokeLinejoin="round" />

              <line x1="172" y1="120" x2="246" y2="120" stroke="var(--color-text-tertiary)" strokeWidth="2" markerEnd="url(#hiw-arrow)" />
              <line x1="402" y1="120" x2="476" y2="120" stroke="var(--color-text-tertiary)" strokeWidth="2" markerEnd="url(#hiw-arrow)" />
              <line x1="632" y1="112" x2="706" y2="112" stroke="var(--color-diverging-export)" strokeWidth="2" markerEnd="url(#hiw-arrow)" />
              <line x1="706" y1="132" x2="632" y2="132" stroke="var(--color-text-secondary)" strokeWidth="2" strokeDasharray="4 4" markerEnd="url(#hiw-arrow)" />
              <text x="669" y="104" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="var(--color-diverging-export)">
                export
              </text>
              <text x="669" y="152" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="var(--color-text-secondary)">
                import
              </text>
            </svg>
            <p className="mt-5 text-[13px] max-w-[80ch]" style={{ color: "var(--color-text-secondary)" }}>
              Solar covers your load first; the surplus exports to the grid for a net-metering credit; anything short is
              drawn back. The meter measures both directions, and every kWh flows into the same ledger that produces your
              bill — so an invoice line always points back to two register reads.
            </p>
          </div>

          <div className="mt-8 grid md:grid-cols-2 gap-5">
            <div className="rounded-card border p-5" style={{ borderColor: "var(--color-border)" }}>
              <div className="eyebrow">For the consumer</div>
              <p className="mt-2.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                One app, three languages. Live meter, prepaid or postpaid, a next-bill forecast from your own curve, and
                every charge line openable to the reads behind it.
              </p>
            </div>
            <div className="rounded-card border p-5" style={{ borderColor: "var(--color-border)" }}>
              <div className="eyebrow">For the DISCOM</div>
              <p className="mt-2.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                Net-metering applications, connection approvals and loss localisation in one console — scoped by division,
                written to an append-only audit ledger. Modelled today on UGVCL / MGVCL / DGVCL / PGVCL.
              </p>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Link href="/pricing" className="btn btn-primary h-11 px-6">
              See pricing
            </Link>
            <Link href="/login" className="btn h-11 px-6" style={{ borderColor: "var(--color-border)" }}>
              Open live demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
