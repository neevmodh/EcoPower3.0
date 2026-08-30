// The deliberate antithesis of 2.0's DashboardLayout.js:60-63 — a pulsing
// green "LIVE" dot that was a hardcoded CSS animation on a dashboard that
// fetched once on mount and never refreshed. This one only shows what's
// actually true this instant.

import type { ConnectionState } from "@/lib/useLiveMeter";

const LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  connected: "Live",
  reconnecting: "Reconnecting…",
  polling: "Polling (5s)",
};

const COLOR: Record<ConnectionState, string> = {
  connecting: "var(--color-text-secondary)",
  connected: "var(--color-status-good)",
  reconnecting: "var(--color-status-warning)",
  polling: "var(--color-status-warning)",
};

export function ConnectionIndicator({ state }: { state: ConnectionState }) {
  const animated = state === "connected";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: COLOR[state] }}>
      <span
        className={animated ? "animate-pulse" : ""}
        style={{ width: 6, height: 6, borderRadius: "50%", background: COLOR[state], display: "inline-block" }}
      />
      {LABEL[state]}
    </span>
  );
}
