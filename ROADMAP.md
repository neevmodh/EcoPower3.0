# EcoPower 3.0 — Build Plan & Tracker

**Competition:** INSTINCT 4.0 — IntelliSmart Infra + The Energy Society, IIT Delhi · **Live target:** Vercel

Every row in the tracker below is a GitHub issue in this repo. Update the Status column as you go — this table is the single record.

**[BUILD-ORDER.md](BUILD-ORDER.md)** is the sequence to solve these in — start there. Visual design is governed by **[DESIGN.md](DESIGN.md)**. Where every number comes from is governed by **[DATA.md](DATA.md)**. Read both before building.

---

## 1. Tracker

Status key: `☐` todo · `◐` in progress · `☑` done · `⊘` cut

| # | Issue | M | Area | Pri | PS | Status | Blocked by |
|---|---|---|---|---|---|---|---|
| 1 | Scaffold monorepo (Turborepo + pnpm) | M0 | infra | critical | — | ☑ | — |
| 2 | Supabase project + migration 0001 core schema | M0 | db | critical | — | ☑ | [#63](../../issues/63) |
| 3 | Denormalized scope keys + maintenance triggers | M0 | db | critical | — | ☑ | 2 |
| 4 | Custom access token hook — scope in the JWT | M0 | db | critical | — | ☑ | 2 |
| 5 | RLS policies for all five roles | M0 | db | critical | — | ☑ | 3, 4 |
| 6 | Writes via SECURITY DEFINER RPCs | M0 | db | critical | — | ☐ | 5 |
| 7 | pgTAP RLS test suite | M0 | test | critical | — | ☐ | 5 |
| 8 | Next.js shell + five panels + Vercel deploy | M0 | web | critical | — | ☑ | 1, 4 |
| 9 | CI: fail build if secrets reach client bundle | M0 | security | high | — | ☐ | 8 |
| 10 | OBIS constants + IS 15959 Pt2 payload schema | M1 | ingest | high | 1 | ☐ | 1 |
| 11 | HESAdapter interface + Trilliant stub | M1 | ingest | high | 1 | ☐ | 10 |
| 12 | AMI simulator with a physical model | M1 | ingest | critical | 1 | ☐ | 10 |
| 13 | Simulator scenario control API | M1 | demo | critical | — | ☐ | 12 |
| 14 | MQTT broker on Railway | M1 | infra | critical | — | ☐ | [#62](../../issues/62) |
| 15 | Ingest worker (HMAC, monotonicity, batch COPY) | M1 | ingest | critical | 1 | ☐ | 14, 16 |
| 16 | Partitioned time-series schema | M1 | db | critical | — | ☐ | 3 |
| 17 | Continuous aggregates + pg_cron jobs | M1 | db | high | — | ☐ | 16 |
| 18 | Live consumer dashboard on Realtime | M1 | web | high | 2 | ☐ | 15, 8 |
| 19 | Pure tariff engine | M2 | billing | critical | 1 | ☐ | 1 |
| 20 | Real GERC / Torrent tariff seed | M2 | billing | high | 1 | ☐ | 19 |
| 21 | Invoice schema with provenance | M2 | billing | critical | 1 | ☐ | 16, 19 |
| 22 | Prepaid as a first-class commercial model | M2 | billing | high | 1 | ☐ | 19 |
| 23 | VEE pipeline | M2 | billing | normal | 1 | ☐ | 16 |
| 24 | Golden-file billing tests | M2 | test | critical | — | ☐ | 19, 20 |
| 25 | Property tests — 12 properties | M2 | test | high | — | ☐ | 21, 7 |
| 26 | DT energy accounting + AT&C loss map | M3 | discom | critical | 1 | ☐ | 17 |
| 27 | Theft / loss localization model | M3 | ml | critical | 3 | ☐ | 26 |
| 28 | Net-metering application state machine | M3 | discom | high | 1 | ☐ | 5 |
| 29 | SLA clocks per CEA/GERC norms | M3 | discom | normal | 1 | ☐ | 28 |
| 30 | DT feasibility check | M3 | discom | normal | 1 | ☐ | 28 |
| 31 | PM Surya Ghar subsidy workflow | M3 | discom | normal | 1 | ☐ | 28 |
| 32 | Prepaid oversight + disconnect queue (two-person) | M3 | security | high | 1 | ☐ | 22 |
| 33 | Demand response | M3 | discom | high | 1 | ☐ | 26 |
| 34 | Append-only audit ledger + UI | M3 | security | normal | — | ☐ | 5 |
| 35 | Bill OCR service | M4 | ml | critical | 1 | ☐ | [#65](../../issues/65) |
| 36 | OCR confirmation UI (never auto-commit) | M4 | web | high | 1 | ☐ | 35 |
| 37 | OCR eval set + measured accuracy | M4 | test | high | 4 | ☐ | 35 |
| 38 | Deterministic plan recommender | M4 | billing | high | 1 | ☐ | 20, 35 |
| 39 | Razorpay Orders + Checkout + webhook verify | M4 | payments | critical | 1 | ☐ | [#64](../../issues/64) |
| 40 | UPI Autopay mandate (intent/QR flow) | M4 | payments | normal | 1 | ☐ | 39 |
| 41 | Settlement reconciliation screen | M4 | payments | normal | — | ☐ | 39 |
| 42 | Sub-5-minute onboarding E2E test | M4 | test | high | 1 | ☐ | 36, 39 |
| 43 | Expo skeleton — one binary, two personas | M5 | mobile | critical | 2 | ☐ | 1, 4 |
| 44 | Mobile Realtime with AppState handling | M5 | mobile | high | 2 | ☐ | 43, 18 |
| 45 | Offline outbox | M5 | mobile | critical | 5 | ☐ | 43 |
| 46 | Meter QR scan + nameplate OCR | M5 | mobile | high | 4, 5 | ☐ | 43 |
| 47 | Meter reading OCR from field photographs | M5 | ml | critical | 4 | ☐ | 35 |
| 48 | Commissioning flow with fraud controls | M5 | mobile | high | 5 | ☐ | 45, 46 |
| 49 | EAS build → APK distribution | M5 | infra | critical | 2 | ☐ | 43 |
| 50 | Society schema + allocation engine | M6 | billing | high | 1 | ☐ | 19 |
| 51 | Allocation conservation property | M6 | test | high | — | ☐ | 50 |
| 52 | Society panel UI | M6 | web | normal | 1 | ☐ | 50 |
| 53 | Forecasting service | M6 | ml | normal | — | ☐ | 17 |
| 54 | Asset anomaly detection | M6 | ml | high | 3 | ☐ | 27 |
| 55 | LLM copilot — one day, hard budget | M6 | ml | low | — | ☐ | 6 |
| 56 | Uptime monitoring from day one | M7 | infra | high | — | ☐ | 8 |
| 57 | k6 load test + honest extrapolation | M7 | test | high | — | ☐ | 15, 58 |
| 58 | Seed 10M+ readings | M7 | db | normal | — | ☐ | 16 |
| 59 | Plant findable defects in demo seed | M7 | demo | critical | — | ☐ | 58, 27 |
| 60 | SPOF diagram + architecture slide | M7 | docs | normal | — | ☐ | — |
| 61 | Demo runbook + fallback video | M7 | demo | critical | — | ☐ | 59, 49 |
| 67 | Design tokens + validated colour system | M0 | design | high | — | ☑ | 1 |
| 68 | Stat tile — no badge without a basis | M0 | design | critical | — | ☑ | 67 |
| 69 | Five states for every data component | M0 | design | critical | — | ☑ | 67 |
| 70 | Single honest ConnectionState indicator | M1 | design | high | — | ☐ | 18 |
| 71 | No-data drill (regression for 2.0's failure) | M7 | design | critical | — | ☐ | 68, 69 |
| 72 | Ingest Tier-1 real datasets (NSRDB, PVGIS, Open-Meteo, OSM) | M1 | data | high | — | ☐ | 1 |
| 73 | Encode real GERC tariffs, IS 1180 / IS 15959, PM Surya Ghar | M2 | data | high | 1 | ☐ | 20 |
| 74 | Calibrate synthetic population to published AT&C losses | M3 | data | critical | — | ☐ | 72, 12 |
| 75 | Data provenance table + visible synthetic-data disclosure | M7 | data | high | — | ☐ | 74 |
| 76 | Performance & uptime guarantee engine (meter-verified) | M2 | commercial | critical | 1 | ☐ | 19, 21 |
| 77 | Multi-service catalog — solar, backup, cooling, lighting | M2 | commercial | high | 1 | ☐ | 19 |
| 78 | Subscription lifecycle: transfer, pause, upgrade, buyout | M6 | commercial | high | 1 | ☐ | 19, 25 |
| 79 | Deposit-free onboarding via bill-history credit assessment | M4 | commercial | high | 1 | ☐ | 35, 38 |
| 80 | Carbon as a settled asset — I-REC certificates with provenance | M6 | commercial | normal | 1 | ☐ | 21, 50 |
| 81 | Multi-channel: WhatsApp, SMS, IVR (DLT-compliant) | M6 | consumer | high | 1,2 | ☐ | 34 |
| 82 | Verified communication — anti-scam message checker | M6 | consumer | high | 1 | ☐ | 81 |
| 83 | Real i18n — English, Hindi, Gujarati + low-literacy | M4 | consumer | high | 1,2 | ☐ | 8 |
| 84 | "Why is my bill high?" — deterministic bill explainer | M2 | consumer | high | 1 | ☐ | 21 |
| 85 | Unit economics + 90-day pilot proposal (docs) | M7 | docs | high | — | ☐ | — |

### Blockers — do these first (issues #62–#66)

| ID | Blocker | Blocks | Owner |
|---|---|---|---|
| [#62](../../issues/62) | `railway login` — MCP returns Unauthorized | 14, 15, 53 | you |
| [#63](../../issues/63) | Supabase project + keys. **Upgrade to Pro** — free tier pauses after 7 idle days and caps the Realtime quota #18 needs (~₹2k against a ₹16L prize) | 2 → everything | you |
| [#64](../../issues/64) | Razorpay test account (free, no company docs) | 39 | you |
| [#65](../../issues/65) | Vision API key for OCR | 35, 47 | you |
| [#66](../../issues/66) | Confirm final-round timeline — public page still shows Demo Day 29 Apr 2026, registration closed | M6–M7 scope | you |

### Milestones

| M | Name | Issues | Demoable outcome |
|---|---|---|---|
| M0 | Foundations & security baseline | 1–9, 67–69 | 5 logins → 5 shells; RLS tests prove cross-tenant reads return 0 rows |
| M1 | AMI spine (real telemetry) | 10–18, 70, 72 | Trigger a fault in a terminal, dashboard reacts in <1s |
| M2 | Billing engine | 19–25, 73, 76, 77, 84 | Invoice where every line traces to two meter register reads |
| M3 | DISCOM panel | 26–34, 74 | Officer finds theft on a DT, raises a work order |
| M4 | Onboarding, OCR, payments | 35–42, 79, 83 | Bill photo → active subscription in under 5 minutes |
| M5 | Mobile + field technician | 43–49 | Commission a meter on a phone in airplane mode |
| M6 | Society, ML, copilot | 50–55, 78, 80, 81, 82 | Allocation conservation check; predicted fault |
| M7 | Hardening & demo proof | 56–61, 71, 75, 85 | Real uptime number, k6 results, rehearsed 7-min demo |

### Labels

`M0`…`M7` · `blocker` · `area:db` `area:web` `area:mobile` `area:ingest` `area:ml` `area:billing` `area:discom` `area:payments` `area:infra` `area:demo` `area:security` `area:test` `area:docs` · `area:design` `area:data` `area:commercial` `area:consumer` · `priority:critical` `priority:high` `priority:normal` `priority:low` · `ps:1`…`ps:5`

---

## 1b. Ship order — read this before starting

**85 issues will not all ship. That is fine, and it is planned for.** The tiers below exist so that when you fall behind — you will — you cut from the bottom without deliberating.

### Tier A — the demo does not exist without these (35)

```
Foundation   1  2  3  4  5  8
AMI spine   10 11 12 13 14 15 16 17 18
Billing     19 20 21
DISCOM      26 27
Onboarding  35 36 38 39
Mobile      43 45 47 49
Design      67 68 69
Proof       58 59 61
Guarantee   76
```

**Tier A is dependency-closed** — no Tier A issue depends on anything outside Tier A. Verified, not assumed. `#17` (aggregates) and `#58` (10M-row seed) were pulled up because `#26` and `#59` cannot run without them, and `#67` (design tokens) because `#68` and `#69` cannot.

**Tier A spans all eight milestones.** You cannot finish the demo by working M0→M3 in order. Work milestone by milestone, but inside each milestone do the Tier A items first and leave the rest.

**Tier A alone is a winning pitch.** It delivers every beat of the 7-minute demo: bill photo → subscription in under 5 minutes, a technician commissioning offline, live telemetry with a fault injected on stage, the DISCOM finding theft on a DT, an invoice line tracing to two register reads, and a guarantee settling from meter data. Everything below is upside.

### Tier B — ship if on track (26)

`7 9 22 24 25 28 32 33 34 37 42 44 46 48 50 51 56 57 70 71 72 73 74 83 84 85`

Three of these punch above their tier and should be pulled up if you can:
- **#33 demand response** — SR Narasimhan ran Grid Controller of India; load management is his domain and he will look for it
- **#71 no-data drill** — the regression test for 2.0's exact public failure
- **#85 unit economics + pilot** — no code, and it answers the "what happens Monday?" question that decides commercialization offers

### Tier C — cut first, without guilt (19)

`6 23 29 30 31 40 41 52 53 54 55 60 75 77 78 79 80 81 82`

Good ideas, none demo-critical. **#55 (LLM copilot) is the first to go** — every team will have a chatbot and none of these six judges will be moved by one.

### The rule
If Tier A is not done, do not start Tier B. A finished Tier A beats a half-built Tier C every time, and a broken demo beats nothing at all only in the sense that both score zero.

---

## 2. Why this project, framed for this jury

EcoPower 2.0 (`eco-power2-0.vercel.app`) reached the final. It cannot go to Demo Day as-is. Verified from the tree:

- **No authentication and no authorization exist.** `?role=admin` in the query string is the entire admin check on 6 endpoints. `POST /api/users/register` accepts an arbitrary `role`, so anyone can self-register as admin. `jsonwebtoken` is a dependency that is never imported.
- **Four enterprise pages already exploit this**, sending `?role=admin` to read every customer on the platform.
- **Billing is not derived from meter data**: `invoices.js` sets `energy_used_kwh = Math.random() * plan.max_kwh`.
- **Nothing is real-time.** The "live meter" is `setInterval` + `Math.random()` that never contacts the server. The pulsing LIVE dot is a CSS animation.
- **Razorpay was never wired** — `RazorpayPayment.js` calls two endpoints that don't exist and is imported by nothing.
- `NEXT_PUBLIC_GROQ_API_KEY` ships a live LLM key in the browser, with a fallback that bypasses every prompt-injection guard.
- ~18,900 of ~30,000 LOC is dead.

### Who is judging

Anil Rawal (MD & CEO, IntelliSmart — 20M+ smart prepaid meters under RDSS, HES on Trilliant UnitySuite), Sanjay Banga (MD & CEO, Tata Power), Robert Denda (CEO, Gridspertise), SR Narasimhan (former CMD, Grid Controller of India), Atul Bali (ED, Powergrid), Swetha Ravi Kumar (ED, FSR Global — regulatory economics).

- Generic SaaS dashboards score near zero. Metering-standard depth, DISCOM regulatory workflow, and provably correct billing are what score.
- **Narasimhan (grid operations) means demand response gets real scrutiny** — #33 cannot be a token feature.
- **Ravi Kumar (FSR Global) means tariff design and consumer protection matter** — cite real GERC orders in #20.
- **Denda and Rawal will know instantly** whether the AMI layer is real or cosmetic.

### Five problem statements, one build

| PS | Covered by |
|---|---|
| 1. Energy as a Service | the platform |
| 2. Smart Metering Super App for consumers | Expo consumer app (#43, #18) |
| 3. Predictive Maintenance of Meters | anomaly detection (#54, #27) |
| 4. Meter reading via OCR from field photographs | #47, #46, #37 |
| 5. Real-time asset tracking | #45, #48, asset registry |

Lead the pitch with PS 1, close with this table. It reframes scope as coherence rather than sprawl.

---

## 3. Architecture

```
Smart Meter → NIC → HES → MDM → EcoPower
                              ↑
                    HESAdapter interface
             SimulatedHESAdapter | TrilliantUnitySuiteAdapter (stub)
```

| | Choice | Why |
|---|---|---|
| Database | **Supabase** (Postgres 15, RLS, Auth, Realtime, Storage, Edge Functions) | Postgres gives joins and window functions for billing; RLS makes 2.0's entire auth failure structurally impossible |
| Web | Next.js 15 App Router on **Vercel** | live URL required |
| Mobile | **Expo**, one binary, two personas | consumer + field technician by role claim |
| Persistent services | **Railway** — MQTT broker, simulator, ingest, ML, job worker | Vercel cannot host long-running or stateful processes |
| Repo | **Monorepo**, Turborepo + pnpm | the tariff engine and DB types must be byte-identical across web, mobile, and worker; a duplicated tariff engine is exactly the bug class that would destroy the correctness claim |
| DISCOM model | **Gujarat** — Torrent Power (Ahmedabad) + GUVNL's DGVCL/MGVCL/PGVCL/UGVCL, GERC tariffs | keeps 2.0's Ahmedabad grounding; real citable tariff orders |
| Money | `bigint` paise everywhere | never float |

```
EcoPower3.0/
├── apps/web/            Next.js 15 — route groups per panel
├── apps/mobile/         Expo — consumer + field technician
├── apps/simulator/      AMI simulator + scenario control API   → Railway
├── services/ingest/     MQTT subscriber → Postgres             → Railway
├── services/ml/         Python FastAPI                          → Railway
├── services/worker/     BullMQ — billing, PDF, notifications   → Railway
├── packages/shared/     zero-dependency pure TS
│   ├── src/billing/     tariff + invoice engine
│   ├── src/ami/         OBIS constants, zod schemas, HESAdapter
│   └── src/tokens.ts    design tokens
├── supabase/            migrations, RLS policies, edge fns, pgTAP tests
└── tools/loadtest/      k6
```

### Where secrets live

| Secret | Vercel | Supabase Fn | Railway | Expo client |
|---|---|---|---|---|
| supabase anon key | ✅ public | – | ✅ | ✅ public |
| supabase **service_role** | webhook route only | ✅ | ✅ | **never** |
| razorpay key_secret | ✅ | – | worker | **never** |
| razorpay webhook secret | ✅ | ✅ | – | **never** |
| LLM / vision API key | ✅ | – | ml svc | **never** |
| device HMAC keys | – | – | broker + ingest | **never** — per-device, provisioned at commissioning |

---

## 4. Issue detail

### M0 — Foundations & security baseline

**#1 Scaffold monorepo.** `apps/{web,mobile,simulator}`, `services/{ingest,ml,worker}`, `packages/shared`, `supabase/`, `tools/loadtest/`. pnpm workspaces; **`.npmrc` with `node-linker=hoisted` from this commit** (Metro and pnpm's symlinked `node_modules` fight otherwise; fixing it later is painful). Turborepo, TS strict, Vitest, Biome. `packages/shared` must be **zero-dependency and platform-agnostic** — pure TS, no React, no Supabase client, no Node built-ins. That's what makes it importable by Metro, Next.js, and Deno alike. *Done when:* `pnpm build` and `pnpm test` pass at root.

**#2 Migration 0001.** Identity: `profiles` (**no role column**), `orgs`, `discom_divisions` (circle > division > subdivision tree), `user_roles` (role + org + division scope, revocable). Topology: `substations`, `feeders`, `distribution_transformers`, `service_connections` (keyed on `consumer_number`, carrying `sanctioned_load_kw`, `tariff_category`, `connection_type`). Assets: `meters` (DISCOM-owned — serial, CT/PT ratio, meter constant, `device_secret_hash`, `key_version`) vs `assets` (EcoPower-owned PV/inverter/battery). **The DISCOM owns the meter, EcoPower owns the panels** — 2.0's `Device.js` conflated them, and the split is itself a domain signal.

**#3 Scope keys.** Every fact table carries `division_id`, `org_id`, `service_connection_id`, `dt_id` as real indexed columns, maintained by `BEFORE INSERT` triggers walking `dt → feeder → substation → division`. This exists so **RLS policies never contain a join** — the single decision that makes row-level security affordable at scale.

**#4 Access token hook.** On login inject `{ app_metadata: { roles, org_ids, division_ids } }` where `division_ids` is the **transitive closure** of the officer's subtree, computed once by a recursive CTE. A Circle head then sees every subdivision at zero extra RLS cost. Helpers `auth_roles()`, `auth_orgs()`, `auth_divisions()`, `has_role()` — all `stable`. JWT expiry 15 min; for revocation-sensitive operations (disconnects, NM approvals) re-check `user_roles` inside the RPC rather than trusting a stale claim.

**#5 RLS.** Every table `ENABLE ROW LEVEL SECURITY` with **no permissive policy by default**; `FORCE` on sensitive tables. **Always wrap helpers in a scalar subselect** so Postgres evaluates once as an InitPlan:
```sql
using ( division_id = any ((select auth_divisions())) )
```
Without `(select …)`, a 10M-row scan calls the function 10M times — the difference between a 40 ms and a 40 s query.
- *DISCOM officer* — `division_id = any((select auth_divisions()))`
- *Consumer* — own service connections only
- *Society admin* — units and aggregates in their org, but **not** per-unit invoice lines (structural: `society_allocations` admin-visible, `invoices` owner-only)
- *Field technician* — time-and-status-bounded: can read a connection **only while an assigned work order is open on it**
- *Data minimization* — no DISCOM policy on `payments` or `payment_mandates` at all; the DISCOM UI reads narrowed `security_invoker` views. Pitch line: **"the DISCOM sees your kWh, never your card."**

**#6 RPC writes.** `REVOKE INSERT, UPDATE, DELETE ON invoices, subscriptions, payments, disconnect_commands FROM anon, authenticated`. RLS guards reads; `SECURITY DEFINER` RPCs guard writes.

**#7 pgTAP suite.** `supabase/tests/rls/{consumer,society,discom_officer,technician,operator}.test.sql`. Each asserts positive access **and negative access** — officer of Division A gets **0 rows** from Division B. Runs in CI against a fresh `supabase db reset`. This is the demonstrable answer to 2.0's total authorization failure, and it's a slide.

**#8 Next.js shell.** Route groups `app/(consumer|society|discom|operator|field|marketing)`. Server Components read Supabase via `@supabase/ssr` with the **anon key + user session cookie** — RLS does the authorization. There is no `?role=` anywhere; the database refuses. `middleware.ts` does **coarse** gating only (a consumer hitting `/discom` gets 404, not an empty dashboard flash); the DB is the real gate. Real Tailwind + tokens in `packages/shared/src/tokens.ts` — 2.0 had Tailwind configured but **not installed** and used inline `style={{}}` everywhere. *Done when:* live Vercel URL on day one with five seeded logins.

**#9 Secret-leak CI.** Grep the built client bundle for `sk_`, `gsk_`, `rzp_`; fail on match. 2.0 shipped a live LLM key into the browser with a fallback that bypassed every guard. This makes that class of bug impossible, and it's a one-slide "we found this and fixed it."

### M1 — AMI spine

Build this **before any UI polish**. It's what separates the project from every other entry.

**#10 OBIS + IS 15959 Pt2.** `packages/shared/src/ami/obis.ts` — OBIS constants (`1.0.1.8.0.255` kWh import, `1.0.2.8.0.255` export, kVAh, kVArh lag/lead, `1.0.94.91.0.255` instantaneous) and zod schemas for billing profile, block load profile, instantaneous, events. Keep the DLMS **shape**, skip the DLMS **stack** — a real gurux TCP implementation is a week of work for zero incremental judge-visible value.

**#11 HESAdapter.** `interface HESAdapter { pushSubscribe, onDemandRead, ping, connect, disconnect, setLoadLimit, getBillingProfile, getBlockLoadProfile, getEvents }` with `SimulatedHESAdapter` and a typed `TrilliantUnitySuiteAdapter` stub. ~200 LOC that converts the project from "a solar app" into "an EaaS layer that plugs into your existing HES." **IntelliSmart's HES is Trilliant UnitySuite.** Highest leverage-per-line file in the repo.

**#12 Simulator.** Not `Math.random()`: PV from a clear-sky solar-position model for Ahmedabad × cloud factor from a real weather API × soiling ramp × temperature derate; household load from a stochastic appliance model; **cumulative registers that only ever increase**; DLMS-shaped OBIS-keyed payloads over MQTT.

**#13 Scenario API.** `POST /scenario/{theft,soiling,inverter-trip,tamper,outage}`. **The highest demo-value endpoint in the project** — cause a fault live on stage and watch it surface in the DISCOM panel 30 seconds later. Bind each to a keyboard shortcut.

**#14 MQTT broker.** EMQX on Railway + TCP proxy on a fixed port. Per-device username = meter serial, password = HMAC-derived token, ACL restricting each device to `ecopower/v1/{serial}/#`. No shared secret.

**#15 Ingest worker.** `services/ingest/src/index.ts` — verifies per-device HMAC + replay window + **register monotonicity**; handles rollover explicitly (`delta < 0`); computes deltas; batch-COPYs into `meter_readings` (500 rows or 200 ms, whichever first); UPSERTs `meter_live_state`; publishes Realtime Broadcast on `meter:{id}`; runs as `service_role`. Idempotent by PK + `ON CONFLICT DO NOTHING`. Readings with `reading_ts > now() + 5 min` go to `quarantine_readings` — **never silently dropped** — and the count surfaces in the operator panel. **This file is what makes "real-time" true rather than a CSS animation.**

**#16 Time-series schema.** `meter_readings` `PARTITION BY RANGE (reading_ts)`, monthly, PK `(meter_id, reading_ts)`. Stores **both** cumulative registers and computed deltas — real meters send registers, you bill on deltas, and storing both lets you detect rollover and **prove any invoice line by pointing at the two reads that bracket it**. Plus VEE provenance (`source`, `quality`, `tamper_flags` as an IS 15959 event bitmask) and the scope keys. `meter_live_state` — one row per meter, low cardinality, cheap RLS. `create_monthly_partition()` called by pg_cron a month ahead **also enables RLS and creates indexes on the new partition** — RLS does *not* propagate to partitions automatically, and this is the trap that would silently expose every reading.

**#17 Aggregates.** `mv_reading_{15min,hourly,daily}`, `mv_dt_energy_balance_daily`, `mv_division_atc_monthly`; refresh 5 min / hourly / nightly. Plus partition creation, retention drop, and a **meter-offline sweeper** (`status='offline'` where `last_seen_at < now() - 15 min`) — maintaining the property rather than asserting it. Note in the README that TimescaleDB continuous aggregates + compression are the production path; Supabase doesn't ship Timescale, so we implement the same semantics with declarative partitions + incremental MV refresh. Knowing what you'd do with a real budget scores.

**#18 Live dashboard.** **`meter_readings` must never enter the `supabase_realtime` publication** — CDC evaluates RLS per subscriber per change, and free tier is ~200 concurrent connections / 2M messages/month, so 1 Hz × 500 meters exhausts the month in about an hour. Instead: subscribe to `meter_live_state` filtered by `meter_id`; Broadcast for hero meters; throttle renders to 4 Hz; **fall back to a 5 s poll if the socket drops**, with an honest `connected / reconnecting / polling` indicator — the deliberate antithesis of 2.0's fake LIVE dot. *Demo:* two browsers + `mosquitto_sub`, trigger a scenario, number moves in under a second.

### M2 — Billing engine

**#19 Tariff engine.** `packages/shared/src/billing/` — zero-I/O pure functions: `slabEngine`, `touEngine`, `fixedCharge`, `netMeteringSettlement`, `bankingCarryForward`, `dutyAndTaxes`, `subscriptionCharge`, `paygCharge`, `prepaidDebit`, `composeInvoice`. **`bigint` paise everywhere.** Shared byte-identically by web, mobile, and worker — this is the reason for the monorepo.

**#20 Tariff seed.** `tariffs`, `tariff_slabs`, `tariff_tou_windows` with **real cited values** and the gazette URL in `source_document_url`; `effective_from` versioning. Gujarat specifics: residential exempt from banking charges; banking ~₹1.50/unit demand-based, ~₹1.10 MSME/non-demand; annual surplus at APPC (~₹3.85/kWh); FPPPA as a quarterly adjustment. Ravi Kumar (FSR Global) is on the jury — cite the orders.

**#21 Invoice provenance.** `invoices` carries `opening_reading_ts/kwh` and `closing_reading_ts/kwh`; `invoice_lines` carries `source_reading_start_id`, `source_reading_end_id`, `obis_ref`, `tariff_slab_id`. On screen:
> `1,247.300 kWh @ 2026-08-01 05:30:12` → `1,589.700 kWh @ 2026-09-01 05:30:07` = **342.400 kWh**
> telescopic on GERC RGP-Urban FY26 — 50 @ ₹3.05 · 50 @ ₹3.50 · 150 @ ₹4.15 · 92.400 @ ₹5.20 = **₹1,430.48**

That turns "provably correct billing" from a claim into a clickable UI element, and it's the direct answer to 2.0's `Math.random()`.

**#22 Prepaid.** `prepaid_accounts` + `prepaid_ledger`. Interval debit at tariff, low-balance alert, zero-balance → disconnect → reconnect on recharge. **IntelliSmart's 20M meters are prepaid, and prepaid *is* Energy-as-a-Service** — you pay for the service, not the asset. Treating it as a DISCOM sub-feature would be the single biggest omission in the project.

**#23 VEE.** Validation, Estimation, Editing — every MDM has it. Real meter data has gaps, register resets, negative deltas, clock drift. Gap detect → profile-based estimate → `quality='estimated'` → **invoice line labelled "estimated"**. Unglamorous, and it *protects* the correctness claim rather than undermining it.

**#24 Golden files.** ~20 committed scenarios: residential 3-slab, society common area, net-metering exporter with banking, prepaid, PAYG, annual APPC settlement. Any engine change altering a golden file must be an explicit reviewed diff.

**#25 Property tests.** Port the 10 correctness properties from 2.0's `.kiro/specs/.../design.md:1177–1287` (which specified 10 and implemented 3), plus two new:
- P1 uniqueness — as a database `EXCLUDE USING gist (service_connection_id WITH =, daterange(...) WITH &&) WHERE (status='active')`, tested under **concurrent** transactions. 2.0's version at `subscriptions.js:86` is a TOCTOU race where two concurrent POSTs both pass.
- P2 `total = Σ lines` · P3 no future/pre-commissioning readings · P4 meter attaches to exactly one parent (CHECK) · P5 paid ⇒ ∃ captured payment · P7 subscription window integrity · P8 device status vs `last_seen_at` + the sweeper that maintains it · P9 every high-severity alert has a terminal `notification_deliveries` row
- P6 authorization — discharged by pgTAP (#7), not JS
- **P10 conservation** — `Σ allocated_kwh == generated_kwh`; `dt_meter_kwh − Σ consumer_kwh == loss_kwh` exactly
- **P11 (new) monotonic registers** — `t1 < t2 ⇒ kwh_import(t1) ≤ kwh_import(t2)` unless a rollover event is recorded
- **P12 (new) invoice provenance** — every energy line has non-null reading refs and `quantity == closing − opening`

Slide: *"design.md specified 10 properties; 2.0 implemented 3; 3.0 implements 12."*

### M3 — DISCOM panel

The differentiator. Nobody else will build the utility's own side.

**#26 AT&C loss map.** Port `AhmedabadMap.js` from 2.0 (Leaflet, SSR-safe dynamic import) → Tailwind, add a DT layer coloured by loss %. `mv_dt_energy_balance_daily`: `dt_meter_kwh`, `sum_consumer_kwh`, `loss_kwh`, `loss_pct`, `billed_kwh`, `collected_paise`, `atc_loss_pct`.

**#27 Theft localization.** DT meter kWh vs Σ consumer meters → residual → rank suspects by load-profile decorrelation with the DT + tamper flags. **The most DISCOM-relevant model in the system — AT&C loss reduction is RDSS's entire business case.** The balance is a **residual, never a correction**: consumer bills always come from consumer meters; the residual drives investigation, not billing. Expect this exact question from the jury.

**#28 NM state machine.** `nm_applications` + `nm_application_events` + `nm_documents`. Lifecycle: `draft → submitted → scrutiny → feasibility → technically_feasible → approved → agreement_signed → installed → inspection_scheduled → inspected → commissioned` (+ `infeasible`, `rejected`, `withdrawn`). Every transition writes an event with actor, role, remarks, timestamp.

**#29 SLA clocks.** `sla_due_at` per stage, `current_stage_entered_at`, `sla_breached`, pg_cron sweeper, breach escalation.

**#30 Feasibility.** `dt_feasibility_checks`: DT capacity kVA, existing solar kW, proposed kW, peak load, headroom, penetration %, verdict, `rule_version`. Demo line: *"71% solar penetration, 8 kW headroom, feasible."*

**#31 PM Surya Ghar.** ₹30,000/kW for the first 2 kW, ₹18,000 for the third, capped at ₹78,000, disbursed **after DISCOM inspection**. Appears on both the savings calculation and the NM state machine.

**#32 Disconnect queue.** `disconnect_commands` with `requested_by` **separate from** `approved_by` — a two-person rule. Reason codes, grace period, full audit, and **no disconnect during declared heat-wave windows** (real DISCOM policy). A compliance detail this jury will notice immediately.

**#33 Demand response.** `demand_response_events` + `dr_participations`: broadcast a peak event → consumers opt in → measure baseline vs achieved reduction **verified by meter** → credit. **Narasimhan is on the jury and load management is his domain** — this cannot be a token feature.

**#34 Audit ledger.** `audit_log` with actor, role, action, entity, before/after JSON, IP. `REVOKE UPDATE, DELETE FROM ALL`. 2.0's `AuditLog.js` was 10 lines and orphaned. Regulated workflows need the chain **and a UI that shows it**.

### M4 — Onboarding, OCR, payments

**#35 Bill OCR.** `/ocr/bill`. Photograph a Torrent/MGVCL/DGVCL bill → consumer number, sanctioned load, tariff category, and the **12-month consumption history table**. **Vision LLM with strict JSON schema, primary** — Indian bill layouts vary wildly, a layout-trained extractor needs per-format training data you can't collect in time, and a vision LLM generalizes zero-shot and handles the variable-schema history table far better than key-value extraction. 3–8 s, ~₹1–3/bill. Log every job to `ocr_jobs` with confidence, latency, cost.

**#36 Confirmation UI.** **Never auto-commit OCR output.** Editable form, per-field confidence, flag below threshold, explicit Confirm. Correct engineering *and* a better demo — the judge sees a system being appropriately humble. Degrade gracefully when the history is a bar-chart image: "we extracted 3 months — enter your typical monthly units."

**#37 Eval set.** ~40 real bills, per-field accuracy reported: *"consumer number 97%, sanctioned load 92%, 12-month history 85%."* **A measured number beats a higher unmeasured one with these judges.**

**#38 Plan recommender.** Given a 12-month kWh vector and the tariff table, enumerate **every** plan and compute exact 12-month cost. **Deliberately not ML** — a linear scan is *provably optimal* and you can show the arithmetic on screen. Calling it an "ML recommender" to this jury is a downgrade.

**#39 Razorpay.** Real test-mode Orders API, real Checkout, **real webhook signature verification**. `webhook_events.event_id UNIQUE` + `INSERT … ON CONFLICT DO NOTHING` **is** the entire idempotency story, in two lines. 2.0 had none, and its `RazorpayPayment.js` called two endpoints that didn't exist.

**#40 UPI mandate.** **Collect-flow is deprecated as of 28 Feb 2026** — mandates can no longer be registered by typing a VPA. Build the **intent/QR** flow. Test mode mocks the mandate either way, but a judge who knows NPCI rules will flag an "enter your UPI ID" screen.

**#41 Reconciliation.** List `webhook_events` with signature-verification status; manual re-fetch if a webhook is lost mid-demo. Turns a test-mode limitation into a rigor signal: *"payment verified via signed webhook at 14:32:07."*

**#42 5-minute E2E.** Playwright asserting wall-clock < 300 s. This is the PS's headline success metric — test it, don't claim it.

### M5 — Mobile + field technician

**#43 Expo skeleton.** Persona chosen by role claim after login; two separate apps doubles distribution burden for zero scoring gain. `@supabase/supabase-js` with **`expo-secure-store`** as the session adapter (Keychain/Keystore, *not* AsyncStorage). **The token flow is identical across web and mobile because there is no custom auth server** — Supabase issues the JWT, RLS enforces it, web stores it in cookies, mobile in SecureStore. No bespoke session logic to get wrong; a genuine architectural argument for the pitch.

**#44 AppState handling.** `AppState` listener calling `removeChannel` on background and resubscribing on foreground. Without it Android kills the socket and the UI **silently goes stale** — a classic demo failure.

**#45 Offline outbox.** MMKV/SQLite queue, idempotency keys, visible "3 pending sync" badge, retry with backoff. **Non-negotiable** — Indian field crews work in basements and meter rooms with no signal, and an IntelliSmart judge *will* ask about this.

**#46 QR + nameplate.** `expo-camera`. Scan serial, OCR nameplate, match against `meters`.

**#47 Meter reading OCR.** **This is INSTINCT 4.0's Problem Statement #4 in its own right.** Harder than bill OCR and separately evaluated: 7-segment LCD and mechanical dials, glare, angle, dust, partial occlusion. Pipeline: display-ROI detection → perspective rectification → digit recognition → **plausibility validation against expected consumption** (a reading implying negative or absurd consumption is rejected, not stored) → geotag + timestamp + SHA-256 photo hash → human confirmation. **The "reliable" in PS #4 is the validation layer, not the OCR.** Separate eval set with a measured number.

**#48 Commissioning.** `commissionings` + `wo_photos`. Checklist (CT/PT verified, earthing, polarity), initial reading, signature. Carries `geo_lat/lng + accuracy_m` and **`device_time` vs `server_time`** — the control against armchair commissioning. An IntelliSmart field-ops person will recognize it instantly.

**#49 EAS build.** Android internal-distribution `.apk`, short URL + QR on a slide. Build **48h before and again 12h before**; configure EAS Update for JS-only hotfixes. Keep last-known-good APK on a USB stick **and** a short link **and** pre-installed on two Android phones you bring. Test against live URLs **over mobile data on the real carrier** — never trust venue Wi-Fi.

### M6 — Society, ML, copilot

**#50 Society schema.** `society_profiles`, `society_units`, `society_allocations`, `society_common_loads`. Group/virtual net metering; allocation by equal / unit area / sanctioned load / consumption / custom share. Deferred constraint trigger: `SUM(allocation_share) = 1.0` per org. The PS explicitly names housing societies and 2.0 ignored them entirely.

**#51 Conservation.** **allocated + common = generated, to the kWh.** No energy created or destroyed by allocation. The correctness centrepiece of the society panel and a better formulation of design.md's Property 10.

**#52 Society UI.** Generation → allocation → per-flat credit on individual bills → common-area load (lifts, pumps, STP) → one flat's own view. Defensible minimum if time runs short: allocation engine + per-flat statement + one chart. Skip AGM reporting.

**#53 Forecasting.** `/forecast/solar` and `/forecast/load` — LightGBM on weather + solar position. Same code path, different target and features.

**#54 Anomaly detection.** **Problem Statement #3.** Same statistical machinery as #27 at asset scope — one service, two views. Soiling ramp, string failure, inverter fault, meter offline. Writes to `alerts`, auto-raises work orders.

**#55 Copilot.** Server-side only, tool-calling over RPCs. Port 2.0's guardrails from `server/routes/groq.js` (9 jailbreak regexes, rate limiter, sanitizer) into `packages/shared/src/llm/guards.ts` and **delete the browser fallback path entirely**. A chat window is the lowest-differentiation feature in the room — every team will have one. **One day, hard budget.**

### M7 — Hardening & demo proof

**#56 Uptime.** External monitor (Better Stack / UptimeRobot free) on `/api/health` every 60 s **starting now**; `/api/health` itself checks DB, MQTT, and ML service and returns per-component status. By pitch day you have weeks of real data: *"99.94% over 26 days, 2 incidents, MTTR 4 min."* **A real 99.94% beats a claimed 99.99%.** Render it as a live component-status widget in the operator panel.

**#57 Load test.** `tools/loadtest/`: ingest 5,000 msg/s sustained 10 min; 500 concurrent dashboard sessions; billing run over 100,000 connections. Report p99, rows/s, DB CPU, wall-clock. Then extrapolate arithmetically:
> *"20M meters at a 15-minute block interval = 96 reads/day each = 1.92 billion rows/day ≈ 22,000 rows/s sustained. Our single ingest worker sustained 5,000 rows/s on 1 vCPU; the path partitions horizontally by NIC/DCU using MQTT shared subscriptions, so 4–5 workers cover national scale. Postgres at that volume needs Timescale or Citus — which is why the schema is already partition-keyed."*

Also: RLS `EXPLAIN (ANALYZE, BUFFERS)` benchmarks as `authenticated` with real claims, checked into `supabase/tests/perf/`.

**#58 Seed 10M+ rows.** `generate_series`, so on-stage query timings are on real volume, not 500 rows.

**#59 Plant defects.** A theft signature on one DT, a soiling ramp on one plant, an inverter trip, an SLA breach. **Charts of synthetic data with nothing wrong in them are the classic hackathon failure** — every analytics screen must have something to *say*.

**#60 SPOF diagram.** Draw the architecture **and mark the single points of failure**, with stated remediation (managed MQTT, read replicas, multi-region). Honesty about SPOFs reads as senior; a diagram with no SPOFs reads as naive.

**#61 Runbook.** Warmup script 20 min before pitching. Keyboard shortcut per scenario. Rehearse end-to-end 10+ times. Recorded 60 s fallback video cued to the exact timestamp. Two laptops. 1280×720, no hover-only interactions.

---

## 5. Risks

| Risk | Mitigation | Issue |
|---|---|---|
| **Realtime quota** — CDC evaluates RLS per subscriber per change; 1 Hz × 500 meters exhausts free tier in ~1 hr | `meter_readings` never in the publication; subscribe to `meter_live_state` filtered by id; Broadcast for hero meters; 4 Hz throttle; honest poll fallback | 18 |
| **RLS on partitions** — doesn't propagate to children; correlated subqueries run per row; bad policies block pruning | partition helper enables RLS + indexes; scope cols denormalized+indexed; all predicates in `(select fn())` form; EXPLAIN benchmarks in CI | 16, 5, 57 |
| **Vercel limits** — billing runs, rollups, PDF batches, multi-page OCR exceed function timeouts | all long work on Railway workers or pg_cron; never in a route handler | 1 |
| **Expo distribution** — a failed EAS build 3 h before the pitch is fatal | build early and often; APK on USB *and* short link *and* pre-installed on two phones; EAS Update; fallback video; test on real carrier data | 49 |
| **Cold starts** — Supabase free projects pause after 7 idle days | **upgrade to Pro**; Railway never-sleep + health cron; Vercel cron on `/api/health`; warmup script 20 min before; SSR first paint with real data | #63, #56 |
| **OCR accuracy** | vision LLM primary + fallback for short numeric fields + mandatory human confirm; measured eval sets; graceful degradation | 35–37, 47 |
| **Ingest duplicates / clock skew** | PK + `ON CONFLICT DO NOTHING`; readings `> now() + 5 min` to `quarantine_readings`, never silently dropped, count shown in operator panel | 15 |
| **Society panel runs out of time** | it's M6 for a reason. Minimum: allocation engine + per-flat statement + one chart | 50–52 |

---

## 6. The demo — one narrative, ~7 minutes

Do **not** click through five nav bars. One causal chain, driven live by the simulator scenario API.

1. **(0:00–0:45) Consumer, real phone mirrored.** Photograph a Torrent bill → OCR → *"based on YOUR 4,180 units last year, Plan X saves ₹19,400/yr and 3.4 tCO₂"* → subscribe → mandate → active. **Stopwatch on screen.** Nails the PS headline metric in minute one.
2. **(0:45–1:45) Field technician, same phone, different login.** Work order arrives as live push. Scan QR, OCR the meter reading, geotagged photo, checklist, submit — **in airplane mode** — then re-enable and watch the outbox flush. PS #4 and #5, demonstrated not described.
3. **(1:45–3:15) Consumer web, genuinely live.** Then *"here's what our AMI layer actually sees"* — terminal showing the raw DLMS/OBIS payload on MQTT beside the chart. Trigger `POST /scenario/theft`. Nothing visible on the consumer screen — which is the point.
4. **(3:15–5:00) DISCOM panel — the moment that wins.** Officer logs in; open a connection from another division and the row simply doesn't exist — explain that's Postgres RLS, not a UI check. DT map: the DT you just attacked is red. *DT meter 412 kWh, consumer meters sum 337 kWh, 18.2% unaccounted, 3 consumers whose profile broke correlation, one showing tamper flag 0x04 (magnetic).* Raise a work order → it lands on the technician's phone. Then the NM queue with a ticking SLA clock, a feasibility check, approval with audit trail.
5. **(5:00–6:00) Housing society.** 60 flats, 100 kW shared rooftop, group net metering. Generation → allocation by share → per-flat credit → common-area load → **conservation check: allocated + common = generated, to the kWh.**
6. **(6:00–6:45) Billing correctness + ops.** Click an invoice energy line, watch it expand to the two bracketing register reads with IDs and timestamps. Then CI: 12/12 properties, RLS suite green. Then uptime: 99.94% over 26 days.
7. **(6:45–7:00) Two slides.** Architecture — Meter → NIC → HES → MDM → EcoPower with `HESAdapter` named: *"today it's our simulator; the same interface takes a Trilliant UnitySuite feed."* Then the five-PS coverage table.

### Anticipate the Q&A

- *"Late or out-of-order meter data?"* → VEE + idempotent upsert + recomputation with versioned `engine_version` and a credit-note flow.
- *"CT/PT ratio and meter constant?"* → columns on `meters`, applied at ingest.
- *"Double-counting when DT and consumer meters disagree?"* → the balance is a **residual, never a correction**.
- *"What stops a wrongful prepaid disconnection?"* → two-person approval, reason codes, audit log, grace period, no disconnect in declared heat-wave windows.
- *"Cybersecurity on the meter link?"* → per-device keys provisioned at commissioning, HMAC + replay window + monotonic counters, per-topic ACL, no shared secret, rotation via `key_version`. Production DLMS uses HLS with AES-GCM; we've modelled the equivalent.

---

## 7. Ordering rationale & scope cuts

**Why AMI and billing land before UI polish and payments:** at 60% done you have AMI + billing + DISCOM — exactly the 60% these judges care about. The conventional order (auth → consumer UI → payments → "IoT later") leaves you at 60% looking like EcoPower 2.0. Every milestone boundary is a coherent pitch on its own.

**Explicitly out of scope:** blockchain, P2P energy trading, EV charging. 2.0 had all three as static mockups. To this jury they read as buzzword padding. **Say "deliberately out of scope" in the pitch and you gain credibility.**

**Deliberately starved:** #55, the LLM copilot — one day, bottom of the list. 2.0 had five chat surfaces. Every team will have a chatbot; none of these six judges will be moved by one.
