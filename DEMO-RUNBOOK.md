# EcoPower 3.0 — Demo Runbook

**Hard path: 5 minutes.** Finals are 5–7 min + Q&A — don't spend it all talking.
The thesis in one line: **every number is derived from a real meter read or a
real DB trigger — no badge outlives its data.** Show that, not a feature list.
The full 9-minute breadth tour is kept below as backup material / Q&A depth,
not the primary path.

Logins — all password `EcoPower!2026`:

| Panel | Email |
|---|---|
| Consumer | `consumer@ecopower.demo` |
| DISCOM officer | `discom@ecopower.demo` |
| Platform admin (scenario trigger only) | `admin@ecopower.demo` |
| RESCO operator | `operator@ecopower.demo` |
| Field technician | `field@ecopower.demo` |
| Support agent | `support@ecopower.demo` |
| Society admin | `society@ecopower.demo` |

Have four tabs pre-signed-in before you start (consumer, discom, operator, a
terminal). Live URL: _[fill in after deploy]_.

---

## The 5-minute hard path

### 0 · Landing (15 s)

Open `/`. One sentence: "Energy-as-a-Service for Indian DISCOMs — a consumer
subscribes to solar output, and every rupee on the bill traces to two meter
reads."

### 1 · Consumer — the provable bill (60 s)

`consumer@ecopower.demo` → `/consumer/bills`. Open any invoice, expand a
charge line — **it opens to the two cumulative register reads that bracket
it**, telescoped through the real GERC slab tariff. *"This isn't a
number we computed and stored. Click it, and it re-derives itself in front
of you."*

### 2 · The RLS moment (30 s)

`discom@ecopower.demo` → `/discom`. *"This officer belongs to Division A.
There is no `WHERE division_id = ...` anywhere in this codebase — query
anything you like, Division B's rows do not exist for this session. That's
Postgres Row-Level Security, not a UI filter."* (Say it, don't demo the
negative — move on, time is short.)

### 3 · Live fault injection — the moment that lands (90 s)

Switch to the terminal, already `cd`'d into the repo:

```bash
node scripts/trigger_scenario.mjs AHD-B-300004 theft 0.6
```

Flip back to `/discom/losses` and refresh. **The DT this meter sits on just
moved up the loss-ranked table**, and drilling into it shows the specific
consumer flagged by tamper bit `0x08` — the same signal shape RDSS's real
AT&C-loss-reduction business case runs on. *"I just caused that live, on a
real database, through a Postgres function — not a slide."*

(Backup line if the terminal isn't visible to the room: narrate it as you
type — "I'm calling `inject_scenario('theft')` against a real meter right
now.")

### 4 · The guarantee settles (45 s)

`operator@ecopower.demo` → `/operator/guarantee`. Contracted vs. achieved
performance, and where achieved falls short, **a credit is computed by the
guarantee engine from the same meter reads** — not adjusted by hand.

### 5 · Close (30 s)

*"Meter → NIC → HES → MDM → EcoPower — today the HES is our simulator; the
same `HESAdapter` interface takes a Trilliant UnitySuite feed unchanged.
160 pgTAP assertions prove the authorization boundary in CI on every push.
2.0 looked finished and asserted things that weren't true. This is the
difference a regulator — and a judge who runs 20 million of these meters —
actually checks for."*

---

## Anticipate the first question

- *"Is that fault injection real or canned?"* → `supabase/migrations/0040_scenario_injection.sql` — a real `SECURITY DEFINER` RPC, `platform_admin`-only, writing a real row into `meter_readings`. Offer to run it again on a different meter, live, on request.
- *"What if the deployed URL is cold?"* → Supabase free tier pauses after 7 idle days. Warm it 20 minutes before you go on, or seed the fallback video (see Pre-flight).

---

## Extended walk (~9 min) — backup depth / Q&A material

Everything below still works and is worth knowing cold for Q&A, but is not
the primary path.

### Consumer — the 2.0 breadth (45 s)

- **Solar trading** — list surplus kWh; another consumer buys via
  `p2p_place_order()` which locks the listing in one transaction.
- **EV charging** — register a vehicle, the 5 seeded Ahmedabad stations with
  real-ballpark tariffs, log a session against "solar hours".
- Mention: **notifications**, **settings** (KYC, autopay), all three
  languages — switch to हिन्दी mid-demo if the room is Gujarati/Hindi.

### Field — closing the OCR loop (40 s)

`field@ecopower.demo` → `/field/readings`. A submitted self-read shows its
plausibility figures (consumption, per-day, backwards-check). **Accept** →
`accept_self_read()` writes a `meter_readings` row, `source='ocr'`,
`quality='estimated'` — "marked as an estimate in the consumer's history,
never dressed up as a measurement." Then `/field/inspections` — start a
tamper checklist from a work order.

### DISCOM — the rest of the panel (90 s)

- **Division load vs behind-meter solar**, 48 h — `division_load_profile()`,
  RLS-scoped.
- **Outages** → log one, post a timeline update that revises the ETR, mark
  restored. The affected consumers can already see it.
- **Net-metering queue** — a decision writes to the **append-only audit
  ledger** (`/discom/audit`), trigger-written, hash-chained, DB-enforced
  immutable. Show the "chain verified" line.
- **P2P market** — the officer sees the trades in their division, read-only.

### Operator + Support (1 min)

`/operator/esg` — the report states its data coverage (98% AMI) instead of
estimating the rest. `support@ecopower.demo` → `/support/lookup`: type
`AHD-A-100001` → a bounded 360 bundle (no blanket billing access for this
role). `/support/kb` — a canned response whose `{placeholders}` fill from
that bundle, so an agent never types a number by hand.

---

## Pre-flight checklist

- [ ] Prod seeded: `seed_discom_fleet.mjs --days=120` + `seed_society_units.mjs --days=21` (else the load/loss/carbon charts are empty)
- [ ] `scripts/trigger_scenario.mjs` tested against prod at least once *before* going on stage — pick and note down a real seeded meter serial that isn't already the planted `AHD-A-300001` defect, so the injection is visibly new
- [ ] Four tabs signed in (consumer, discom, operator, terminal)
- [ ] One meter photo saved on the demo laptop for the OCR step, if using the extended walk
- [ ] Realtime tile shows `connected` (needs Supabase Pro / a warm project — see #56 for the uptime monitor that also keeps it warm)
- [ ] `/discom/losses` drill-down loads the planted defect *before* you inject a second one live
- [ ] Language switch tested (cookie persists per browser)
- [ ] Recorded 60 s fallback video, cued to the exact timestamp, in case the live URL is cold (#61 — not yet recorded)
