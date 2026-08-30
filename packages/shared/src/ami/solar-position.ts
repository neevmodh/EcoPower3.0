// Solar position for Ahmedabad (23.03°N, 72.58°E) — the astronomical input
// the clear-sky irradiance model needs. Standard simplified NOAA-style
// formulas (declination + hour angle), not arc-second-precision ephemeris.
//
// Deliberate scope limit: no equation-of-time / longitude correction — local
// clock time is treated as solar time. That's a ±15-minute-scale error on
// the position of the peak, not a change in shape, and is not worth the
// complexity for a simulator whose job is a physically plausible curve, not
// a solar-tracker controller.

export const AHMEDABAD_LAT = 23.03;
export const AHMEDABAD_LON = 72.58;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const diff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start;
  return Math.floor(diff / 86_400_000) + 1;
}

// Solar declination in degrees, Cooper's equation.
export function solarDeclination(date: Date): number {
  const n = dayOfYear(date);
  return 23.45 * Math.sin(toRadians((360 / 365) * (284 + n)));
}

export interface SolarPosition {
  elevationDeg: number; // negative when below the horizon
  zenithDeg: number;
  isDaylight: boolean;
}

// hourUTC: fractional hour in UTC. IST is UTC+5:30, so pass
// localHour - 5.5 when the caller has IST wall-clock time.
export function solarPosition(date: Date, hourUTC: number, lat = AHMEDABAD_LAT, lon = AHMEDABAD_LON): SolarPosition {
  const declination = solarDeclination(date);
  // Longitude shifts local solar noon: 15° of longitude = 1 hour.
  const solarHour = hourUTC + lon / 15;
  const hourAngleDeg = 15 * (solarHour - 12);

  const latRad = toRadians(lat);
  const decRad = toRadians(declination);
  const hourRad = toRadians(hourAngleDeg);

  const sinElevation = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourRad);
  const elevationDeg = toDegrees(Math.asin(Math.max(-1, Math.min(1, sinElevation))));

  return {
    elevationDeg,
    zenithDeg: 90 - elevationDeg,
    isDaylight: elevationDeg > 0,
  };
}
