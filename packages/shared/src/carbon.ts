// CO2 avoided from real exported solar generation — no invented "ESG
// score." 2.0's admin command centre showed a fabricated "GREEN EFFICIENCY
// 0%" badged "Target Hit"; this computes one real number from one real
// input using one cited constant, and nothing else.

// India's grid emission factor for avoided-emissions accounting — Central
// Electricity Authority (CEA), CO2 Baseline Database for the Indian Power
// Sector, User Guide Version 21.0 (published Dec 2025, FY2024-25
// provisional): Combined Margin (CM) = 0.7383 tCO2/MWh. CM, not the
// weighted-average grid factor (0.710 tCO2/MWh in the same release), is
// the standard CEA/CDM methodology for exactly this calculation — energy
// exported to the grid displacing what the grid would otherwise have
// generated, the same logic renewable-energy project offset accounting
// uses. 0.7383 tCO2/MWh = 0.7383 kgCO2/kWh. Verified against the primary
// source, not estimated — same discipline as #20's tariff citation.
export const INDIA_GRID_EMISSION_FACTOR_KG_PER_KWH = 0.7383;

export function co2AvoidedKg(exportedKwh: number, gridFactorKgPerKwh = INDIA_GRID_EMISSION_FACTOR_KG_PER_KWH): number {
  if (exportedKwh <= 0) return 0;
  return exportedKwh * gridFactorKgPerKwh;
}

// A tree absorbs roughly 21 kg CO2/year — a commonly cited EPA/USDA
// Forest Service figure for a mature tree over one growing season. Useful
// for framing a number, not a precise offset calculation.
const KG_CO2_PER_TREE_PER_YEAR = 21;

export function treeEquivalent(co2Kg: number): number {
  if (co2Kg <= 0) return 0;
  return co2Kg / KG_CO2_PER_TREE_PER_YEAR;
}
