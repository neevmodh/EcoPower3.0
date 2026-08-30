"use client";

// #69's deliverable: every data component's five states, rendered together
// so a review is a glance, not a hunt through the app for edge cases.
// No component ships without its five states reviewed here first.

import type { DataState } from "@ecopower/shared";
import { StatTileWithState } from "@/components/StatTileWithState";

type NumericData = { value: number; unit?: string };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {children}
      </div>
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs mb-2 font-mono" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export default function KitchenSinkPage() {
  const loading: DataState<NumericData> = { status: "loading" };
  const empty: DataState<NumericData> = { status: "empty", windowLabel: "the last 24 hours" };
  const error: DataState<NumericData> = { status: "error", message: "Ingest worker unreachable." };
  const readyFresh: DataState<NumericData> = {
    status: "ready",
    data: { value: 41.8, unit: "kWh" },
    confidence: "measured",
    asOf: new Date(),
    expectedIntervalMs: 15 * 60_000,
  };
  const readyStale: DataState<NumericData> = {
    status: "ready",
    data: { value: 41.8, unit: "kWh" },
    confidence: "measured",
    asOf: new Date(Date.now() - 60 * 60_000), // 1h ago, well past the 15-min interval
    expectedIntervalMs: 15 * 60_000,
  };
  const readyEstimated: DataState<NumericData> = {
    status: "ready",
    data: { value: 39.2, unit: "kWh" },
    confidence: "estimated",
    asOf: new Date(),
    expectedIntervalMs: 15 * 60_000,
  };
  const readyForecast: DataState<NumericData> = {
    status: "ready",
    data: { value: 44.0, unit: "kWh" },
    confidence: "forecast",
    asOf: new Date(),
    expectedIntervalMs: 15 * 60_000,
  };
  const readyWithBadge: DataState<NumericData> = {
    status: "ready",
    data: { value: 41.8, unit: "kWh" },
    confidence: "measured",
    asOf: new Date(),
    expectedIntervalMs: 15 * 60_000,
  };

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Kitchen sink</h1>
      <p className="text-sm mb-8" style={{ color: "var(--color-text-secondary)" }}>
        Every state a data component can be in. Reviewed here before any component ships (DESIGN.md P2/P3).
      </p>

      <Section title="StatTile — the five required states">
        <Labeled label="loading">
          <StatTileWithState icon="☀️" label="Solar generated" tileState={loading} />
        </Labeled>
        <Labeled label="empty">
          <StatTileWithState icon="☀️" label="Solar generated" tileState={empty} onWiden={() => {}} />
        </Labeled>
        <Labeled label="partial (confidence: estimated)">
          <StatTileWithState icon="☀️" label="Solar generated" tileState={readyEstimated} />
        </Labeled>
        <Labeled label="stale">
          <StatTileWithState icon="☀️" label="Solar generated" tileState={readyStale} />
        </Labeled>
        <Labeled label="error">
          <StatTileWithState icon="☀️" label="Solar generated" tileState={error} onRetry={() => {}} />
        </Labeled>
      </Section>

      <Section title="StatTile — happy path + confidence variants (P3)">
        <Labeled label="ready, fresh, measured">
          <StatTileWithState icon="☀️" label="Solar generated" tileState={readyFresh} />
        </Labeled>
        <Labeled label="ready, with a real comparison badge">
          <StatTileWithState
            icon="☀️"
            label="Solar generated"
            comparison={{ value: 37.2, windowLabel: "last week" }}
            tileState={readyWithBadge}
          />
        </Labeled>
        <Labeled label="forecast (beyond now, #53)">
          <StatTileWithState icon="☀️" label="Solar generated" tileState={readyForecast} />
        </Labeled>
        <Labeled label="status colour: critical">
          <StatTileWithState icon="⚠️" label="Tamper flag" state="critical" tileState={readyFresh} />
        </Labeled>
      </Section>
    </main>
  );
}
