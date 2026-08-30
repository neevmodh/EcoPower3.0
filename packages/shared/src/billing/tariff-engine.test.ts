import { describe, expect, it } from "vitest";
import {
  bankingCarryForward,
  composeInvoice,
  dutyAndTaxes,
  fixedCharge,
  netMeteringSettlement,
  paygCharge,
  prepaidDebit,
  slabEngine,
  subscriptionCharge,
  touEngine,
} from "./tariff-engine";
import { kwhToMilli, rupeesToPaise } from "./money";

// RGP (residential), Torrent Power — Ahmedabad, FY2026-27. Verified
// directly against the primary tariff order during #20 (pdftotext on the
// actual PDF, not a secondary summary) — three slabs, not four. Matches
// the rows seeded by 0008_tariff_seed.sql exactly.
const RGP_SLABS = [
  { uptoKwh: 50, ratePaisePerKwh: rupeesToPaise(3.2) },
  { uptoKwh: 200, ratePaisePerKwh: rupeesToPaise(3.95) },
  { uptoKwh: null, ratePaisePerKwh: rupeesToPaise(5.0) },
];

describe("slabEngine", () => {
  it("reproduces the real RGP tariff's worked example: 342.400 kWh -> ₹1,464.50", () => {
    const result = slabEngine(kwhToMilli(342.4), RGP_SLABS);

    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]).toMatchObject({ quantityMilliKwh: 50000n, amountPaise: 16000n }); // 50 @ 3.20 = 160.00
    expect(result.lines[1]).toMatchObject({ quantityMilliKwh: 150000n, amountPaise: 59250n }); // 150 @ 3.95 = 592.50
    expect(result.lines[2]).toMatchObject({ quantityMilliKwh: 142400n, amountPaise: 71200n }); // 142.4 @ 5.00 = 712.00

    expect(result.totalPaise).toBe(146450n); // ₹1,464.50
  });

  it("bills entirely within the first slab when consumption is low", () => {
    const result = slabEngine(kwhToMilli(30), RGP_SLABS);
    expect(result.lines).toHaveLength(1);
    expect(result.totalPaise).toBe(rupeesToPaise(30 * 3.2));
  });

  it("bills zero consumption as zero, with no lines — not a fabricated line item", () => {
    const result = slabEngine(0n, RGP_SLABS);
    expect(result.lines).toHaveLength(0);
    expect(result.totalPaise).toBe(0n);
  });

  it("never produces a negative total regardless of slab configuration", () => {
    const result = slabEngine(kwhToMilli(1000), RGP_SLABS);
    expect(result.totalPaise).toBeGreaterThan(0n);
  });
});

describe("touEngine", () => {
  it("sums independently-rated windows without telescoping between them", () => {
    const result = touEngine([
      { windowLabel: "peak", milliKwh: kwhToMilli(10), ratePaisePerKwh: rupeesToPaise(6) },
      { windowLabel: "off-peak", milliKwh: kwhToMilli(20), ratePaisePerKwh: rupeesToPaise(3) },
    ]);
    expect(result.totalPaise).toBe(rupeesToPaise(10 * 6 + 20 * 3));
  });
});

describe("fixedCharge", () => {
  const bands = [
    { maxSanctionedKw: 2, ratePaise: rupeesToPaise(15) },
    { maxSanctionedKw: 4, ratePaise: rupeesToPaise(25) },
    { maxSanctionedKw: 6, ratePaise: rupeesToPaise(45) },
    { maxSanctionedKw: null, ratePaise: rupeesToPaise(70) },
  ];

  it("picks the correct band at each boundary", () => {
    expect(fixedCharge(2, bands)).toBe(rupeesToPaise(15));
    expect(fixedCharge(2.5, bands)).toBe(rupeesToPaise(25));
    expect(fixedCharge(4, bands)).toBe(rupeesToPaise(25));
    expect(fixedCharge(6, bands)).toBe(rupeesToPaise(45));
    expect(fixedCharge(10, bands)).toBe(rupeesToPaise(70));
  });
});

describe("netMeteringSettlement", () => {
  it("offsets export against import 1:1 when export doesn't exceed import", () => {
    const result = netMeteringSettlement(kwhToMilli(100), kwhToMilli(60), rupeesToPaise(3.85));
    expect(result.offsetMilliKwh).toBe(kwhToMilli(60));
    expect(result.billableImportMilliKwh).toBe(kwhToMilli(40));
    expect(result.surplusExportMilliKwh).toBe(0n);
    expect(result.surplusCreditPaise).toBe(0n);
  });

  it("settles surplus export at APPC, not the retail slab rate", () => {
    const result = netMeteringSettlement(kwhToMilli(50), kwhToMilli(80), rupeesToPaise(3.85));
    expect(result.billableImportMilliKwh).toBe(0n);
    expect(result.surplusExportMilliKwh).toBe(kwhToMilli(30));
    expect(result.surplusCreditPaise).toBe(rupeesToPaise(30 * 3.85));
  });
});

describe("bankingCarryForward", () => {
  it("is free for residential — Gujarat exemption", () => {
    const result = bankingCarryForward(0n, kwhToMilli(50), rupeesToPaise(1.5), true);
    expect(result.bankingChargePaise).toBe(0n);
    expect(result.bankedForwardMilliKwh).toBe(kwhToMilli(50));
  });

  it("charges non-residential accounts per unit banked", () => {
    const result = bankingCarryForward(0n, kwhToMilli(50), rupeesToPaise(1.5), false);
    expect(result.bankingChargePaise).toBe(rupeesToPaise(50 * 1.5));
  });
});

describe("dutyAndTaxes", () => {
  it("applies Gujarat's 10% electricity duty on energy + fixed combined", () => {
    const duty = dutyAndTaxes(rupeesToPaise(1000), rupeesToPaise(70), 1000n);
    expect(duty).toBe(rupeesToPaise(107)); // 10% of 1070
  });
});

describe("subscriptionCharge", () => {
  it("charges the full plan price with no proration argument", () => {
    expect(subscriptionCharge(rupeesToPaise(999))).toBe(rupeesToPaise(999));
  });

  it("prorates for a partial billing period", () => {
    const charge = subscriptionCharge(rupeesToPaise(300), { daysActive: 10, daysInPeriod: 30 });
    expect(charge).toBe(rupeesToPaise(100));
  });
});

describe("paygCharge", () => {
  it("charges a flat rate with no slabs — 2.0's PAYG model, done for real", () => {
    expect(paygCharge(kwhToMilli(20), rupeesToPaise(6.5))).toBe(rupeesToPaise(130));
  });
});

describe("prepaidDebit", () => {
  it("debits the balance and does not flag disconnect while still positive", () => {
    const result = prepaidDebit(rupeesToPaise(100), rupeesToPaise(30));
    expect(result.newBalancePaise).toBe(rupeesToPaise(70));
    expect(result.disconnect).toBe(false);
  });

  it("flags disconnect once balance reaches zero or below", () => {
    const result = prepaidDebit(rupeesToPaise(20), rupeesToPaise(30));
    expect(result.newBalancePaise).toBe(rupeesToPaise(-10));
    expect(result.disconnect).toBe(true);
  });
});

describe("composeInvoice", () => {
  it("stamps the engine version and sums all line items, credits included", () => {
    const invoice = composeInvoice([
      { kind: "energy_slab", label: "Energy", amountPaise: rupeesToPaise(1430.48) },
      { kind: "fixed", label: "Fixed charge", amountPaise: rupeesToPaise(70) },
      { kind: "duty", label: "Electricity duty", amountPaise: rupeesToPaise(150.05) },
      { kind: "net_metering_credit", label: "Export credit", amountPaise: -rupeesToPaise(200) },
    ]);
    expect(invoice.engineVersion).toBe("1.0.0");
    expect(invoice.totalPaise).toBe(rupeesToPaise(1430.48 + 70 + 150.05 - 200));
  });
});
