# EcoPower 3.0 — Data Strategy

Companion to [ROADMAP.md](ROADMAP.md) and [DESIGN.md](DESIGN.md).

---

## 1. The honest answer

**Per-consumer smart meter data does not exist publicly. Not in India, not anywhere.** DISCOMs do not publish individual consumer reads — it is commercially sensitive, personally identifying, and in most tenders contractually restricted. IntelliSmart holds that data for 20M+ meters and cannot hand it out.

So every team in this final will be showing generated data. There is no alternative.

The thing that separates a credible entry from a fabricated one is **not** whether the series is synthetic. It is whether the **parameters that generate it are real, sourced, and cited** — and whether the platform is honest about which is which.

> **Our rule: synthetic *series*, real *parameters*, cited *everywhere*.**

That principle is enforced structurally, not by discipline:

- A `data_provenance` table records, for every seeded fact, the generator version and the source of every parameter it used.
- The demo UI carries a visible **"Synthetic data · generator v1.x · calibrated to GERC FY26 / PFC FY24"** chip. We do not hide it.
- Anywhere a real published figure is encoded (a tariff slab, an AT&C loss number), the row carries a `source_document_url`.

Saying *"this is synthetic, here is exactly how it was calibrated, and here are the eleven public sources"* reads as rigour to Rawal and Banga. Presenting invented numbers as real reads as the opposite, and they will ask.

---

## 2. Three tiers of data

| Tier | What it is | How we use it |
|---|---|---|
| **T1 — Real, downloadable** | Solar irradiance, weather, tariff orders, AT&C loss reports, equipment standards, geography | **Ingest directly.** No synthesis at all. |
| **T2 — Real published aggregates** | DISCOM-level loss %, consumption per capita, DT loading norms, connection counts | **Calibrate the generator.** Our synthetic population must reproduce these aggregates. |
| **T3 — Synthesised** | Individual consumer load profiles, individual meter register reads, individual invoices | **Generate**, from a physical model driven by T1 and constrained to T2. |

The test for T3 is: *if you aggregate our synthetic population up to division level, do you get the published PFC number?* If yes, the synthesis is defensible. If no, it is fiction.

---

## 3. Tier 1 — real data we ingest directly

### 3.1 Solar resource — drives all generation

| Source | What | Access |
|---|---|---|
| **NREL NSRDB** — `nsrdb.nrel.gov` | Satellite-derived GHI / DNI / DHI, hourly and half-hourly, 1998–2025. Covers India. | Free API + AWS Open Data registry |
| **PVGIS** (EU JRC) | Hourly solar radiation and modelled PV output, covers India | Free, downloadable hourly series |
| **Global Solar Atlas** (World Bank/Solargis) | Long-term yearly GHI, DNI, PVOUT, optimum tilt — GIS layers | Free download |

**Ahmedabad parameters, encoded:**

| Parameter | Value | Note |
|---|---|---|
| GHI | **5.5 – 6.0 kWh/m²/day** annual mean | Tier-1 solar zone |
| Performance ratio | **0.78 – 0.85** | typical Indian rooftop |
| Specific yield | **≈ 1,600 kWh/kWp/year** | `5.75 × 365 × 0.80 ≈ 1,679`; we use 1,600 as the conservative central value |
| Daily, 1 kWp | **≈ 4.0 – 4.5 kWh/day** annual mean | seasonal swing modelled, not averaged away |

We do **not** hardcode a yield number. `apps/simulator` (#12) computes a clear-sky curve from solar position for 23.03°N, 72.58°E, then applies cloud cover from a live weather API, a soiling ramp, and a temperature derate. The yield above is what the model should reproduce over a year — it is a **validation target**, not an input.

### 3.2 Weather — drives the cloud/temperature terms
Open-Meteo (free, no key, hourly forecast + historical reanalysis) as primary; IMD for citation. Feeds both the simulator (#12) and the forecasting service (#53).

### 3.3 Tariffs — GERC, real and cited

**RGP-Urban (residential), Gujarat, FY2026** — GERC retained the previous year's tariffs:

| Slab | Rate |
|---|---|
| 0–50 units | **₹3.05** |
| 51–100 | **₹3.50** |
| 101–250 | **₹4.15** |
| above 250 | **₹5.20** |

**RGP-Rural:** ₹2.65 · ₹3.10 · ₹3.75 · ₹4.90

**Fixed charge**, by sanctioned load: ₹15/mo ≤2 kW · ₹25 (2–4 kW) · ₹45 (4–6 kW) · ₹70 (>6 kW)

**Electricity duty:** 10% on energy + fixed charges
**FPPPA:** quarterly Fuel & Power Purchase Price Adjustment, varies by DISCOM — modelled as its own invoice line, not folded into the unit rate

Regulatory frame: **GERC Multi-Year Tariff Regulations, 2024**, effective 1 Apr 2025 – 31 Mar 2030.

Every one of these goes into `tariff_slabs` with `effective_from` and `source_document_url` (#20). Swetha Ravi Kumar of FSR Global is on the jury — the citation is the point.

### 3.4 AT&C losses — the DISCOM story, real

**FY2023–24, Gujarat:**

| DISCOM | AT&C loss |
|---|---|
| DGVCL (Dakshin) | **1.68%** — lowest of any state utility in India |
| MGVCL (Madhya) | **9.29%** |
| UGVCL (Uttar) | **9.35%** |
| PGVCL (Paschim) | **18.31%** |

Source: PFC / Ministry of Power annual DISCOM performance report. All four rank in India's top 10.

**This spread is a gift for the demo.** It is real, it is public, and it means our seeded divisions can span 1.7% to 18.3% loss honestly. The "problem division" in the DISCOM panel (#26, #27) is modelled on PGVCL's real profile — we are not inventing a crisis, we are reproducing a published one.

### 3.5 Equipment standards

**Distribution transformers — IS 1180.** Standard three-phase ratings: **25, 40, 63, 100, 160, 200, 250, 315, 400, 500 kVA**. RDSS procurement since 2023 requires **Level 2** efficiency (~20–25% lower losses than Level 1). Our `distribution_transformers` seed uses only these ratings — a 175 kVA DT would be an instant tell.

**Meters — IS 15959 Part 2 : 2016**, the Indian companion specification to DLMS/COSEM. Defines the object model, six associations, authentication and security mechanisms, and the profiles our payloads imitate (#10):

| Profile | Interval |
|---|---|
| Block load profile — consumer meters | **30 min** (configurable) |
| Block load profile — interface / feeder meters | **15 min** |
| Instantaneous | on demand |
| Billing profile | monthly + on-demand |
| Event log | on occurrence |

### 3.6 Geography
OpenStreetMap for Ahmedabad street network and ward boundaries; feeds `AhmedabadMap.js` and the DT choropleth (#26). Substation and feeder topology is synthesised — real network topology is a security-sensitive asset and is not public anywhere.

### 3.7 Subsidy — PM Surya Ghar Muft Bijli Yojana
₹30,000/kW for the first 2 kW · ₹18,000 for the third · **capped at ₹78,000** · disbursed **after DISCOM inspection**. Encoded in #31 and in the savings calculation (#38), where it materially changes payback.

---

## 4. Tier 3 — how the synthesis actually works

### 4.1 Consumer load profiles
A stochastic appliance model, not a sine wave and not `Math.random()`:

- Per-household appliance set drawn from a distribution conditioned on sanctioned load and tariff category
- Each appliance has a duty cycle, a rated draw, and a diversity factor
- Seasonal envelope — Ahmedabad summer AC load is the dominant signal, and a flat annual profile is a tell
- Evening peak, morning shoulder, overnight base
- Weekend/weekday variation

**Calibration target:** aggregate our synthetic residential population and the mean monthly consumption must land in the real Gujarat residential band, with a realistic long tail.

### 4.2 Registers, not readings
The simulator emits **cumulative registers that only ever increase** (#12), because that is what a real meter sends. Deltas are computed at ingest (#15). This is what makes invoice provenance (#21) possible and what makes rollover handling a real code path rather than a hypothetical.

### 4.3 Planted, findable defects (#59)
Seeded deliberately, each with a physically plausible signature:

| Defect | Signature |
|---|---|
| Theft on one DT | consumer sum decorrelates from DT feeder meter; residual appears |
| Soiling | gradual PR decline vs clear-sky expectation over weeks |
| String failure | step change in array output, partial |
| Inverter trip | output collapse with grid present |
| Meter tamper | IS 15959 event code set, e.g. magnetic |
| Clock skew | readings arriving with future timestamps → `quarantine_readings` |
| VEE gap | comms outage producing a hole that must be estimated and labelled |

The DT chosen for the theft scenario sits in the division modelled on PGVCL's real loss profile — so the story is internally consistent from national statistic down to individual meter.

### 4.4 Volume
`generate_series` to **10M+ rows** (#58) with a realistic diurnal and seasonal shape, so on-stage query timings and the loss map are measured on real volume.

**The scale arithmetic, corrected:** at a **15-minute** block interval — the RDSS interface-meter norm — 20M meters produce 96 reads/day each:

> 20M × 96 = **1.92 billion rows/day ≈ 22,000 rows/s sustained.**

Our single ingest worker target is 5,000 rows/s on 1 vCPU, horizontally partitioned by NIC/DCU via MQTT shared subscriptions. That is 4–5 workers for national scale, and it is why the schema is partition-keyed from migration 0001.

---

## 5. What we will not claim

- We will not claim real consumer data. We will say it is synthetic, in the UI and in the pitch.
- We will not claim a live DISCOM integration. `TrilliantUnitySuiteAdapter` (#11) is a **typed stub**, and we will say so — the point is the interface boundary, not a fake integration.
- We will not present modelled savings as measured savings. Forecasts render dashed beyond `now` (DESIGN.md P3).
- We will not quote an OCR accuracy we have not measured (#37, #47).

---

## 6. Source index

| # | Source | Used for |
|---|---|---|
| 1 | NREL NSRDB — `nsrdb.nrel.gov` | solar irradiance, India coverage |
| 2 | PVGIS (EU JRC) | hourly PV output validation |
| 3 | Global Solar Atlas (World Bank / Solargis) | GHI, PVOUT, optimum tilt GIS layers |
| 4 | Open-Meteo | live + historical weather |
| 5 | GERC tariff orders; MYT Regulations 2024 | tariff slabs, fixed charges, duty |
| 6 | PFC / Ministry of Power DISCOM performance report FY24 | AT&C losses by DISCOM |
| 7 | IS 1180 | DT ratings and efficiency levels |
| 8 | IS 15959 Part 2 : 2016 | meter object model, OBIS, profiles |
| 9 | National Power Portal — `npp.gov.in` | national generation/transmission context |
| 10 | `data.gov.in` — Power & Energy sector APIs | open datasets, CEA |
| 11 | India Climate & Energy Dashboard (NITI Aayog) — `iced.niti.gov.in` | energy indicators |
| 12 | PM Surya Ghar scheme documents | subsidy structure |
| 13 | OpenStreetMap | Ahmedabad geography |

Each is cited in-product at the point of use, not just listed here.
