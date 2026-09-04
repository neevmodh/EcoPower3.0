"use client";

import { useEffect, useState } from "react";
import { PanelIcon, type IconName } from "./Icon";

// A first-run orientation card. Dismissed state lives in localStorage keyed
// by `id`, so it stays gone per browser after the user closes it — no
// server round-trip, no account setting. Renders nothing until mount so it
// can't flash on a already-dismissed panel or mismatch on hydration.

export type OnboardingStep = { icon: IconName; title: string; body: string };

export function OnboardingCard({
  id,
  heading,
  steps,
  accent = "var(--color-categorical-third)",
}: {
  id: string;
  heading: string;
  steps: OnboardingStep[];
  accent?: string;
}) {
  const key = `ecopower.onboard.${id}`;
  const [state, setState] = useState<"loading" | "open" | "closed">("loading");

  useEffect(() => {
    setState(localStorage.getItem(key) === "done" ? "closed" : "open");
  }, [key]);

  if (state !== "open") return null;

  const close = () => {
    localStorage.setItem(key, "done");
    setState("closed");
  };

  return (
    <div
      className="rounded-card border p-5 mb-6 animate-fade-up relative overflow-hidden"
      style={{
        borderColor: `color-mix(in oklab, ${accent} 35%, var(--color-border))`,
        background: `color-mix(in oklab, ${accent} 5%, var(--color-surface-card))`,
      }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: accent, boxShadow: `0 0 12px ${accent}` }} />

      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span style={{ color: accent }}>
            <PanelIcon name="info" size={16} />
          </span>
          <h2 className="text-sm font-semibold">{heading}</h2>
        </div>
        <button
          type="button"
          onClick={close}
          className="btn btn-ghost text-xs px-2 py-1 -mr-1 -mt-1"
          aria-label="Dismiss orientation"
        >
          <PanelIcon name="x" size={14} />
        </button>
      </div>

      <ol className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-2.5 animate-slide-in" style={{ animationDelay: `${i * 70}ms` }}>
            <span
              className="shrink-0 mt-0.5 inline-flex items-center justify-center rounded-full"
              style={{ width: 24, height: 24, background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}
            >
              <PanelIcon name={s.icon} size={13} />
            </span>
            <div>
              <div className="text-xs font-semibold mb-0.5">{s.title}</div>
              <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {s.body}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
