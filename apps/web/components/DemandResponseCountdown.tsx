"use client";

import { useEffect, useState } from "react";

// Same hydration-safety shape as SlaCountdown: `remaining` starts null so
// server and client render identically on first pass, then a client-only
// useEffect fills in the real, ticking value — computing it during render
// would give the server and the client's first hydration two different
// "now"s and risk a text mismatch across a minute boundary.
function format(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function DemandResponseCountdown({
  startsAt,
  endsAt,
  status,
}: { startsAt: string; endsAt: string; status: string }) {
  const starts = new Date(startsAt).getTime();
  const ends = new Date(endsAt).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  if (status === "cancelled" || now === null) return null;

  if (status === "completed" || now >= ends) {
    return null;
  }
  if (now >= starts) {
    return (
      <span
        className="text-xs font-medium tabular"
        style={{ color: "var(--color-status-warning)" }}
      >
        ends in {format(ends - now)}
      </span>
    );
  }
  return (
    <span
      className="text-xs font-medium tabular"
      style={{ color: "var(--color-text-secondary)" }}
    >
      starts in {format(starts - now)}
    </span>
  );
}
