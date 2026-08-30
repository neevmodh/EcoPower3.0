import { type Paise, roundDivPaise } from "./money";

export type GuaranteeMetric = "cuf" | "performance_ratio" | "availability_pct" | "dmge_kwh";

export interface CufInput {
  generatedKwh: number;
  ratedCapacityKw: number;
  hoursInWindow: number;
}

// Capacity Utilization Factor — SECI/MNRE RESCO contract metric.
// CUF% = generated energy / (rated capacity * hours), as a fraction (0-1), not *100.
export function computeCuf(input: CufInput): number {
  const denominator = input.ratedCapacityKw * input.hoursInWindow;
  if (denominator <= 0) return 0;
  return input.generatedKwh / denominator;
}

export interface PerformanceRatioInput {
  actualKwh: number;
  expectedKwh: number; // from the plant's own design yield for the window, not fetched here
}

// PR = actual output / expected output, as a fraction. expectedKwh is an
// input, not computed here — this engine has zero I/O, same discipline as
// tariff-engine.ts; irradiance-derived expected yield is someone else's job.
export function computePerformanceRatio(input: PerformanceRatioInput): number {
  if (input.expectedKwh <= 0) return 0;
  return input.actualKwh / input.expectedKwh;
}

export interface AvailabilityInput {
  uptimeSeconds: number;
  windowSeconds: number;
}

export function computeAvailability(input: AvailabilityInput): number {
  if (input.windowSeconds <= 0) return 0;
  return Math.min(1, input.uptimeSeconds / input.windowSeconds);
}

// DMGE — Daily Minimum Guaranteed Energy. Achieved is just the day's kWh;
// this function exists only to name the metric alongside its siblings.
export function computeDmgeAchieved(deliveredKwh: number): number {
  return deliveredKwh;
}

export interface ShortfallCreditInput {
  metric: GuaranteeMetric;
  contractedValue: number; // same unit as achievedValue: a fraction for cuf/pr/availability, kWh for dmge
  achievedValue: number;
  ratePaisePerUnitShortfall: Paise; // paise credited per unit of shortfall (e.g. per 0.01 CUF point, or per kWh for dmge)
  capPaise: Paise | null;
}

export interface ShortfallCreditResult {
  shortfall: number; // never negative — exceeding the contract earns no negative credit
  creditPaise: Paise;
}

// Linear shortfall credit: below contract, credit scales with the gap;
// at or above contract, zero. Capped, since RESCO contracts cap exposure.
export function shortfallCredit(input: ShortfallCreditInput): ShortfallCreditResult {
  const shortfall = Math.max(0, input.contractedValue - input.achievedValue);
  if (shortfall === 0) {
    return { shortfall: 0, creditPaise: 0n };
  }
  const raw = roundDivPaise(
    BigInt(Math.round(shortfall * 1_000_000)) * input.ratePaisePerUnitShortfall,
    1_000_000n,
  );
  const credit = input.capPaise !== null && raw > input.capPaise ? input.capPaise : raw;
  return { shortfall, creditPaise: credit };
}
