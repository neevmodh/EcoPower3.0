// Pure tick logic: given a meter's running cumulative state plus the
// current physical conditions, compute this tick's reading and the updated
// state. Kept separate from the MQTT/timer wiring in index.ts so it's
// testable without a broker.

import {
  deriveHouseholdProfile,
  householdLoadKw,
  pvYieldKw,
  type HouseholdProfile,
  type Reading,
} from "@ecopower/shared";
import type { SimulatedMeter } from "./fleet.js";

export interface MeterRunningState {
  cumulativeImportKwh: number;
  cumulativeExportKwh: number;
  profile: HouseholdProfile;
}

export function initMeterState(meter: SimulatedMeter): MeterRunningState {
  return {
    cumulativeImportKwh: 0,
    cumulativeExportKwh: 0,
    profile: deriveHouseholdProfile(meter.serial, meter.sanctionedLoadKw),
  };
}

export interface TickConditions {
  now: Date; // wall-clock instant this tick represents
  cloudCoverFraction: number;
  ambientTempC: number;
  tickHours: number; // simulated duration this tick advances the registers by
}

export interface TickResult {
  state: MeterRunningState;
  reading: Reading;
  loadKw: number;
  pvKw: number;
  netKw: number; // positive = importing from grid, negative = exporting
}

function istHour(date: Date): number {
  const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60;
  return (utcHour + 5.5) % 24;
}

export function tick(meter: SimulatedMeter, state: MeterRunningState, conditions: TickConditions): TickResult {
  const hourLocal = istHour(conditions.now);
  const month = conditions.now.getUTCMonth() + 1;
  const day = conditions.now.getUTCDay();
  const isWeekend = day === 0 || day === 6;

  const loadKw = householdLoadKw({
    profile: state.profile,
    hourLocal,
    isWeekend,
    ambientTempC: conditions.ambientTempC,
    month,
  });

  const pvKw =
    meter.pvCapacityKw > 0
      ? pvYieldKw({
          date: conditions.now,
          hourUTC: conditions.now.getUTCHours() + conditions.now.getUTCMinutes() / 60,
          capacityKw: meter.pvCapacityKw,
          cloudCoverFraction: conditions.cloudCoverFraction,
          ambientTempC: conditions.ambientTempC,
        })
      : 0;

  const netKw = loadKw - pvKw;

  const nextState: MeterRunningState = {
    ...state,
    cumulativeImportKwh: state.cumulativeImportKwh + Math.max(0, netKw) * conditions.tickHours,
    cumulativeExportKwh: state.cumulativeExportKwh + Math.max(0, -netKw) * conditions.tickHours,
  };

  const reading: Reading = {
    meterId: meter.serial,
    timestamp: conditions.now.toISOString(),
    registers: [
      { obis: "1.0.1.8.0.255", value: round3(nextState.cumulativeImportKwh), unit: "kWh" },
      { obis: "1.0.2.8.0.255", value: round3(nextState.cumulativeExportKwh), unit: "kWh" },
    ],
    instantaneous: {
      voltageR: 230 + (Math.random() - 0.5) * 4,
      voltageY: 230 + (Math.random() - 0.5) * 4,
      voltageB: 230 + (Math.random() - 0.5) * 4,
      currentR: round3(netKw >= 0 ? (netKw * 1000) / 230 / 3 : 0),
      currentY: round3(netKw >= 0 ? (netKw * 1000) / 230 / 3 : 0),
      currentB: round3(netKw >= 0 ? (netKw * 1000) / 230 / 3 : 0),
      powerFactor: 0.95 + Math.random() * 0.04,
      frequencyHz: 50 + (Math.random() - 0.5) * 0.1,
    },
  };

  return { state: nextState, reading, loadKw, pvKw, netKw };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
