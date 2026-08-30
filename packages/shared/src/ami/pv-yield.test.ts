import { describe, expect, it } from "vitest";
import { clearSkyGHI, pvYieldKw, temperatureDerate } from "./pv-yield";
import { solarPosition } from "./solar-position";

describe("clearSkyGHI", () => {
  it("is zero below the horizon", () => {
    expect(clearSkyGHI({ elevationDeg: -5, zenithDeg: 95, isDaylight: false })).toBe(0);
  });

  it("is near the ~1000 W/m² textbook peak at zenith overhead", () => {
    const ghi = clearSkyGHI({ elevationDeg: 90, zenithDeg: 0, isDaylight: true });
    expect(ghi).toBeGreaterThan(900);
    expect(ghi).toBeLessThan(1100);
  });

  it("decreases monotonically as zenith angle increases", () => {
    const near = clearSkyGHI({ elevationDeg: 60, zenithDeg: 30, isDaylight: true });
    const far = clearSkyGHI({ elevationDeg: 20, zenithDeg: 70, isDaylight: true });
    expect(near).toBeGreaterThan(far);
  });
});

describe("temperatureDerate", () => {
  it("is 1.0 exactly at STC ambient (25°C - 20°C NOCT rise = ... )", () => {
    // cellTemp = ambient + 20; derate is 1 only when cellTemp == 25.
    expect(temperatureDerate(5)).toBeCloseTo(1, 5);
  });

  it("derates output at high ambient temperature — Ahmedabad summer, not free energy", () => {
    const hot = temperatureDerate(42);
    expect(hot).toBeLessThan(1);
  });
});

describe("pvYieldKw", () => {
  it("is zero at night regardless of capacity", () => {
    const midnightUTC = 0 - 72.58 / 15;
    const yieldKw = pvYieldKw({
      date: new Date("2026-06-15T00:00:00Z"),
      hourUTC: midnightUTC,
      capacityKw: 5,
      cloudCoverFraction: 0,
    });
    expect(yieldKw).toBe(0);
  });

  it("full cloud cover reduces but does not zero out generation — diffuse light still passes", () => {
    const noonUTC = 12 - 72.58 / 15;
    const clear = pvYieldKw({
      date: new Date("2026-06-15T00:00:00Z"),
      hourUTC: noonUTC,
      capacityKw: 5,
      cloudCoverFraction: 0,
    });
    const overcast = pvYieldKw({
      date: new Date("2026-06-15T00:00:00Z"),
      hourUTC: noonUTC,
      capacityKw: 5,
      cloudCoverFraction: 1,
    });
    expect(overcast).toBeGreaterThan(0);
    expect(overcast).toBeLessThan(clear);
  });

  it("never exceeds capacity even at solar noon with a hot panel", () => {
    const noonUTC = 12 - 72.58 / 15;
    const yieldKw = pvYieldKw({
      date: new Date("2026-06-15T00:00:00Z"),
      hourUTC: noonUTC,
      capacityKw: 5,
      cloudCoverFraction: 0,
      ambientTempC: 45,
    });
    expect(yieldKw).toBeLessThanOrEqual(5);
  });

  it("soiling reduces yield relative to a clean array under identical conditions", () => {
    const noonUTC = 12 - 72.58 / 15;
    const clean = pvYieldKw({
      date: new Date("2026-06-15T00:00:00Z"),
      hourUTC: noonUTC,
      capacityKw: 5,
      cloudCoverFraction: 0,
      soilingFactor: 1,
    });
    const soiled = pvYieldKw({
      date: new Date("2026-06-15T00:00:00Z"),
      hourUTC: noonUTC,
      capacityKw: 5,
      cloudCoverFraction: 0,
      soilingFactor: 0.85,
    });
    expect(soiled).toBeLessThan(clean);
  });
});
