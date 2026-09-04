# EcoPower 3.0 — Demo Runbook

A ~9-minute walk for a jury of utility executives. The thesis in one line:
**every number is derived from a real meter read or a real DB trigger — no
badge outlives its data.** Show that, not a feature list.

Logins — all password `EcoPower!2026`:

| Panel | Email |
|---|---|
| Consumer | `consumer@ecopower.demo` |
| DISCOM officer | `discom@ecopower.demo` |
| RESCO operator | `operator@ecopower.demo` |
| Field technician | `field@ecopower.demo` |
| Support agent | `support@ecopower.demo` |
| Society admin | `society@ecopower.demo` |

Have six tabs pre-signed-in before you start. Live URL: _[fill in after deploy]_.

---

## 0 · Landing (20 s)

Open `/`. One sentence: "Energy-as-a-Service for Indian DISCOMs — a consumer
subscribes to solar output, and every rupee on the bill traces to two meter
reads." Scroll to the pricing block — "these are the real `plans` rows, not
marketing copy." Click **How it works** → the system diagram: where EcoPower
sits between the roof and the grid.

## 1 · Consumer — the honest dashboard (90 s)

`consumer@ecopower.demo` → `/consumer`.

- The **live meter tile** — the pulse is a real socket state, not a CSS
  animation. Point at the connection indicator: `connected / polling / stale`.
- **Grid import vs solar export**, 30 days, from this consumer's own reads.
  Open the `<details>` **Table view** — "every chart ships its data."
- Prepaid balance ring — real `prepaid_ledger`, append-only.
- Open **Bills** → expand any charge line → it opens to the **two register
  reads** that bracket it. This is the whole product in one interaction.
- **Submit reading** → pick a meter photo → tesseract reads the digits
  client-side, shows a confidence %, and low-confidence digits are flagged.
  Confirm → "it's in a review queue, not on the bill yet."
- **Carbon** — CO₂ avoided from *metered* export × the CEA grid factor. If a
  window has no export it says so; it does not estimate.

## 2 · Consumer — the 2.0 breadth (45 s)

- **Solar trading** — list surplus kWh; another consumer buys via
  `p2p_place_order()` which locks the listing in one transaction.
- **EV charging** — register a vehicle, the 5 seeded Ahmedabad stations with
  real-ballpark tariffs, log a session against "solar hours".
- Mention: **notifications**, **settings** (KYC, autopay), all three
  languages — switch to हिन्दी mid-demo if the room is Gujarati/Hindi.

## 3 · Field — closing the OCR loop (40 s)

`field@ecopower.demo` → `/field/readings`. The self-read you just submitted is
here with its plausibility figures (consumption, per-day, backwards-check).
**Accept** → `accept_self_read()` writes a `meter_readings` row,
`source='ocr'`, `quality='estimated'` — "marked as an estimate in the
consumer's history, never dressed up as a measurement."

Then `/field/inspections` — start a tamper checklist from a work order.

## 4 · DISCOM — the operator's view (2 min)

`discom@ecopower.demo` → `/discom`. Rail note: "Row-Level Security confines
every query on this page to this officer's division — there is no `WHERE
division_id` in the code."

- **Division load vs behind-meter solar**, 48 h — `division_load_profile()`,
  RLS-scoped.
- **AT&C loss by DT**, sorted, with sparkline bars. Click the worst DT →
  **loss localisation drill-down**: feeder read vs the sum of consumer reads,
  the planted defect on `AHD-A-300001`.
- **Outages** → log one, post a timeline update that revises the ETR, mark
  restored. The affected consumers can already see it.
- **Net-metering queue** — a decision writes to the **append-only audit
  ledger** (`/discom/audit`), trigger-written, hash-chained, DB-enforced
  immutable. Show the "chain verified" line.
- **P2P market** — the officer sees the trades in their division, read-only.

## 5 · Operator + Support (1 min)

`operator@ecopower.demo` → `/operator/guarantee`: contracted performance
terms, latest achieved vs contracted, **credit accrued** when a site misses —
computed by the guarantee engine, traceable to reads. `/operator/esg` — the
report states its data coverage (98% AMI) instead of estimating the rest.

`support@ecopower.demo` → `/support/lookup`: type `AHD-A-100001` → a bounded
360 bundle (no blanket billing access for this role). `/support/kb` — a
canned response whose `{placeholders}` fill from that bundle, so an agent
never types a number by hand.

## 6 · Close (20 s)

"2.0 looked finished and asserted things that weren't true. 3.0 has the same
breadth — P2P, EV, prepaid, three languages — but you can click any number
down to the meter read it came from. That's the difference a regulator
cares about."

---

## Pre-flight checklist

- [ ] Prod seeded: `seed_discom_fleet.mjs --days=120` + `seed_society_units.mjs --days=21` (else the load/loss/carbon charts are empty)
- [ ] Six tabs signed in, one per role
- [ ] One meter photo saved on the demo laptop for the OCR step
- [ ] Realtime tile shows `connected` (needs Supabase Pro / a warm project)
- [ ] `/discom/losses` drill-down loads the planted defect
- [ ] Language switch tested (cookie persists per browser)
