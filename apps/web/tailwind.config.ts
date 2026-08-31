// Tailwind reads the validated palette from packages/shared (#67) — the same
// source NativeWind will read on mobile, so the platforms cannot drift.
// Colours resolve through CSS custom properties so the light/dark toggle
// works without a second Tailwind theme.

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        generation: "var(--color-categorical-generation)",
        consumption: "var(--color-categorical-consumption)",
        third: "var(--color-categorical-third)",
        "grid-export": "var(--color-diverging-export)",
        "grid-zero": "var(--color-diverging-zero)",
        "grid-import": "var(--color-diverging-import)",
        "status-good": "var(--color-status-good)",
        "status-warning": "var(--color-status-warning)",
        "status-serious": "var(--color-status-serious)",
        "status-critical": "var(--color-status-critical)",
        surface: "var(--color-surface)",
        "surface-card": "var(--color-surface-card)",
        border: "var(--color-border)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
      },
      borderRadius: {
        // DESIGN.md §5 (#89) — one set: 6px controls, 16px cards, full pills.
        control: "6px",
        card: "16px",
      },
      fontSize: {
        // DESIGN.md §5 scale. Nothing between steps.
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        lg: "1.125rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
        "4xl": "2.5rem",
        "5xl": "3.5rem",
      },
      spacing: {
        // 4px base. Nothing arbitrary.
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        6: "24px",
        8: "32px",
        12: "48px",
        16: "64px",
      },
      transitionDuration: {
        state: "150ms",
        entrance: "250ms",
      },
    },
  },
  plugins: [],
};

export default config;
