// Shared between the consumer and DISCOM demand-response pages so a status
// pill means the same color in both panels, not two colors invented
// independently that happen to drift.
export const DR_STATUS_COLOR: Record<string, string> = {
  scheduled: "var(--color-categorical-consumption)",
  active: "var(--color-status-warning)",
  completed: "var(--color-status-good)",
  cancelled: "var(--color-text-tertiary)",
};
