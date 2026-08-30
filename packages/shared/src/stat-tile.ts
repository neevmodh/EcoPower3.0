// Pure logic for the stat tile (DESIGN.md §4.3, principle P1 — no component
// may outlive its data). No React, no formatting-by-string-concat that could
// silently reintroduce a float bug — currency goes through bigint paise only.

export type TileState = "good" | "warning" | "serious" | "critical";

export type Comparison = {
  value: number;
  windowLabel: string; // shown in the tile, e.g. "last week" — no basis, no badge
};

export type Delta = {
  percent: number; // signed
  direction: "up" | "down" | "flat";
  windowLabel: string;
};

// Returns null (no badge) whenever a real comparison can't be honestly
// expressed: no data, no comparison window, or a zero basis (a % change
// against zero is undefined, not "infinite%" or silently dropped to 0%).
export function computeDelta(current: number | null | undefined, comparison: Comparison | null | undefined): Delta | null {
  if (current == null || comparison == null) return null;
  if (comparison.value === 0) return null;

  const percent = ((current - comparison.value) / Math.abs(comparison.value)) * 100;
  const direction = percent > 0 ? "up" : percent < 0 ? "down" : "flat";

  return { percent, direction, windowLabel: comparison.windowLabel };
}

// bigint paise -> "₹10,63,717.88". Exactly two decimals by construction —
// there is no float division step for the fractional part to leak through.
export function formatInrFromPaise(paise: bigint | null | undefined): string {
  if (paise == null) return "—";

  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const rupees = abs / 100n;
  const fraction = abs % 100n;

  const rupeesFormatted = new Intl.NumberFormat("en-IN").format(rupees);
  const fractionFormatted = fraction.toString().padStart(2, "0");

  return `${negative ? "-" : ""}₹${rupeesFormatted}.${fractionFormatted}`;
}

export function formatNumber(value: number | null | undefined, unit?: string): string {
  if (value == null) return "—";
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}
