# EcoPower 3.0 — Design System

Companion to [ROADMAP.md](ROADMAP.md). This file governs every pixel in `apps/web` and `apps/mobile`.

---

## 1. What went wrong in 2.0

2.0's UI is not ugly. The landing page is genuinely good — strong type, clean cards, a well-drawn energy-flow diagram. The failure is not aesthetic, it is **epistemic**: the interface asserts things that are not true.

Captured from the live deployment:

| Screen | What it showed |
|---|---|
| Consumer dashboard | `Solar Generated 0.0 kWh` with a green **↗ +12%** badge · `Total Consumed 0.0 kWh` with **↘ −5%** · `Savings ₹0` with **↗ +₹450** |
| Consumer analytics | Four KPIs at `0.0`, badges reading **+12% / −8% / +22% / +15%**, and the main chart an empty box captioned *"No data available"* |
| Admin command centre | `SYSTEM GENERATION 0 kWh` badged **"Optimal"** · `GREEN EFFICIENCY 0%` badged **"Target Hit"** · `CARBON OFFSET 0.0 kg` badged **"+124kg"** |
| Admin fleet | **"ALL SYSTEMS GO"** beside a list containing `INV-000 — OFFLINE` |
| Admin revenue | `₹1,063,717.882` — three decimals on a currency value, a float artifact |
| Everywhere | A pulsing green **LIVE** dot that is a CSS animation on a page that fetched once on mount |

Every one of these is a **decorative element that survived the disappearance of its data.** The badges are hardcoded constants. "Optimal" is a string literal. The trend arrows point up because someone typed an up arrow.

This is the worst possible failure mode in front of a jury of utility operators. A dashboard that says "Target Hit" over 0% is not a dashboard with a bug — it is a dashboard that cannot be trusted about anything. Anil Rawal and Sanjay Banga will read that in five seconds.

**So the first principle of 3.0's design is not about colour.**

---

## 2. Principles

### P1 — No component may outlive its data
Every number, badge, trend, status pill and indicator is **derived**, or it does not render. There are no hardcoded deltas, no literal `"Optimal"`, no decorative LIVE dot.

If a value is unavailable, the component renders its **empty state**, and any badge attached to it renders nothing. A stat tile with no data shows `—`, not `0.0`, because zero is a measurement and absence is not.

### P2 — Every state is designed, not just the happy one
Five states per data component, all specified before the happy path is built:

| State | Rule |
|---|---|
| **Loading** | Skeleton matching final geometry. Never a spinner where a number will be. Never layout shift. |
| **Empty** | "No readings in this window" + the window + a way to widen it. Never an empty box captioned *"No data available"*. |
| **Partial** | Data exists but is incomplete or estimated → render it, **labelled**. This is the VEE case (#23). |
| **Stale** | Last update older than the expected interval → the value greys and a timestamp appears. Never keep showing a fresh-looking number. |
| **Error** | What failed, and one action. Never a blank card. |

### P3 — Confidence is part of the value
An estimated reading, an OCR field below threshold, and a forecast are all rendered **differently from a measured fact**: estimated values are hatched or dashed, OCR fields below threshold are outlined and focusable, forecasts are dashed beyond `now`. The user should never have to ask which numbers are real.

This principle is what makes #23 (VEE), #36 (OCR confirmation) and #53 (forecasting) visually coherent rather than three unrelated features.

### P4 — Live means live, and says so when it isn't
One shared `ConnectionState` component: `connected` · `reconnecting` · `polling` · `stale`. It reflects the actual socket, and it is the **only** thing permitted to render a live indicator. Wired to #18's Realtime fallback ladder.

### P5 — Provenance is one click away
Any derived number can be expanded to its inputs. An invoice line opens to the two register reads that bracket it (#21). A DT loss figure opens to the feeder read and the consumer sum (#26). This is the design expression of the whole project's thesis.

### P6 — Density is the point
This is an operations product, not a marketing site. 2.0 used four enormous stat cards to display four numbers above the fold. A DISCOM officer managing 400 DTs needs a table, sorted, with sparklines. Marketing pages get air; operator surfaces get information.

---

## 3. Colour

Colour is assigned **by the job it does**, and the palette was validated with a script rather than judged by eye. All values below are OKLab-verified for CVD separation, lightness band, chroma floor, and contrast, in **both** light and dark.

### 3.1 The core insight

2.0 treated solar / consumption / import / export / battery as five arbitrary categorical colours. They are not. They are four *different kinds of quantity*:

| Quantity | Encoding job | Therefore |
|---|---|---|
| Generation, consumption | identity | **categorical** |
| Net grid exchange (import ↔ export) | **polarity** — it is one signed quantity | **diverging** |
| Battery SoC, AT&C loss %, DT penetration | magnitude | **sequential** |
| Meter offline, tamper, SLA breach, theft | state | **status** (reserved) |

Getting this taxonomy right is why the palette validates. Trying to force grid exchange into two categorical slots is what made every 4-colour candidate fail.

### 3.2 Categorical — 3 slots, all-pairs safe

| Slot | Role | Light | Dark |
|---|---|---|---|
| 1 | Generation (solar) | `#eda100` | `#c98500` |
| 2 | Consumption (load) | `#2a78d6` | `#3987e5` |
| 3 | Third series (site, plan, comparison) | `#1baf7a` | `#199e70` |

Validated `--pairs all` in both modes:
- light — CVD ΔE 9.1 (protan), normal-vision ΔE 20.5 ✅
- dark — all checks pass ✅

**Assign in fixed order, never cycled.** A 4th simultaneous series folds to "Other", becomes small multiples, or gets faceted. Amber and aqua sit below 3:1 on the light surface, so the **relief rule** applies: those series always carry visible direct labels or a table view.

For genuinely arbitrary many-series comparisons (per-DT, per-plan), extend with the reference eight-hue order on the **adjacent** pairlist only — stacked areas and grouped bars, never scatter or choropleth.

### 3.3 Diverging — net grid exchange

**aqua ↔ orange**, neutral gray midpoint. Cool/warm poles that read as opposite; gray at zero reads as "nothing exchanged".

| | Light | Dark |
|---|---|---|
| Export (+, selling) | `#1baf7a` | `#199e70` |
| Zero | `#f0efec` | `#383835` |
| Import (−, buying) | `#eb6834` | `#d95926` |

Validated all-pairs, both modes ✅. Equal step count per arm.

Also used for: DT loss vs target, DR achieved-vs-baseline, budget variance.

### 3.4 Sequential — magnitude

Single hue, light→dark. Default **blue** ramp `#cde2fb → #0d366b`.

Used for: battery SoC, AT&C loss choropleth on the DT map (#26), solar penetration on the feasibility view (#30), heatmaps of load by hour × day.

For an **ordinal** ramp (discrete tiers), the lightest step must clear 2:1 against the surface — start no lighter than `#86b6ef` on light, no darker than `#184f95` on dark.

Never a rainbow. Never a hue at a diverging midpoint.

### 3.5 Status — reserved, never a series colour

| State | Light | Dark | Used for |
|---|---|---|---|
| good | `#008300` | `#008300` | online, within SLA, balance healthy |
| warning | `#eda100` | `#c98500` | low balance, approaching SLA, degraded comms |
| serious | `#eb6834` | `#d95926` | offline, SLA breached, loss above threshold |
| critical | `#e34948` | `#e66767` | tamper, suspected theft, disconnect pending |

This set deliberately **does not** pass the categorical CVD gate — and it does not have to, because **status never ships as colour alone.** Every status pill carries an icon and a text label. That is the documented relief, and it is mandatory, not optional.

Status colours are never reused as "series 4".

### 3.6 Implementation

Define as CSS custom properties on a `.viz-root` scope, declared under **both** `@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]`, so the OS setting and the in-app toggle both work and the toggle wins in both directions. Reference roles, never raw hex, in component code.

Tokens live in `packages/shared/src/tokens.ts` and are consumed by Tailwind config (web) and NativeWind (mobile) so the two platforms cannot drift.

---

## 4. Charts

### 4.1 Rules
- **One axis. Never dual-axis.** Two measures of different scale → two charts, small multiples, or index to a common base. Generation-vs-cost is the tempting case; do not.
- Thin marks. 2px lines. 4px rounded data-ends anchored to the baseline. ≥8px markers. 2px surface gap between stacked segments and adjacent bars. 2px surface ring on overlapping marks.
- Recessive grid and axes. Text wears **text tokens**, never the series colour — a colour swatch beside a label carries identity.
- Legend always present for ≥2 series; none for one (the title names it). ≤4 series also get direct labels. Identity is never colour-alone.
- Selective direct labels — never a number on every point.
- **Hover layer by default**: crosshair + tooltip on line/area, per-mark tooltip on bar/dot/cell. Hit targets larger than the mark. Filters in one row above the charts.
- A table view exists for every chart. This is the relief for the sub-3:1 series and the accessibility floor.

### 4.2 Forms, by surface

| Surface | Form | Why |
|---|---|---|
| Live energy flow | Sankey or node-flow, animated by real value | 2.0's version was good — port the visual, drive it from #18 |
| 24h generation vs load | Layered area, one axis | Two series, shared unit |
| Net grid exchange | Diverging bar around a zero baseline | Signed quantity |
| Battery SoC | Sequential gauge or sparkline | Magnitude |
| DT AT&C loss | Choropleth on the Leaflet map + sorted table | Geography *and* ranking — the table is what an officer actually works from |
| Loss over time per DT | Small multiples | Many series, never 12 lines on one axis |
| Load by hour × day | Heatmap, sequential | Two categorical dims + magnitude |
| NM queue | Table with SLA countdown, sorted by time-to-breach | Not a chart |
| Invoice breakdown | Ordered bar with direct labels | Every line traceable (#21) |
| Society allocation | Stacked bar summing to generation | Shows conservation (#51) visually |

### 4.3 The stat tile — rebuilt

The component 2.0 got most wrong. Spec:

```
┌──────────────────────────────────┐
│ [icon]              [Δ badge]    │   badge renders ONLY if a real
│                                  │   comparison period exists
│ SOLAR GENERATED                  │
│ 41.8 kWh                         │   — if no data
│ ▁▂▃▅▆▅▃ · vs 37.2 last week      │   sparkline + explicit basis
└──────────────────────────────────┘
```

Rules:
- The Δ badge is computed from a **named comparison window** shown in the tile. No basis → no badge.
- No data → the value is `—`, the sparkline is absent, the badge is absent. Never `0.0` with an up-arrow.
- Zero is rendered as `0` only when zero was genuinely measured, and then the badge is honest about it.
- Currency is `bigint` paise formatted to exactly 2 decimals via `Intl.NumberFormat('en-IN')`. `₹1,063,717.882` is impossible by construction.
- Colour on the tile follows the **status** taxonomy if it has a state, and nothing otherwise. A tile is not decorated for decoration's sake.

### 4.4 The chart toolkit (built)

§4.2's forms are now real components under `apps/web/components/charts/`, all hand-rolled SVG per §4.1 — no charting library, same as `EnergyBarChart` and `Sparkline` before them:

- **`ChartFrame` / `LegendDot`** — the shell every chart sits in: a title that names the one series, an optional filter row, a legend for ≥2 series, and a `<details>` **Table view** that is never optional. Server component; the plot is the client island inside it.
- **`AreaChart`** — layered area, one axis, for two series sharing a unit (grid import vs solar export, generation vs load). Hover crosshair + tooltip, hit target the full width; the line paths trace themselves in once on mount via `.animate-draw` (`--draw-length` set inline from `getTotalLength()`), never animating the values.
- **`LoadHeatmap`** — hour × weekday, sequential fill on the consumption token, per-cell tooltip. Fed by `hourly_load_profile()` (migration 0025), the first rollup below day granularity.
- **`RankedBar`** — ordered horizontal bars with a direct value label per row (DT AT&C loss, later invoice breakdown and society allocation). Bars grow from the left once; a negative value (metered exceeds delivered — a DT-head data-quality flag) renders by magnitude in the tertiary text colour, never as a green "good" bar.
- **`DonutChart`** — a single composition that sums to a real whole (fleet capacity by asset type). 3px circumference gap between segments, centre total, one segment lifts on hover. Not for time series.

Wired into: consumer dashboard + analytics (area + heatmap), DISCOM overview (ranked loss bars), operator fleet (capacity donut). `OnboardingCard` (dismissed state in `localStorage`) gives each panel a first-run orientation strip.

---

## 5. Typography, spacing, surfaces

**Type.** One display face for headings (2.0's tight geometric sans works — keep the family, tighten the scale), one text face, one **tabular-figure** mono for all numerals in tables and stat tiles. Tabular figures are non-negotiable in an operations product: columns of kWh must align.

Scale (rem): `0.75 · 0.875 · 1 · 1.125 · 1.25 · 1.5 · 2 · 2.5 · 3.5`. Nothing between steps.

**Spacing.** 4px base. `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Nothing arbitrary.

**Surfaces.** Three elevations only — page, card, popover. 2.0 used a soft mint-tinted page wash that made every card float in the same gentle way and flattened all hierarchy. 3.0: neutral page, `1px` hairline borders, shadow reserved for genuine overlay.

**Update (#89):** the flattening was 2.0's wash applying to *every* surface indiscriminately, not the wash or shadow themselves being illegitimate. 3.0 now uses both, scoped by P6's own logic — marketing gets air, operator surfaces get information:
- `.hero-wash` (a `color-mix()` derivative of the existing categorical tokens, not a new hardcoded colour) is permitted on the landing page hero only, carrying forward 2.0's composition per §8.
- `--shadow-card` / `--shadow-card-hover` are permitted on marketing cards (`.card-lift`, real hover response to a real pointer) and popovers. Dashboard *chrome* — `PanelShell`'s nav rail, header, and page background — stays flat: hairline borders, no shadow, exactly as this section originally specified.

**Update 2 (#89, second pass, after reading EcoPower2.0's source directly):** 2.0's dashboard *pages* were never washed either — `DashboardLayout.js` sits on a flat `#F8FAFC` and only its individual cards carry `--shadow-sm`/`.hover-lift`. So the boundary was overcorrected: individual dashboard cards (`StatTile`, `InvoiceCard`, the sidebar account card, notification/AI-advisor popovers) now carry `.card-lift` (hover) or `.card-shadow` (resting-only, for cards inside dense lists/tables where a hover translateY would jitter neighbours) — same tokens as marketing. What stays banned is a shadow or wash on the page frame itself (nav, header, `<main>` background) and any shadow standing in for a data value that isn't there (P1). Card radius also moved 10px → 16px in `tailwind.config.ts`, one step closer to 2.0's 16–24px range while staying inside "one set."

**Radius.** `6px` controls, `10px` cards, `full` pills. One set.

**Motion.** 150ms ease-out for state changes, 250ms for entrances. Live values transition their number, not their container. `prefers-reduced-motion` respected — and this matters specifically for the energy-flow animation.

### 5.1 Update 3 — dark by default, and the faces are named

The light theme was the shipped default through #89. It is now the *alternate*: the palette's **dark** variant is what `:root` carries, and light lives under `:root[data-theme="light"]`, intact and still validated. Nothing was deleted — the default flipped.

Why: this is an operations product read in a control room and on a phone in sunlight, and the palette's luminous accents (`#6fea77` lime, `#00d3ff` cyan, `#ffbd34` amber, `#ff6c58` coral) only separate properly against a near-black ground. `scripts/validate_palette.js` passes on both themes with the same thresholds; the tightest pair is generation-vs-third at protan ΔE 8.5 against a floor of 5.

**The faces are now named**, replacing "2.0's tight geometric sans":
- **Archivo** — headings. Tight, slightly wide, industrial.
- **IBM Plex Sans** — body. Engineered rather than neutral; it belongs to a utility product.
- **IBM Plex Mono** — every value that came out of the database: a meter serial, a register read, a rupee amount, a JWT claim. `.mono` is the marker for "this is data", `.tabular` remains mandatory for aligned columns.

All three are self-hosted by `next/font` in `app/layout.tsx`, so there is no third-party request at runtime.

**The neutral ladder is four surfaces, not three:** `--color-surface` (page), `--color-surface-raised` (nav rail and header chrome), `--color-surface-card`, `--color-surface-sunken` (the well an input or code block sits in). On a dark ground a drop shadow is nearly invisible, so chrome separates from canvas by *surface step plus hairline*; `--shadow-card` is still what lifts a card on hover.

**Accent fills take dark ink, not white.** The dark accents are all light colours — `text-white` on lime or amber is unreadable. `.on-accent` (`#04140b`) is the ink for any filled chip, badge or primary button.

**Icons are drawn, never typed.** `components/Icon.tsx` is the single stroke-icon set (24-unit grid, 1.6 weight, `currentColor`). Emoji are banned as icons anywhere in the product: they render differently on every platform, cannot take a tint, and sit at the wrong optical weight beside real data.

**Atmosphere stays scoped by P6.** `.grid-backdrop` and `.aurora` are permitted on the marketing and auth surfaces only — the two places DESIGN.md grants air. No dashboard gets either.

---

## 6. Panel identity

Five panels need to be instantly distinguishable without becoming five products. 2.0 tinted the whole sidebar per role, which fought the data colours.

**Rule: identity lives in the rail and the header, never in the data area.** A 3px accent bar on the active nav item and a role chip in the header. The chart canvas is identical in all five.

| Panel | Accent | Density |
|---|---|---|
| Consumer | aqua | comfortable — one decision per screen |
| Society | violet | comfortable, table-forward |
| DISCOM | blue | **dense** — tables, sorting, keyboard nav, bulk actions |
| Operator | slate | dense |
| Field (mobile) | amber | **large touch targets**, one-handed, high contrast for sunlight |

The field app is a genuinely different design problem: gloved hands, direct sunlight, basements with no signal. Minimum 48px touch targets, maximum contrast, and the offline-queue badge (#45) always visible.

---

## 7. Accessibility

- WCAG AA minimum: 4.5:1 body text, 3:1 large text and UI boundaries.
- Colour is never the sole carrier of meaning — status has icon + label, series have direct labels or a legend, charts have table views.
- Full keyboard operation on every DISCOM and operator surface. Visible focus rings. Skip links.
- Dark mode is **selected**, not an automatic inversion — its own steps from the same ramps, validated against the dark surface.
- A texture fill (45° / 135° hatch) is available for the CVD, print, and forced-colors case, and is the default rendering for **estimated** values (P3).
- Language: `en` / `hi` / `gu` via next-intl. 2.0 shipped a `LanguageSwitcher.js` with three dictionaries that was never mounted and had no i18n system behind it. Indian utility consumers are not an English-only audience.

---

## 8. Carry forward from 2.0

**Take:** the landing-page hero composition and energy-flow diagram (visual only — rebuild the data path), `AhmedabadMap.js` (Leaflet, SSR-safe dynamic import, generic despite the name), `Modal.js` (clean API, body-scroll lock, used by 19 pages), `InvoicePDF.js` and `ExportUtils.js` (the jsPDF suite genuinely works).

**Rebuild:** every stat tile, every badge, every status pill, the LIVE indicator, all chart components, `Sidebar.js` (26 routes hardcoded in an object literal — make it data-driven), `DashboardLayout.js` (carries a second copy of the role-colour map with different keys).

**Drop:** the inline `style={{}}` approach entirely — 2.0 had Tailwind configured but never installed, and not one component used a utility class.

---

## 8.5 Scalability (#89)

PS1 §4/§6 asks the platform be "designed for scalability so it can later
expand to multiple services and integrate with DISCOM workflows" and
support "millions of users and devices." A hackathon PoC cannot *prove*
millions-of-devices scale — no load test claiming that number here would
be honest. What the schema actually does, concretely, toward that goal:

- **Partitioned time-series**: `meter_readings` is partitioned by month
  (`0005_time_series_schema.sql`) specifically so per-partition indexes
  stay small as device count and history grow — an unpartitioned table
  at millions-of-meters × 15-minute ticks would degrade query planning
  long before it degraded storage.
- **Denormalized scope keys**: every RLS-scoped table carries its own
  `dt_id`/`division_id`/`org_id` (`0002_scope_keys.sql`) rather than
  requiring a join up the topology tree on every row-security check —
  the join cost that would otherwise multiply by every concurrent query
  is paid once, at write time, via a trigger.
- **Service-abstraction, not a hardcoded plan**: `service_types`
  (`0012_subscriptions.sql`) is the mechanism PS1's "later expand to
  multiple services" asks for — adding a new metered or flat-rate service
  is a row, not a schema migration touching every billing code path.
- **Known, named limits, not silence**: the free-tier Supabase Realtime
  connection cap (~200 concurrent) is the actual ceiling on today's
  deployment for the live-meter-tile feature specifically — documented
  here rather than left implicit, so it's a known trade to revisit on a
  paid tier, not a surprise.
- **Not done**: connection pooling tuning, read replicas, and an actual
  load test are real future work, not simulated. Listed here so "designed
  for scalability" stays a specific, checkable claim rather than a phrase.

---

## 9. Verification

- **Palette**: `node scripts/validate_palette.js` in CI on both modes. A failing palette fails the build.
- **States**: Storybook (or a `/kitchen-sink` route) rendering all five states of every data component. Reviewed before the component ships.
- **No-data drill**: a Playwright run against a seeded-empty tenant asserting that **no badge, trend arrow, or status literal renders anywhere**. This is the regression test for 2.0's exact failure — and the one that matters most.
- **Contrast**: axe-core in CI.
- **Visual regression**: Playwright screenshots of every panel in light and dark.
