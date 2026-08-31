# HANDOFF — read this first

Written for whichever AI assistant (or human) picks this project up next. The author (Claude, Anthropic) ran out of usable session budget on this account — this file exists so nothing has to be re-discovered from scratch. Everything in here was true and verified as of **2026-08-31**.

If you only read one section, read [Reality check](#reality-check-what-actually-works) and [How to run this locally](#how-to-run-this-locally).

---

## What this is

**EcoPower 3.0** — an Energy-as-a-Service platform for Indian DISCOMs (electricity distribution utilities), built for the final round of **INSTINCT 4.0** (a hackathon run by IntelliSmart Infra / EESL+NIIF, with The Energy Society, IIT Delhi). It's a from-scratch rewrite of a prior entry (`EcoPower2.0`, at `/Users/neev/Downloads/Ecopower/EcoPower2.0` on this machine) — not an iteration, a deliberate greenfield redo. The reasons are in `ROADMAP.md §2` and `DESIGN.md §1`, and boil down to: 2.0 had decorative UI that outlived its data (fake `+12%` badges over `0.0 kWh`), no real RLS, and a mocked payment flow. 3.0's entire design philosophy is the inverse of that — see `DESIGN.md` principle P1: **"no component may outlive its data."**

Repo root: `/Users/neev/Downloads/Ecopower/EcoPower3.0`. Monorepo, pnpm workspaces + Turborepo. GitHub: `neevmodh/EcoPower3.0` (also check for `neev3377` — see [Identity gotcha](#identity-gotcha)). Live at a Vercel deployment tied to project `ecopower3` under `neevs-projects-324ae932`.

---

## Reality check: what actually works

The docs in this repo (`README.md`, `ROADMAP.md`, `BUILD-ORDER.md`) describe an ambitious five-problem-statement, multi-service architecture (web + mobile + ML anomaly detection + OCR + load testing). **Most of that is aspirational scaffolding, not built code.** Don't take the README's architecture table at face value — here's what's actually real as of this handoff:

| Path | Status |
|---|---|
| `apps/web` | **Real, working, deployed.** Next.js 15 App Router. This is 95% of what exists. |
| `apps/simulator` | **Real.** Publishes physically-modelled AMI readings (solar yield + household load models) over MQTT. |
| `services/ingest` | **Real.** MQTT subscriber → validates HMAC + register monotonicity → writes to partitioned Postgres. |
| `packages/shared` | **Real.** Tariff engine, OBIS helpers, validated colour palette. Zero-dependency TS, imported by web + scripts. |
| `supabase/` | **Real.** 21 migrations, RLS on every table, a pgTAP suite (103 assertions, all passing) run in CI. |
| `apps/mobile` | **Empty.** Just a `.gitkeep`. No Expo app exists despite what README's table implies. |
| `services/ml` | **Empty.** No FastAPI/forecasting/OCR/anomaly-detection service exists. |
| `services/worker` | **Empty.** No BullMQ job runner exists. |
| `tools/loadtest` | **Empty.** No k6 scripts exist. |

So in practice: **this is a Next.js web app with a real Postgres/RLS backend and a real MQTT telemetry pipeline feeding it.** Five *panels* exist inside that one web app (Consumer, Society, DISCOM, Operator, Field), gated by role via middleware + enforced for real by RLS — not five separate apps. There is no mobile app, no ML service, no background job worker. If asked to "add OCR" or "build the mobile app," that's new work from zero, not wiring up something half-built.

GitHub issue tracker: 85 issues total, **31 closed, 56 still open** (`gh issue list --state open`). The closed ones are the real, verified work; the open ones are the aspirational remainder (mobile, ML, i18n, WhatsApp/SMS delivery, k6 load testing, etc.) — see `ROADMAP.md` for the full tracker table, it's the single source of truth for what's tracked as an issue.

---

## How to run this locally

```bash
cd /Users/neev/Downloads/Ecopower/EcoPower3.0
pnpm install                      # from repo root, installs all workspaces

# Local Supabase (Postgres + Auth + Realtime), via Docker
supabase start                    # first time; supabase status if already running
supabase db reset                 # applies all 21 migrations + resets to clean state

# Seed demo data (run in this order — each is additive/idempotent)
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local anon/service key from `supabase status`> \
  node scripts/seed_demo_users.mjs
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<same> \
  services/ingest/node_modules/.bin/tsx scripts/seed_discom_fleet.mjs
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<same> \
  services/ingest/node_modules/.bin/tsx scripts/seed_society_units.mjs

# Run the web app
cd apps/web
pnpm dev                          # http://localhost:3000

# Run the RLS test suite (do this after any migration change)
cd /Users/neev/Downloads/Ecopower/EcoPower3.0
supabase test db                  # expect 103/103 passing

# Typecheck (there's no configured lint — `next lint` prompts interactively and was never set up)
cd apps/web && pnpm exec tsc --noEmit -p .
```

**Local service-role key**: `supabase status` prints a fixed local dev key (`SERVICE_ROLE_KEY`), safe to hardcode for local scripts — it's not a secret, it's the same well-known key every Supabase local dev stack uses. Do not confuse it with the **production** service-role key (see [Credentials](#credentials--secrets)).

**Login**: `http://localhost:3000/login` has one-click demo account buttons — no password typing needed for local dev. Six roles: Consumer, Society admin, DISCOM officer, Operator (RESCO), Field technician, Support agent. Password for all, if you ever need it directly: `EcoPower!2026`.

**Gotcha**: every `supabase db reset` invalidates existing browser session cookies (new user UUIDs get generated). Sign out and use the login page's demo buttons again after any reset — don't assume a session survives a reset.

---

## Architecture principles worth knowing before touching code

These aren't optional style points — code review in this repo has consistently enforced them:

1. **RLS is the actual authorization boundary, never the UI.** Every table has `enable row level security` + `force row level security`. Middleware role-gating (`apps/web/lib/supabase/middleware.ts`) exists only to redirect a wrong-role user to a friendly 404 before the empty-RLS-result flash — it is explicitly documented as *not* the real gate. When adding a new feature, write the RLS policy and a pgTAP test for it before or alongside the UI.
2. **Money is `bigint` paise. Energy is `bigint` milli-kWh internally where it matters (billing), `numeric` for raw meter reads.** Never float for currency.
3. **Denormalized scope keys.** Every RLS-scoped table carries its own `dt_id`/`division_id`/`org_id` (or `resco_org_id`/`society_org_id` for ownership-based tables), populated by a `before insert or update` trigger, not computed via a join at query time. See `supabase/migrations/0002_scope_keys.sql` for the pattern and `resolve_scope_from_dt()`/`resolve_scope_from_meter()`.
4. **Aggregate in SQL, not in JS.** PostgREST caps a `.select()` at 1000 rows by default. Twice in this project, a page that summed raw rows client-side after `.select().in()` silently under-reported once the row count exceeded that cap (found live both times, not by tests). The fix pattern is a `security invoker` SQL function (e.g. `dt_loss_summary()`, `society_unit_consumption()`) that does the `sum()`/`group by` server-side — RLS still applies inside the function body since it's invoker-mode, so it's not a security bypass.
5. **`security definer` functions that set `search_path=''` must not call other helper functions** like `has_role()`/`auth_orgs()` — Postgres inlines simple SQL functions, and the inlined body executes under the *caller's* `search_path`, not its own, so an unqualified reference inside the callee (e.g. `has_role()`'s own call to `auth_roles()`) fails to resolve. Read `auth.jwt()` directly instead. This bit `my_society_unit_ids()` in `0020_society_units.sql` — read the comment there for the full story if it recurs.
6. **UUIDs in seed scripts are manually constructed** (`30000000-0000-0000-0000-0000xxxxxxxx` patterns) for reproducibility across reruns — **hex digits only** (0-9, a-f). This has been a recurring self-inflicted bug (using `g`/`m`/`p`/`s` by mistake) — if a seed script throws a Postgres UUID parse error, check this first.
7. **Every billing/notification-generating action needs `packages/shared`'s tariff engine or a real DB trigger, never a hardcoded number.** DESIGN.md P1 ("no component may outlive its data") is enforced in code review, not just prose — a stat tile or badge must derive from real comparison data or not render at all.
8. **`next lint` was never configured** — running it prompts interactively for ESLint setup. Don't run it expecting a working lint pass; use `tsc --noEmit` as the correctness bar, matching what CI actually checks (`.github/workflows/*.yml` runs `pnpm validate:palette`, `pnpm build`, `pnpm test`, and `supabase test db` — no lint step).

---

## Design system (see `DESIGN.md` for the full spec)

- **Palette**: validated at `packages/shared/src/palette.json`, checked by `scripts/validate_palette.js` in CI for CVD-safety (OKLab distance). Categorical: generation=amber, consumption=blue, third=green. Never invent a new raw hex colour for a data series — derive from these tokens via `color-mix()` if you need a variant.
- **Theme**: light green/white is the forced default for every visitor (no `prefers-color-scheme` auto-dark). Dark values exist in `:root[data-theme="dark"]` for a future toggle that doesn't exist yet in the UI.
- **Shadows/radius** (as of the most recent session): cards use `rounded-card` (16px) + either `.card-lift` (hover-responsive, for standalone tiles) or `.card-shadow` (resting only, for rows inside dense lists/tables) — both defined in `apps/web/app/globals.css`. The **page frame** (nav rail, header, `<main>` background) stays flat — no shadow, no wash — that boundary is deliberate and documented in `DESIGN.md §5`'s dated update notes. The landing-page hero is the one surface allowed a soft gradient wash (`.hero-wash`), carried forward from the predecessor's composition per `DESIGN.md §8`.
- **Panel identity** lives in the nav rail + header chip only (a 3px accent bar, a coloured badge) — never in the data/chart area, so charts read the same across all five panels.

---

## What the most recent extended session actually did (chronological, terse)

Full blow-by-blow is in `WORKLOG.md` (50KB, exhaustive) — this is the compressed version:

1. Closed a batch of PS1-gate issues with the verification discipline described above (real fixtures, pgTAP, live browser checks, CI green, push to remote).
2. Built out DISCOM and Operator panels for real (multi-DT loss map, RESCO asset fleet) — found and fixed a genuine RLS gap where `assets.org_id` was being confused for RESCO ownership when it's actually a DISCOM-topology-derived scope key (`resco_org_id` is the real ownership column, added in `0018_resco_operator_rls.sql`).
3. **UI-fidelity pass**: re-read the predecessor's (`EcoPower2.0`) actual source rather than just its live site, corrected an earlier over-broad "no shadow anywhere" design rule, extended real shadow/hover tokens to dashboard cards (see design system section above).
4. **PS1 gap audit**: re-read the literal problem statement text against the running app and closed five real gaps — each with working code + RLS + pgTAP + live verification, not just declared:
   - Outage/status/payment/subscription notifications (`0019_workflows.sql` — real triggers + a `pg_cron` job scanning `meters.last_seen_at` for staleness)
   - Field panel work orders (was a permanent "table doesn't exist yet" stub — now a real claim/start/complete/cancel workflow)
   - Net-metering approval (issue #28 — reopened once already for being closed with no code; now a real DISCOM approve/reject state machine)
   - Support agent queue (the role had RLS access since early on but literally no UI and no demo login — both added)
   - Annual / pay-as-you-go billing cycles (`plans.billing_cycle`, a real zero-base-fee PAYG plan)
   - A real installable PWA (`app/manifest.ts`, `next/og`-generated icon, minimal service worker) as the honest answer to "mobile channel" — explicitly not pretending a native app exists
5. **Society panel**: found this was the least-real page in the app (roles existed since the first migration with zero RLS granting them anything, page queried the wrong table, linked to two nonexistent routes). Built for real: unit ownership model, admin/member visibility split, three working pages (Overview/Units/editable Allocation), physically-modelled demo data.
6. Two real production-grade bugs found by **looking at the actual rendered numbers**, not by trusting a green build — see architecture principles #4 and #5 above.

All of the above: 103 pgTAP assertions passing, CI green on every push, migrations pushed to remote Supabase, code pushed to `main` on GitHub.

**Not yet done**: the demo seed data for the newest tables (`work_orders`, `netmetering_applications`, `support_tickets`, the 6 society units) exists **locally** but was never pushed to the **production** Supabase project — the production service-role key wasn't accessible in that session's sandboxed shell (the harness's permission classifier correctly blocked routing around that; see next section for how to actually do it).

---

## Credentials & secrets

**Never put actual secret values in this file or in git.** Locations only:

- `secrets/*.md` — four files (`supabase-ecopower3.md`, `razorpay-ecopower3.md`, `emqx-ecopower3.md`, `gemini-ecopower3.md`) at repo root, presumably gitignored or private — check before assuming they're safe to read into a shared context.
- **Vercel** holds the real production env vars: `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`. To pull them locally (only when you actually need to act against production — e.g. to seed the missing remote demo data mentioned above):
  ```bash
  cd apps/web
  vercel link --yes --project ecopower3          # one-time
  vercel env pull .env.production.local --environment=production --yes
  # then, to seed remote demo data:
  set -a && source .env.production.local && set +a
  SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    node ../../scripts/seed_demo_users.mjs
  # then seed_discom_fleet.mjs and seed_society_units.mjs the same way (via tsx, see "How to run" above)
  rm .env.production.local   # don't leave production secrets sitting on disk
  ```
  **If you're an AI agent with a permission classifier**: piping a pulled production service-role key through a script is exactly the kind of action such a classifier is built to block, and it did, correctly, in the prior session. Don't try to route around a block like that — surface the exact commands to the human instead, like this section does.
- **Supabase project ref**: `vdjzhvlwwzxelckrjbuj` (remote/production). Local dev uses Docker via `supabase start`, entirely separate.
- **Gemini API key gotcha** (flagged, unresolved as of last check): the configured key's format didn't match standard Gemini keys (`AIza...`) — verify it actually authenticates before building anything new against it. Get a fresh one at aistudio.google.com/apikey if it doesn't.
- **Gemini model gotcha**: `gemini-3.6-flash` is a reasoning model that silently burns hundreds of "thinking" tokens against `maxOutputTokens`, truncating short answers to fragments. The AI features in this app (`apps/web/lib/ai/`) use `gemini-3.5-flash-lite` instead — deliberately, not by oversight. Don't "upgrade" the model without checking output actually completes.
- **Razorpay**: test-mode keys only. Webhook URL in Razorpay's dashboard was still the placeholder `https://example.com/webhook` as of last check — needs updating to the real deployed `/api/webhooks/razorpay` endpoint for webhook-driven payment confirmation to work end-to-end in production.

### Identity gotcha

Three GitHub-adjacent accounts have been in play this project. Use the **`neevmodh`** GitHub account/email for commits — the wrong one silently misattributes commit authorship. **Railway** deliberately uses a *different* account (`neev3377`) — that's intentional, not a mistake to "fix."

---

## Immediate next steps, roughly prioritized

1. **Seed the missing production demo data** (see Credentials section) — quick, unblocks a live demo of the newest features (work orders, net-metering, support queue, society units) on the deployed URL, not just localhost.
2. **Mobile app scope decision** — still explicitly undecided (`PS1-PRIORITY-PLAN.md §4` flagged this early, never resolved). A PWA now exists as the practical middle ground (installable, real manifest+icon+SW) but no decision has been made on whether a thin native shell or full Expo app is worth building given remaining time. Don't start `apps/mobile` without this decision being made first — it's currently empty by choice, not by oversight.
3. **Razorpay webhook URL** — update from the placeholder once there's a stable production URL to point it at.
4. **Confirm the Gemini API key actually authenticates** before building anything else on top of it (issues #35/#47 in the tracker depend on this).
5. **Issue #66 ("BLOCKER: Confirm final-round timeline")** — open, marked `blocker`, needs a human answer about the actual competition schedule, not something to resolve in code.
6. Beyond that: `ROADMAP.md`'s tracker table is the prioritized backlog (Tier A/B/C ship order) — 56 open issues, spanning i18n, WhatsApp/SMS delivery, the ML anomaly/forecast/OCR services, k6 load testing, and the demo runbook. Read `BUILD-ORDER.md` before picking one — it explicitly sequences AMI spine + billing correctness *before* UI polish and payments, on the reasoning that "at 60% complete the project should have the 60% the jury cares about."

---

## Where to find deeper detail

| File | What's in it |
|---|---|
| `WORKLOG.md` | Full chronological log of every session, every bug found and fixed, every verification step taken. Exhaustive — read this if you need the *why* behind a specific decision that this handoff compressed away. |
| `ROADMAP.md` | The 85-issue tracker table, milestone-by-milestone, matches GitHub issue numbers exactly. |
| `BUILD-ORDER.md` | The sequencing plan — start here for "what should I work on next and why in this order." |
| `DESIGN.md` | Full design system spec: palette math, chart rules, component states, accessibility, panel identity. Has dated "Update" notes where rules were later revised — read those, not just the original text, for the current rule. |
| `DATA.md` | What data is real vs. synthetic, and the citation for every synthetic parameter (AT&C loss rates, tariff structure, seasonal solar/load shape, etc.) — the honesty discipline this whole project is built around. |
| `PS1-PRIORITY-PLAN.md` | The original triage of what to build first against the literal problem-statement text. |

If you're picking this up cold: skim this file, skim `BUILD-ORDER.md`, then go work. Don't read all 50KB of `WORKLOG.md` up front — search it for a specific topic when you need the history behind something you're touching.
