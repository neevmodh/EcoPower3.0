import { describe, expect, it } from "vitest";
import { solarPosition } from "./solar-position";

describe("solarPosition", () => {
  it("is near-zenith at solar noon on the equinox — Ahmedabad is close to the Tropic of Cancer", () => {
    // Equinox: declination ~0°, so elevation at solar noon ~= 90 - latitude.
    const equinox = new Date("2026-03-20T00:00:00Z");
    const noonUTC = 12 - 72.58 / 15; // local solar noon, converted to UTC
    const pos = solarPosition(equinox, noonUTC);
    // Cooper's declination equation is an approximation, not an ephemeris —
    // within ~1° of the true equinox value is the model's actual precision.
    expect(Math.abs(pos.elevationDeg - (90 - 23.03))).toBeLessThan(1);
  });

  it("is below the horizon at local midnight", () => {
    const date = new Date("2026-06-15T00:00:00Z");
    const midnightUTC = 0 - 72.58 / 15;
    const pos = solarPosition(date, midnightUTC);
    expect(pos.isDaylight).toBe(false);
    expect(pos.elevationDeg).toBeLessThan(0);
  });

  it("summer solstice sun is higher than winter solstice sun at the same local hour", () => {
    const summer = new Date("2026-06-21T00:00:00Z");
    const winter = new Date("2026-12-21T00:00:00Z");
    const noonUTC = 12 - 72.58 / 15;
    const summerPos = solarPosition(summer, noonUTC);
    const winterPos = solarPosition(winter, noonUTC);
    expect(summerPos.elevationDeg).toBeGreaterThan(winterPos.elevationDeg);
  });
});
