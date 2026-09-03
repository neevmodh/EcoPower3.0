// Golden-file billing tests (#24). Fixed inputs → exact expected paise,
// pinned. If any of these numbers move, an engine change shifted a real
// bill and the diff has to be justified — that's the point.
//
// Every scenario uses the real Torrent Power Ahmedabad RGP tariff seeded
// by 0008_tariff_seed.sql (slabs 50@₹3.20 / 200@₹3.95 / ∞@₹5.00, 10%
// electricity duty, APPC ₹3.85/kWh). Hand-computed values are shown in
// the comment next to each expectation.

import { describe, expect, it } from "vitest";
import { kwhToMilli, rupeesToPaise } from "./money";
import {
  composeInvoice,
  dutyAndTaxes,
  type InvoiceLineItem,
  netMeteringSettlement,
  slabEngine,
} from "./tariff-engine";

const RGP_SLABS = [
  { uptoKwh: 50, ratePaisePerKwh: rupeesToPaise(3.2) },
  { uptoKwh: 200, ratePaisePerKwh: rupeesToPaise(3.95) },
  { uptoKwh: null, ratePaisePerKwh: rupeesToPaise(5.0) },
];

const DUTY_BPS = 1000n; // 10.0%

describe("golden: RGP slab energy charge", () => {
  const cases: { kwh: number; expectedLines: [number, bigint][]; total: bigint }[] = [
    // kWh, [ [lineKwh, linePaise], ... ], totalPaise
    { kwh: 30, expectedLines: [[30, 9600n]], total: 9600n }, //                     30×320
    { kwh: 50, expectedLines: [[50, 16000n]], total: 16000n }, //                   50×320
    { kwh: 51, expectedLines: [[50, 16000n], [1, 395n]], total: 16395n }, //        +1×395
    { kwh: 200, expectedLines: [[50, 16000n], [150, 59250n]], total: 75250n }, //   50×320 + 150×395
    {
      kwh: 342.4,
      expectedLines: [[50, 16000n], [150, 59250n], [142.4, 71200n]],
      total: 146450n, // ₹1,464.50 — the tariff order's own worked example
    },
    {
      kwh: 851,
      expectedLines: [[50, 16000n], [150, 59250n], [651, 325500n]],
      total: 400750n, // ₹4,007.50
    },
  ];

  for (const c of cases) {
    it(`${c.kwh} kWh → ${c.total} paise, ${c.expectedLines.length} line(s)`, () => {
      const r = slabEngine(kwhToMilli(c.kwh), RGP_SLABS);
      expect(r.totalPaise).toBe(c.total);
      expect(r.lines.map((l) => [Number(l.quantityMilliKwh) / 1000, l.amountPaise])).toEqual(c.expectedLines);
    });
  }
});

describe("golden: electricity duty (10% of energy + fixed)", () => {
  it("342.4 kWh RGP single-phase: duty on ₹1,464.50 energy + ₹25.00 fixed = ₹148.95", () => {
    expect(dutyAndTaxes(146450n, 2500n, DUTY_BPS)).toBe(14895n);
  });
  it("851 kWh RGP three-phase: duty on ₹4,007.50 energy + ₹65.00 fixed = ₹407.25", () => {
    expect(dutyAndTaxes(400750n, 6500n, DUTY_BPS)).toBe(40725n);
  });
});

describe("golden: net-metering settlement at APPC ₹3.85/kWh", () => {
  it("import 400, export 250 → 250 offset 1:1, 150 billable, no surplus credit", () => {
    const r = netMeteringSettlement(kwhToMilli(400), kwhToMilli(250), rupeesToPaise(3.85));
    expect(r).toEqual({
      offsetMilliKwh: 250_000n,
      billableImportMilliKwh: 150_000n,
      surplusExportMilliKwh: 0n,
      surplusCreditPaise: 0n,
    });
  });
  it("import 100, export 300 → 100 offset, 0 billable, 200 surplus @ APPC = ₹770.00", () => {
    const r = netMeteringSettlement(kwhToMilli(100), kwhToMilli(300), rupeesToPaise(3.85));
    expect(r).toEqual({
      offsetMilliKwh: 100_000n,
      billableImportMilliKwh: 0n,
      surplusExportMilliKwh: 200_000n,
      surplusCreditPaise: 77_000n,
    });
  });
});

describe("golden: full RGP invoice (energy + fixed + duty)", () => {
  it("342.4 kWh, single-phase → ₹1,638.45", () => {
    const energy = slabEngine(kwhToMilli(342.4), RGP_SLABS).totalPaise; // 146450
    const fixed = 2500n;
    const duty = dutyAndTaxes(energy, fixed, DUTY_BPS); // 14895
    const lines: InvoiceLineItem[] = [
      { kind: "energy_slab", label: "Energy (telescopic slabs)", amountPaise: energy },
      { kind: "fixed", label: "Fixed charge (single-phase)", amountPaise: fixed },
      { kind: "duty", label: "Electricity duty (10%)", amountPaise: duty },
    ];
    const inv = composeInvoice(lines);
    expect(inv.totalPaise).toBe(163_845n); // 146450 + 2500 + 14895
    expect(inv.engineVersion).toBe("1.0.0");
  });

  it("net-metering consumer: 400 import / 250 export, single-phase → ₹638.00", () => {
    const settle = netMeteringSettlement(kwhToMilli(400), kwhToMilli(250), rupeesToPaise(3.85));
    const energy = slabEngine(settle.billableImportMilliKwh, RGP_SLABS).totalPaise; // 150 kWh: 50×320+100×395 = 16000+39500 = 55500
    const fixed = 2500n;
    const duty = dutyAndTaxes(energy, fixed, DUTY_BPS); // round(58000×1000/10000) = 5800
    const inv = composeInvoice([
      { kind: "net_metering_credit", label: "Export offset (1:1)", amountPaise: 0n },
      { kind: "energy_slab", label: "Net energy", amountPaise: energy },
      { kind: "fixed", label: "Fixed charge", amountPaise: fixed },
      { kind: "duty", label: "Electricity duty", amountPaise: duty },
    ]);
    expect(energy).toBe(55_500n);
    expect(duty).toBe(5_800n);
    expect(inv.totalPaise).toBe(63_800n);
  });
});
