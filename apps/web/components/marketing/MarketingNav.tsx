import Link from "next/link";
import { Logo } from "@/components/Logo";

// Shared chrome for the marketing surfaces (landing, /pricing, /how-it-works).
// DESIGN.md P6: these are the pages granted air — the dashboards get none of
// this. `active` bolds the current section.

export function MarketingNav({ active }: { active?: "how" | "pricing" }) {
  const link = (href: string, label: string, key: "how" | "pricing") => (
    <Link
      href={href}
      style={{ color: active === key ? "var(--color-text-primary)" : "inherit", fontWeight: active === key ? 600 : 400 }}
    >
      {label}
    </Link>
  );

  return (
    <nav
      className="sticky top-0 z-30 border-b backdrop-blur"
      style={{
        borderColor: "var(--color-border)",
        background: "color-mix(in oklab, var(--color-surface) 76%, transparent)",
      }}
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
          {link("/how-it-works", "How it works", "how")}
          {link("/pricing", "Pricing", "pricing")}
          <Link href="/#discom" style={{ color: "inherit" }}>
            For DISCOMs
          </Link>
        </div>
        <Link href="/login" className="btn btn-primary h-9 px-4 text-[13px]">
          Open live demo
        </Link>
      </div>
    </nav>
  );
}
