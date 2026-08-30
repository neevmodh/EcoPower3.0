import { describe, expect, it } from "vitest";
import { deriveHouseholdProfile, householdLoadKw, seedFromString } from "./appliance-load";

describe("deriveHouseholdProfile", () => {
  it("is deterministic for the same meter serial", () => {
    const a = deriveHouseholdProfile("MTR-001", 5);
    const b = deriveHouseholdProfile("MTR-001", 5);
    expect(a).toEqual(b);
  });

  it("differs across meter serials — not every household is identical", () => {
    const a = deriveHouseholdProfile("MTR-001", 5);
    const b = deriveHouseholdProfile("MTR-002", 5);
    expect(a).not.toEqual(b);
  });

  it("never gives AC to a connection too small to plausibly run one", () => {
    for (let i = 0; i < 50; i++) {
      const profile = deriveHouseholdProfile(`MTR-${i}`, 1);
      expect(profile.hasAc).toBe(false);
    }
  });
});

describe("seedFromString", () => {
  it("is a stable hash — same input, same output", () => {
    expect(seedFromString("MTR-001")).toBe(seedFromString("MTR-001"));
  });
});

describe("householdLoadKw", () => {
  const baseProfile = deriveHouseholdProfile("MTR-TEST", 5);

  it("evening load exceeds overnight base load", () => {
    const evening = householdLoadKw({ profile: baseProfile, hourLocal: 20, isWeekend: false, ambientTempC: 30, month: 6 });
    const overnight = householdLoadKw({ profile: baseProfile, hourLocal: 3, isWeekend: false, ambientTempC: 28, month: 6 });
    expect(evening).toBeGreaterThan(overnight);
  });

  it("a household with AC draws more on a hot summer night than a mild winter one", () => {
    const acProfile = { ...baseProfile, hasAc: true };
    const summerNight = householdLoadKw({ profile: acProfile, hourLocal: 22, isWeekend: false, ambientTempC: 38, month: 5 });
    const winterNight = householdLoadKw({ profile: acProfile, hourLocal: 22, isWeekend: false, ambientTempC: 18, month: 12 });
    expect(summerNight).toBeGreaterThan(winterNight);
  });

  it("a household without AC is unaffected by ambient temperature", () => {
    const noAcProfile = { ...baseProfile, hasAc: false };
    const hot = householdLoadKw({ profile: noAcProfile, hourLocal: 22, isWeekend: false, ambientTempC: 40, month: 5 });
    const mild = householdLoadKw({ profile: noAcProfile, hourLocal: 22, isWeekend: false, ambientTempC: 25, month: 5 });
    expect(hot).toBe(mild);
  });

  it("load is always positive — never a negative or zero household draw", () => {
    for (let hour = 0; hour < 24; hour++) {
      const load = householdLoadKw({ profile: baseProfile, hourLocal: hour, isWeekend: false, ambientTempC: 28, month: 6 });
      expect(load).toBeGreaterThan(0);
    }
  });
});
