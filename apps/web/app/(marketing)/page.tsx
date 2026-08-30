import Link from "next/link";
import { LiveFlowIllustration } from "@/components/LiveFlowIllustration";
import { Logo } from "@/components/Logo";

// Marketing page, not an operator surface — DESIGN.md P6 explicitly draws
// that line ("marketing pages get air; operator surfaces get information")
// and §8 keeps 2.0's landing-page composition. What changes from 2.0:
// every number below is either a real, checkable fact about this build
// (RLS role count, the cited tariff source, the CI test count) or clearly
// labelled illustrative — never an invented customer count or a fabricated
// testimonial. This is the same discipline DESIGN.md §1 demands of the
// in-app dashboards, applied to the one surface that's allowed to have air.
//
// Server-rendered by default — the only client code on the page is the
// small energy-flow illustration and the nav's mobile toggle omission
// (there isn't one; five links fit). No scroll listeners, no counter
// animation library, no icon package — matches "fast speed": this ships
// as static HTML plus one tiny client island.

const PANELS: Array<{ label: string; accent: string; icon: string; blurb: string }> = [
  { label: "Consumer", accent: "var(--color-categorical-third)", icon: "🏠", blurb: "Live usage, billing, subscriptions" },
  { label: "Society", accent: "#7c5cd6", icon: "🏢", blurb: "Units, allocation, aggregate load" },
  { label: "DISCOM", accent: "var(--color-categorical-consumption)", icon: "⚡", blurb: "Division-scoped, RLS-enforced" },
  { label: "Operator", accent: "#5c6470", icon: "🛠️", blurb: "Fleet health, asset registry" },
  { label: "Field", accent: "var(--color-categorical-generation)", icon: "📶", blurb: "Offline-first, commissioning" },
];

const STATS: Array<{ value: string; label: string }> = [
  { value: "3", label: "Real tariff slabs, cited to the GERC order — not estimated" },
  { value: "9", label: "Row-secured roles, default-deny by construction" },
  { value: "<1s", label: "Meter reading to dashboard, over Realtime Broadcast" },
  { value: "185", label: "Automated unit and RLS tests run in CI on every change" },
];

const STEPS: Array<{ n: string; icon: string; title: string; desc: string; tone: string }> = [
  { n: "01", icon: "📋", title: "Subscribe to a service", desc: "Solar, battery backup, or a performance guarantee — chosen, not defaulted.", tone: "var(--color-categorical-third)" },
  { n: "02", icon: "📡", title: "A smart meter reports in", desc: "OBIS-standard readings over MQTT, ingested and validated in real time.", tone: "var(--color-categorical-consumption)" },
  { n: "03", icon: "📈", title: "Watch it live", desc: "Realtime Broadcast pushes the number to your screen — or it says why it can't.", tone: "var(--color-categorical-generation)" },
  { n: "04", icon: "🧾", title: "See exactly what you're billed", desc: "Every invoice line opens to the two register reads it was computed from.", tone: "#7c5cd6" },
];

const FEATURES: Array<{ icon: string; title: string; desc: string }> = [
  { icon: "📡", title: "Real AMI, not a demo feed", desc: "OBIS/IS-15959 register model, an MQTT broker, HMAC-authenticated devices, and a physically modelled simulator behind every reading." },
  { icon: "🔒", title: "Default-deny security", desc: "Row-Level Security on every table, division-scoped for DISCOM staff, owner-scoped for consumers — proven with pgTAP, not asserted in a slide." },
  { icon: "🧮", title: "A real tariff, not a guess", desc: "Gujarat's actual RGP order for Torrent Power Ahmedabad, extracted from the primary PDF — three slabs, phase-based fixed charges, cited." },
  { icon: "🧾", title: "Provenance on every rupee", desc: "Click an invoice line, see the bracketing meter reads it came from. The billing engine works in bigint paise — no floating-point currency." },
  { icon: "🤝", title: "Performance guarantees, settled", desc: "CUF, performance ratio, and uptime guarantees compared against real meter data, with automatic credit lines when the contract isn't met." },
  { icon: "🛰️", title: "Live means live, honestly", desc: "A connection indicator that reflects the actual socket — connected, reconnecting, or polling — never a decorative dot on a page that fetched once." },
];

export default function LandingPage() {
  return (
    <div style={{ background: "var(--color-surface)" }}>
      {/* NAV */}
      <nav
        className="sticky top-0 z-10 border-b backdrop-blur"
        style={{ borderColor: "var(--color-border)", background: "color-mix(in oklab, var(--color-surface) 88%, transparent)" }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-semibold text-lg" style={{ color: "var(--color-text-primary)" }}>
            <Logo size={32} />
            EcoPower
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
            <a href="#how-it-works" className="hover:text-current transition-colors duration-state">How it works</a>
            <a href="#features" className="hover:text-current transition-colors duration-state">Features</a>
            <a href="#panels" className="hover:text-current transition-colors duration-state">Panels</a>
          </div>
          <Link
            href="/login"
            className="rounded-control px-4 py-2 text-sm font-semibold text-white transition-colors duration-state"
            style={{ background: "var(--color-categorical-consumption)" }}
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold mb-6"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
          >
            ✦ Energy-as-a-Service for Indian DISCOMs
          </div>
          <h1 className="text-5xl font-semibold tracking-tight leading-[1.05] mb-5" style={{ color: "var(--color-text-primary)" }}>
            Clean energy,{" "}
            <span style={{ color: "var(--color-categorical-third)" }}>metered honestly.</span>
          </h1>
          <p className="text-lg mb-8 max-w-md" style={{ color: "var(--color-text-secondary)" }}>
            Subscribe to solar, battery backup, or a performance guarantee. Every
            number on your bill traces back to a real meter reading — not a
            badge that outlived its data.
          </p>
          <div className="flex flex-wrap gap-3 mb-10">
            <Link
              href="/login"
              className="rounded-control px-6 py-3 text-sm font-semibold text-white transition-colors duration-state"
              style={{ background: "var(--color-categorical-third)" }}
            >
              Sign in →
            </Link>
            <a
              href="#how-it-works"
              className="rounded-control px-6 py-3 text-sm font-semibold border transition-colors duration-state"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
            >
              See how it works
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            {["Default-deny RLS", "Real GERC tariff", "Sub-second live data"].map((b) => (
              <span
                key={b}
                className="rounded-full border px-3 py-1 text-xs font-medium"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                {b}
              </span>
            ))}
          </div>
        </div>
        <LiveFlowIllustration />
      </section>

      {/* STATS */}
      <section className="border-y" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}>
        <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-4xl font-semibold tracking-tight" style={{ color: "var(--color-categorical-third)" }}>
                {s.value}
              </div>
              <div className="text-sm mt-2" style={{ color: "var(--color-text-secondary)" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-semibold tracking-tight mb-3" style={{ color: "var(--color-text-primary)" }}>
            How it works
          </h2>
          <p className="text-base max-w-lg mx-auto" style={{ color: "var(--color-text-secondary)" }}>
            Four steps, and every one of them is a real system, not a mockup.
          </p>
        </div>
        <div className="grid md:grid-cols-4 gap-6">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-card border p-6" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-center justify-between mb-4">
                <div
                  className="rounded-control flex items-center justify-center"
                  style={{ width: 44, height: 44, fontSize: "1.25rem", background: "var(--color-surface-card)", border: "1px solid var(--color-border)" }}
                  aria-hidden="true"
                >
                  {s.icon}
                </div>
                <span className="text-2xl font-semibold" style={{ color: "var(--color-border)" }}>
                  {s.n}
                </span>
              </div>
              <h3 className="text-base font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
                {s.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ background: "var(--color-surface-card)" }}>
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-semibold tracking-tight mb-3" style={{ color: "var(--color-text-primary)" }}>
              Built for what PS1 actually asks
            </h2>
            <p className="text-base max-w-lg mx-auto" style={{ color: "var(--color-text-secondary)" }}>
              Every card below is a shipped, tested feature — not a roadmap item.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-card border p-6" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
                <div
                  className="rounded-control flex items-center justify-center mb-4"
                  style={{ width: 44, height: 44, fontSize: "1.25rem", background: "var(--color-surface-card)", border: "1px solid var(--color-border)" }}
                  aria-hidden="true"
                >
                  {f.icon}
                </div>
                <h3 className="text-base font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PANELS */}
      <section id="panels" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-semibold tracking-tight mb-3" style={{ color: "var(--color-text-primary)" }}>
            Five panels, one row-secured spine
          </h2>
          <p className="text-base max-w-lg mx-auto" style={{ color: "var(--color-text-secondary)" }}>
            Identity lives in the rail, not the data. Every panel reads the same honest chart canvas.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {PANELS.map((p) => (
            <div key={p.label} className="rounded-card border p-4" style={{ borderColor: "var(--color-border)" }}>
              <span
                className="inline-flex items-center justify-center rounded-full mb-3"
                style={{ width: 32, height: 32, background: p.accent, fontSize: 15 }}
                aria-hidden="true"
              >
                {p.icon}
              </span>
              <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {p.label}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                {p.blurb}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}>
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight mb-4" style={{ color: "var(--color-text-primary)" }}>
            See it live, in one click
          </h2>
          <p className="text-base mb-8" style={{ color: "var(--color-text-secondary)" }}>
            Sign in as any of the five roles above with a demo account — no password to remember.
          </p>
          <Link
            href="/login"
            className="inline-block rounded-control px-8 py-3.5 text-sm font-semibold text-white transition-colors duration-state"
            style={{ background: "var(--color-categorical-third)" }}
          >
            Sign in →
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t" style={{ borderColor: "var(--color-border)" }}>
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
            <Logo size={24} />
            EcoPower 3.0 — INSTINCT 4.0
          </div>
          <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            Metering, billing, and DISCOM operations on one row-secured spine.
          </span>
        </div>
      </footer>
    </div>
  );
}
