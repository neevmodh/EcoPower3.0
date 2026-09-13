"use client";

import { useEffect, useState } from "react";

function format(msRemaining: number): string {
  if (msRemaining <= 0) return "BREACHED";
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
export function SlaCountdown({
  dueAt,
  breached,
}: { dueAt: string; breached: boolean }) {
  const due = new Date(dueAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const remaining = due - now;
  const isBreached = breached || remaining <= 0;

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium tabular"
      style={{
        color: isBreached
          ? "var(--color-status-critical)"
          : "var(--color-status-warning)",
      }}
    >
      {isBreached ? "SLA BREACHED" : `SLA: ${format(remaining)}`}
    </span>
  );
}
