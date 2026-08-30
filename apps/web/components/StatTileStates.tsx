"use client";

// The four non-happy-path states every data component needs (DESIGN.md P2).
// Geometry matches StatTile exactly — height must not shift when loading
// resolves into ready/empty/error.

import type { ReactNode } from "react";

export function StatTileSkeleton() {
  return (
    <div
      className="rounded-card border p-4 animate-pulse"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="h-5 w-5 rounded" style={{ background: "var(--color-border)" }} />
      </div>
      <div className="h-3 w-24 rounded mb-2" style={{ background: "var(--color-border)" }} />
      <div className="h-7 w-32 rounded mb-2" style={{ background: "var(--color-border)" }} />
      <div className="h-3 w-40 rounded" style={{ background: "var(--color-border)" }} />
    </div>
  );
}

export function StatTileEmpty({
  icon,
  label,
  windowLabel,
  onWiden,
}: {
  icon: ReactNode;
  label: string;
  windowLabel: string;
  onWiden?: () => void;
}) {
  return (
    <div
      className="rounded-card border p-4"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
    >
      <div className="mb-3" style={{ color: "var(--color-text-secondary)" }}>
        {icon}
      </div>
      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </div>
      <div className="text-sm mb-2" style={{ color: "var(--color-text-secondary)" }}>
        No readings in {windowLabel}.
      </div>
      {onWiden && (
        <button type="button" onClick={onWiden} className="text-xs underline" style={{ color: "var(--color-categorical-consumption)" }}>
          Widen window
        </button>
      )}
    </div>
  );
}

export function StatTileError({
  icon,
  label,
  message,
  onRetry,
}: {
  icon: ReactNode;
  label: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="rounded-card border p-4"
      style={{ borderColor: "var(--color-status-critical)", borderLeftWidth: "3px", background: "var(--color-surface-card)" }}
      role="alert"
    >
      <div className="mb-3" style={{ color: "var(--color-status-critical)" }}>
        {icon}
      </div>
      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </div>
      <div className="text-sm mb-2" style={{ color: "var(--color-status-critical)" }}>
        {message}
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-xs underline" style={{ color: "var(--color-status-critical)" }}>
          Retry
        </button>
      )}
    </div>
  );
}
