# PS1 — Unit economics & a 90-day pilot (#85)

No code — this answers "what happens Monday?" Ravi Kumar (FSR Global, regulatory
economics) and Banga (Tata Power CEO) will ask it; a team that can't answer loses
to one that can build less but knows this cold.

**Source discipline, same as [DATA.md](DATA.md):** every number below is tagged
**[repo]** (already cited in this codebase — `packages/shared/src/billing`,
`0008_tariff_seed.sql`, ROADMAP.md) or **[external — verify]** (a public
benchmark you should confirm against the current-year figure before using it
in the actual pitch; MNRE/CFA benchmark costs move year to year).

---

## 1. Who pays whom

```
Consumer  →  monthly subscription  →  EcoPower / RESCO
EcoPower  →  owns, installs, insures, maintains the panels
Consumer  →  still pays the DISCOM  →  for grid import beyond what solar covers
DISCOM    →  net-meters the export, approves the connection, unaffected financially
```

The RESCO carries the CAPEX and the performance risk (the guarantee engine
credits the consumer if generation underperforms — `0010_guarantee_engine.sql`,
**[repo]**). The consumer carries no equipment, no maintenance, no roof-survey
risk, and a lower combined monthly outflow than buying the same system outright
on a loan, if the subscription is priced right. Getting that price right is
the entire unit-economics question below.

---

## 2. The RESCO's economics — one 3 kW residential rooftop

| Item | Value | Source |
|---|---|---|
| System size | 3 kW (matches the seeded demo fleet's typical residential connection) | [repo] `scripts/seed_demo_users.mjs` |
| Installed cost before subsidy | ₹50,000–65,000/kW → **₹150,000–195,000** | [external — verify against the current MNRE/CFA residential rooftop benchmark] |
| PM Surya Ghar subsidy | ₹30,000/kW × 2 kW + ₹18,000 × 1 kW = **₹78,000** (capped) | [repo] ROADMAP.md #31 |
| Net RESCO CAPEX | **₹72,000–117,000** | derived |
| Subscription plan | Solar Basic, **₹999/month** (₹11,988/year) | [repo] `0012_subscriptions.sql` seed |
| Simple payback (CAPEX ÷ annual subscription revenue) | **~6–10 years**, before O&M, insurance, cost of capital | derived — a real pilot needs the RESCO's actual financing terms substituted here |

**What this doesn't yet include, and a real pilot must:** cost of capital
(RESCO's WACC or the specific loan/lease terms), O&M (typically 1–1.5% of
CAPEX/year for rooftop solar), insurance, inverter replacement at ~10–12 years,
and the guarantee-engine credit liability (98% availability plans pay out on
shortfall — `guarantee-engine.ts` **[repo]**, so it's a real, budgetable cost,
not an unbounded one; `capPaise` in `shortfallCreditInput` **[repo]** exists
specifically to bound RESCO exposure per contract).

**Sensitivity that matters for the pitch:** Solar + Backup (₹2,499/mo) and
Solar + Comfort (₹3,999/mo) — **[repo]** `0012_subscriptions.sql` — payback
against the same CAPEX-plus-battery cost is materially faster per rupee of
ARPU; battery CAPEX (~₹15,000–25,000/kWh, **[external — verify]**) needs its
own line before quoting a blended number.

---

## 3. The consumer's economics — the same worked example the README uses

Grid-only, no solar, 342.400 kWh/month, GERC RGP-Urban FY26 **[repo]**
(`tariff-engine.golden.test.ts`):

> 50 kWh @ ₹3.20 + 150 kWh @ ₹3.95 + 142.400 kWh @ ₹5.00 = **₹1,464.50** before fixed charge and duty.

Same consumer with a 3 kW rooftop system generating ~250 kWh that month
(illustrative — Ahmedabad seasonal generation varies, see DATA.md §3):

- Net import via `netMeteringSettlement()` **[repo]**: 342.400 − 250 = 92.400 kWh billable import, telescoped through the same slabs → **~₹342** (50 @ ₹3.20 + 42.4 @ ₹3.95).
- Subscription: **₹999** (Solar Basic).
- **Total: ~₹1,341/month vs. ₹1,464.50 grid-only** — an **~8% reduction**, illustrative at this generation/consumption ratio, not a promised number.

**This is a deliberately modest example, not a cherry-picked one** — the
platform's own honesty discipline (DATA.md P1: no badge outlives its data)
applies here too. The real pitch number should come from running the actual
tariff engine over a representative consumption/generation distribution across
the seeded fleet (`scripts/seed_discom_fleet.mjs`), not one hand-picked
consumer. **Action item, not yet done:** a script that runs `composeInvoice()`
against every seeded connection with and without solar and reports the real
distribution of % savings — this is buildable from code that already exists
and would replace this section's illustrative example with a measured one.

The bigger consumer win than the monthly bill is avoided CAPEX: no ₹150–195k
upfront, no loan, no O&M, no inverter-replacement risk, and the guarantee
engine's shortfall credit means underperformance is EcoPower's problem, not
theirs.

---

## 4. The regulatory basis — the question Ravi Kumar will actually ask

**"How does a third party own panels on a customer's roof, and why does the
DISCOM allow it?"** This is not a hypothetical gap — it's the load-bearing
regulatory question for the entire EaaS model, and it has a real answer:

- **PM Surya Ghar Muft Bijli Yojana** explicitly supports the RESCO / third-party-
  ownership model for residential rooftop solar, alongside consumer-owned
  CAPEX purchase — the subsidy structure in §2 above is disbursed to the
  installer/RESCO on the consumer's behalf, not paid to the consumer directly,
  which is precisely the EaaS financing shape. **[external — cite the current
  MNRE scheme guidelines PDF; verify the RESCO-model clause hasn't changed
  since the version this was checked against]**
- **Net-metering approval** under GERC's Rooftop Solar Regulations runs through
  the **connection owner** (the consumer, whose name is on the service
  connection), not the equipment owner — third-party ownership of the panels
  doesn't change who the DISCOM's net-metering agreement is with. This is
  exactly why `nm_applications` (`0019_workflows.sql` **[repo]**) is scoped to
  `service_connection_id`, not to an EcoPower-owned asset ID.
- **The DISCOM is financially indifferent** to who owns the panels: it still
  meters the same import/export, bills the same tariff, and settles the same
  net-metering credit. What it needs from a platform like this is exactly
  what's built: real net-metering workflow with SLA clocks (#29), real DT
  feasibility checks (#30) before approving, and an audit trail (`0023_audit_log.sql`
  **[repo]**) — regulatory comfort, not a new financial relationship.

**Say this explicitly in the pitch**, don't leave it implied: *"We are not
asking the DISCOM to change how it bills or meters anything. We are asking it
to approve a net-metering connection exactly as it already does — the panels'
ownership structure is a private commercial arrangement between us and the
consumer, invisible to the DISCOM's own processes."*

---

## 5. A 90-day pilot proposal

**Scope:** one DISCOM division (matching the seeded demo topology — a Circle
with 2–3 divisions), 50–100 residential connections, Solar Basic + Solar +
Backup plans only (skip Comfort — unmetered line items add pilot complexity
for no proof-of-concept value).

| Phase | Days | What happens | Success gate |
|---|---|---|---|
| **Setup** | 1–15 | DISCOM data-sharing agreement for the pilot division; net-metering approval process confirmed against the real workflow (not just the demo's simulated one); first 10 real HES-integrated meters via `HESAdapter` (the `TrilliantUnitySuiteAdapter` stub becomes real for however many meters IntelliSmart can point at the pilot) | ≥10 meters streaming real DLMS/OBIS reads into `meter_readings` |
| **Onboard** | 16–40 | Consumer sign-up, bill-history quote, install, commissioning, net-metering filing for the full 50–100 | ≥80% of applications commissioned within their SLA clock (#29); zero disconnect-queue incidents |
| **Operate** | 41–75 | Billing runs live monthly; guarantee engine tracks real CUF/PR/availability against contract; support tickets flow through the real queue | Invoice line traceable to two real register reads on every bill, no exceptions; measured platform uptime logged (#56) |
| **Review** | 76–90 | Real AT&C impact on the pilot DT(s) measured against the pre-pilot baseline; real subscriber savings vs. their own prior 12 months of bills (not a hypothetical); a pricing recommendation for scale-up | A number, not an estimate, for: subscriber savings, RESCO CAPEX recovered per subscriber-month, and the DT-level loss delta |

**What makes this credible instead of aspirational:** every system in the
pilot column already exists in this codebase and is pgTAP-tested — the pilot
is a real-data substitution into working software, not a build project. The
one real integration gap is `TrilliantUnitySuiteAdapter` (`hes-adapter.ts`
**[repo]**), which is a typed stub specifically because it's the one piece
that needs IntelliSmart's actual HES credentials to complete — a fact to state
directly to the judges, since Rawal will know instantly whether that claim is
honest.

---

## 6. What this document is not

Not a business plan, not a funded financial model, not audited. It exists so
the pitch has real arithmetic behind "what happens Monday" instead of a slide
that asserts viability. Before using the CAPEX/payback numbers in an actual
investor or DISCOM conversation, replace every **[external — verify]** tag
above with a current, cited figure — the same discipline DATA.md applies to
every other number this platform shows.
