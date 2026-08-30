// Clear-sky irradiance and PV yield — the generation half of #12's physical
// model. Haurwitz's clear-sky model (1945) for GHI from zenith angle alone:
// simple, textbook, and accurate enough that the difference from a heavier
// model (Ineichen, REST2) doesn't show up at the precision this simulator
// operates at. Cloud cover, soiling, and temperature are applied as
// multiplicative derates on top — this is the "clear-sky curve × cloud
// factor × soiling ramp × temperature derate" DATA.md §3.1 specifies.

import { solarPosition, type SolarPosition } from "./solar-position";

// Haurwitz clear-sky GHI, W/m². Zero below the horizon.
export function clearSkyGHI(position: SolarPosition): number {
  if (!position.isDaylight) return 0;
  const zenithRad = (position.zenithDeg * Math.PI) / 180;
  const cosZenith = Math.cos(zenithRad);
  return 1098 * cosZenith * Math.exp(-0.059 / Math.max(cosZenith, 0.01));
}

export interface PvYieldInputs {
  date: Date;
  hourUTC: number;
  capacityKw: number;
  cloudCoverFraction: number; // 0 (clear) to 1 (fully overcast) — from a weather API
  soilingFactor?: number; // 1 = clean, gradually decreases over weeks without cleaning (DATA.md §4.3)
  ambientTempC?: number; // for temperature derate; defaults to a mild 25°C
}

// Standard crystalline-silicon temperature coefficient: output drops ~0.4%
// per °C above 25°C cell temperature. Cell temp is approximated as ambient
// + 20°C under load (NOCT-style approximation), not modelled from wind/mounting.
const TEMP_COEFFICIENT_PER_C = -0.004;
const STC_TEMP_C = 25;
const NOCT_CELL_RISE_C = 20;

export function temperatureDerate(ambientTempC: number): number {
  const cellTempC = ambientTempC + NOCT_CELL_RISE_C;
  return 1 + TEMP_COEFFICIENT_PER_C * (cellTempC - STC_TEMP_C);
}

// Output in kW. Performance ratio band from DATA.md §3.1 (0.78–0.85 typical
// Indian rooftop) is implicit in the product of these derates, not a
// separate hardcoded multiplier — that is the point of modelling the terms
// instead of the ratio.
export function pvYieldKw(inputs: PvYieldInputs): number {
  const position = solarPosition(inputs.date, inputs.hourUTC);
  const ghi = clearSkyGHI(position);
  const cloudFactor = 1 - inputs.cloudCoverFraction * 0.75; // overcast still passes diffuse light
  const soiling = inputs.soilingFactor ?? 1;
  const tempDerate = temperatureDerate(inputs.ambientTempC ?? 25);

  // 1000 W/m^2 at STC is the reference irradiance a panel's rated capacity
  // is measured against.
  const irradianceFraction = ghi / 1000;

  const yieldKw = inputs.capacityKw * irradianceFraction * cloudFactor * soiling * tempDerate;
  return Math.max(0, yieldKw);
}
