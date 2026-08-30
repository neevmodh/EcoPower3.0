// One shell, five panels. DESIGN.md §6: panel identity lives in the rail and
// the header, never in the data area — a 3px accent bar on the active nav item
// and a role chip in the header. The content canvas is identical in all five,
// so the charts never fight the panel colour.
//
// DESIGN.md §5: neutral page, hairline borders, shadow reserved for genuine
// overlay — 2.0's soft page wash flattened hierarchy, so depth here comes
// from spacing and tinted fills, never a drop shadow on the chrome.

import Link from "next/link";
import { NotificationBell } from "./NotificationBell";
import { AIAdvisor } from "./AIAdvisor";

export type PanelKey = "consumer" | "society" | "discom" | "operator" | "field";

const ACCENTS: Record<PanelKey, string> = {
  consumer: "var(--color-categorical-third)", // aqua
  society: "#7c5cd6", // violet
  discom: "var(--color-categorical-consumption)", // blue
  operator: "#5c6470", // slate
  field: "var(--color-categorical-generation)", // amber
};

const LABELS: Record<PanelKey, string> = {
  consumer: "Consumer",
  society: "Society",
  discom: "DISCOM",
  operator: "Operator",
  field: "Field",
};

const ICONS: Record<PanelKey, string> = {
  consumer: "🏠",
  society: "🏢",
  discom: "⚡",
  operator: "🛠️",
  field: "📶",
};

// `dense` panels (DISCOM, operator) are table-forward; consumer/society are
// comfortable; field gets large touch targets for gloved hands in sunlight.
const DENSITY: Record<PanelKey, string> = {
  consumer: "p-6",
  society: "p-6",
  discom: "p-4",
  operator: "p-4",
  field: "p-6",
};

function hexToRgba(hex: string, alpha: number): string {
  // Handles both #rrggbb literals and var(--...) tokens gracefully — for
  // CSS custom properties we fall back to color-mix, which every browser
  // this app targets supports.
  if (hex.startsWith("var(")) return `color-mix(in srgb, ${hex} ${alpha * 100}%, transparent)`;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function PanelShell({
  panel,
  email,
  nav,
  children,
}: {
  panel: PanelKey;
  email: string;
  nav: Array<{ href: string; label: string; active?: boolean }>;
  children: React.ReactNode;
}) {
  const accent = ACCENTS[panel];
  const initial = email ? email[0]?.toUpperCase() : "?";

  return (
    <div className="min-h-screen flex" style={{ background: "var(--color-surface)" }}>
      <nav className="w-60 shrink-0 border-r flex flex-col" style={{ borderColor: "var(--color-border)" }}>
        <div className="px-5 py-6 flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center rounded-control text-white font-semibold"
            style={{ width: 28, height: 28, background: accent, fontSize: 14 }}
          >
            ⚡
          </span>
          <span className="font-semibold text-lg tracking-tight">EcoPower</span>
        </div>

        <ul className="flex-1 px-2 space-y-0.5">
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center gap-2 px-3 py-2 rounded-control text-sm transition-colors duration-state"
                style={{
                  background: item.active ? hexToRgba(accent, 0.12) : "transparent",
                  borderLeft: `3px solid ${item.active ? accent : "transparent"}`,
                  color: item.active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  fontWeight: item.active ? 600 : 400,
                }}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="p-3 mx-2 mb-3 rounded-card border" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="inline-flex items-center justify-center rounded-full font-medium text-white shrink-0"
              style={{ width: 32, height: 32, background: accent, fontSize: 13 }}
            >
              {initial}
            </span>
            <span className="text-xs tabular truncate" style={{ color: "var(--color-text-secondary)" }} title={email}>
              {email}
            </span>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="w-full text-xs rounded-control border px-2 py-1.5 transition-colors duration-state hover:opacity-80"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>

      <div className="flex-1 flex flex-col">
        <header
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: accent, color: "#fff" }}
          >
            <span aria-hidden="true">{ICONS[panel]}</span>
            {LABELS[panel]} panel
          </span>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <span className="text-sm tabular" style={{ color: "var(--color-text-secondary)" }}>
              {email}
            </span>
          </div>
        </header>
        <main className={DENSITY[panel]}>{children}</main>
      </div>
      {panel === "consumer" && <AIAdvisor />}
    </div>
  );
}
