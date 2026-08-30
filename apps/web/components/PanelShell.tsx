// One shell, five panels. DESIGN.md §6: panel identity lives in the rail and
// the header, never in the data area — a 3px accent bar on the active nav item
// and a role chip in the header. The content canvas is identical in all five,
// so the charts never fight the panel colour.

import Link from "next/link";

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

// `dense` panels (DISCOM, operator) are table-forward; consumer/society are
// comfortable; field gets large touch targets for gloved hands in sunlight.
const DENSITY: Record<PanelKey, string> = {
  consumer: "p-6",
  society: "p-6",
  discom: "p-4",
  operator: "p-4",
  field: "p-6",
};

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

  return (
    <div className="min-h-screen flex" style={{ background: "var(--color-surface)" }}>
      <nav
        className="w-56 shrink-0 border-r flex flex-col"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="px-4 py-6 font-semibold text-lg">EcoPower</div>
        <ul className="flex-1">
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center px-4 py-3 text-sm transition-colors duration-state"
                style={{
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
        <form action="/auth/signout" method="post" className="p-4">
          <button
            type="submit"
            className="text-sm underline"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Sign out
          </button>
        </form>
      </nav>

      <div className="flex-1 flex flex-col">
        <header
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: accent, color: "#fff" }}
          >
            {LABELS[panel]}
          </span>
          <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {email}
          </span>
        </header>
        <main className={DENSITY[panel]}>{children}</main>
      </div>
    </div>
  );
}
