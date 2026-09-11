# EcoPower 3.0

**An Energy-as-a-Service platform that sits on top of AMI — the layer between a DISCOM's metering infrastructure and the consumer.**

Built for the final round of **INSTINCT 4.0**, the innovation challenge run by [IntelliSmart Infra](https://www.intellismartinfra.in/) — the EESL + NIIF joint venture executing India's largest smart-meter rollout — in partnership with The Energy Society, IIT Delhi.

```
Smart Meter → NIC → HES → MDM → EcoPower
                            ↑
                  HESAdapter interface
       SimulatedHESAdapter │ TrilliantUnitySuiteAdapter (stub)
```

**Status:** deployed and working on Vercel, backed by a real Supabase Postgres/RLS project and a live MQTT telemetry pipeline. Not a mockup — see [What's actually built](#whats-actually-built) for the honest line between shipped code and planned scope.

---

## What it is

Customers subscribe to energy services — solar, battery backup, uptime — instead of buying and maintaining equipment. EcoPower runs the commercial layer on top of the meter data: subscription, prepaid and postpaid billing derived from actual register reads, payments, support, and the DISCOM-side workflows that make rooftop solar legal and connected.

It is **one Next.js web app** with seven role-gated panels, authorization enforced by Postgres Row Level Security (not the UI):

| Panel | Who | What they do |
|---|---|---|
| **Consumer** | homeowner | live energy, bills with provable line items, subscription, prepaid balance, analytics, notifications, carbon, P2P trade, EV, meter self-read (OCR-assist), i18n (EN/HI/GU) |
| **Housing Society** | RWA committee | shared rooftop, per-unit consumption breakdown, editable allocation, common-area cost split + notice board |
| **DISCOM** | utility officer | DT-level AT&C loss map + theft/loss localization drill-down, net-metering approval queue, prepaid disconnection watch list, outage management console, append-only audit ledger, P2P market oversight, division load curve |
| **Operator** | RESCO / EaaS provider | asset fleet, device health, performance-guarantee exposure, fleet generation curve, ESG report |
| **Field Technician** | installer, mobile-first | work-order queue, meter self-read review, site inspections |
| **Support agent** | contact-centre | Consumer 360 lookup, ticket queue, knowledge base + canned responses |
| **Platform admin** | superadmin | cross-tenant tenants / users / consumers / billing / analytics / tickets |

### One build, five problem statements

INSTINCT 4.0 published five problem statements. They are one system, so we built one:

| PS | Covered by | State |
|---|---|---|
| 1 · Energy as a Service | the platform | **built** |
| 2 · Smart Metering Super App for consumers | consumer panel + installable PWA (`manifest.ts`, icon, service worker) | **built as PWA**; native Expo app not built (see [#43](../../issues/43)) |
| 3 · Predictive Maintenance of Meters | anomaly-detection service | **not built** (see [#54](../../issues/54)) |
| 4 · Accurate meter reading via OCR | field self-read capture + `tesseract.js` OCR-assist + review queue | **capture + assist built**; measured eval set not done ([#37](../../issues/37), [#47](../../issues/47)) |
| 5 · Real-time asset tracking | asset registry, work orders, site inspections, commissioning | **partial** — registry + work orders + inspections built; offline outbox / QR-scan commissioning not ([#45](../../issues/45), [#48](../../issues/48)) |

---

## What makes it different

**Billing is provable.** Every invoice line carries the two cumulative register reads that bracket it. Click a line and it expands:

> `1,247.300 kWh @ 2026-08-01 05:30:12` → `1,589.700 kWh @ 2026-09-01 05:30:07` = **342.400 kWh**
> telescopic on GERC RGP-Urban FY26 — 50 @ ₹3.20 · 150 @ ₹3.95 · 142.400 @ ₹5.00 = **₹1,464.50**

The tariff seed is read from the actual Torrent Power Ahmedabad GERC order (3 slabs, phase-based fixed charge, real FPPPA — not DATA.md's earlier placeholder).

**Telemetry is real.** An AMI simulator (`apps/simulator`) publishes DLMS-shaped, OBIS-keyed payloads over MQTT (EMQX on Railway) from a physical solar-position + stochastic-load model driven by live Open-Meteo weather. An ingest worker (`services/ingest`) verifies per-device HMAC, checks register monotonicity, handles rollover, and batch-`COPY`s into partitioned Postgres. Realtime pushes `meter_live_state` to the web app with an honest connected/reconnecting/polling indicator.

**Authorization is the database's job.** Every policy is Postgres Row Level Security over JWT scope claims injected by a custom access-token hook. A DISCOM officer querying another division does not get an empty list — the rows do not exist for them. Proven by a pgTAP suite (160 assertions across 24 files) run in CI against a fresh `supabase db reset`.

**Correctness is tested.** Golden-file billing tests plus property tests (line-sum conservation, net-metering offset conservation, monotonic slab boundaries, half-up rounding) in `packages/shared`.

**The numbers are honest.** Synthetic series, real cited parameters — see [DATA.md](DATA.md). Nothing renders a trend badge without a real comparison basis ([DESIGN.md](DESIGN.md) P1).

---

## What's actually built

| Path | State |
|---|---|
| `apps/web` | **Real, deployed.** Next.js 15 App Router, 46 pages across 7 panels. ~95% of the codebase. |
| `apps/simulator` | **Real.** Physically-modelled AMI readings over MQTT. |
| `services/ingest` | **Real.** MQTT → HMAC + monotonicity validation → partitioned Postgres. |
| `packages/shared` | **Real.** Zero-dependency TS — tariff engine, OBIS/HESAdapter, guarantee engine, design tokens + palette validator. |
| `supabase/` | **Real.** 38 migrations, RLS + FORCE on every table, 24 pgTAP test files in CI. |
| `apps/mobile` | **Empty.** No Expo app. PWA covers the mobile channel for now. |
| `services/ml` | **Empty.** No forecasting / anomaly / OCR-service. (Bill/meter OCR runs client-side via `tesseract.js`.) |
| `services/worker` | **Empty.** No BullMQ job runner; scheduled work is `pg_cron`. |
| `tools/loadtest` | **Empty.** No k6 scripts. |

Payments: real Razorpay **test-mode** Orders + Checkout + signed webhook verification. AI: `/api/ai/advisor` + `/api/ai/bill-explainer`, Gemini-grounded on real account data (`/api/copilot` is still a stub).

---

## Stack

| Layer | Choice | State |
|---|---|---|
| Web | Next.js 15 App Router · React 19 · Tailwind → **Vercel** | built |
| Data | **Supabase** — Postgres 15, RLS, Auth, Realtime | built |
| Telemetry | EMQX (MQTT) · ingest worker · AMI simulator → **Railway** | built |
| Payments | Razorpay — Orders, Checkout, signed webhooks (test mode) | built |
| AI | Google Gemini — energy advisor + bill explainer (server-side) | built |
| Mobile | installable PWA; Expo / EAS | PWA built; native planned |
| ML | Python FastAPI — forecasting, anomaly, OCR service → Railway | planned |
| Jobs | `pg_cron` today; BullMQ + Redis → Railway | cron today |

Monorepo, Turborepo + pnpm. `packages/shared` is zero-dependency pure TypeScript — the tariff engine is byte-identical across web and worker, because a duplicated tariff engine is the one bug class that would destroy the correctness claim.

```
apps/web/          Next.js — route groups per panel
apps/simulator/    AMI simulator
services/ingest/   MQTT subscriber → Postgres
packages/shared/   tariff + guarantee engine · OBIS + HESAdapter · design tokens
supabase/          38 migrations, RLS policies, pgTAP tests
scripts/           demo seed + palette validation + client-bundle secret scan
apps/mobile · services/ml · services/worker · tools/loadtest   — scaffolded, empty
```

---

## Standards and regulatory grounding

- **DLMS/COSEM**, **IS 15959 Part 2 : 2016** — OBIS codes, block load / billing / instantaneous / event profiles
- **GERC** Multi-Year Tariff Regulations 2024, Torrent Power Ahmedabad RGP slab tariffs, FPPPA, electricity duty
- **CEA / GERC** net-metering approval workflow
- **RDSS** — prepaid metering, AT&C loss reduction, DT-level energy accounting
- **PM Surya Ghar Muft Bijli Yojana** — subsidy structure (referenced; full workflow tracked in [#31](../../issues/31))
- **NPCI** — UPI Autopay (tracked in [#40](../../issues/40))

---

## Documentation

| File | What's in it |
|---|---|
| **[HANDOFF.md](HANDOFF.md)** | **Start here.** Single-file context for anyone picking this up — what works, how to run it, the architecture rules code review enforces. |
| **[ROADMAP.md](ROADMAP.md)** | The issue tracker — every row is a GitHub issue, with the Tier A/B/C ship order. |
| **[WORKLOG.md](WORKLOG.md)** | Chronological record of every session, bug found, and verification step. |
| **[DESIGN.md](DESIGN.md)** | Design system — validated colour palette, chart specs, component states, accessibility. |
| **[DATA.md](DATA.md)** | Data strategy — what's real, what's synthetic, every source cited. |
| **[DEMO-RUNBOOK.md](DEMO-RUNBOOK.md)** | The jury walk-through. |
| [BUILD-ORDER.md](BUILD-ORDER.md) · [PS1-PRIORITY-PLAN.md](PS1-PRIORITY-PLAN.md) · [PLAN-2.0-PARITY.md](PLAN-2.0-PARITY.md) · [PLAN-FINAL-WEB.md](PLAN-FINAL-WEB.md) | Historical planning docs — carry a dated status note at the top. |

**Issue tracker:** 45 closed, 50 open (of 95 filed). Closed = verified shipped. Open = the remainder — native mobile, ML services, k6 load testing, WhatsApp/SMS delivery, demo hardening, plus 3 review findings (#93–#95). See ROADMAP.

---

## Predecessor

[EcoPower 2.0](https://github.com/neevmodh/EcoPower2.0) reached this final. 3.0 is a greenfield rewrite, not an iteration — the reasons (no real auth, `Math.random()` billing, a fake LIVE dot, a live LLM key in the browser) are documented in [ROADMAP.md §2](ROADMAP.md) and [EcoPower-2.0-vs-3.0.md](EcoPower-2.0-vs-3.0.md).

## License

MIT
