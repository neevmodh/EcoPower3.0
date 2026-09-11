import { describe, expect, it } from "vitest";
import { kwhToMilli, rupeesToPaise } from "./money";
import { type PlanCandidate, recommendPlan } from "./plan-recommender";
import type { TariffSlab } from "./tariff-engine";

// Same real RGP tariff as tariff-engine.test.ts (0008_tariff_seed.sql).
const RGP_SLABS: TariffSlab[] = [
  { uptoKwh: 50, ratePaisePerKwh: rupeesToPaise(3.2) },
  { uptoKwh: 200, ratePaisePerKwh: rupeesToPaise(3.95) },
  { uptoKwh: null, ratePaisePerKwh: rupeesToPaise(5.0) },
];

const FLAT_MONTHLY_KWH = new Array(12).fill(0).map(() => kwhToMilli(300));

describe("recommendPlan", () => {
  it("rejects anything other than exactly 12 months", () => {
    expect(() => recommendPlan([kwhToMilli(100)], RGP_SLABS, [])).toThrow(/12 months/);
  });

  it("baseline is the sum of 12 real slabEngine bills, not an approximation", () => {
    const result = recommendPlan(FLAT_MONTHLY_KWH, RGP_SLABS, []);
    // 300 kWh/month through the real RGP slabs: 50@3.20 + 150@3.95 + 100@5.00
    const perMonth = rupeesToPaise(50 * 3.2 + 150 * 3.95 + 100 * 5.0);
    expect(result.baselineGridOnlyPaise).toBe(perMonth * 12n);
  });

  it("with no plans, there is nothing to recommend, not a crash", () => {
    const result = recommendPlan(FLAT_MONTHLY_KWH, RGP_SLABS, []);
    expect(result.ranked).toHaveLength(0);
    expect(result.bestPlanId).toBeNull();
    expect(result.bestSavingsPaise).toBe(0n);
  });

  it("picks the cheapest plan by exact 12-month cost, including overage", () => {
    const cheapButNarrow: PlanCandidate = {
      planId: "narrow",
      planName: "Narrow allowance",
      pricePaisePerMonth: rupeesToPaise(500),
      includedQuantityMilliKwh: kwhToMilli(100), // 200 kWh/month overage at 300 kWh usage
      overageRatePaisePerKwh: rupeesToPaise(6.0), // deliberately expensive overage
    };
    const pricierButGenerous: PlanCandidate = {
      planId: "generous",
      planName: "Generous allowance",
      pricePaisePerMonth: rupeesToPaise(1200),
      includedQuantityMilliKwh: kwhToMilli(300), // exactly covers usage, zero overage
      overageRatePaisePerKwh: rupeesToPaise(6.0),
    };

    const result = recommendPlan(FLAT_MONTHLY_KWH, RGP_SLABS, [cheapButNarrow, pricierButGenerous]);

    // narrow: (500*12) + (200kWh * 6.00 * 12 months) = 6,000 + 14,400 = 20,400
    // generous: 1200*12 + 0 = 14,400
    expect(result.ranked[0].planId).toBe("generous");
    expect(result.ranked[0].totalPaise).toBe(rupeesToPaise(14_400));
    expect(result.ranked[1].planId).toBe("narrow");
    expect(result.ranked[1].totalPaise).toBe(rupeesToPaise(20_400));
    expect(result.bestPlanId).toBe("generous");
  });

  it("an honest negative recommendation: no plan beats staying on the grid tariff", () => {
    const overpriced: PlanCandidate = {
      planId: "overpriced",
      planName: "Overpriced",
      pricePaisePerMonth: rupeesToPaise(5000),
      includedQuantityMilliKwh: kwhToMilli(300),
      overageRatePaisePerKwh: rupeesToPaise(6.0),
    };
    const result = recommendPlan(FLAT_MONTHLY_KWH, RGP_SLABS, [overpriced]);
    expect(result.bestSavingsPaise).toBeLessThan(0n);
  });

  it("ranking is a pure function of the inputs — same call, same order, no hidden state", () => {
    const plans: PlanCandidate[] = [
      { planId: "a", planName: "A", pricePaisePerMonth: rupeesToPaise(900), includedQuantityMilliKwh: kwhToMilli(250), overageRatePaisePerKwh: rupeesToPaise(5.5) },
      { planId: "b", planName: "B", pricePaisePerMonth: rupeesToPaise(1100), includedQuantityMilliKwh: kwhToMilli(350), overageRatePaisePerKwh: rupeesToPaise(5.5) },
    ];
    const first = recommendPlan(FLAT_MONTHLY_KWH, RGP_SLABS, plans);
    const second = recommendPlan(FLAT_MONTHLY_KWH, RGP_SLABS, plans);
    expect(first).toEqual(second);
  });
});
