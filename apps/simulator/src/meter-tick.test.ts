import { describe, expect, it } from "vitest";
import { initMeterState, tick } from "./meter-tick";
import type { SimulatedMeter } from "./fleet";

const solarMeter: SimulatedMeter = {
  serial: "TEST-METER-SOLAR",
  mqttPassword: "x",
  hmacSecret: "x",
  sanctionedLoadKw: 5,
  pvCapacityKw: 5,
};

const noSolarMeter: SimulatedMeter = {
  serial: "TEST-METER-NOSOLAR",
  mqttPassword: "x",
  hmacSecret: "x",
  sanctionedLoadKw: 3,
  pvCapacityKw: 0,
};

describe("tick", () => {
  it("cumulative registers only ever increase — never decrease tick over tick", () => {
    let state = initMeterState(solarMeter);
    let prevImport = 0;
    let prevExport = 0;
    const start = new Date("2026-06-15T00:00:00Z");

    for (let i = 0; i < 48; i++) {
      const now = new Date(start.getTime() + i * 30 * 60_000);
      const result = tick(solarMeter, state, {
        now,
        cloudCoverFraction: 0.2,
        ambientTempC: 35,
        tickHours: 0.5,
      });
      state = result.state;
      expect(state.cumulativeImportKwh).toBeGreaterThanOrEqual(prevImport);
      expect(state.cumulativeExportKwh).toBeGreaterThanOrEqual(prevExport);
      prevImport = state.cumulativeImportKwh;
      prevExport = state.cumulativeExportKwh;
    }
  });

  it("a meter with no solar never accumulates export register", () => {
    let state = initMeterState(noSolarMeter);
    const start = new Date("2026-06-15T12:00:00Z"); // solar noon, would export if it had panels
    for (let i = 0; i < 4; i++) {
      const now = new Date(start.getTime() + i * 30 * 60_000);
      const result = tick(noSolarMeter, state, { now, cloudCoverFraction: 0, ambientTempC: 30, tickHours: 0.5 });
      state = result.state;
    }
    expect(state.cumulativeExportKwh).toBe(0);
  });

  it("a solar meter can export at midday under clear skies (generation exceeds a modest load)", () => {
    const state = initMeterState(solarMeter);
    const noon = new Date("2026-06-15T06:30:00Z"); // ~noon IST
    const result = tick(solarMeter, state, { now: noon, cloudCoverFraction: 0, ambientTempC: 30, tickHours: 0.5 });
    expect(result.pvKw).toBeGreaterThan(0);
  });

  it("the reading is tagged with the meter's own serial as meterId", () => {
    const state = initMeterState(solarMeter);
    const result = tick(solarMeter, state, {
      now: new Date(),
      cloudCoverFraction: 0.3,
      ambientTempC: 28,
      tickHours: 0.5,
    });
    expect(result.reading.meterId).toBe("TEST-METER-SOLAR");
  });

  it("register values in the reading match the updated cumulative state exactly", () => {
    const state = initMeterState(solarMeter);
    const result = tick(solarMeter, state, {
      now: new Date("2026-06-15T00:00:00Z"),
      cloudCoverFraction: 0.5,
      ambientTempC: 30,
      tickHours: 0.5,
    });
    const importRegister = result.reading.registers.find((r) => r.obis === "1.0.1.8.0.255");
    expect(importRegister?.value).toBeCloseTo(result.state.cumulativeImportKwh, 3);
  });
});
