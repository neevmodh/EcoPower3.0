// packages/shared/src/billing/ — pure, zero-I/O tariff functions (#19).
// Shared byte-identically by apps/web, apps/mobile, and services/worker —
// this is the entire reason for the monorepo. A duplicated tariff engine is
// exactly the bug class that would destroy the billing-correctness claim.
//
// Every function here takes data in and returns data out. No DB, no clock,
// no I/O of any kind — that's what makes it trivially testable and
// identical across Node, Metro, and Deno.

import { type MilliKwh, type Paise, chargeForQuantity, roundDivPaise } from "./money";

export const ENGINE_VERSION = "1.0.0";

// ============================================================
// slabEngine — telescopic slab billing. Consumption is billed through each
// slab up to its threshold before spilling into the next, never at a single
// blended rate. This is what makes an invoice line expandable into
// "50 @ ₹3.05 · 50 @ ₹3.50 · ..." on screen (#21).
// ============================================================

export interface TariffSlab {
  /** Upper bound of this slab, in whole kWh. null = unbounded (last slab). */
  uptoKwh: number | null;
  ratePaisePerKwh: Paise;
}

export interface SlabLine {
  slabIndex: number;
  quantityMilliKwh: MilliKwh;
  ratePaisePerKwh: Paise;
  amountPaise: Paise;
}

export interface SlabResult {
  lines: SlabLine[];
  totalPaise: Paise;
}

export function slabEngine(totalMilliKwh: MilliKwh, slabs: TariffSlab[]): SlabResult {
  const lines: SlabLine[] = [];
  let remaining = totalMilliKwh;
  let consumedSoFarMilli = 0n;

  for (let i = 0; i < slabs.length && remaining > 0n; i++) {
    const slab = slabs[i];
    const slabCeilingMilli = slab.uptoKwh == null ? null : BigInt(slab.uptoKwh) * 1000n;
    const slabCapacityMilli = slabCeilingMilli == null ? remaining : slabCeilingMilli - consumedSoFarMilli;

    if (slabCapacityMilli <= 0n) continue;

    const quantityMilli = remaining < slabCapacityMilli ? remaining : slabCapacityMilli;
    const amountPaise = chargeForQuantity(quantityMilli, slab.ratePaisePerKwh);

    lines.push({ slabIndex: i, quantityMilliKwh: quantityMilli, ratePaisePerKwh: slab.ratePaisePerKwh, amountPaise });

    remaining -= quantityMilli;
    consumedSoFarMilli += quantityMilli;
  }

  const totalPaise = lines.reduce((sum, l) => sum + l.amountPaise, 0n);
  return { lines, totalPaise };
}

// ============================================================
// touEngine — time-of-use billing. Unlike slabs, ToU windows don't
// telescope — each window's consumption is already segmented by the meter's
// block load profile and billed at that window's own rate independently.
// ============================================================

export interface TouWindow {
  windowLabel: string;
  milliKwh: MilliKwh;
  ratePaisePerKwh: Paise;
}

export interface TouLine {
  windowLabel: string;
  quantityMilliKwh: MilliKwh;
  ratePaisePerKwh: Paise;
  amountPaise: Paise;
}

export function touEngine(windows: TouWindow[]): { lines: TouLine[]; totalPaise: Paise } {
  const lines = windows.map((w) => ({
    windowLabel: w.windowLabel,
    quantityMilliKwh: w.milliKwh,
    ratePaisePerKwh: w.ratePaisePerKwh,
    amountPaise: chargeForQuantity(w.milliKwh, w.ratePaisePerKwh),
  }));
  const totalPaise = lines.reduce((sum, l) => sum + l.amountPaise, 0n);
  return { lines, totalPaise };
}

// ============================================================
// fixedCharge — banded by sanctioned load, not a single flat number.
// ============================================================

export interface FixedChargeBand {
  maxSanctionedKw: number | null; // null = unbounded (highest band)
  ratePaise: Paise;
}

export function fixedCharge(sanctionedLoadKw: number, bands: FixedChargeBand[]): Paise {
  for (const band of bands) {
    if (band.maxSanctionedKw == null || sanctionedLoadKw <= band.maxSanctionedKw) {
      return band.ratePaise;
    }
  }
  throw new Error(`fixedCharge: no band matched sanctioned load ${sanctionedLoadKw}kW`);
}

// ============================================================
// netMeteringSettlement — nets export against import 1:1; surplus export
// (export > import) settles at APPC, not the retail slab rate.
// ============================================================

export interface NetMeteringResult {
  offsetMilliKwh: MilliKwh; // export applied 1:1 against import
  billableImportMilliKwh: MilliKwh; // import remaining after offset — feeds slabEngine
  surplusExportMilliKwh: MilliKwh; // export beyond what import could absorb
  surplusCreditPaise: Paise; // surplus settled at APPC
}

export function netMeteringSettlement(
  importMilliKwh: MilliKwh,
  exportMilliKwh: MilliKwh,
  appcRatePaisePerKwh: Paise,
): NetMeteringResult {
  const offsetMilliKwh = importMilliKwh < exportMilliKwh ? importMilliKwh : exportMilliKwh;
  const billableImportMilliKwh = importMilliKwh - offsetMilliKwh;
  const surplusExportMilliKwh = exportMilliKwh - offsetMilliKwh;
  const surplusCreditPaise = chargeForQuantity(surplusExportMilliKwh, appcRatePaisePerKwh);

  return { offsetMilliKwh, billableImportMilliKwh, surplusExportMilliKwh, surplusCreditPaise };
}

// ============================================================
// bankingCarryForward — Gujarat: residential is exempt from banking
// charges; commercial/industrial banking is charged per unit banked.
// ============================================================

export interface BankingResult {
  bankedForwardMilliKwh: MilliKwh;
  bankingChargePaise: Paise;
}

export function bankingCarryForward(
  previousBankedMilliKwh: MilliKwh,
  newSurplusMilliKwh: MilliKwh,
  bankingChargeRatePaisePerKwh: Paise,
  residentialExempt: boolean,
): BankingResult {
  const bankedForwardMilliKwh = previousBankedMilliKwh + newSurplusMilliKwh;
  const bankingChargePaise = residentialExempt
    ? 0n
    : chargeForQuantity(newSurplusMilliKwh, bankingChargeRatePaisePerKwh);

  return { bankedForwardMilliKwh, bankingChargePaise };
}

// ============================================================
// dutyAndTaxes — electricity duty as a percentage (basis points) of energy
// + fixed charges combined. Gujarat: 10% (1000 bps).
// ============================================================

export function dutyAndTaxes(energyChargePaise: Paise, fixedChargePaise: Paise, dutyRateBasisPoints: bigint): Paise {
  return roundDivPaise((energyChargePaise + fixedChargePaise) * dutyRateBasisPoints, 10_000n);
}

// ============================================================
// subscriptionCharge — flat monthly EaaS plan price, optionally prorated
// for a partial billing period (signup/cancellation mid-cycle).
// ============================================================

export function subscriptionCharge(
  planPricePaise: Paise,
  proration?: { daysActive: number; daysInPeriod: number },
): Paise {
  if (!proration) return planPricePaise;
  if (proration.daysInPeriod <= 0) throw new Error("subscriptionCharge: daysInPeriod must be positive");
  return roundDivPaise(planPricePaise * BigInt(proration.daysActive), BigInt(proration.daysInPeriod));
}

// ============================================================
// paygCharge — flat pay-as-you-go rate per kWh, no slabs, no lock-in.
// ============================================================

export function paygCharge(milliKwh: MilliKwh, paygRatePaisePerKwh: Paise): Paise {
  return chargeForQuantity(milliKwh, paygRatePaisePerKwh);
}

// ============================================================
// prepaidDebit — interval debit against a prepaid balance. Never lets the
// balance report as more negative than the actual charge — a debit larger
// than the remaining balance still fully debits (the account goes negative,
// which is what triggers disconnect), it doesn't clamp at zero and lose track.
// ============================================================

export interface PrepaidDebitResult {
  newBalancePaise: Paise;
  disconnect: boolean;
}

export function prepaidDebit(balancePaise: Paise, chargePaise: Paise, disconnectThresholdPaise: Paise = 0n): PrepaidDebitResult {
  const newBalancePaise = balancePaise - chargePaise;
  return { newBalancePaise, disconnect: newBalancePaise <= disconnectThresholdPaise };
}

// ============================================================
// composeInvoice — assembles every charge type above into one invoice.
// engine_version is stamped on every invoice for reproducibility: if the
// engine changes, old invoices still show which version priced them.
// ============================================================

export interface InvoiceLineItem {
  kind: "energy_slab" | "energy_tou" | "fixed" | "duty" | "subscription" | "payg" | "net_metering_credit" | "banking";
  label: string;
  amountPaise: Paise; // negative for credits
}

export interface ComposedInvoice {
  engineVersion: string;
  lines: InvoiceLineItem[];
  totalPaise: Paise;
}

export function composeInvoice(lines: InvoiceLineItem[]): ComposedInvoice {
  const totalPaise = lines.reduce((sum, l) => sum + l.amountPaise, 0n);
  return { engineVersion: ENGINE_VERSION, lines, totalPaise };
}
