"use client";

// Hero illustration only — DESIGN.md §8 keeps 2.0's energy-flow composition
// but rebuilds the data path. This is NOT wired to real telemetry (a
// landing page can't authenticate a specific meter before sign-in), so
// unlike every in-app stat tile it is explicitly labelled illustrative
// rather than presented as a live reading — DESIGN.md P1 forbids a
// component outliving its data anywhere the platform actually claims
// liveness. The real thing is one click away at /login.

import { useEffect, useState } from "react";

const NODES = [
  { key: "solar", icon: "☀️", label: "Solar", tone: "var(--color-categorical-generation)" },
  { key: "battery", icon: "🔋", label: "Battery", tone: "var(--color-categorical-third)" },
  { key: "home", icon: "🏠", label: "Home", tone: "var(--color-categorical-consumption)" },
  { key: "grid", icon: "⚡", label: "Grid", tone: "var(--color-diverging-export)" },
] as const;

export function LiveFlowIllustration() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % NODES.length), 1100);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="rounded-card border p-6"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Energy flow
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            Illustrative — the real one is behind sign-in, driven by Realtime
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        {NODES.map((n, i) => (
          <div key={n.key} className="flex items-center">
            <div
              className="flex flex-col items-center gap-2 transition-transform duration-entrance"
              style={{ transform: active === i ? "scale(1.08)" : "scale(1)" }}
            >
              <div
                className="rounded-card border flex items-center justify-center transition-colors duration-state"
                style={{
                  width: 56,
                  height: 56,
                  fontSize: "1.5rem",
                  borderColor: active === i ? n.tone : "var(--color-border)",
                  background: "var(--color-surface)",
                }}
                aria-hidden="true"
              >
                {n.icon}
              </div>
              <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                {n.label}
              </span>
            </div>
            {i < NODES.length - 1 && (
              <div
                className="mx-2 mb-6"
                style={{ width: 32, height: 2, background: "var(--color-border)" }}
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
