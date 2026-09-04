// One shell, six panels. DESIGN.md §6: panel identity lives in the rail and
// the header, never in the data area — a glowing 2px bar on the active nav
// item and a role chip in the header. The content canvas is identical in all
// six, so a chart never fights the panel colour.
//
// DESIGN.md §5: on the dark ground the chrome separates from the canvas by a
// lighter raised surface plus a hairline, not by a shadow — a drop shadow is
// invisible here. Cards inside the canvas still carry real resting elevation.

import Link from "next/link";
import { NotificationBell } from "./NotificationBell";
import { AIAdvisor } from "./AIAdvisor";
import { PanelIcon, type IconName } from "./Icon";

export type PanelKey = "consumer" | "society" | "discom" | "operator" | "field" | "support";

const ACCENTS: Record<PanelKey, string> = {
  consumer: "var(--color-categorical-third)", // lime
  society: "#b394ff", // violet
  discom: "var(--color-categorical-consumption)", // cyan
  operator: "#8fa0b4", // slate
  field: "var(--color-categorical-generation)", // amber
  support: "#4fd6c4", // teal — distinct from consumer lime and operator slate
};

const LABELS: Record<PanelKey, string> = {
  consumer: "Consumer",
  society: "Society",
  discom: "DISCOM",
  operator: "Operator",
  field: "Field",
  support: "Support",
};

const ICONS: Record<PanelKey, IconName> = {
  consumer: "home",
  society: "building",
  discom: "grid",
  operator: "gauge",
  field: "pin",
  support: "chat",
};

// `dense` panels (DISCOM, operator, support) are table-forward;
// consumer/society are comfortable; field gets large touch targets for
// gloved hands in sunlight.
const DENSITY: Record<PanelKey, string> = {
  consumer: "p-6",
  society: "p-6",
  discom: "p-5",
  operator: "p-5",
  field: "p-6",
  support: "p-5",
};

export function PanelShell({
  panel,
  email,
  nav,
  children,
  panelLabel,
  signOutLabel = "Sign out",
  headerExtra,
  scopeNote,
}: {
  panel: PanelKey;
  email: string;
  nav: Array<{ href: string; label: string; active?: boolean }>;
  children: React.ReactNode;
  panelLabel?: string; // translated "<Panel> panel" chip; defaults to English
  signOutLabel?: string;
  headerExtra?: React.ReactNode; // e.g. a LocaleSwitcher, rendered in the header
  scopeNote?: string; // what RLS confines this session to, shown in the rail
}) {
  const accent = ACCENTS[panel];
  const initial = email ? email[0]?.toUpperCase() : "?";

  return (
    <div className="min-h-screen flex" style={{ background: "var(--color-surface)" }}>
      <nav
        className="w-56 shrink-0 border-r flex flex-col px-3 py-4"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}
      >
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <PanelIcon name="bolt" size={21} style={{ color: accent }} />
          <span className="font-display font-extrabold text-sm tracking-tight">ECOPOWER</span>
        </div>

        <ul className="flex-1 space-y-0.5">
          {nav.map((item) => (
            <li key={item.href} className="relative">
              {item.active && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
                  style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
                />
              )}
              <Link
                href={item.href}
                className="flex items-center gap-2 px-3 py-2 rounded-control text-sm transition-colors duration-state"
                style={{
                  background: item.active ? "color-mix(in oklab, var(--color-text-primary) 5%, transparent)" : "transparent",
                  color: item.active ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                  fontWeight: item.active ? 600 : 500,
                }}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        {scopeNote && (
          <div
            className="mb-3 rounded-card border p-3"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" }}
          >
            <div className="eyebrow mb-1.5">Session scope</div>
            <div className="mono text-[10.5px]" style={{ color: "var(--color-text-secondary)" }}>
              {scopeNote}
            </div>
            <p className="text-[10px] mt-2" style={{ color: "var(--color-text-tertiary)" }}>
              Row-Level Security confines every query below to this claim.
            </p>
          </div>
        )}

        <div
          className="rounded-card border p-3 card-shadow"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
        >
          <div className="flex items-center gap-2.5 mb-2.5">
            <span
              className="inline-flex items-center justify-center rounded-control font-display font-bold shrink-0"
              style={{ width: 28, height: 28, background: accent, color: "#04140b", fontSize: 12 }}
            >
              {initial}
            </span>
            <span className="mono text-[10px] truncate" style={{ color: "var(--color-text-tertiary)" }} title={email}>
              {email}
            </span>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="w-full text-xs rounded-control border py-1.5 transition-colors duration-state"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
            >
              {signOutLabel}
            </button>
          </form>
        </div>
      </nav>

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="flex items-center justify-between px-6 h-14 border-b shrink-0"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}
        >
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 h-7 text-xs font-display font-semibold"
            style={{ background: accent, color: "#04140b" }}
          >
            <PanelIcon name={ICONS[panel]} size={13} />
            {panelLabel ?? `${LABELS[panel]} panel`}
          </span>
          <div className="flex items-center gap-4">
            {headerExtra}
            <NotificationBell />
            <span className="mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
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
