# EcoPower 3.0 — Build Order

The sequence to actually solve the issues in. Companion to [ROADMAP.md](ROADMAP.md), which holds the tracker and the reasoning; this file holds only **what to do next**.

Topologically verified — no issue appears before something it depends on. Tier A is dependency-closed.

---

## How to use this

Work the sprints in order. Inside a sprint, issues on the same line have **no dependency on each other** and can be done in any order, or in parallel if you have help.

**Do not start the next sprint until the current one's checkpoint demos.** Each checkpoint is a thing you could show on stage. That is the point — if you run out of time at any sprint boundary, you still have a coherent pitch.

---

## Sprint 0 — Unblock (30 minutes, all external)

These are not code. Nothing starts without them.

| Do now | Unblocks |
|---|---|
| **#62** `railway login` | #14 → the entire AMI spine |
| **#63** Supabase project + keys — **upgrade to Pro** | #2 → everything |
| **#65** Vision API key | #35 → all OCR |
| #64 Razorpay test account | #39 — needed by Sprint 5, not before |

> Pro on Supabase is not optional. Free projects pause after 7 idle days, and the Realtime quota caps what Sprint 2 needs. ~₹2,000 against a ₹16 lakh prize.

---

## Sprint 1 — Foundation

```
#1   scaffold monorepo            ← .npmrc node-linker=hoisted in THIS commit
#2   Supabase + migration 0001
────────────────────────────────── then, in parallel:
#3   denormalized scope keys      #4   access-token hook      #67  design tokens
────────────────────────────────── then:
#5   RLS policies for five roles
#8   Next.js shell + Vercel deploy    #68  stat tile     #69  five component states
#7   pgTAP RLS suite               ← Tier B, but pull it up: it is the proof
```

**Checkpoint:** a live Vercel URL, five seeded logins landing in five different shells, and pgTAP showing a DISCOM officer in Division A gets **zero rows** from Division B.

⚠️ **Start #56 (uptime monitoring) the moment #8 deploys.** It is Tier B, but its entire value is *elapsed time* — you cannot manufacture "99.94% over 26 days" in the last week. Point Better Stack at `/api/health` on day one and forget about it.

---

## Sprint 2 — AMI spine

The longest sprint, and the one that separates this from every other entry. **Build it before any UI polish.**

```
#10  OBIS constants + IS 15959 schema      #14  MQTT broker on Railway
#16  partitioned time-series schema        ← RLS on partitions is the trap
────────────────────────────────── then:
#11  HESAdapter + Trilliant stub           #12  AMI simulator (physical model)
────────────────────────────────── then:
#13  scenario control API                  #15  ingest worker
#17  continuous aggregates + pg_cron       #58  seed 10M+ readings
────────────────────────────────── then:
#18  live consumer dashboard on Realtime
```

**Checkpoint:** two browser windows, `mosquitto_sub` in a terminal. Trigger `POST /scenario/theft`. The number moves in under a second.

---

## Sprint 3 — Billing

```
#19  pure tariff engine
#20  real GERC tariff seed          ← telescopic: four lines, not one
#21  invoice schema with provenance
#76  guarantee engine               ← the PS1 differentiator
#39  Razorpay Orders + Checkout + webhook verify
```

**Checkpoint:** click an invoice energy line, watch it expand to the two bracketing register reads. 342.400 kWh → 50 @ ₹3.05 · 50 @ ₹3.50 · 150 @ ₹4.15 · 92.400 @ ₹5.20 = ₹1,430.48.

---

## Sprint 3.5 — PS1 core loop

**Pulled forward from Tier C** (see [PS1-PRIORITY-PLAN.md](PS1-PRIORITY-PLAN.md)) — subscription plans, notifications, and support tickets are named explicitly in PS1's requirements and desired outcomes; they were previously sequenced last, behind items PS1 doesn't name at all. This sprint exists to close that mismatch before the DISCOM/OCR sprints, which PS1's own text says can be mocked.

```
#77  multi-service catalog          #38  plan recommender
──────────────────────────────────  then:
#78  subscription lifecycle (trim to upgrade/cancel if short on time)
#86  notifications primitive        #87  support/fault ticketing
──────────────────────────────────  then:
#80  carbon tracking (lightweight — metered CO2 avoided; defer I-REC provenance)
```

**Checkpoint:** a consumer subscribes to a plan, sees it reflected in billing, raises a support ticket, gets a reply notification in the bell icon — the full PS1 consumer loop, demoable end to end.

---

## Sprint 4 — DISCOM

Only two issues, and they carry the single strongest moment in the demo.

```
#26  DT energy accounting + AT&C loss map
#27  theft / loss localization
```

**Checkpoint:** officer logs in, cannot see another division at all (RLS, not a UI check), opens the worst DT by loss, drills to three suspect consumers, one showing a tamper flag.

---

## Sprint 5 — Onboarding

```
#35  bill OCR service
────────────────────────────────── then:
#36  OCR confirmation UI
```

**Checkpoint:** stopwatch on screen. Photograph a real Torrent bill → active subscription in under five minutes.

---

## Sprint 6 — Mobile

```
#43  Expo skeleton — two personas
────────────────────────────────── then, in parallel:
#45  offline outbox      #47  meter reading OCR (PS #4)      #49  EAS build → APK
```

**Checkpoint:** commission a meter on a real phone **in airplane mode**, then re-enable network and watch the outbox flush.

⚠️ **#49 has a hard lead time.** EAS free-tier queues are slow. Build 48h before *and* 12h before the pitch. Keep the APK on a USB stick, a short link, and pre-installed on two phones you physically bring.

---

## Sprint 7 — Demo proof

```
#59  plant findable defects in the seed
#61  demo runbook + fallback video
```

**Checkpoint:** the full 7-minute run, rehearsed end to end, ten times.

**Tier A is complete here — 39 issues (5 more than before: #77, #38, #78, #86, #87 — the PS1 core loop, pulled up from Tier C). This is a winning pitch.** Everything below is upside.

---

## Sprint 8 — Tier B, highest value first

If you reach this, take them in this order. The first three punch above their tier.

```
#28  net-metering state machine ← the DISCOM demo segment shows this SLA clock ticking
#33  demand response          ← Narasimhan ran Grid Controller of India; he will look for it
#71  no-data drill            ← the regression test for 2.0's exact public failure
#85  unit economics + pilot   ← no code; answers "what happens Monday?"
────────────────────────────────── then:
#9   secret-leak CI      #24  golden-file billing tests    #25  twelve properties
#22  prepaid             #32  disconnect two-person rule   #34  audit ledger
#84  bill explainer      #83  i18n gu/hi/en                #37  OCR eval set
#50  society schema      #51  conservation property        #42  5-minute E2E test
#46  meter QR scan       #48  commissioning fraud controls #44  mobile AppState
#57  k6 load test        #70  ConnectionState indicator
#72  Tier-1 real data    #73  GERC constants               #74  AT&C calibration
```

`#85` needs no dependencies and no code — it is the right thing to do on any day you are blocked waiting on something else.

---

## Sprint 9 — Tier C, cut without guilt

```
#6 #23 #29 #30 #31 #40 #41 #52 #53 #54 #55 #60 #75 #79 #81 #82
```

Good ideas, none demo-critical. **#55 (LLM copilot) goes first** — every team will have a chatbot and none of these six judges will be moved by one.

---

## The critical path — your real schedule risk

Eight links deep, and every one is Tier A. A slip anywhere here slips the demo:

```
#2 schema → #3 scope keys → #16 partitions → #17 aggregates
   → #26 DT loss map → #27 theft → #59 planted defects → #61 runbook
```

Everything else has slack. This does not. If you are ever choosing what to work on and the answer is not obvious, **work the next thing on this chain.**

Note it runs through `#63` (Supabase) at the very top — which is why that blocker is worth clearing before anything else this morning.

---

## Two scheduling exceptions

Both are Tier B items whose value depends on when you start, not on finishing:

| Issue | Start it | Why |
|---|---|---|
| **#56** uptime monitoring | the hour #8 deploys | you need weeks of real data. A measured 99.94% beats a claimed 99.99%, and you cannot fake elapsed time. |
| **#49** EAS build | 48h before the pitch, then again at 12h | queue times are unpredictable and a failed build three hours out is fatal |

---

## If you have a second person

The dependency graph forks cleanly after Sprint 1. Two people can run these in parallel with almost no contention:

| Track | Sprints |
|---|---|
| **A — telemetry & DISCOM** | Sprint 2 → Sprint 4 (#10–#18, #26, #27) |
| **B — commerce & consumer** | Sprint 3 → Sprint 5 (#19–#21, #76, #35–#39) |

They rejoin at Sprint 6. Mobile (#43) only needs #1 and #4, so it can start any time after Sprint 1 — give it to whoever frees up first, since #49's build lead time is the thing most likely to bite you.
