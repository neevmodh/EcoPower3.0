// The state machine every data component must handle (DESIGN.md P2), plus
// confidence rendering (P3). Pure types + the one piece of logic worth
// getting right in one place: staleness is *computed* from asOf + the
// expected refresh interval, not a flag a caller can forget to set.

export type Confidence = "measured" | "estimated" | "forecast";

export type DataState<T> =
  | { status: "loading" }
  | { status: "empty"; windowLabel: string }
  | { status: "error"; message: string }
  | {
      status: "ready";
      data: T;
      confidence: Confidence;
      asOf: Date;
      expectedIntervalMs: number;
    };

export type ReadyDataState<T> = Extract<DataState<T>, { status: "ready" }>;

export function isStale<T>(state: ReadyDataState<T>, now: Date = new Date()): boolean {
  return now.getTime() - state.asOf.getTime() > state.expectedIntervalMs;
}
