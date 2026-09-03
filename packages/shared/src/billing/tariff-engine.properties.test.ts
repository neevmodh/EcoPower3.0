// Property tests for the tariff engine (#25). The engine's unit tests
// (tariff-engine.test.ts) pin specific worked examples; these pin the
// *invariants* that must hold for every input — the things a future
// "small" change to slabEngine could quietly break.
//
// No property-testing library: a seeded mulberry32 loop (the same PRNG the
// seed scripts use) gives deterministic, reproducible cases without a new
// dependency. Each property runs CASES times.

import { describe, expect, it } from "vitest";
import {
  chargeForQuantity,
  kwhToMilli,
  type Paise,
  roundDivPaise,
  rupeesToPaise,
} from "./money";
import {
  composeInvoice,
  dutyAndTaxes,
  fixedCharge,
  type FixedChargeBand,
  netMeteringSettlement,
  prepaidDebit,
  slabEngine,
  type TariffSlab,
  touEngine,
} from "./tariff-engine";

const CASES = 400;

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

/** A random but well-formed telescopic slab schedule: 1–5 slabs, ascending
 *  thresholds, last slab unbounded, positive rates. */
function randomSlabs(rand: () => number): TariffSlab[] {
  const count = 1 + Math.floor(rand() * 5);
  const slabs: TariffSlab[] = [];
  let threshold = 0;
  for (let i = 0; i < count; i++) {
    threshold += 20 + Math.floor(rand() * 180);
    const last = i === count - 1;
    slabs.push({
      uptoKwh: last ? null : threshold,
      ratePaisePerKwh: rupeesToPaise(1 + rand() * 9),
    });
  }
  return slabs;
}

describe("slabEngine — properties", () => {
  it("P1 monotonic in consumption: more kWh never bills less", () => {
    const rand = mulberry32(1);
    for (let c = 0; c < CASES; c++) {
      const slabs = randomSlabs(rand);
      const a = kwhToMilli(Math.floor(rand() * 800));
      const b = a + kwhToMilli(Math.floor(rand() * 400));
      expect(slabEngine(b, slabs).totalPaise).toBeGreaterThanOrEqual(slabEngine(a, slabs).totalPaise);
    }
  });

  it("P2 quantity conservation: line quantities sum to the input", () => {
    const rand = mulberry32(2);
    for (let c = 0; c < CASES; c++) {
      const slabs = randomSlabs(rand);
      const total = kwhToMilli(Math.floor(rand() * 1000));
      const summed = slabEngine(total, slabs).lines.reduce((s, l) => s + l.quantityMilliKwh, 0n);
      expect(summed).toBe(total);
    }
  });

  it("P3 amount conservation: line amounts sum to totalPaise", () => {
    const rand = mulberry32(3);
    for (let c = 0; c < CASES; c++) {
      const slabs = randomSlabs(rand);
      const { lines, totalPaise } = slabEngine(kwhToMilli(Math.floor(rand() * 1000)), slabs);
      expect(lines.reduce((s, l) => s + l.amountPaise, 0n)).toBe(totalPaise);
    }
  });

  it("P4 zero consumption bills zero with no lines — never a fabricated line", () => {
    const rand = mulberry32(4);
    for (let c = 0; c < CASES; c++) {
      const r = slabEngine(0n, randomSlabs(rand));
      expect(r.totalPaise).toBe(0n);
      expect(r.lines).toHaveLength(0);
    }
  });

  it("P5 non-negative total for every valid schedule", () => {
    const rand = mulberry32(5);
    for (let c = 0; c < CASES; c++) {
      expect(slabEngine(kwhToMilli(Math.floor(rand() * 2000)), randomSlabs(rand)).totalPaise).toBeGreaterThanOrEqual(0n);
    }
  });

  it("P6 effective rate stays within [min slab rate, max slab rate]", () => {
    const rand = mulberry32(6);
    for (let c = 0; c < CASES; c++) {
      const slabs = randomSlabs(rand);
      const milli = kwhToMilli(1 + Math.floor(rand() * 1000));
      const { totalPaise } = slabEngine(milli, slabs);
      const rates = slabs.map((s) => s.ratePaisePerKwh);
      const lo = rates.reduce((m, r) => (r < m ? r : m));
      const hi = rates.reduce((m, r) => (r > m ? r : m));
      // effective paise-per-kWh = total / kWh, compared in milli precision
      const effLo = roundDivPaise(milli * lo, 1000n);
      const effHi = roundDivPaise(milli * hi, 1000n);
      expect(totalPaise).toBeGreaterThanOrEqual(effLo);
      expect(totalPaise).toBeLessThanOrEqual(effHi);
    }
  });

  it("P7 splitting a bill at any kWh point gives the same total (telescoping is associative)", () => {
    const rand = mulberry32(7);
    for (let c = 0; c < CASES; c++) {
      const slabs = randomSlabs(rand);
      const whole = 10 + Math.floor(rand() * 600);
      const cut = Math.floor(rand() * whole);
      const one = slabEngine(kwhToMilli(whole), slabs).totalPaise;
      // bill [0,cut] then [cut,whole] as a continuation by re-basing thresholds
      const first = slabEngine(kwhToMilli(cut), slabs);
      const rebased: TariffSlab[] = slabs.map((s) => ({
        uptoKwh: s.uptoKwh == null ? null : Math.max(0, s.uptoKwh - cut),
        ratePaisePerKwh: s.ratePaisePerKwh,
      }));
      const second = slabEngine(kwhToMilli(whole - cut), rebased);
      expect(first.totalPaise + second.totalPaise).toBe(one);
    }
  });
});

describe("touEngine — properties", () => {
  it("P8 windows are billed independently: total == sum of window charges, no cross-window telescoping", () => {
    const rand = mulberry32(8);
    for (let c = 0; c < CASES; c++) {
      const windows = Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, i) => ({
        windowLabel: `w${i}`,
        milliKwh: kwhToMilli(Math.floor(rand() * 300)),
        ratePaisePerKwh: rupeesToPaise(2 + rand() * 8),
      }));
      const { lines, totalPaise } = touEngine(windows);
      const expected = windows.reduce((s, w) => s + chargeForQuantity(w.milliKwh, w.ratePaisePerKwh), 0n);
      expect(totalPaise).toBe(expected);
      expect(lines.reduce((s, l) => s + l.amountPaise, 0n)).toBe(totalPaise);
    }
  });
});

describe("fixedCharge — properties", () => {
  it("P9 non-decreasing in sanctioned load for an ascending band schedule", () => {
    const rand = mulberry32(9);
    for (let c = 0; c < CASES; c++) {
      let cap = 0;
      let rate = rupeesToPaise(50);
      const bands: FixedChargeBand[] = [];
      for (let i = 0; i < 4; i++) {
        cap += 2 + Math.floor(rand() * 5);
        rate += rupeesToPaise(Math.floor(rand() * 40));
        bands.push({ maxSanctionedKw: i === 3 ? null : cap, ratePaise: rate });
      }
      const a = 1 + rand() * 10;
      const b = a + rand() * 10;
      expect(fixedCharge(b, bands)).toBeGreaterThanOrEqual(fixedCharge(a, bands));
    }
  });
});

describe("netMeteringSettlement — properties", () => {
  it("P10 conservation: offset+billableImport == import and offset+surplus == export", () => {
    const rand = mulberry32(10);
    for (let c = 0; c < CASES; c++) {
      const imp = kwhToMilli(Math.floor(rand() * 900));
      const exp = kwhToMilli(Math.floor(rand() * 900));
      const r = netMeteringSettlement(imp, exp, rupeesToPaise(2.5));
      expect(r.offsetMilliKwh + r.billableImportMilliKwh).toBe(imp);
      expect(r.offsetMilliKwh + r.surplusExportMilliKwh).toBe(exp);
    }
  });

  it("P11 no negative billable import, no negative surplus, no negative credit", () => {
    const rand = mulberry32(11);
    for (let c = 0; c < CASES; c++) {
      const r = netMeteringSettlement(
        kwhToMilli(Math.floor(rand() * 900)),
        kwhToMilli(Math.floor(rand() * 900)),
        rupeesToPaise(1 + rand() * 4),
      );
      expect(r.billableImportMilliKwh).toBeGreaterThanOrEqual(0n);
      expect(r.surplusExportMilliKwh).toBeGreaterThanOrEqual(0n);
      expect(r.surplusCreditPaise).toBeGreaterThanOrEqual(0n);
    }
  });
});

describe("money + duty — properties", () => {
  it("P12 chargeForQuantity is within half a paise of the exact rational value", () => {
    const rand = mulberry32(12);
    for (let c = 0; c < CASES; c++) {
      const milli = BigInt(Math.floor(rand() * 5_000_000));
      const rate = rupeesToPaise(1 + rand() * 12);
      const got = chargeForQuantity(milli, rate);
      const exactTimes2 = (milli * rate * 2n) / 1000n; // 2x exact, floored
      const gotTimes2 = got * 2n;
      const diff = gotTimes2 > exactTimes2 ? gotTimes2 - exactTimes2 : exactTimes2 - gotTimes2;
      expect(diff).toBeLessThanOrEqual(1n); // <= 0.5 paise
    }
  });

  it("P13 dutyAndTaxes is monotonic in the base and matches rate*base/10000 rounded", () => {
    const rand = mulberry32(13);
    for (let c = 0; c < CASES; c++) {
      const energy = BigInt(Math.floor(rand() * 500_000));
      const fixed = BigInt(Math.floor(rand() * 50_000));
      const bps = BigInt(500 + Math.floor(rand() * 1500));
      const d = dutyAndTaxes(energy, fixed, bps);
      expect(d).toBe(roundDivPaise((energy + fixed) * bps, 10_000n));
      const more = dutyAndTaxes(energy + 1000n, fixed, bps);
      expect(more).toBeGreaterThanOrEqual(d);
    }
  });

  it("P14 prepaidDebit is exact — balance - charge, never clamped", () => {
    const rand = mulberry32(14);
    for (let c = 0; c < CASES; c++) {
      const bal = BigInt(Math.floor((rand() - 0.5) * 200_000));
      const charge = BigInt(Math.floor(rand() * 50_000));
      const r = prepaidDebit(bal, charge);
      expect(r.newBalancePaise).toBe(bal - charge);
      expect(r.disconnect).toBe(bal - charge <= 0n);
    }
  });

  it("P15 composeInvoice total equals the signed sum of every line, credits included", () => {
    const rand = mulberry32(15);
    for (let c = 0; c < CASES; c++) {
      const lines = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, i) => ({
        kind: "fixed" as const,
        label: `l${i}`,
        amountPaise: BigInt(Math.floor((rand() - 0.4) * 100_000)) as Paise,
      }));
      const inv = composeInvoice(lines);
      expect(inv.totalPaise).toBe(lines.reduce((s, l) => s + l.amountPaise, 0n));
    }
  });
});
