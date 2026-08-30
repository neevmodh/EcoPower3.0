// Design tokens — validated palette (see scripts/validate_palette.js and
// DESIGN.md §3). Colour is assigned by the job it does: categorical
// (identity), diverging (polarity), sequential (magnitude), status (state,
// reserved — never a series colour). Reference these roles in component
// code, never raw hex.

import palette from "./palette.json" with { type: "json" };

export type Theme = "light" | "dark";

export const categorical = palette.categorical;
export const diverging = palette.diverging;
export const sequential = palette.sequential;
export const status = palette.status;
export const surface = palette.surface;

const CSS_VAR_GROUPS: Array<{ prefix: string; entries: Record<string, Record<Theme, string>> }> = [
  { prefix: "categorical", entries: categorical },
  { prefix: "diverging", entries: diverging },
  { prefix: "status", entries: status },
];

function cssVarLines(theme: Theme): string {
  const lines: string[] = [];
  for (const { prefix, entries } of CSS_VAR_GROUPS) {
    for (const [name, value] of Object.entries(entries)) {
      lines.push(`  --color-${prefix}-${name}: ${value[theme]};`);
    }
  }
  sequential.ramp.forEach((hex, i) => {
    lines.push(`  --color-sequential-${i}: ${hex};`);
  });
  lines.push(`  --color-surface: ${surface[theme]};`);
  return lines.join("\n");
}

// Declared under both @media (prefers-color-scheme: dark) and
// :root[data-theme="dark"] so the OS setting and the in-app toggle both
// work, and the toggle wins in both directions (DESIGN.md §3.6).
export function generateCssVariables(): string {
  return `:root {
${cssVarLines("light")}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${cssVarLines("dark")}
  }
}

:root[data-theme="dark"] {
${cssVarLines("dark")}
}

:root[data-theme="light"] {
${cssVarLines("light")}
}
`;
}

// Tailwind-consumable shape (theme.extend.colors) — same values, imported
// directly by apps/web's tailwind config once it exists (#8), so web and
// mobile (NativeWind) read the one source instead of drifting.
export function tailwindColors(theme: Theme) {
  return {
    generation: categorical.generation[theme],
    consumption: categorical.consumption[theme],
    third: categorical.third[theme],
    "grid-export": diverging.export[theme],
    "grid-zero": diverging.zero[theme],
    "grid-import": diverging.import[theme],
    sequential: sequential.ramp,
    "status-good": status.good[theme],
    "status-warning": status.warning[theme],
    "status-serious": status.serious[theme],
    "status-critical": status.critical[theme],
    surface: surface[theme],
  };
}
