import Link from "next/link";

const PANELS: Array<{ label: string; accent: string; icon: string; blurb: string }> = [
  { label: "Consumer", accent: "var(--color-categorical-third)", icon: "🏠", blurb: "Live usage, billing, subscriptions" },
  { label: "Society", accent: "#7c5cd6", icon: "🏢", blurb: "Units, allocation, aggregate load" },
  { label: "DISCOM", accent: "var(--color-categorical-consumption)", icon: "⚡", blurb: "Division-scoped, RLS-enforced" },
  { label: "Operator", accent: "#5c6470", icon: "🛠️", blurb: "Fleet health, asset registry" },
  { label: "Field", accent: "var(--color-categorical-generation)", icon: "📶", blurb: "Offline-first, commissioning" },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <span
        className="inline-flex items-center justify-center rounded-control text-white font-semibold mb-6"
        style={{ width: 40, height: 40, background: "var(--color-categorical-consumption)", fontSize: 20 }}
        aria-hidden="true"
      >
        ⚡
      </span>

      <h1 className="text-4xl font-semibold mb-4 tracking-tight">EcoPower 3.0</h1>
      <p className="text-lg mb-10 max-w-xl" style={{ color: "var(--color-text-secondary)" }}>
        Energy-as-a-Service for Indian distribution utilities. Metering, billing,
        and DISCOM operations on one row-secured spine.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-10 max-w-3xl w-full">
        {PANELS.map((p) => (
          <div
            key={p.label}
            className="rounded-card border p-3 text-left"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <span
              className="inline-flex items-center justify-center rounded-full mb-2"
              style={{ width: 28, height: 28, background: p.accent, fontSize: 14 }}
              aria-hidden="true"
            >
              {p.icon}
            </span>
            <div className="text-sm font-medium">{p.label}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
              {p.blurb}
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/login"
        className="rounded-control px-6 py-3 text-sm font-medium transition-colors duration-state"
        style={{ background: "var(--color-categorical-consumption)", color: "#fff" }}
      >
        Sign in
      </Link>
    </main>
  );
}
