import { describe, expect, it } from "vitest";
import { evaluateRegister, type RegisterState } from "./monotonicity";

describe("evaluateRegister", () => {
  it("returns first-reading when there's no prior state", () => {
    const result = evaluateRegister(undefined, 41.8, "2026-06-15T00:00:00Z");
    expect(result.kind).toBe("first-reading");
  });

  it("computes a positive delta when the register increased", () => {
    const prior: RegisterState = { meterId: "M1", obis: "1.0.1.8.0.255", lastValue: 100, lastReadingTs: "2026-06-15T00:00:00Z" };
    const result = evaluateRegister(prior, 101.5, "2026-06-15T00:30:00Z");
    expect(result.kind).toBe("delta");
    if (result.kind === "delta") {
      expect(result.delta).toBeCloseTo(1.5, 5);
      expect(result.intervalSeconds).toBe(1800);
    }
  });

  it("treats an unchanged register as a zero delta, not a rollover", () => {
    const prior: RegisterState = { meterId: "M1", obis: "1.0.1.8.0.255", lastValue: 100, lastReadingTs: "2026-06-15T00:00:00Z" };
    const result = evaluateRegister(prior, 100, "2026-06-15T00:30:00Z");
    expect(result.kind).toBe("delta");
    if (result.kind === "delta") expect(result.delta).toBe(0);
  });

  it("flags a decrease as a rollover — never emits a negative delta", () => {
    const prior: RegisterState = { meterId: "M1", obis: "1.0.1.8.0.255", lastValue: 9999.5, lastReadingTs: "2026-06-15T00:00:00Z" };
    const result = evaluateRegister(prior, 0.3, "2026-06-15T00:30:00Z");
    expect(result.kind).toBe("rollover");
    if (result.kind === "rollover") {
      expect(result.previousValue).toBe(9999.5);
      expect(result.newValue).toBe(0.3);
    }
  });

  it("never produces a delta result with a negative delta value, across many random-ish inputs", () => {
    const prior: RegisterState = { meterId: "M1", obis: "1.0.1.8.0.255", lastValue: 500, lastReadingTs: "2026-06-15T00:00:00Z" };
    for (const candidate of [499, 500, 500.001, 600, 1000]) {
      const result = evaluateRegister(prior, candidate, "2026-06-15T00:30:00Z");
      if (result.kind === "delta") {
        expect(result.delta).toBeGreaterThanOrEqual(0);
      } else {
        expect(result.kind).toBe("rollover");
      }
    }
  });
});
