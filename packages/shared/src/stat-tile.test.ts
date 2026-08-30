import { describe, expect, it } from "vitest";
import { computeDelta, formatInrFromPaise, formatNumber } from "./stat-tile";

describe("computeDelta", () => {
  it("returns null with no data — never a fake badge on 0.0", () => {
    // This is the exact 2.0 bug: "Solar Generated 0.0 kWh" with a badged +12%.
    expect(computeDelta(null, { value: 37.2, windowLabel: "last week" })).toBeNull();
    expect(computeDelta(undefined, { value: 37.2, windowLabel: "last week" })).toBeNull();
  });

  it("returns null with no comparison window — no basis, no badge", () => {
    expect(computeDelta(41.8, null)).toBeNull();
    expect(computeDelta(41.8, undefined)).toBeNull();
  });

  it("returns null against a zero basis rather than an undefined/infinite percent", () => {
    expect(computeDelta(41.8, { value: 0, windowLabel: "last week" })).toBeNull();
  });

  it("computes a real, signed delta when both current and basis exist", () => {
    const delta = computeDelta(41.8, { value: 37.2, windowLabel: "last week" });
    expect(delta).not.toBeNull();
    expect(delta?.direction).toBe("up");
    expect(delta?.percent).toBeCloseTo(12.37, 1);
    expect(delta?.windowLabel).toBe("last week");
  });

  it("a genuinely measured zero against a real basis produces an honest -100% badge", () => {
    // Distinguishes "0 was measured" (legitimate, shows a real badge) from
    // "no data" (value is null, shows nothing) — the whole point of P1.
    const delta = computeDelta(0, { value: 37.2, windowLabel: "last week" });
    expect(delta).not.toBeNull();
    expect(delta?.percent).toBeCloseTo(-100, 5);
    expect(delta?.direction).toBe("down");
  });
});

describe("formatInrFromPaise", () => {
  it("returns an em dash for no data, not ₹0.00", () => {
    expect(formatInrFromPaise(null)).toBe("—");
    expect(formatInrFromPaise(undefined)).toBe("—");
  });

  it("is exactly two decimals by construction — reproduces and fixes 2.0's ₹1,063,717.882 bug", () => {
    // 2.0 rendered a float with three decimals. The equivalent paise value:
    const paise = 106371788n; // ₹1,063,717.88
    expect(formatInrFromPaise(paise)).toBe("₹10,63,717.88");
    expect(formatInrFromPaise(paise)).not.toContain(".882");
  });

  it("formats zero paise as ₹0.00, not an em dash — zero is not the same as no data", () => {
    expect(formatInrFromPaise(0n)).toBe("₹0.00");
  });

  it("handles negative amounts", () => {
    expect(formatInrFromPaise(-15000n)).toBe("-₹150.00");
  });

  it("never loses a paise digit regardless of magnitude", () => {
    expect(formatInrFromPaise(1n)).toBe("₹0.01");
    expect(formatInrFromPaise(9n)).toBe("₹0.09");
    expect(formatInrFromPaise(100n)).toBe("₹1.00");
  });
});

describe("formatNumber", () => {
  it("returns an em dash for no data", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
  });

  it("renders a genuinely measured zero as 0, not an em dash", () => {
    expect(formatNumber(0, "kWh")).toBe("0 kWh");
  });

  it("appends the unit when given", () => {
    expect(formatNumber(41.8, "kWh")).toBe("41.8 kWh");
  });
});
