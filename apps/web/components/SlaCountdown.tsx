"use client";

import { useEffect, useState } from "react";

// Only ever called with msRemaining > 0 — the caller already renders "SLA
// BREACHED" itself once isBreached is true, so there's no <= 0 case here.
function format(msRemaining: number): string {
  const totalMinutes = Math.floor(msRemaining / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

// A genuinely ticking clock, not a value computed once at server-render
// time and left stale until the next refresh — the demo value here (#29)
// is specifically that it visibly moves.
//
// `remaining` starts null rather than seeded from Date.now(): computing it
// during the render itself would give the server and the client's first
// hydration pass two different "now"s, and a text mismatch across a minute
// boundary is a React hydration warning. Null renders identically on both
// sides; the real value fills in from useEffect right after mount, which
// only ever runs client-side.
export function SlaCountdown({
  dueAt,
  breached,
}: { dueAt: string; breached: boolean }) {
  const due = new Date(dueAt).getTime();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(due - Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [due]);

  const isBreached = breached || (remaining !== null && remaining <= 0);
  const label = isBreached
    ? "SLA BREACHED"
    : remaining === null
      ? "SLA: —"
      : `SLA: ${format(remaining)}`;

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium tabular"
      style={{
        color: isBreached
          ? "var(--color-status-critical)"
          : "var(--color-status-warning)",
      }}
    >
      {label}
    </span>
  );
}
