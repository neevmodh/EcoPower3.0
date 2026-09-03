# PLAN — Final Web App ("make it the best 3.0, finished")

Goal: take the 3.0 web app from "5 real panels, demo-grade" to **a finished product** — the polish and completeness 2.0 projected, but without violating DESIGN.md P1 (*no component may outlive its data*). Web app only. No mobile, no new ML services.

**What this explicitly does NOT do** (2.0 had these; they contradict 3.0's thesis or need infra/decisions):
P2P energy trading · blockchain ledger · EV charging · weather-forecast dashboard · grid-balancing sim · firmware OTA · multi-site enterprise fleet. If you want any of these, say so — each is its own decision.

Status: `☐` todo · `◐` doing · `☑` done · `⊘` cut

## Tier 1 — Finish & de-embarrass (do first, all low-risk)

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Fix Realtime `Connecting… / Reconnecting…` tile (issue #70) | ☑ | Root cause: `meter_live_state` was never seeded, so SSR initial + poll fallback had no row. Both seeds now upsert it. `963c5fd`. Still needs the prod re-seed (below) to take effect on the live URL. Making it *actually* live = Tier 2 #6. |
| 2 | `next lint` → working lint for `apps/web` | ☑ | Swapped to Biome (repo's existing linter), added build-output ignores, wired `pnpm lint` into CI. Fixed 20 findings (16× button type, deps, keys, non-null). `134cbe9`. |
| 3 | Empty / loading / error state pass across all 17 pages | ☐ | |
| 4 | Marketing page polish | ☐ | Subjective — check with user first. |
| 5 | CI guard: fail build if a secret reaches the client bundle (issue #9) | ☑ | `scripts/check_client_bundle.mjs` scans `.next/static` for env-var values + service_role/Razorpay fingerprints. In CI after build. `35f5761`. |
| — | **Bonus:** pgTAP time-bomb — `main` CI was red | ☑ | `0005` pre-creates only current+next month partition; `invoices`/`payments` fixtures use fixed Aug-2026 dates → 16 subtests failing since the month rolled. Fixed `8fb39c6`. Not caused by this work — surfaced by it. |

## Tier 2 — Depth the judges will probe (utility execs)

| # | Task | Why | Files |
|---|---|---|---|
| 6 | Simulator scenario control API (issue #13) — `POST /scenario/theft`, `/surge`, `/outage` | The single strongest demo moment: trigger theft, watch the DISCOM loss number move in <1s. Currently no way to drive it live. | `apps/simulator/src/`, new `services` route |
| 7 | DISCOM theft / loss localization drill-down (#27) | ☑ `32d4e57` — `dt_consumer_breakdown()` RPC (0022) + `/discom/losses/[dtId]` page + links + 6 pgTAP. Planted defect on AHD-A-300001 (#59 partial). Fixed a phantom -18% loss on DT A-21 by moving the society to its own DT. **Migration deploys to prod on next `supabase db push`.** |
| 8 | Golden-file billing tests + 12 correctness properties (issues #24, #25) | ☑ `f278da4` — 12 golden (exact paise, real Torrent RGP tariff) + 15 properties (400 seeded cases each). 62 billing tests total. |
| 9 | Consumer analytics — month-over-month grid import | ◐ MoM comparison card added (only when both months fully covered — no fake headline). Slab-position + load disaggregation deferred (disaggregation risks synthetic numbers → P1). |
| 10 | Notifications actually delivered + bell badge live | Bell exists; wire it to the `0019_workflows` triggers so outage/payment/ticket events show up. | `components/NotificationBell.tsx` |

## Tier 3 — Finished-product completeness

| # | Task | Why |
|---|---|---|
| 11 | i18n: en / hi / gu with a real switcher (issue #83) | 2.0 had it; Indian utility product needs it; judges will check. |
| 12 | Prepaid as a first-class billing mode (#22) | ☑ `843d2a5` — `prepaid_accounts` + append-only `prepaid_ledger` (0024), `prepaid_recharge()` RPC, `prepaid_settle_day()` on pg_cron, `PrepaidBalanceCard` on /consumer, `/discom/prepaid` watch list. Demo consumer is now prepaid at ₹80. 9 pgTAP (125 total). Migration needs `supabase db push`. |
| 13 | Append-only audit ledger + UI (issue #34) | ☑ `5384390` — `audit_log` (0023), trigger-written, DB-enforced immutable, division/org RLS, `/discom/audit` page. 7 pgTAP (116 total). Migration needs `supabase db push` for prod. |
| 14 | Operator + Field + Support panel depth pass | All ~100 lines each — functional but shallow. |
| 15 | Demo seed: plant findable defects (issue #59) + runbook (#61) | The 7-minute rehearsed run. |

## Sequencing

Tier 1 top-to-bottom → Tier 2 → Tier 3. Each task: real data or a real DB trigger, pgTAP where it touches RLS, `pnpm build` + `pnpm test` green, live-verified on the deployed URL, committed with a worklog note. Push to `main` as I go (neevmodh identity).

## Prod re-seed needed (classifier blocks me from running it)

The earlier prod seed wrote topology via PostgREST but the 120-day `meter_readings`
backfill went to **local** Supabase (DATABASE_URL defaulted to localhost). Prod has
meters but no readings and no `meter_live_state`. Run, from repo root:

```bash
cd apps/web && vercel env pull .env.production.local --environment=production --yes
set -a && source .env.production.local && set +a
export SUPABASE_URL="https://vdjzhvlwwzxelckrjbuj.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role from secrets/supabase-ecopower3.md>"
# DATABASE_URL: copy the "Session pooler" URI from the Supabase dashboard
# (Project → Connect); DB password is in secrets/supabase-ecopower3.md.
export DATABASE_URL="<session-pooler URI>"
cd ..
./services/ingest/node_modules/.bin/tsx scripts/seed_discom_fleet.mjs --days=120
./services/ingest/node_modules/.bin/tsx scripts/seed_society_units.mjs --days=21
rm apps/web/.env.production.local
```

## Needs you (parallel, not blocking the above)

- **#66** confirm final-round timeline (blocker)
- Supabase **Pro** upgrade — Free tier Realtime quota is likely *why* task 1 is broken; also Free projects pause after 7 idle days
- Mobile: PWA-only, or build the Expo app? (currently PWA only, by choice)
