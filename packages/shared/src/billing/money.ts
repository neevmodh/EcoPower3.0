// bigint paise everywhere. Never float — this file exists so nothing else
// in the billing engine has to reach for Math or Number division for money.
// Energy quantities are bigint milli-kWh (kWh × 1000), matching the meter
// register precision seen throughout (e.g. "92.400 kWh").

export type Paise = bigint;
export type MilliKwh = bigint;

export function kwhToMilli(kwh: number): MilliKwh {
  return BigInt(Math.round(kwh * 1000));
}

export function milliToKwh(milli: MilliKwh): number {
  return Number(milli) / 1000;
}

export function rupeesToPaise(rupees: number): Paise {
  return BigInt(Math.round(rupees * 100));
}

// Round-half-up bigint division — banking/billing rounds to the nearest
// paise, it doesn't truncate. Only defined for non-negative operands, which
// is every call site in this engine (a negative charge is a credit,
// represented as a negative Paise value applied at a higher level, not as
// negative inputs to this division).
export function roundDivPaise(numerator: bigint, denominator: bigint): Paise {
  if (denominator === 0n) throw new Error("roundDivPaise: division by zero");
  const sign = (numerator < 0n) !== (denominator < 0n) ? -1n : 1n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  return sign * ((n + d / 2n) / d);
}

// quantity (milli-kWh) x rate (paise/kWh) -> paise, rounded to the nearest
// paise rather than truncated.
export function chargeForQuantity(milliKwh: MilliKwh, ratePaisePerKwh: Paise): Paise {
  return roundDivPaise(milliKwh * ratePaisePerKwh, 1000n);
}
