// Stochastic residential appliance load model (DATA.md §4.1) — a household
// is a set of appliances with duty cycles and diversity, not a sine wave and
// not raw Math.random(). Deterministic given a seed, so a specific meter's
// profile is reproducible (and testable) across runs.

// mulberry32 — a small, fast, seedable PRNG. Not cryptographic; this is
// load-shape synthesis, not a security primitive.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hashes a string seed (e.g. a meter serial) to a 32-bit int for mulberry32.
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface HouseholdProfile {
  hasAc: boolean;
  hasGeyser: boolean;
  eveningIntensity: number; // 0.7–1.3, per-household diversity on the peak
  baseLoadKw: number;
}

// Drawn once per meter (seeded by serial), conditioned on sanctioned load —
// a 2 kW connection cannot plausibly run a 1.5 kW AC unit continuously.
export function deriveHouseholdProfile(meterSerial: string, sanctionedLoadKw: number): HouseholdProfile {
  const rand = mulberry32(seedFromString(meterSerial));
  const acCapable = sanctionedLoadKw >= 3;
  return {
    hasAc: acCapable && rand() < 0.55,
    hasGeyser: rand() < 0.7,
    eveningIntensity: 0.7 + rand() * 0.6,
    baseLoadKw: 0.08 + rand() * 0.12,
  };
}

export interface LoadInputs {
  profile: HouseholdProfile;
  hourLocal: number; // 0–24, IST wall-clock
  isWeekend: boolean;
  ambientTempC: number;
  month: number; // 1–12, for the seasonal AC envelope
}

// AC draw scales with how far ambient temperature is above a comfort
// threshold, and Ahmedabad's summer (Apr–Jun) is when this term dominates —
// a flat annual profile is exactly the tell DATA.md warns against.
function acLoadKw(profile: HouseholdProfile, ambientTempC: number, month: number, hourLocal: number): number {
  if (!profile.hasAc) return 0;
  const isSummer = month >= 3 && month <= 6;
  const heatDrive = Math.max(0, ambientTempC - 28) / 12; // 0 at 28°C, ~1 at 40°C
  const nightRunProbabilityBoost = isSummer && (hourLocal >= 21 || hourLocal < 6) ? 1 : 0.4;
  return 1.2 * heatDrive * nightRunProbabilityBoost;
}

function timeOfDayShapeKw(hourLocal: number, isWeekend: boolean): number {
  // Morning shoulder.
  if (hourLocal >= 6 && hourLocal < 9) return 0.35;
  // Daytime — lower on a weekday (occupants at work), higher on a weekend.
  if (hourLocal >= 9 && hourLocal < 18) return isWeekend ? 0.3 : 0.12;
  // Evening peak.
  if (hourLocal >= 18 && hourLocal < 23) return 0.7;
  // Overnight base.
  return 0.05;
}

function geyserLoadKw(profile: HouseholdProfile, hourLocal: number): number {
  if (!profile.hasGeyser) return 0;
  // Morning bathing window — a short, high-draw event, not a sustained load.
  return hourLocal >= 6 && hourLocal < 8 ? 1.5 : 0;
}

// Instantaneous household load in kW. Deterministic given the same inputs —
// call once per simulated tick.
export function householdLoadKw(inputs: LoadInputs): number {
  const { profile, hourLocal, isWeekend, ambientTempC, month } = inputs;

  const base = profile.baseLoadKw;
  const shape = timeOfDayShapeKw(hourLocal, isWeekend) * profile.eveningIntensity;
  const ac = acLoadKw(profile, ambientTempC, month, hourLocal);
  const geyser = geyserLoadKw(profile, hourLocal);

  return base + shape + ac + geyser;
}
