# EcoPower 3.0

**An Energy-as-a-Service platform that sits on top of AMI — the layer between a DISCOM's metering infrastructure and the consumer.**

Built for the final round of **INSTINCT 4.0**, the innovation challenge run by [IntelliSmart Infra](https://www.intellismartinfra.in/) — the EESL + NIIF joint venture executing India's largest smart-meter rollout — in partnership with The Energy Society, IIT Delhi.

```
Smart Meter → NIC → HES → MDM → EcoPower
                            ↑
                  HESAdapter interface
       SimulatedHESAdapter │ TrilliantUnitySuiteAdapter
```

---

## What it is

Customers subscribe to energy services — solar, battery backup, uptime — instead of buying and maintaining equipment. EcoPower runs the commercial layer on top of the meter data: subscription, prepaid and postpaid billing derived from actual register reads, payments, support, and the DISCOM-side workflows that make rooftop solar legal and connected.

It serves **five distinct users**, each with their own panel:

| Panel | Who | What they do |
|---|---|---|
| **Consumer** | homeowner | live energy, bills with provable line items, subscription, prepaid balance, demand-response opt-in |
| **Housing Society** | RWA committee | shared rooftop, group/virtual net metering, per-flat allocation, common-area load |
| **DISCOM** | utility officer | DT-level energy accounting, AT&C loss and theft localization, net-metering approval queue with SLA clocks, prepaid oversight, demand response |
| **Operator** | RESCO / EaaS provider | asset fleet, O&M and SLA, revenue, churn, plans, OTA firmware |
| **Field Technician** | installer, mobile-first | work orders, meter QR scan, **meter reading OCR from field photographs**, geotagged commissioning proof, offline-first |

### One build, five problem statements

INSTINCT 4.0 published five problem statements. They are one system, so we built one:

| PS | Covered by |
|---|---|
| 1 · Energy as a Service | the platform |
| 2 · Smart Metering Super App for consumers | Expo consumer app |
| 3 · Predictive Maintenance of Meters | anomaly detection service |
| 4 · Accurate meter reading via OCR | field-technician capture + validation layer |
| 5 · Real-time asset tracking | asset registry, work orders, commissioning |

---

## What makes it different

**Billing is provable.** Every invoice line carries the two cumulative register reads that bracket it. Click a line and it expands:

> `1,247.300 kWh @ 2026-08-01 05:30:12` → `1,589.700 kWh @ 2026-09-01 05:30:07` = **342.400 kWh**
> telescopic on GERC RGP-Urban FY26 — 50 @ ₹3.05 · 50 @ ₹3.50 · 150 @ ₹4.15 · 92.400 @ ₹5.20 = **₹1,430.48**

**Telemetry is real.** An AMI simulator publishes DLMS-shaped, OBIS-keyed payloads over MQTT from a physical solar and load model. An ingest worker verifies per-device HMAC, checks register monotonicity, handles rollover, and batch-writes to partitioned Postgres. Realtime pushes to web and mobile. A scenario API can inject theft, soiling, an inverter trip or a tamper event **live**, and you watch it surface in the DISCOM panel.

**Authorization is the database's job.** Every policy is Postgres Row Level Security over JWT scope claims. A DISCOM officer querying another division does not get an empty list — the rows do not exist for them. Proven by a pgTAP suite in CI.

**Correctness is tested, not asserted.** Twelve property-based invariants, including energy conservation (`allocated + common = generated`), DT balance (`dt_meter_kwh − Σ consumer_kwh = loss_kwh`), register monotonicity, and invoice provenance. Plus golden-file billing tests across 20 tariff scenarios.

**The numbers are honest.** Synthetic series, real parameters, cited everywhere — see [DATA.md](DATA.md). Nothing renders a trend badge without a real comparison basis.

---

## Stack

| Layer | Choice |
|---|---|
| Web | Next.js 15 App Router · React 19 · Tailwind → **Vercel** |
| Mobile | Expo / React Native — one binary, two personas → **EAS** |
| Data | **Supabase** — Postgres 15, RLS, Auth, Realtime, Storage, Edge Functions |
| Telemetry | EMQX (MQTT) · ingest worker · AMI simulator → **Railway** |
| ML | Python FastAPI — forecasting, anomaly detection, theft localization, OCR → **Railway** |
| Jobs | BullMQ + Redis — billing runs, PDFs, notifications → **Railway** |
| Payments | Razorpay — Orders, Checkout, signed webhooks, UPI Autopay mandate |

Monorepo, Turborepo + pnpm. `packages/shared` is zero-dependency pure TypeScript — the tariff engine and DB types are byte-identical across web, mobile, and worker, because a duplicated tariff engine is the one bug class that would destroy the correctness claim.

```
apps/web/          Next.js — route groups per panel
apps/mobile/       Expo — consumer + field technician
apps/simulator/    AMI simulator + scenario control API
services/ingest/   MQTT subscriber → Postgres
services/ml/       FastAPI — forecast, anomaly, OCR
services/worker/   BullMQ — billing, PDF, notifications
packages/shared/   tariff engine · OBIS + HESAdapter · design tokens
supabase/          migrations, RLS policies, edge functions, pgTAP tests
tools/loadtest/    k6
```

---

## Standards and regulatory grounding

- **DLMS/COSEM**, **IS 15959 Part 2 : 2016** — meter object model, OBIS codes, block load / billing / instantaneous / event profiles
- **IS 1180** — distribution transformer ratings and efficiency levels
- **GERC** Multi-Year Tariff Regulations 2024, RGP slab tariffs, FPPPA, electricity duty
- **CEA / GERC** net-metering approval timelines and SLA norms
- **RDSS** — prepaid metering, AT&C loss reduction, DT-level energy accounting
- **PM Surya Ghar Muft Bijli Yojana** — subsidy structure and disbursement gating
- **NPCI** — UPI Autopay intent/QR mandate flow

---

## Documentation

| File | What's in it |
|---|---|
| **[ROADMAP.md](ROADMAP.md)** | The build plan and tracker — 85 issues across 8 milestones, numbered to match GitHub issues, with a Tier A/B/C ship order |
| **[DESIGN.md](DESIGN.md)** | Design system — validated colour palette, chart specs, component states, accessibility |
| **[DATA.md](DATA.md)** | Data strategy — what's real, what's synthetic, and every source cited |

---

## Status

In development. Track progress in [ROADMAP.md](ROADMAP.md) — the tracker table is the single record, and every row is an issue in this repo.

Build order is deliberate: the AMI spine and billing engine land **before** UI polish and payments, so that at 60% complete the project has the 60% this jury cares about.

---

## Predecessor

[EcoPower 2.0](https://github.com/neevmodh/EcoPower2.0) reached this final. 3.0 is a greenfield rewrite, not an iteration — the reasons are documented candidly in [ROADMAP.md §2](ROADMAP.md) and [DESIGN.md §1](DESIGN.md).

## License

MIT
