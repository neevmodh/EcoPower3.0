# EcoPower 2.0 → 3.0

2.0 looked finished. In front of a jury of utility operators it had one fatal
flaw: **the interface asserted things that were not true.** 3.0 keeps 2.0's
breadth and rebuilds every claim so it survives an audit.

---

## The problem 2.0 had

Captured from 2.0's own live deployment (see `DESIGN.md §1`):

| Screen | What 2.0 showed |
|---|---|
| Consumer dashboard | `Solar Generated 0.0 kWh` with a green **↗ +12%** badge · `Savings ₹0` with **↗ +₹450** |
| Consumer analytics | Four KPIs at `0.0`, badges reading **+12% / −8% / +22%**, main chart an empty box captioned *"No data available"* |
| Admin command centre | `SYSTEM GENERATION 0 kWh` badged **"Optimal"** · `GREEN EFFICIENCY 0%` badged **"Target Hit"** |
| Admin fleet | **"ALL SYSTEMS GO"** beside `INV-000 — OFFLINE` |
| Admin revenue | `₹1,063,717.882` — three decimals on a currency, a float artifact |
| Everywhere | A pulsing green **LIVE** dot — a CSS animation on a page that fetched once on mount |

Every badge was a hardcoded constant. "Optimal" was a string literal. The
trend arrows pointed up because someone typed an up arrow.

## The principle 3.0 is built on

**No component may outlive its data.** Every number, badge, trend and status
pill is *derived*, or it renders an empty state. A stat tile with no data
shows `—`, never `0.0` — because zero is a measurement and absence is not.
Any number can be expanded to the inputs it was computed from.

---

## Architecture

| | EcoPower 2.0 | EcoPower 3.0 |
|---|---|---|
| Frontend | Next.js 16 (App Router) + React 19 | Next.js 15 + React 19, monorepo (`apps/web`, `apps/simulator`, `services/ingest`, `packages/shared`) |
| Backend | Node + Express 5 on port 5005 | Supabase — Postgres + PostgREST, no bespoke API server |
| Database | MongoDB Atlas + Mongoose | Postgres: partitioned time-series, **Row-Level Security on every table**, `pg_cron`, triggers, pgTAP |
| Auth / tenancy | JWT, three roles (consumer / enterprise / admin), scoping in app code | Supabase Auth, **9 roles** scoped per org / division, enforced **in the database** — the app never writes a `WHERE org_id` clause |
| Realtime | none (CSS "LIVE" dot on a fetch-once page) | Supabase Realtime with a Broadcast → Postgres-Changes → polling fallback ladder; one `ConnectionState` component is the *only* thing allowed to say "live" |
| Meter model | ad hoc fields | OBIS / IS 15959 cumulative registers; deltas computed at ingest, never at read time |
| Device ingest | — | HMAC-authenticated device endpoint, monotonicity + VEE validation |
| Tests | — | **290+**: 154 pgTAP (RLS, triggers, ledgers), ~170 unit (billing golden files, HMAC, carbon, state machines) |
| AI | Groq LLaMA 3.3 70B advisor | Same idea, grounded strictly in the caller's own rows; refuses to invent a number |

## Data honesty

| | 2.0 | 3.0 |
|---|---|---|
| Tariff | assumed slab rates | Real **GERC / Torrent RGP order**, extracted with `pdftotext` from the gazette PDF, a `source_document_url` beside every rate |
| AT&C loss | a badge | Computed live as `delivered ÷ metered` from real DT-head and consumer register reads; RDSS 12–15% target shown for context |
| Carbon | `0.82 kg/kWh` constant × `0` | Metered export × the **CEA combined-margin factor** (`0.7383`); if a window has no export the page says so rather than estimating |
| Bill | a total | Every line opens to the **two register reads** that bracket it (`#21`) |
| DISCOM decisions | — | Written to an **append-only, hash-chained audit ledger** by a trigger, DB-enforced immutable |
| The Gujarat sector | one generic "DISCOM" | The real structure: GUVNL + GSECL + GETCO + **UGVCL / MGVCL / DGVCL / PGVCL** + Torrent (Ahmedabad & Surat) + Adani (Mundra), each with HQ, district list, consumer count and published loss — tagged `data_basis` so demo scale is never mistaken for a live measurement |

## Features — 3.0 keeps 2.0's breadth

| Feature | 2.0 | 3.0 |
|---|---|---|
| AI advisor | ✅ | ✅ grounded, per-role |
| Notification centre | ✅ | ✅ full page + live bell, wired to workflow triggers |
| Payment flow | multi-step mock wizard | real Razorpay order + signature verify (`#39`) |
| P2P energy trading | ✅ mock | ✅ `p2p_listings` / `p2p_trades`, `p2p_place_order()` locks the listing in one transaction; DISCOM sees the market in its division |
| EV charging | ✅ mock | ✅ vehicles, 5 seeded Ahmedabad stations with real-ballpark tariffs, sessions with a preferred source |
| Sustainability / ESG | ✅ | ✅ consumer carbon page + operator ESG report that **states its data coverage** instead of estimating |
| Map | Leaflet, Ahmedabad | carried forward (`AhmedabadMap` is generic) |
| PDF / CSV export | jsPDF suite | carried forward; every chart also ships a `<details>` Table view |
| Languages | EN / HI / GU | EN / हिन्दी / ગુજરાતી, dependency-free, consumer surfaces end to end |
| **Meter self-read (OCR)** | — | **new**: photograph the meter → tesseract.js reads the digits client-side → confidence-gated confirm → review queue → `accept_self_read()` writes a reading marked `source='ocr', quality='estimated'`. Never asserted as measured until a human confirms. |
| Prepaid | — | first-class billing mode: `prepaid_ledger` (append-only), `pg_cron` daily settlement, a mandated 3-day disconnect grace |
| Loss localisation | — | click a DT → feeder read vs the sum of consumer reads, drill to the consumer |
| Outage management | — | log / timeline / ETR revision / restore; affected consumers see it |
| Performance guarantees | — | contracted terms → measured achievement → **credit auto-computed** when missed, traceable to reads |

## Panels

2.0: 3 dashboards (consumer / enterprise / admin).

3.0: **6 role panels**, each RLS-scoped in the database —
**Consumer** (11 surfaces) · **DISCOM** (8) · **Society** (4) ·
**Operator/RESCO** (4) · **Support** (3) · **Field** (3) — plus marketing
`/`, `/pricing`, `/how-it-works`.

## The one-line difference

> 2.0 showed you a number. 3.0 lets you click it down to the meter read it
> came from. That is what a regulator cares about.
