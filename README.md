# ⚡ EcoPower 3.0 — Energy-as-a-Service Platform

<div align="center">

![EcoPower](https://img.shields.io/badge/EcoPower-3.0-16A34A?style=for-the-badge&logo=zap&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-Postgres_·_RLS_·_Realtime-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![MQTT](https://img.shields.io/badge/AMI-EMQX_·_DLMS/OBIS-660066?style=for-the-badge&logo=eclipsemosquitto&logoColor=white)
![Razorpay](https://img.shields.io/badge/Payments-Razorpay-0C2451?style=for-the-badge&logo=razorpay&logoColor=white)
![Expo](https://img.shields.io/badge/Mobile-Expo_·_React_Native-000020?style=for-the-badge&logo=expo&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?style=for-the-badge&logo=vercel)

**A digital platform for Energy-as-a-Service — customers subscribe to energy services (solar, battery backup, uptime) instead of owning and maintaining the hardware.**

*Provable billing from real register reads · live AMI telemetry · Postgres RLS as the authorization boundary · honest synthetic data*

Built for **[INSTINCT 4.0](https://hack2skill.com/event/instinct4/)** — the innovation challenge run by [IntelliSmart Infra](https://www.intellismartinfra.in/) (EESL + NIIF), with The Energy Society, IIT Delhi.
**Competing on Problem Statement 1 — Energy as a Service.**

</div>

---

## 📋 Table of Contents

- [The Problem (PS1)](#-the-problem-ps1)
- [What EcoPower 3.0 Is](#-what-ecopower-30-is)
- [How It Answers PS1](#-how-it-answers-ps1)
- [Success Metrics](#-success-metrics)
- [What Makes It Different](#-what-makes-it-different)
- [The Seven Panels](#-the-seven-panels)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [What's Actually Built](#-whats-actually-built)
- [Quick Start](#-quick-start)
- [Demo Credentials](#-demo-credentials)
- [Project Structure](#-project-structure)
- [Testing & CI](#-testing--ci)
- [Standards & Regulatory Grounding](#-standards--regulatory-grounding)
- [Where It's Going](#-where-its-going)
- [Documentation](#-documentation)
- [Predecessor](#-predecessor)

---

## 🎯 The Problem (PS1)

> **Energy-as-a-Service (EaaS)** let customers subscribe to energy services — solar power, battery backup, lighting, cooling, uptime guarantees — instead of buying or maintaining equipment. It removes the upfront cost and technical complexity, making clean, reliable energy affordable and accessible.
>
> **The challenge:** build a digital platform that lets end consumers easily **subscribe, track, and manage** energy services without owning infrastructure — with transparency, convenience, and integration with IoT / smart-meter data. It must be **scalable to millions of users and devices** and **future-ready** to integrate with DISCOM workflows (net-metering approval, billing sync, load management).

Real per-consumer smart-meter data is not published by any DISCOM in India (it is commercially sensitive and personally identifying). So every entry demonstrates on generated data. EcoPower's discipline: **synthetic series, real cited parameters, honest about which is which** — see [DATA.md](DATA.md).

---

## 🌍 What EcoPower 3.0 Is

EcoPower runs the **commercial layer on top of the meter**. A customer subscribes to a plan; EcoPower installs and owns the panels, files the paperwork with the DISCOM, meters the output, and bills the service — monthly, prepaid, or pay-as-you-go — from the actual register reads.

```
        Smart Meter → NIC → HES → MDM → EcoPower
                                    ↑
                          HESAdapter interface
             SimulatedHESAdapter │ TrilliantUnitySuiteAdapter (stub)
```

It is **one Next.js web app** with seven role-gated panels. Authorization is **Postgres Row-Level Security over JWT scope claims** — not a UI check. A DISCOM officer querying another division does not get an empty list; the rows do not exist for them.

---

## ✅ How It Answers PS1

| PS1 Key Requirement | How EcoPower 3.0 delivers it |
|---|---|
| **Web & mobile app, simple UI/UX** | Next.js 15 web app, 47 pages across 7 panels, validated colour system, five states for every data component. Installable **PWA** as a mobile channel, plus a real **Expo/React Native app** (`apps/mobile`) — one binary, persona-routed by JWT role claim, live meter tile, offline-safe field-technician mutation queue. |
| **Subscription management — tiered, monthly / annual / pay-as-you-go** | `plans` catalog — **Solar Basic** (₹999/mo), **Solar + Backup** (₹2,499/mo, 98% availability guarantee), **Solar + Comfort** (₹3,999/mo). `billing_cycle` supports monthly / annual; a real zero-base-fee **PAYG** plan exists. Full lifecycle: subscribe → pause → resume → upgrade → cancel, with a `subscription_events` audit chain. |
| **IoT / smart-meter integration for real-time consumption** | An **AMI simulator** publishes DLMS-shaped, OBIS-keyed, HMAC-signed payloads over **MQTT (EMQX)** from a physical solar + load model driven by live weather. An **ingest worker** verifies signatures, checks register monotonicity, handles rollover, and batch-`COPY`s into partitioned Postgres. Supabase **Realtime** pushes to the live dashboard with an honest connected / reconnecting / polling indicator. |
| **Billing & payment gateway (UPI / cards / net-banking / wallets)** | A **pure tariff engine** (bigint paise, telescopic slabs, ToU, net-metering, duty) seeded with the **real Torrent Power Ahmedabad GERC order**. **Razorpay** Orders + Checkout + signed-webhook verification (test mode) covers UPI / card / net-banking / wallet. Every invoice line is provable — see below. |
| **Alerts & notifications (outages, service status, savings)** | `notifications` + `notification_deliveries` primitive with an in-app bell. Real triggers on invoice issued, payment captured, subscription events, and a `pg_cron` outage scan against meter staleness. |
| **Scalable architecture for millions of users & devices** | Time-series `meter_readings` **partitioned monthly by range**; **denormalized scope keys** so RLS policies contain no joins; every policy written as an InitPlan `(select fn())` so it evaluates once, not per row. Ingest is horizontally partitionable by NIC via MQTT shared subscriptions. |
| **Future-ready for DISCOM workflows** | A full **DISCOM panel**: net-metering approval **state machine** (submitted → approved / rejected, division-scoped, consumer notified), DT-level **AT&C loss** accounting + theft / loss localization drill-down, prepaid disconnection oversight (two-person rule), append-only **audit ledger**, P2P market oversight, division load curve. |
| **Service / support module** | A **Support panel**: ticket queue, **Consumer 360** lookup (bill + meter history attached to every ticket), knowledge base + canned responses. Faults raise their own tickets. |

---

## 📊 Success Metrics

| PS1 Metric | Status |
|---|---|
| **Subscribe in < 5 minutes** | Onboarding flow: quote from address + bills → plan recommender (deterministic, provably optimal) → subscribe → UPI mandate → active. A sub-5-minute E2E test is tracked ([#42](../../issues/42)). |
| **Transparency — accurate real-time consumption & billing** | Live meter tile on the consumer dashboard; **every invoice line expands to the two register reads that bracket it** (see below). |
| **Reliability — uptime ≥ 99%** | `/api/health` endpoint; continuous external uptime monitoring is being wired ([#56](../../issues/56)). |
| **Scalability** | See the architecture requirement above; a k6 load test + honest extrapolation to 20M meters is planned ([#57](../../issues/57)). |
| **Impact — savings & carbon** | Savings surfaced on the consumer dashboard; a dedicated **Carbon** page; the guarantee engine credits measured shortfalls. |

---

## 💡 What Makes It Different

**Billing is provable.** Every invoice line carries the two cumulative register reads that bracket it. Click a line and it expands:

> `1,247.300 kWh @ 2026-08-01 05:30:12` → `1,589.700 kWh @ 2026-09-01 05:30:07` = **342.400 kWh**
> telescopic on GERC RGP-Urban FY26 — 50 @ ₹3.20 · 150 @ ₹3.95 · 142.400 @ ₹5.00 = **₹1,464.50**

The tariff seed is read from the actual Torrent Power Ahmedabad GERC order via `pdftotext` on the primary document — 3 slabs, phase-based fixed charge, real FPPPA.

**Telemetry is real, not a `setInterval`.** DLMS/OBIS payloads, per-device HMAC, register monotonicity, rollover handling, batch `COPY` into partitioned Postgres, RLS-gated Realtime broadcast.

**Authorization is the database's job.** Every policy is Postgres RLS over JWT scope claims injected by a custom access-token hook. Proven by a **pgTAP suite — 255 assertions across 37 files** — run in CI against a fresh `supabase db reset`.

**Correctness is tested.** Golden-file billing tests + property tests (line-sum conservation, net-metering offset conservation, monotonic slab boundaries, half-up rounding) in `packages/shared`.

**The numbers are honest.** Synthetic series, real cited parameters ([DATA.md](DATA.md)). Nothing renders a trend badge without a real comparison basis ([DESIGN.md](DESIGN.md) P1).

---

## 🧑‍💻 The Seven Panels

| Panel | Who | What they do |
|---|---|---|
| **Consumer** | homeowner | live energy · provable bills · plan / prepaid balance · analytics · notifications · carbon · P2P trade · EV · meter self-read (OCR-assist) · English / Hindi / Gujarati |
| **Housing Society** | RWA committee | shared rooftop · per-unit consumption breakdown · editable allocation · common-area cost split + notice board |
| **DISCOM** | utility officer | DT-level AT&C loss map + theft localization · net-metering approval queue · prepaid disconnection oversight · outage console · audit ledger · P2P market oversight · division load curve |
| **Operator** | RESCO / EaaS provider | asset fleet · device health · performance-guarantee exposure · fleet generation curve · ESG report |
| **Field Technician** | installer, mobile-first | work-order queue · meter self-read review · site inspections |
| **Support agent** | contact centre | Consumer 360 lookup · ticket queue · knowledge base + canned responses |
| **Platform admin** | superadmin | cross-tenant tenants / users / consumers / billing / analytics / tickets |

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Web** | Next.js 15 App Router · React 19 · Tailwind 3 | SSR, route-group per panel, → **Vercel** (region `bom1`) |
| **Mobile** | Expo + expo-router · NativeWind | One binary, two personas (consumer, field technician); same JWT/RLS boundary as web, no bespoke session logic |
| **Data** | **Supabase** — Postgres 15 · RLS · Auth · Realtime | 54 migrations, RLS + FORCE on every table |
| **Telemetry** | **EMQX** (MQTT) · AMI simulator · ingest worker | DLMS/OBIS, per-device HMAC, → **Railway** |
| **Billing** | `packages/shared` — zero-dependency pure TypeScript | tariff + guarantee engine, byte-identical across web & worker |
| **Payments** | **Razorpay** — Orders · Checkout · signed webhooks | UPI / card / net-banking / wallet (test mode) |
| **AI** | **Google Gemini** — server-side | energy advisor + "why is my bill high" explainer, grounded in real account data |
| **Validation** | **Zod** | DLMS payload schemas, API bodies |
| **Auth** | Supabase Auth — JWT (ES256), custom access-token hook | scope claims (`roles`, `org_ids`, `division_ids`) drive RLS |
| **Monorepo** | Turborepo + pnpm | one tariff engine, shared everywhere — a duplicated one is the bug class that kills the correctness claim |

---

## 🏗 Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                    Browser  ·  Next.js 15 (Vercel)             │
│  (consumer) (society) (discom) (operator) (field) (support)    │
│                        (admin) · PWA                           │
│         middleware = coarse role gate (404, not the gate)      │
└───────────────┬───────────────────────────────┬───────────────┘
                │ @supabase/ssr (anon key + cookie)              │ Razorpay
                ▼                                                ▼  Checkout
┌───────────────────────────────────────────────┐    ┌────────────────────┐
│              Supabase  ·  Postgres 15          │    │  Razorpay (test)   │
│  ┌─────────────────────────────────────────┐  │    │  Orders · webhook  │
│  │ Row-Level Security  (the real gate)     │  │    └─────────┬──────────┘
│  │  scope keys · InitPlan policies · pgTAP │  │              │ signed
│  ├─────────────────────────────────────────┤  │◄─────────────┘ webhook
│  │ meter_readings  → monthly RANGE parts   │  │
│  │ invoices / invoice_lines  → provenance  │  │
│  │ subscriptions · prepaid · notifications │  │
│  │ nm_applications · audit_log · tickets   │  │
│  │ pg_cron  → outage scan, prepaid debit   │  │
│  └─────────────────────────────────────────┘  │
│         Realtime  → meter_live_state           │
└───────────────▲───────────────────────────────┘
                │ service_role (COPY, upsert, broadcast)
┌───────────────┴───────────────────────────────┐
│  apps/web/workers/ingest  (Railway)           │   verify HMAC · monotonicity
│  MQTT subscriber → batch COPY                 │   · rollover · quarantine
└───────────────▲───────────────────────────────┘
                │ ecopower/v1/{serial}/readings  (DLMS/OBIS, HMAC)
┌───────────────┴───────────────────────────────┐
│  EMQX broker (Railway) ◄── apps/web/workers/  │   solar-position + Haurwitz
│  per-device auth · topic ACL         simulator│   clear-sky + stochastic load
└───────────────────────────────────────────────┘
```

Both workers live inside `apps/web` (one codebase, one `package.json`) but run as
long-lived Node processes on Railway, not as Next.js routes — an MQTT
subscriber needs a persistent connection, which a serverless request/response
function can't hold.

`apps/mobile` (not pictured above) talks to the same Supabase project directly
with the anon key via `@supabase/supabase-js` — the same RLS policies gate it,
and there is no bespoke mobile authorization path to get wrong. The one
platform-specific piece is session storage: `expo-secure-store` (Keychain /
Keystore) instead of the browser's httpOnly cookie.

---

## 📦 What's Actually Built

| Path | State |
|---|---|
| `apps/web` | **Real, deployed.** Next.js 15, 47 pages across 7 panels. ~90% of the codebase. |
| `apps/web/workers/simulator` | **Real.** Physically-modelled AMI readings over MQTT. Runs as a persistent Node process (Railway), not a route — MQTT needs an open connection. |
| `apps/web/workers/ingest` | **Real.** MQTT → HMAC + monotonicity validation → partitioned Postgres. Same reason, same deployment. |
| `packages/shared` | **Real.** Zero-dependency TS — tariff engine, guarantee engine, OBIS / HESAdapter, design tokens + palette validator. |
| `supabase/` | **Real.** 54 migrations, RLS + FORCE on every table, 37 pgTAP test files in CI. |
| `apps/mobile` | **Real, not yet device-tested.** Expo + expo-router + NativeWind: auth + persona routing, a live-data tile with `AppState`-aware Realtime, an offline outbox for field-technician mutations, and meter QR/barcode scan. Verified via `tsc`, lint, and a real Metro bundle export in CI — **never booted on a physical device or simulator**, since none was available while it was built. Nameplate OCR, meter-reading OCR, the full commissioning flow, and an EAS-distributed build are not built yet — see [open mobile issues](../../issues?q=is%3Aissue+is%3Aopen+label%3Aarea%3Amobile). |
| `services/ml` | **Empty.** No forecasting / anomaly service. Bill / meter OCR runs client-side via `tesseract.js`. |
| `services/worker` | **Empty.** Scheduled work is `pg_cron`, not BullMQ. |

Payments run in Razorpay **test mode**. AI features run against Google Gemini.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 22 · pnpm 11 · Docker (for local Supabase) · Supabase CLI

### 1. Install

```bash
git clone https://github.com/neevmodh/EcoPower3.0.git
cd EcoPower3.0
pnpm install
```

### 2. Local Supabase + schema

```bash
supabase start
supabase db reset          # applies all 54 migrations
```

### 3. Seed demo data

```bash
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`>

node scripts/seed_demo_users.mjs
apps/web/node_modules/.bin/tsx scripts/seed_discom_fleet.mjs
apps/web/node_modules/.bin/tsx scripts/seed_society_units.mjs
```

### 4. Run the web app

```bash
cd apps/web && pnpm dev            # http://localhost:3000
```

### 5. (Optional) Run the telemetry pipeline

Both workers live inside `apps/web` — run them from there, each in its own terminal:

```bash
# terminal A — ingest worker
cd apps/web && pnpm worker:ingest
# terminal B — AMI simulator
cd apps/web && pnpm worker:simulator
```

### 6. (Optional) Run the mobile app

```bash
cd apps/mobile
cp .env .env.local          # already gitignored — edit the URL for your target device
pnpm start                  # scan the QR with Expo Go, or press `a` / `i` for an emulator
```

`127.0.0.1` in `.env` only resolves from the machine running `supabase start` — the Android emulator needs `10.0.2.2`, a physical device needs your machine's LAN IP. See `apps/mobile/README.md` for the full setup and what's built vs. not.

---

## 🔑 Demo Credentials

`http://localhost:3000/login` has one-click buttons for every role — no password typing. If you need it directly, the password for all demo accounts is **`EcoPower!2026`**.

| Role | Email | Scope |
|---|---|---|
| Consumer | `consumer@ecopower.demo` | one connection, own register reads |
| Society admin | `society@ecopower.demo` | Sunrise Residency — 6 units on one society meter |
| DISCOM officer | `discom@ecopower.demo` | Division A only — Division B rows do not exist |
| Operator (RESCO) | `operator@ecopower.demo` | RESCO-owned assets, scoped by ownership |
| Field technician | `field@ecopower.demo` | work orders assigned to you or unclaimed |
| Support agent | `support@ecopower.demo` | every open ticket, billing read-only |
| Platform admin | `admin@ecopower.demo` | full cross-tenant — the one session RLS does not confine |

> Every `supabase db reset` regenerates user UUIDs — sign out and use the demo buttons again after a reset.

The same accounts work in the mobile app's login screen — it's the same Supabase project, same JWT, same RLS. `field@ecopower.demo` lands on the field-technician persona; anything else lands on consumer.

---

## 📁 Project Structure

```
EcoPower3.0/
├── apps/web/            Next.js 15 — route group per panel
│   ├── app/(consumer|society|discom|operator|field|support|admin)/
│   ├── app/api/         Razorpay, AI, health, workflow RPCs
│   ├── lib/             auth (JWT claims → scope), supabase clients, i18n
│   └── workers/         ingest (MQTT→Postgres) + simulator — long-lived
│                        Node processes deployed separately (Railway), not
│                        Next.js routes; one codebase, one package.json
├── packages/shared/     tariff + guarantee engine · OBIS · HESAdapter · tokens
│   └── src/billing/     bigint-paise pure functions, golden + property tests
├── apps/mobile/         Expo + expo-router — auth, live tile, offline outbox, QR scan
│   ├── app/(consumer|field)/
│   └── lib/outbox/      SQLite-backed queue, retry/backoff, conflict surfacing
├── supabase/
│   ├── migrations/      0001 … 0054
│   └── tests/rls/       37 pgTAP files, 255 assertions
├── scripts/             demo seed · palette validation · client-bundle secret scan
└── services/ml · services/worker · tools/loadtest   (scaffolded)
```

---

## 🧪 Testing & CI

| Suite | Count |
|---|---|
| `packages/shared` (tariff, guarantee, OBIS, HESAdapter, tokens) | 151 tests |
| `apps/web/workers` (HMAC, monotonicity, batcher, meter tick, publisher) | 27 tests |
| pgTAP RLS suite (`supabase test db`) | 255 assertions / 37 files |
| `apps/mobile` | `tsc --noEmit` + Biome + a real `expo export` bundle in CI — no device/simulator test yet |

**CI** (`.github/workflows/ci.yml`) runs on every push: palette validation → Biome lint → build → **client-bundle secret scan** (fails if a server secret reaches the browser) → tests → fresh `supabase db reset` → pgTAP. `apps/mobile` is typechecked and bundled in the same run but is not part of the deployed web app's pipeline.

```bash
pnpm test                 # all workspace unit tests
supabase test db          # pgTAP RLS suite
pnpm --dir apps/web exec tsc --noEmit   # typecheck (web)
pnpm --dir apps/mobile exec tsc --noEmit   # typecheck (mobile)
```

---

## 📐 Standards & Regulatory Grounding

- **DLMS/COSEM**, **IS 15959 Part 2 : 2016** — OBIS codes, block-load / billing / instantaneous / event profiles
- **GERC** Multi-Year Tariff Regulations 2024 · Torrent Power Ahmedabad RGP slabs · FPPPA · electricity duty
- **CEA / GERC** net-metering approval workflow
- **RDSS** — prepaid metering, AT&C loss reduction, DT-level energy accounting
- **PM Surya Ghar Muft Bijli Yojana** — subsidy structure (referenced; full workflow tracked as [#31](../../issues/31))
- **NPCI** — UPI Autopay intent / QR mandate ([#40](../../issues/40))

---

## 🧭 Where It's Going

The next milestone (`sandbox-v1`, epic [#102](../../issues/102)) opens EcoPower to **public signup**: Google + email/password auth, and every new user gets an **isolated synthetic tenant** — their own division, connections, society and RESCO — provisioned automatically, explorable across all seven panels. The provisioning trigger and its cross-tenant isolation pgTAP suite are built and CI-verified; the free-tier keep-alive/prune jobs and the auth UI itself are the remaining pieces. Telemetry for the sandbox is generated in-database by `pg_cron`, so it runs entirely on free infrastructure. The real AMI path (simulator + EMQX + ingest, via `HESAdapter`) remains for utility pilots.

On mobile, the next steps need something this repo's CI can't provide — a physical device or simulator, and real meter photographs to build the nameplate/meter-reading OCR against honestly rather than guessing at accuracy no one can check.

Open work is tracked in [ROADMAP.md](ROADMAP.md) — the tracker table matches GitHub issue numbers.

---

## 📚 Documentation

| File | What's in it |
|---|---|
| **[HANDOFF.md](HANDOFF.md)** | Start here — what works, how to run it, the architecture rules code review enforces |
| **[ROADMAP.md](ROADMAP.md)** | The issue tracker — every row is a GitHub issue |
| **[WORKLOG.md](WORKLOG.md)** | Chronological record of every session, bug, and verification step |
| **[DESIGN.md](DESIGN.md)** | Design system — validated palette, chart specs, component states, accessibility |
| **[DATA.md](DATA.md)** | Data strategy — what's real, what's synthetic, every source cited |
| **[DEMO-RUNBOOK.md](DEMO-RUNBOOK.md)** | The jury walk-through |

---

## 🔙 Predecessor

[EcoPower 2.0](https://github.com/neevmodh/EcoPower2.0) reached this final. 3.0 is a **greenfield rewrite**, not an iteration — 2.0 had no real authorization (`?role=admin` was the entire admin check), `Math.random()` billing, a CSS-animated "LIVE" dot that never contacted the server, and a live LLM key shipped to the browser. The reasons are documented candidly in [ROADMAP.md §2](ROADMAP.md) and [EcoPower-2.0-vs-3.0.md](EcoPower-2.0-vs-3.0.md).

## 📄 License

MIT
