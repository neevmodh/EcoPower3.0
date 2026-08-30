import { describe, expect, it } from "vitest";
import {
  computeAvailability,
  computeCuf,
  computeDmgeAchieved,
  computePerformanceRatio,
  shortfallCredit,
} from "./guarantee-engine";
import { rupeesToPaise } from "./money";

describe("computeCuf", () => {
  it("computes CUF as a fraction, matching SECI Category A's 15% minimum", () => {
    // 5 kW plant, 30-day month, delivering exactly the Category A floor.
    const hours = 30 * 24;
    const generatedKwh = 0.15 * 5 * hours;
    expect(computeCuf({ generatedKwh, ratedCapacityKw: 5, hoursInWindow: hours })).toBeCloseTo(0.15, 10);
  });

  it("returns 0 for a zero or negative rated capacity instead of dividing by zero", () => {
    expect(computeCuf({ generatedKwh: 100, ratedCapacityKw: 0, hoursInWindow: 720 })).toBe(0);
  });
});

describe("computePerformanceRatio", () => {
  it("computes PR as a fraction, matching a typical 75-80% PPA guarantee", () => {
    expect(computePerformanceRatio({ actualKwh: 780, expectedKwh: 1000 })).toBeCloseTo(0.78, 10);
  });

  it("returns 0 when expected yield is zero rather than dividing by zero", () => {
    expect(computePerformanceRatio({ actualKwh: 10, expectedKwh: 0 })).toBe(0);
  });
});

describe("computeAvailability", () => {
  it("computes uptime as a fraction of the window", () => {
    expect(computeAvailability({ uptimeSeconds: 86400 * 29, windowSeconds: 86400 * 30 })).toBeCloseTo(29 / 30, 10);
  });

  it("clamps at 1 even if uptime is reported longer than the window", () => {
    expect(computeAvailability({ uptimeSeconds: 90000, windowSeconds: 86400 })).toBe(1);
  });
});

describe("computeDmgeAchieved", () => {
  it("is just the day's delivered energy", () => {
    expect(computeDmgeAchieved(42.5)).toBe(42.5);
  });
});

describe("shortfallCredit", () => {
  it("credits zero when the contract is met exactly", () => {
    const result = shortfallCredit({
      metric: "cuf",
      contractedValue: 0.15,
      achievedValue: 0.15,
      ratePaisePerUnitShortfall: rupeesToPaise(1000),
      capPaise: null,
    });
    expect(result.shortfall).toBe(0);
    expect(result.creditPaise).toBe(0n);
  });

  it("credits zero when the plant exceeds the contract, never a negative credit", () => {
    const result = shortfallCredit({
      metric: "cuf",
      contractedValue: 0.15,
      achievedValue: 0.18,
      ratePaisePerUnitShortfall: rupeesToPaise(1000),
      capPaise: null,
    });
    expect(result.shortfall).toBe(0);
    expect(result.creditPaise).toBe(0n);
  });

  it("scales credit linearly with the shortfall below contract", () => {
    // Contracted 15% CUF, achieved 12% -> 0.03 shortfall at Rs 1000/point.
    const result = shortfallCredit({
      metric: "cuf",
      contractedValue: 0.15,
      achievedValue: 0.12,
      ratePaisePerUnitShortfall: rupeesToPaise(1000),
      capPaise: null,
    });
    expect(result.shortfall).toBeCloseTo(0.03, 10);
    expect(result.creditPaise).toBe(rupeesToPaise(30)); // 0.03 * 1000
  });

  it("caps the credit at the contract's cap_paise regardless of shortfall size", () => {
    const result = shortfallCredit({
      metric: "dmge_kwh",
      contractedValue: 20,
      achievedValue: 0, // total outage
      ratePaisePerUnitShortfall: rupeesToPaise(50),
      capPaise: rupeesToPaise(500),
    });
    expect(result.shortfall).toBe(20);
    expect(result.creditPaise).toBe(rupeesToPaise(500)); // 20 * 50 = 1000, capped to 500
  });

  it("handles DMGE shortfall uncapped below the cap threshold", () => {
    const result = shortfallCredit({
      metric: "dmge_kwh",
      contractedValue: 20,
      achievedValue: 15,
      ratePaisePerUnitShortfall: rupeesToPaise(50),
      capPaise: rupeesToPaise(500),
    });
    expect(result.shortfall).toBe(5);
    expect(result.creditPaise).toBe(rupeesToPaise(250)); // 5 * 50, under cap
  });
});
