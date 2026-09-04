// The deliberate antithesis of 2.0's DashboardLayout.js:60-63 — a pulsing
// green "LIVE" dot that was a hardcoded CSS animation on a dashboard that
// fetched once on mount and never refreshed. This one only shows what is
// actually true this instant, and only the genuinely-connected state gets
// the animated ring.

import type { ConnectionState } from "@/lib/useLiveMeter";

const LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  connected: "Live",
  reconnecting: "Reconnecting…",
  polling: "Polling (5s)",
};

const COLOR: Record<ConnectionState, string> = {
  connecting: "var(--color-text-tertiary)",
  connected: "var(--color-status-good)",
  reconnecting: "var(--color-status-warning)",
  polling: "var(--color-status-warning)",
};

export function ConnectionIndicator({ state }: { state: ConnectionState }) {
  const color = COLOR[state];
  const live = state === "connected";

  return (
    <span className="inline-flex items-center gap-2 mono text-[11px]" style={{ color }}>
      {live ? (
        <span className="pulse-dot" />
      ) : (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
            display: "inline-block",
            opacity: state === "connecting" ? 0.6 : 1,
          }}
        />
      )}
      {LABEL[state]}
    </span>
  );
}
