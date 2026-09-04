import type { ReactNode } from "react";

// The shell every chart in the app sits in — DESIGN.md §4.1: a title that
// names the single series (so a one-series chart needs no legend), a filter
// row above the plot, and a table view that always exists. Server component;
// the plot passed in as `children` is the client island that owns hover.
export function ChartFrame({
  title,
  caption,
  legend,
  filters,
  table,
  children,
}: {
  title: string;
  caption?: ReactNode;
  legend?: ReactNode;
  filters?: ReactNode;
  table?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-card border card-shadow p-5 animate-fade-up"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {caption && (
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
              {caption}
            </p>
          )}
        </div>
        {filters && <div className="flex items-center gap-2">{filters}</div>}
      </div>

      {legend && (
        <div className="flex flex-wrap items-center gap-4 mt-3 mb-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
          {legend}
        </div>
      )}

      <div className="mt-3">{children}</div>

      {table && (
        <details className="mt-4 group">
          <summary
            className="text-xs font-medium cursor-pointer select-none inline-flex items-center gap-1.5"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <span className="transition-transform group-open:rotate-90">▸</span>
            Table view
          </summary>
          <div className="overflow-x-auto mt-3">{table}</div>
        </details>
      )}
    </section>
  );
}

// A small swatch + label used inside ChartFrame's `legend` slot. Identity is
// the swatch; the text wears a text token, never the series colour (§4.1).
export function LegendDot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-block rounded-full" style={{ width: 9, height: 9, background: color }} />
      {children}
    </span>
  );
}
