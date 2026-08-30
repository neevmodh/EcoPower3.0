import { describe, expect, it } from "vitest";
import { chargeForQuantity, kwhToMilli, milliToKwh, roundDivPaise, rupeesToPaise } from "./money";

describe("kwhToMilli / milliToKwh", () => {
  it("round-trips 92.400 kWh exactly", () => {
    expect(kwhToMilli(92.4)).toBe(92400n);
    expect(milliToKwh(92400n)).toBe(92.4);
  });
});

describe("rupeesToPaise", () => {
  it("converts ₹3.05 to 305 paise", () => {
    expect(rupeesToPaise(3.05)).toBe(305n);
  });
});

describe("roundDivPaise", () => {
  it("rounds half up, not down (truncation would be wrong for billing)", () => {
    expect(roundDivPaise(15n, 10n)).toBe(2n); // 1.5 -> 2
    expect(roundDivPaise(14n, 10n)).toBe(1n); // 1.4 -> 1
  });

  it("divides exactly when it divides exactly", () => {
    expect(roundDivPaise(48048000n, 1000n)).toBe(48048n);
  });

  it("throws on division by zero rather than returning Infinity/NaN", () => {
    expect(() => roundDivPaise(1n, 0n)).toThrow();
  });
});

describe("chargeForQuantity", () => {
  it("reproduces the ROADMAP worked example's individual slab amounts exactly", () => {
    // 92.400 kWh @ ₹5.20 = ₹480.48
    expect(chargeForQuantity(92400n, 520n)).toBe(48048n);
    // 150 kWh @ ₹4.15 = ₹622.50
    expect(chargeForQuantity(150000n, 415n)).toBe(62250n);
  });
});
