import { describe, expect, it } from "vitest";
import { co2AvoidedKg, INDIA_GRID_EMISSION_FACTOR_KG_PER_KWH, treeEquivalent } from "./carbon";

describe("co2AvoidedKg", () => {
  it("multiplies exported kWh by the cited CEA combined-margin factor", () => {
    expect(co2AvoidedKg(1000)).toBeCloseTo(1000 * INDIA_GRID_EMISSION_FACTOR_KG_PER_KWH, 10);
  });

  it("is zero for zero or negative export, never negative", () => {
    expect(co2AvoidedKg(0)).toBe(0);
    expect(co2AvoidedKg(-50)).toBe(0);
  });

  it("accepts a custom grid factor for other regions", () => {
    expect(co2AvoidedKg(100, 0.5)).toBe(50);
  });
});

describe("treeEquivalent", () => {
  it("divides by the cited 21 kg CO2/tree/year figure", () => {
    expect(treeEquivalent(210)).toBe(10);
  });

  it("is zero for zero or negative input", () => {
    expect(treeEquivalent(0)).toBe(0);
    expect(treeEquivalent(-5)).toBe(0);
  });
});
