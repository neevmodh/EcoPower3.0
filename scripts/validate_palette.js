#!/usr/bin/env node
// Validates packages/shared/src/palette.json against the checks DESIGN.md §3
// promises: CVD (protanopia) separation, normal-vision separation, lightness
// band, chroma floor, and WCAG contrast — for both light and dark. Exits
// non-zero on any failure, so CI fails the build on a broken palette.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const palettePath = path.join(__dirname, "..", "packages", "shared", "src", "palette.json");
const palette = JSON.parse(readFileSync(palettePath, "utf8"));

// ---------------------------------------------------------------------------
// Color science: hex -> linear sRGB -> OKLab, plus a protanopia simulation
// in linear RGB (Machado, Oliveira & Fernandes 2009, protanopia, severity 1.0).
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const m = hex.replace("#", "");
  return [
    Number.parseInt(m.slice(0, 2), 16) / 255,
    Number.parseInt(m.slice(2, 4), 16) / 255,
    Number.parseInt(m.slice(4, 6), 16) / 255,
  ];
}

function srgbToLinearChannel(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexToLinear(hex) {
  return hexToRgb(hex).map(srgbToLinearChannel);
}

function linearToOKLab([r, g, b]) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

// Linear-RGB CVD simulation matrix, protanopia, 100% severity.
// Machado, Oliveira & Fernandes, "A Physiologically-based Model for
// Simulation of Color Vision Deficiency" (2009).
const PROTANOPIA_MATRIX = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];

function simulateProtanopia([r, g, b]) {
  const [m0, m1, m2] = PROTANOPIA_MATRIX;
  return [
    m0[0] * r + m0[1] * g + m0[2] * b,
    m1[0] * r + m1[1] * g + m1[2] * b,
    m2[0] * r + m2[1] * g + m2[2] * b,
  ].map((c) => Math.min(1, Math.max(0, c)));
}

function deltaEOK(lab1, lab2) {
  return 100 * Math.sqrt((lab1.L - lab2.L) ** 2 + (lab1.a - lab2.a) ** 2 + (lab1.b - lab2.b) ** 2);
}

function chroma(lab) {
  return Math.sqrt(lab.a ** 2 + lab.b ** 2);
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToLinear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

function labOf(hex) {
  return linearToOKLab(hexToLinear(hex));
}

function protanLabOf(hex) {
  return linearToOKLab(simulateProtanopia(hexToLinear(hex)));
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const NORMAL_MIN_DE = 10;
const PROTAN_MIN_DE = 5;
const LIGHTNESS_MIN = 0.15;
const LIGHTNESS_MAX = 0.92;
const CHROMA_MIN = 0.03;
const STATUS_CONTRAST_MIN = 3.0;
const ORDINAL_FLOOR_CONTRAST_MIN = 2.0;

let failures = 0;
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const fail = (msg) => {
  failures += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
};

function allPairsCheck(groupName, theme, entries) {
  console.log(`\n${groupName} — ${theme} — all-pairs`);
  const names = Object.keys(entries);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [nameA, nameB] = [names[i], names[j]];
      const hexA = entries[nameA];
      const hexB = entries[nameB];

      const normalDE = deltaEOK(labOf(hexA), labOf(hexB));
      const protanDE = deltaEOK(protanLabOf(hexA), protanLabOf(hexB));

      const label = `${nameA} vs ${nameB} (${hexA} / ${hexB})`;
      if (normalDE >= NORMAL_MIN_DE) {
        ok(`${label} — normal ΔE ${normalDE.toFixed(1)} (≥ ${NORMAL_MIN_DE})`);
      } else {
        fail(`${label} — normal ΔE ${normalDE.toFixed(1)} (< ${NORMAL_MIN_DE})`);
      }
      if (protanDE >= PROTAN_MIN_DE) {
        ok(`${label} — protan ΔE ${protanDE.toFixed(1)} (≥ ${PROTAN_MIN_DE})`);
      } else {
        fail(`${label} — protan ΔE ${protanDE.toFixed(1)} (< ${PROTAN_MIN_DE})`);
      }
    }
  }
}

function lightnessAndChromaCheck(groupName, theme, entries, { skipChroma = [], skipLightness = [] } = {}) {
  console.log(`\n${groupName} — ${theme} — lightness band + chroma floor`);
  for (const [name, hex] of Object.entries(entries)) {
    const lab = labOf(hex);

    if (skipLightness.includes(name)) {
      console.log(`  · ${name} (${hex}) — L ${lab.L.toFixed(2)} (neutral midpoint, band n/a)`);
    } else if (lab.L >= LIGHTNESS_MIN && lab.L <= LIGHTNESS_MAX) {
      ok(`${name} (${hex}) — L ${lab.L.toFixed(2)} within [${LIGHTNESS_MIN}, ${LIGHTNESS_MAX}]`);
    } else {
      fail(`${name} (${hex}) — L ${lab.L.toFixed(2)} outside [${LIGHTNESS_MIN}, ${LIGHTNESS_MAX}]`);
    }

    if (skipChroma.includes(name)) continue;
    const c = chroma(lab);
    if (c >= CHROMA_MIN) {
      ok(`${name} (${hex}) — chroma ${c.toFixed(3)} ≥ ${CHROMA_MIN}`);
    } else {
      fail(`${name} (${hex}) — chroma ${c.toFixed(3)} < ${CHROMA_MIN} (washed out)`);
    }
  }
}

// Advisory, not build-breaking: DESIGN.md §3.5 explicitly exempts status
// colors from the contrast/CVD gate because status never ships as colour
// alone — every status pill carries an icon and a text label, mandatorily.
// That relief is the compensating control, not a higher-contrast hex.
function statusContrastCheck(theme, entries, surfaceHex) {
  console.log(`\nstatus — ${theme} — contrast against surface ${surfaceHex} (advisory — relief is icon+label, not contrast)`);
  for (const [name, hex] of Object.entries(entries)) {
    const ratio = contrastRatio(hex, surfaceHex);
    if (ratio >= STATUS_CONTRAST_MIN) {
      ok(`${name} (${hex}) — contrast ${ratio.toFixed(2)}:1 ≥ ${STATUS_CONTRAST_MIN}:1`);
    } else {
      console.log(`  \x1b[33m⚠\x1b[0m ${name} (${hex}) — contrast ${ratio.toFixed(2)}:1 < ${STATUS_CONTRAST_MIN}:1 (relies on mandatory icon+label)`);
    }
  }
}

function sequentialCheck(seq) {
  console.log("\nsequential — ramp monotonicity");
  const lightnesses = seq.ramp.map((hex) => labOf(hex).L);
  let monotonic = true;
  for (let i = 1; i < lightnesses.length; i++) {
    if (lightnesses[i] >= lightnesses[i - 1]) monotonic = false;
  }
  if (monotonic) {
    ok(`ramp is strictly decreasing in L: [${lightnesses.map((l) => l.toFixed(2)).join(", ")}]`);
  } else {
    fail(`ramp is not monotonic in L: [${lightnesses.map((l) => l.toFixed(2)).join(", ")}]`);
  }

  console.log("\nsequential — ordinal floor contrast");
  const lightFloorRatio = contrastRatio(seq.ordinalFloor.light, palette.surface.light);
  if (lightFloorRatio >= ORDINAL_FLOOR_CONTRAST_MIN) {
    ok(`light floor ${seq.ordinalFloor.light} — contrast ${lightFloorRatio.toFixed(2)}:1 ≥ ${ORDINAL_FLOOR_CONTRAST_MIN}:1`);
  } else {
    fail(`light floor ${seq.ordinalFloor.light} — contrast ${lightFloorRatio.toFixed(2)}:1 < ${ORDINAL_FLOOR_CONTRAST_MIN}:1`);
  }
  const darkFloorRatio = contrastRatio(seq.ordinalFloor.dark, palette.surface.dark);
  if (darkFloorRatio >= ORDINAL_FLOOR_CONTRAST_MIN) {
    ok(`dark floor ${seq.ordinalFloor.dark} — contrast ${darkFloorRatio.toFixed(2)}:1 ≥ ${ORDINAL_FLOOR_CONTRAST_MIN}:1`);
  } else {
    fail(`dark floor ${seq.ordinalFloor.dark} — contrast ${darkFloorRatio.toFixed(2)}:1 < ${ORDINAL_FLOOR_CONTRAST_MIN}:1`);
  }
}

for (const theme of ["light", "dark"]) {
  const categorical = Object.fromEntries(
    Object.entries(palette.categorical).map(([name, v]) => [name, v[theme]]),
  );
  const diverging = Object.fromEntries(
    Object.entries(palette.diverging).map(([name, v]) => [name, v[theme]]),
  );
  const status = Object.fromEntries(
    Object.entries(palette.status).map(([name, v]) => [name, v[theme]]),
  );

  allPairsCheck("categorical", theme, categorical);
  allPairsCheck("diverging", theme, diverging);

  lightnessAndChromaCheck("categorical", theme, categorical);
  lightnessAndChromaCheck("diverging", theme, diverging, { skipChroma: ["zero"], skipLightness: ["zero"] });
  lightnessAndChromaCheck("status", theme, status);

  statusContrastCheck(theme, status, palette.surface[theme]);
}

sequentialCheck(palette.sequential);

console.log("\n" + "-".repeat(60));
if (failures > 0) {
  console.log(`\x1b[31mFAILED — ${failures} check(s) did not pass.\x1b[0m`);
  process.exit(1);
} else {
  console.log("\x1b[32mAll palette checks passed for light and dark.\x1b[0m");
  process.exit(0);
}
