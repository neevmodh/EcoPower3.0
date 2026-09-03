# PLAN — Final Web App ("make it the best 3.0, finished")

Goal: take the 3.0 web app from "5 real panels, demo-grade" to **a finished product** — the polish and completeness 2.0 projected, but without violating DESIGN.md P1 (*no component may outlive its data*). Web app only. No mobile, no new ML services.

**What this explicitly does NOT do** (2.0 had these; they contradict 3.0's thesis or need infra/decisions):
P2P energy trading · blockchain ledger · EV charging · weather-forecast dashboard · grid-balancing sim · firmware OTA · multi-site enterprise fleet. If you want any of these, say so — each is its own decision.

Status: `☐` todo · `◐` doing · `☑` done · `⊘` cut

## Tier 1 — Finish & de-embarrass (do first, all low-risk)

| # | Task | Why | Files |
|---|---|---|---|
| 1 | Fix Realtime `Connecting… / Reconnecting…` tile — honest ConnectionState (issue #70) | It's the first thing anyone sees on the consumer panel and it never resolves. Either fix the subscription or show a truthful "last reading 4s ago" state. | `components/LiveMeterTile.tsx`, `components/ConnectionIndicator.tsx` |
| 2 | `next lint` → real ESLint config for `apps/web` | `pnpm lint` currently drops into an interactive prompt and fails. | `apps/web/eslint.config.mjs`, `package.json` |
| 3 | Empty / loading / error state pass across all 17 pages | Several pages assume data exists. Finished apps degrade gracefully. | all `app/**/page.tsx` |
| 4 | Marketing page polish — tighten hero, real live pricing already there, add a "how it works" + proof strip | Landing page is the pitch's first 10 seconds. | `app/(marketing)/page.tsx` |
| 5 | CI guard: fail build if a secret reaches the client bundle (issue #9) | Cheap, and one leaked `SUPABASE_SERVICE_ROLE_KEY` in a client chunk ends the pitch. | `.github/workflows/`, `scripts/` |

## Tier 2 — Depth the judges will probe (utility execs)

| # | Task | Why | Files |
|---|---|---|---|
| 6 | Simulator scenario control API (issue #13) — `POST /scenario/theft`, `/surge`, `/outage` | The single strongest demo moment: trigger theft, watch the DISCOM loss number move in <1s. Currently no way to drive it live. | `apps/simulator/src/`, new `services` route |
| 7 | DISCOM: theft / loss localization drill-down (issue #27, deterministic not ML) | From "DT X has 19% loss" → the 3 suspect consumers under it, ranked by unexplained delta. Closes the loop on the loss map. | `app/(discom)/discom/losses/`, new RPC migration |
| 8 | Golden-file billing tests + 12 correctness properties (issues #24, #25) | "Provable billing" is the headline claim. It needs a test suite that proves it. | `packages/shared/`, `apps/web` test dirs |
| 9 | Consumer analytics depth — real disaggregation (base vs cooling load), month-over-month, tariff-slab breakdown | Analytics page is 124 lines / thin. This is where a consumer actually lives. | `app/(consumer)/consumer/analytics/page.tsx` |
| 10 | Notifications actually delivered + bell badge live | Bell exists; wire it to the `0019_workflows` triggers so outage/payment/ticket events show up. | `components/NotificationBell.tsx` |

## Tier 3 — Finished-product completeness

| # | Task | Why |
|---|---|---|
| 11 | i18n: en / hi / gu with a real switcher (issue #83) | 2.0 had it; Indian utility product needs it; judges will check. |
| 12 | Prepaid as a first-class billing mode (issue #22) | Named in PS1. Currently only postpaid + PAYG. |
| 13 | Append-only audit ledger + UI (issue #34) | Every disconnect / tariff-change / approval action, immutable, viewable. Utilities care about this a lot. |
| 14 | Operator + Field + Support panel depth pass | All ~100 lines each — functional but shallow. |
| 15 | Demo seed: plant findable defects (issue #59) + runbook (#61) | The 7-minute rehearsed run. |

## Sequencing

Tier 1 top-to-bottom → Tier 2 → Tier 3. Each task: real data or a real DB trigger, pgTAP where it touches RLS, `pnpm build` + `pnpm test` green, live-verified on the deployed URL, committed with a worklog note. Push to `main` as I go (neevmodh identity).

## Needs you (parallel, not blocking the above)

- **#66** confirm final-round timeline (blocker)
- Supabase **Pro** upgrade — Free tier Realtime quota is likely *why* task 1 is broken; also Free projects pause after 7 idle days
- Mobile: PWA-only, or build the Expo app? (currently PWA only, by choice)
