// Cumulative registers only ever increase (DATA.md §4.2) — this is the
// pure state machine that turns "new register value" into "delta, or a
// rollover event," never a negative delta silently written to the DB.

export interface RegisterState {
  meterId: string;
  obis: string;
  lastValue: number;
  lastReadingTs: string;
}

export type MonotonicityResult =
  | { kind: "delta"; delta: number; intervalSeconds: number }
  | { kind: "rollover"; previousValue: number; newValue: number }
  | { kind: "first-reading" }; // no prior state — nothing to delta against yet

export function evaluateRegister(
  prior: RegisterState | undefined,
  newValue: number,
  newReadingTs: string,
): MonotonicityResult {
  if (!prior) return { kind: "first-reading" };

  if (newValue < prior.lastValue) {
    // A real meter's register wrapped (or was replaced/reset). Not an
    // error to reject — an event to record. #15 does not guess a delta
    // across a rollover; #23 (VEE) is where an estimate for the gap, if
    // any, gets made explicitly and labelled.
    return { kind: "rollover", previousValue: prior.lastValue, newValue };
  }

  const delta = newValue - prior.lastValue;
  const intervalSeconds = Math.max(
    0,
    (new Date(newReadingTs).getTime() - new Date(prior.lastReadingTs).getTime()) / 1000,
  );

  return { kind: "delta", delta, intervalSeconds };
}
