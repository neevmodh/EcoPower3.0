# PLAN — 2.0 Feature Parity + Meter-Read OCR

Goal (per your call, 2026-09-04): bring the 3.0 web app to **2.0's feature density** —
every role panel gets **5+ real features/tools** — and add **meter-reading OCR** so a
consumer can photograph their meter and self-submit a reading for billing, the way
Torrent Power's app does.

This deliberately overrides PLAN-FINAL-WEB.md's "depth over feature count" scoping.
DESIGN.md still applies where it can: OCR reads render with a confidence state (P3),
new tiles derive from real rows or a real service (P1) — where a feature needs data we
don't have, the plan notes it as **[synthetic]** so you can veto per-item.

Status: `☐` todo · `◐` doing · `☑` done · `⊘` cut

---

## Tier 0 — Shared building blocks (do first; everything else depends on these)

| # | Item | Notes | Status |
|---|------|-------|--------|
| 0.1 | `MeterOcr` component + `/api/ocr/meter-read` route | tesseract.js in a web worker, client-side. Crop box → digit read → per-digit confidence → below-threshold digits outlined & editable (P3) → submit to `meter_readings` as `source='self_read'`, `confidence` column. | ☐ |
| 0.2 | Migration `0026_self_reads.sql` | `meter_readings.source` + `.confidence` + `.photo_path`; `self_read_submissions` review queue; RLS (consumer inserts own, field/support review). | ☐ |
| 0.3 | `PaymentWizard` component | Port 2.0 `PaymentFlow.js`: method → details (Luhn / UPI regex) → OTP (30s resend) → processing → receipt. Wraps existing Razorpay `/api/payments/*`; mock rail for demo. | ☐ |
| 0.4 | `MapView` component | Port 2.0 `AhmedabadMap.js` (Leaflet, SSR-safe dynamic import). Generic: takes markers + popup renderer. Add `leaflet` + `react-leaflet` deps. | ☐ |
| 0.5 | `NotificationCenter` full page + `/notifications` route | Beyond the bell: list, filter by type, mark read/all, delete. Backed by `0014` / `0019` notification rows. | ☐ |
| 0.6 | `EsgCard` component | CO2 offset, forest-equiv, ESG score (renewable mix 0–100), monthly trend. Uses `@ecopower/shared` carbon helpers + meter rows. | ☐ |
| 0.7 | Migration `0027_p2p_ev.sql` | `p2p_listings`, `p2p_trades`, `ev_vehicles`, `ev_sessions`, `charging_stations`, `outages`, `announcements`, `call_logs`, `maintenance_orders`, `site_inspections`. RLS per role. Seed stations + a few listings. | ☐ |
| 0.8 | Migration `0028_gujarat_utilities.sql` + `scripts/seed_gujarat_sector.mjs` | Model the **real Gujarat power sector** instead of one generic DISCOM (see Appendix A). `utilities` table (GUVNL parent + GSECL gen + GETCO transmission + 4 DISCOMs + 3 private licensees), each with HQ, service territory (district list), consumer count, published AT&C loss, GERC tariff schedule ref. Existing `divisions`/`orgs` FK to `utilities`. Seed circles/divisions with realistic Gujarati names. All demo rows carry a `data_basis` note (`'modelled on GERC/GUVNL FY24 filings'`) so P1 isn't violated by silent fabrication. | ☑ `0028` — `utilities` table + 10 real entities, `orgs.utility_id`, applied+verified local. Division circle seeding + DISCOM-panel wiring still todo. |
| 0.9 | **Theme → light default (blue/green/white)** | `:root` flipped to the light variant; dark moved to `[data-theme="dark"]`. DESIGN.md §5.2; palette validator + build + lint green. | ☑ |

---

## Tier 1 — Consumer panel (target 8 features)

| # | Feature | Data source | Status |
|---|---------|-------------|--------|
| 1.1 | **Meter self-read (OCR)** — photo → reading → confirm → bill | `meter_readings` (0.2) | ☐ |
| 1.2 | Multi-step payment wizard on bills | Razorpay + `payments` | ☐ |
| 1.3 | P2P energy trading — list surplus, browse, buy | `p2p_listings/_trades` [synthetic prices] | ☐ |
| 1.4 | EV charging — register vehicle, schedule, nearby stations, session log | `ev_*`, `charging_stations` [synthetic] | ☐ |
| 1.5 | Sustainability / ESG card | derived (0.6) | ☐ |
| 1.6 | Site + nearby stations/DT map | `MapView` (0.4) | ☐ |
| 1.7 | Notification center | 0.5 | ☐ |
| 1.8 | AI advisor (exists — keep) | `/api/ai/advisor` | ☑ |
| 1.9 | Live meter · prepaid · analytics · load heatmap (exist — keep) | real | ☑ |

## Tier 2 — DISCOM panel (target 8)

| # | Feature | Data source | Status |
|---|---------|-------------|--------|
| 2.1 | Grid map — DT/feeder health + AT&C loss choropleth | `dt_loss_summary`, `MapView` | ☐ |
| 2.2 | Grid load / demand dashboard | aggregate `meter_readings` | ☐ |
| 2.3 | Loss / theft localization drill-down (exists — keep) | `dt_consumer_breakdown` | ☑ |
| 2.4 | Outage management console — log, assign, restore, ETR | `outages` (0.7) | ☐ |
| 2.5 | Connection approvals (exists — keep) | `connections` | ☑ |
| 2.6 | Revenue / collection-efficiency dashboard | `invoices` + `payments` | ☐ |
| 2.7 | Self-read review queue (approve/reject consumer OCR reads) | `self_read_submissions` | ☐ |
| 2.8 | Prepaid watch · net metering · audit (exist — keep) | real | ☑ |

## Tier 3 — Operator (RESCO) panel (target 7)

| # | Feature | Data source | Status |
|---|---------|-------------|--------|
| 3.1 | Fleet map | `MapView` | ☐ |
| 3.2 | Device health table + firmware/OTA status | `devices` + `maintenance_orders` [firmware synthetic] | ☐ |
| 3.3 | Generation vs performance-guarantee | `0010_guarantee_engine` | ☐ |
| 3.4 | Multi-site portfolio dashboard | `subscriptions` / sites | ☐ |
| 3.5 | Alerts & maintenance queue | `maintenance_orders` | ☐ |
| 3.6 | ESG / carbon portfolio report (+PDF) | derived (0.6) | ☐ |
| 3.7 | Device inventory (exists — keep) | `devices` | ☑ |

## Tier 4 — Field panel (target 6)

| # | Feature | Data source | Status |
|---|---------|-------------|--------|
| 4.1 | Work-order queue (exists API — build UI) | `/api/work-orders` | ☐ |
| 4.2 | Meter reading capture (OCR) | 0.1 | ☐ |
| 4.3 | Site inspection checklist form | `site_inspections` (0.7) | ☐ |
| 4.4 | Assigned-sites route map | `MapView` | ☐ |
| 4.5 | Photo evidence upload (Supabase Storage) | storage bucket | ☐ |
| 4.6 | Offline queue indicator + sync | PWA / local queue | ☐ |

## Tier 5 — Support panel (target 6)

| # | Feature | Data source | Status |
|---|---------|-------------|--------|
| 5.1 | Ticket queue + thread + status (exists — build out) | `tickets` | ◐ |
| 5.2 | Consumer 360 lookup (account · bills · meter · tickets) | joins | ☐ |
| 5.3 | Knowledge base / canned responses | `kb_articles` [seed] | ☐ |
| 5.4 | SLA timers + escalation flags | `tickets` timestamps | ☐ |
| 5.5 | AI reply assist | `/api/ai/advisor` | ☐ |
| 5.6 | Call log | `call_logs` (0.7) | ☐ |

## Tier 6 — Society panel (target 6)

| # | Feature | Data source | Status |
|---|---------|-------------|--------|
| 6.1 | Units register (exists — keep) | `society_units` | ☑ |
| 6.2 | Allocation editor (exists — keep) | `society_units` | ☑ |
| 6.3 | Society consumption dashboard + heatmap | `society_consumption_summary` | ☐ |
| 6.4 | Common-area / DG-set cost split | derived | ☐ |
| 6.5 | Per-flat collection tracker | `invoices`/`payments` scoped to society | ☐ |
| 6.6 | Notice board / announcements | `announcements` (0.7) | ☐ |

---

## Sequencing

Tier 0 in order → then Tiers 1–6. Each feature: migration + RLS + pgTAP where it
touches RLS, `pnpm build` + `pnpm test` green, committed with a WORKLOG note
(neevmodh identity). Maps/OCR add client deps — bundle-size check stays green.

## Open decisions for you

1. **[synthetic] items** (P2P prices, charging stations, firmware versions, KB seed):
   OK to ship with clearly-labelled demo data, or cut those sub-features?
2. **OCR**: client-side tesseract.js is the plan (no new service). Accept the
   accuracy tradeoff, or do you want a real OCR microservice later?
3. **Storage**: field photo evidence needs a Supabase Storage bucket — provision it?
4. Scope of first pass — all 6 tiers, or Tier 0 + Consumer first for review?

---

## Appendix A — Gujarat power sector reference dataset

Structure of GUVNL (Gujarat Urja Vikas Nigam Ltd — state holding co):

| Code | Company | Role | HQ | Territory | ~Consumers | AT&C loss (FY24) |
|---|---|---|---|---|---|---|
| **GUVNL** | Gujarat Urja Vikas Nigam Ltd | Holding / bulk power procurement | Vadodara | statewide | — | — |
| **GSECL** | Gujarat State Electricity Corp Ltd | Generation (thermal/hydro/solar) | Vadodara | statewide | — | — |
| **GETCO** | Gujarat Energy Transmission Corp Ltd | Transmission (220/400 kV) | Vadodara | statewide | — | — |
| **UGVCL** | Uttar Gujarat Vij Company Ltd | Distribution — North Gujarat | Mehsana | Mehsana, Patan, Banaskantha, Sabarkantha, Gandhinagar, Aravalli, Mahisagar | ~42 lakh | ~9.3% |
| **MGVCL** | Madhya Gujarat Vij Company Ltd | Distribution — Central Gujarat | Vadodara | Vadodara, Anand, Kheda, Panchmahal, Dahod, Chhota Udaipur, Mahisagar | ~33 lakh | ~9.3% |
| **DGVCL** | Dakshin Gujarat Vij Company Ltd | Distribution — South Gujarat | Surat | Surat, Bharuch, Narmada, Tapi, Navsari, Valsad, Dang | ~40 lakh | ~1.7% (lowest in India) |
| **PGVCL** | Paschim Gujarat Vij Company Ltd | Distribution — Saurashtra & Kutch | Rajkot | Rajkot, Morbi, Jamnagar, Devbhoomi Dwarka, Porbandar, Junagadh, Gir Somnath, Amreli, Bhavnagar, Botad, Surendranagar, Kutch | ~70 lakh | ~18.3% (high — agri load) |
| **TPL-A** | Torrent Power Ltd — Ahmedabad licence | Private distribution licensee | Ahmedabad | Ahmedabad, Gandhinagar | ~26 lakh | ~7% |
| **TPL-S** | Torrent Power Ltd — Surat licence | Private distribution licensee | Surat | Surat city | ~8 lakh | ~3.5% |
| **AEML-M** | Adani Electricity — Mundra | Private licensee (SEZ) | Mundra | Mundra SEZ | industrial | ~2% |

Figures are public ballparks from GERC MYT tariff orders, PFC/MoP DISCOM performance
reports (FY23–24) and company sites — used as **demo scale**, tagged `data_basis` in
the seed. Tariff slabs already live in `0008_tariff_seed` (Torrent RGP) — extend with
UGVCL/MGVCL/DGVCL/PGVCL RGP slabs from the 01.04.2025 GERC schedule.

Sources: [PFC/MoP DISCOM performance (Power Line)](https://powerline.net.in/2025/04/04/discom-performance-mops-annual-stocktake-of-distribution-segment-health/) ·
[GERC tariff schedule 01.04.2025](https://gercin.org/wp-content/uploads/2025/04/Tariff-Schedule-of-DGVCL-MGVCL-PGVCL-UGVCL-w.e.f.-01.04.2025.pdf) ·
[GUVNL introduction](https://www.guvnl.com/introduction.html) ·
Wikipedia: [DGVCL](https://en.wikipedia.org/wiki/Dakshin_Gujarat_Vij_Company), [Madhya Gujarat Vij](https://en.wikipedia.org/wiki/Madhya_Gujarat_Vij), [Paschim Gujarat Vij](https://en.wikipedia.org/wiki/Paschim_Gujarat_Vij)

---

## UI implementation log (building the 36-screen canvas into apps/web)

| Slice | Screens | Status |
|---|---|---|
| Consumer read-only | `/consumer/notifications`, `/consumer/carbon`, `/consumer/settings` + `lib/panelNav.ts` | ☑ `ca9ab7a` — build + lint green |
| Marketing | `/pricing`, `/how-it-works` + shared marketing nav | ☐ |
| Consumer mobile / PWA responsive | consumer panel @ 390px, meter self-read (needs 0026 + tesseract) | ☐ |
| Five-states demo | `/kitchen-sink` addition or `StatTile` state gallery | ☐ |
| Society depth | units register + allocation editor pages | ◐ (units/allocation pages exist, shallow) |
| DISCOM depth | connections, prepaid watch, outages, command-centre buildout | ◐ (routes exist, shallow) |
| Operator depth | sites & devices, ESG report, maintenance | ◐ (devices exists, shallow) |
| Field depth | work-order queue UI, route, inspection, OCR capture | ◐ |
| Support depth | queue, consumer 360, knowledge base | ◐ |
| Payment wizard | multi-step `PaymentWizard` on `/consumer/bills` | ☐ |
| New-feature panels | P2P / EV / ESG card (needs 0027) | ☐ |
