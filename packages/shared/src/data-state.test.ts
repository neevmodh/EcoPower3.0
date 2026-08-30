import { describe, expect, it } from "vitest";
import { isStale, type ReadyDataState } from "./data-state";

function readyAt(asOf: Date, expectedIntervalMs: number): ReadyDataState<number> {
  return { status: "ready", data: 41.8, confidence: "measured", asOf, expectedIntervalMs };
}

describe("isStale", () => {
  it("is not stale when the last update is within the expected interval", () => {
    const now = new Date("2026-08-30T12:00:00Z");
    const asOf = new Date("2026-08-30T11:58:00Z"); // 2 min ago
    expect(isStale(readyAt(asOf, 5 * 60_000), now)).toBe(false);
  });

  it("is stale once the last update exceeds the expected interval", () => {
    const now = new Date("2026-08-30T12:00:00Z");
    const asOf = new Date("2026-08-30T11:50:00Z"); // 10 min ago
    expect(isStale(readyAt(asOf, 5 * 60_000), now)).toBe(true);
  });

  it("defaults to the current time when now is omitted", () => {
    const asOf = new Date(Date.now() - 1000);
    expect(isStale(readyAt(asOf, 60_000))).toBe(false);
  });
});
