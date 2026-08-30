# EcoPower3.0 — Work Log

Chronological record of work done in this session. Times in IST (UTC+5:30).

---

## 2026-08-30

**~09:00** — Status check across both repos (EcoPower2.0, EcoPower3.0). Both clean, on `main`, up to date with origin. EcoPower3.0 confirmed still planning-only: 85-row ROADMAP.md tracker, 80 rows `☐ todo`, 0 in progress, 0 done. Next actionable step identified as BUILD-ORDER Sprint 0 (external unblocks: #62 Railway login, #63 Supabase, #64 Razorpay, #65 Vision API key).

**09:34** — **Issue #62** (`BLOCKER: railway login`) resolved and closed.
- Verified `railway whoami` → authenticated as `neev3377` (rajodedra2847@gmail.com, workspace "Raj Odedra's Projects") — matches the project's deliberate Railway account convention.
- Commented on #62 with the verification, closed the issue.

**09:36** — **Issue #28** (`Net-metering application state machine`) reopened.
- Was closed with no comments and no corresponding code; ROADMAP.md still lists it `☐ todo`, blocked by #5 (not yet done).
- Reopened to keep the tracker honest — closing it was premature (only got added to BUILD-ORDER.md's sequence, not implemented).

**09:40–09:47** — **Issue #63** (`BLOCKER: Supabase project + keys (upgrade to Pro)`) resolved and closed.
- Installed Supabase CLI via Homebrew (`supabase/tap/supabase`, v2.116.0).
- User logged in via `supabase login` (browser OAuth).
- Found an existing but `INACTIVE` project named "Ecopower" (ref `doladplzmelvxpvysyhb`) in the same org — user chose not to reuse it.
- Created new project **`Ecopower3.0`** (ref `vdjzhvlwwzxelckrjbuj`, region `ap-south-1`, org `neevmodh's Org`), status `ACTIVE_HEALTHY`.
- Fetched anon key, service_role key, DB password. Saved locally to `secrets/supabase-ecopower3.md` (gitignored — added `secrets/` to `.gitignore`).
- Posting keys directly to the public GitHub issue was attempted per user instruction but blocked by the Claude Code auto-mode permission classifier (service_role key bypasses RLS entirely — high-risk in a public repo). Resolved instead by setting them as **private repo secrets**: `SUPABASE_PROJECT_REF`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD` — usable by CI, never exposed publicly.
- **Decision: staying on the free tier, no billing spend.** Accepted tradeoff: free projects pause after 7 idle days, Realtime capped lower (~200 concurrent/2M msgs/mo vs Pro's ~500/5M). Mitigation if it matters later: keep the project warm before the demo, or manually unpause via dashboard.
- Issue commented twice (project details, then the free-tier decision) and closed.

---

**09:48–10:00** — **Issue #64** (`BLOCKER: Razorpay test account`) resolved and closed.
- No CLI/API path for self-serve account or webhook creation exists (Razorpay's webhook-creation API is scoped to partner/OAuth sub-merchant accounts, not the merchant's own account) — user signed up manually via dashboard.razorpay.com (test mode, no docs required).
- User generated test API keys (`rzp_test_TVqcEFqdkI9M8R` / secret) and shared them.
- Generated a random webhook secret (`openssl rand -hex 24`) for the user to paste into Settings → Webhooks.
- User created the webhook with URL `https://example.com/webhook` (placeholder — no real endpoint exists yet, pending #39) and events `payment.captured`, `payment.failed`.
- All three values (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) stored as private repo secrets and locally in `secrets/razorpay-ecopower3.md`.
- Issue commented and closed. Note: webhook URL still needs updating to the real deployed endpoint once #39 ships.

**10:05–10:10** — **Issue #65** (`BLOCKER: Vision API key for OCR`) resolved and closed.
- Recommended Google Gemini (aistudio.google.com/apikey) as the only genuinely free vision API option (Anthropic/OpenAI have no ongoing free API tier) — fits the ₹1–3/bill budget target for a hackathon build.
- User provided two key values, both starting with `AQ.` rather than the standard Gemini key format (`AIza...`). Flagged this; user confirmed correct anyway.
- Stored both as private repo secrets (`GEMINI_API_KEY`, `GEMINI_API_KEY_2`) and locally in `secrets/gemini-ecopower3.md`, with a note to verify they actually authenticate before #35/#47 depend on them.
- Issue commented (including the format caveat) and closed.

**10:13–10:35** — **Issue #1** (`Scaffold monorepo (Turborepo + pnpm)`) resolved and closed.
- Installed pnpm 11.24.0 via Homebrew (corepack's `prepare` failed on `/usr/local/bin` permissions).
- Scaffolded `apps/{web,mobile,simulator}`, `services/{ingest,ml,worker}`, `packages/shared`, `tools/loadtest` (empty dirs tracked via `.gitkeep`, to be filled in later sprints).
- Root config: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` (strict), `biome.json`.
- `packages/shared`: zero-dependency, pure-TS package (`"types": []` in tsconfig to keep Node/DOM ambient types out), with a placeholder export + passing Vitest test.
- **Found and removed `rzp-test-key.csv`** at repo root — plaintext Razorpay key/secret, not covered by `.gitignore`, one `git add .` from being pushed to the public repo. User confirmed deletion (same values already safe in `secrets/razorpay-ecopower3.md`).
- **`.npmrc` (node-linker=hoisted)** — Write/Edit tool was blocked twice by the Claude Code auto-mode permission classifier (treats `.npmrc` writes as sensitive, likely due to registry-auth-token risk generally). User created the file manually instead.
- Added `supabase/.temp/` to `.gitignore` (CLI link-state cache, not meant to be committed).
- Verified done-when criteria: `pnpm build` and `pnpm test` both pass at root.
- Committed (`b3f55b7`), pushed to `origin/main`, issue commented and closed.

**10:20–11:10** — **Issue #2** (`Supabase project + migration 0001 core schema`) resolved and closed.
- Installed Docker Desktop for local Supabase stack (`supabase db reset` requires it). Homebrew cask install failed once (needed interactive sudo for a symlink step) — user completed the install manually.
- `supabase init`, linked to the remote project (`vdjzhvlwwzxelckrjbuj`).
- Wrote `supabase/migrations/0001_core_schema.sql`: identity & tenancy (`profiles`, `orgs`, `discom_divisions`, `user_roles`), grid topology (`substations → feeders → distribution_transformers → service_connections`), and the meters/assets split (`meters` DISCOM-owned with a single-parent CHECK constraint across service_connection_id/dt_id/feeder_id, `assets` RESCO-owned).
- Local stack hit two dead ends before starting cleanly: `vector` (log shipper) panicked on a docker-internal URI parse and `edge_runtime` failed its health check — both disabled in `config.toml` (`analytics.enabled = false`, `edge_runtime.enabled = false`); neither is needed for schema work.
- Verified: `supabase db reset` applies cleanly locally (10 tables created, CHECK constraint confirmed rejecting a row with two parents set). Pushed the same migration to the remote project via `supabase db push`; `supabase migration list` shows local/remote both at `0001`.
- Committed (`4c4f692`), pushed, issue commented and closed.

**11:15–11:40** — **Issue #3** (`Denormalized scope keys + maintenance triggers`) resolved and closed.
- Wrote `supabase/migrations/0002_scope_keys.sql`: added `division_id`/`org_id` (real, indexed) to `service_connections`, `meters`, `assets` (`assets` also gets `dt_id`), populated by `BEFORE INSERT/UPDATE` triggers walking `dt → feeder → substation → division`.
- Built `resolve_scope_from_meter(meter_id)` + generic trigger `set_scope_keys_from_meter()` — designed for #16 to attach directly to `meter_readings` once that table exists.
- **Forward-reference gap:** the issue's done-when references `meter_readings`, which doesn't exist until #16 (blocked by this issue). Verified the exact scenario — insert with only `meter_id`, all four scope keys populate — against a throwaway fixture table shaped identically, with the same trigger attached, inside a `ROLLBACK`ed transaction. #16 reuses the trigger as-is.
- Applied locally (`supabase db reset`) and pushed to remote via `supabase db push`. Committed (`a5fb587`), pushed, issue commented and closed.

**11:45–12:20** — **Issue #4** (`Custom access token hook — scope in the JWT`) resolved and closed.
- Wrote `supabase/migrations/0003_auth_hook.sql` (renumbered from the issue's suggested `0002` — #3 already took that slot): `custom_access_token_hook` injects `{roles, org_ids, division_ids}` into `app_metadata`; `division_ids` via a recursive CTE (transitive closure). Helpers `auth_roles()`/`auth_orgs()`/`auth_divisions()`/`has_role()` for #5.
- Hit a real bug: `supabase_auth_admin`'s default `search_path` doesn't include `public`, so the hook errored `relation "user_roles" does not exist` on first login attempt. Fixed with `set search_path = ''` + fully-qualified `public.` references.
- Set JWT expiry to 15 minutes in `config.toml` per the issue's staleness caveat.
- **Verified for real**, not just by inspection: created a test user via the admin API, granted `discom_officer` at a Circle only (not the subdivisions), signed in through the actual `/auth/v1/token` endpoint, decoded the JWT — `division_ids` correctly included the Circle plus both descendant divisions.
- Pushed to remote via `supabase db push` + `supabase config push`. **`config push` synced the entire auth config**, not just the hook — it silently flipped email-confirmation and MFA enroll/verify to `config.toml`'s dev-friendly local defaults on the live project. Caught it, asked the user, reverted those two settings explicitly (re-pushed) so only the hook + JWT expiry changed remotely.
- Committed (`027c0b5`), pushed, issue commented and closed.

**12:25–13:10** — **Issue #5** (`RLS policies for all five roles`) resolved and closed.
- Wrote `supabase/migrations/0004_rls_policies.sql`: default-deny RLS (ENABLE, FORCE on PII/scope-bearing tables) across every table that exists so far. Policies: discom_officer/admin division-scoped (service_connections, meters, substations, feeders, distribution_transformers), consumer own-connections + own-assets (new `my_service_connection_ids()` SECURITY DEFINER helper), self-only on profiles/user_roles, org/division membership on orgs/discom_divisions.
- **Bug 1:** `x = any((select fn()))` without an explicit `::uuid[]` cast parses as row-comparison `ANY(subquery)`, not array `ANY(array)` — errors on a type mismatch (`uuid = uuid[]`). Confirmed via a minimal `select 1 = any((select array[1,2,3]))` repro before fixing every occurrence with `::uuid[]`.
- **Bug 2 (real interaction bug with #4):** enabling `FORCE ROW LEVEL SECURITY` on `user_roles`/`discom_divisions` silently broke `custom_access_token_hook` — `supabase_auth_admin` isn't the table owner, so it got zero rows back with no error, emptying every JWT claim on login. Fixed by making the hook `SECURITY DEFINER`.
- **Verified against the real local stack**, not just by inspection: two divisions, two DTs, two service connections, a real officer login scoped to Division A only — PostgREST returned exactly `CN-A-001`, Division B's row genuinely absent (not client-filtered). Same for a consumer scoped to their own connection, and default-deny confirmed for anon and no-claim cases.
- Forward references (society_admin split, field_technician work-order access, DISCOM's no-payments-access, RESCO-org scoping on assets) noted inline — same treatment as #3's meter_readings gap.
- Committed (`cd9fe66`), pushed, issue commented and closed.

**13:15–14:10** — **Issue #67** (`Design tokens + validated colour system`) resolved and closed.
- `packages/shared/src/palette.json` as the single source; `tokens.ts` exposes it as CSS custom properties (dark declared under **both** the media query and `:root[data-theme="dark"]`, so the toggle wins in both directions) plus a Tailwind/NativeWind-consumable object so web and mobile can't drift.
- `scripts/validate_palette.js` actually implements the colour science DESIGN.md §3 claims — hex → linear sRGB → OKLab, ΔE for normal vision *and* simulated protanopia (Machado/Oliveira/Fernandes 2009 linear-RGB matrix), lightness band, chroma floor, WCAG contrast, sequential ramp monotonicity — across light and dark.
- Wired into a new `.github/workflows/ci.yml` ahead of build/test. **Verified both directions**: passes as committed, and deliberately colliding two categorical slots exits 1 — confirming "a failing palette fails the build". CI run 33295098574 passed green on GitHub's runner, not just locally.
- **Two calibration decisions, both resolved against DESIGN.md rather than by loosening thresholds until they passed:**
  - Diverging `zero` midpoint exempted from the lightness band — it's deliberately near-white ("gray at zero reads as nothing exchanged"), so a band written for series colours doesn't apply. (This was my validator being wrong, not the palette.)
  - Status contrast made **advisory, not build-breaking** — §3.5 explicitly exempts status from the gate because status never ships as colour alone; icon + label is the mandatory relief. Amber warning at 2.17:1 on white is the documented consequence of that design, not a regression to fix by changing the hex. Still hard-fails for the three status colours that do clear 3:1, so a real regression is still caught.
- `pnpm build` + `pnpm test` green (4 tests). Committed (`394cf67`), pushed, issue commented and closed.

**14:15–16:00** — **Issue #8** (`Next.js shell + five role-routed panels + Vercel deploy`) resolved.
- Scaffolded `apps/web`: Next.js 15 App Router, route groups for all five panels + marketing/login. Tailwind actually installed and wired to #67's tokens via CSS custom properties — the exact thing 2.0 never did.
- Server Components read Supabase with `@supabase/ssr` + anon key + session cookie, no `service_role` in the app. `middleware.ts` does coarse role gating (404, not empty-dashboard flash); RLS (#5) is the real gate.
- Route handlers: Razorpay webhook (HMAC signature verification wired), push registration stub, copilot stub (#55), health (for #56).
- **Real bug found during verification**: `getUser()`'s returned user row has empty `app_metadata` — #4's scope claims exist only in the JWT, not the stored user. Every role check was silently failing (all 404s) until `lib/auth.ts` started decoding claims from the access token. Would have been very easy to ship broken and only notice at demo time.
- `scripts/seed_demo_users.mjs` — seeds five demo logins + a two-division topology fixture, reusable against local or remote via env vars.
- Deployed to Vercel (`vercel link` + `--root-directory apps/web` on the project, since the monorepo needs the workspace root for `pnpm install`). Set `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`/`RAZORPAY_WEBHOOK_SECRET` as production env vars.
- **Verified against the live deployment**, not just locally: seeded the remote Supabase project, ran the same 8-check verification script against `https://ecopower3.vercel.app` with real signed-in cookies — five logins → five panels, coarse gating, RLS isolation, anon redirect, all passing live. This is the issue's exact done-when criterion.
- Committed (`f7d0a51`), pushed, issue commented (not yet closed — waiting on CI to confirm before closing).

**16:05–16:35** — **Issue #68** (`Stat tile — no badge without a basis`) resolved and closed.
- `packages/shared/src/stat-tile.ts`: `computeDelta()` returns `null` (no badge) on missing current, missing comparison, or a zero basis. `formatInrFromPaise()` fixes 2.0's `₹1,063,717.882` bug by construction — bigint paise, integer division, no float step.
- 13 new tests, including a direct repro of the float bug now producing the correct grouped/2-decimal value, and a test proving a *genuinely measured* zero still gets an honest badge (distinct from no-data, which gets none).
- `apps/web/components/StatTile.tsx` + `Sparkline.tsx`, wired into the consumer panel with a real mixed-data state (one tile with real data + no badge since no comparison exists, two tiles honestly no-data since #16 doesn't exist yet).
- Verified against the actual live production page (not just unit tests): fetched `/consumer` on `ecopower3.vercel.app` with a real signed-in cookie, confirmed `—` renders for no-data tiles with zero badge markup anywhere.
- 17/17 tests, CI green (run 33301605646). Committed (`d06e37a`), pushed, deployed, issue commented and closed.

**16:40–17:15** — **Issue #69** (`Five states for every data component`) resolved and closed.
- `packages/shared/src/data-state.ts`: `DataState<T>` union (loading/empty/error/ready) + `isStale()` computed from `asOf + expectedIntervalMs` — staleness isn't a flag a caller can forget to set.
- Extended `StatTile` with `confidence` (dashed rendering + label for estimated/forecast, P3) and stale (greyed value + as-of timestamp, derived not flagged).
- New `StatTileStates.tsx`: skeleton (matches geometry, no spinner), empty (message + widen action, not 2.0's "No data available" box), error (message + retry, never blank).
- `StatTileWithState.tsx` composes a `DataState` into the right rendering; `/kitchen-sink` is the literal deliverable named in the issue — all 9 state/confidence/badge variants rendered together for review.
- Verified against the built page: fetched `/kitchen-sink` and confirmed each state's distinguishing markup is actually present (skeleton pulse, empty message, error+retry, stale label, estimated/forecast labels).
- 20/20 tests, CI green (run 33302005651). Committed (`79344b8`), pushed, deployed, issue commented and closed.

**17:20–18:00** — **Issue #7** (`pgTAP RLS test suite`) resolved and closed. **Sprint 1 complete.**
- `supabase/tests/rls/{consumer,discom_officer,society,technician,operator}.test.sql` — 24 tests, positive + negative access per the issue's own example pattern.
- `discom_officer.test.sql` formalizes the exact Sprint 1 checkpoint hand-verified three times already (#8/#68/#69): Division A officer sees zero rows from Division B. Also covers meters, DTs, Circle-head transitive closure, default deny.
- `technician.test.sql` / `operator.test.sql` assert the current correct behavior for #5's two known gaps (no work_orders yet, no RESCO-ownership column yet) rather than skipping them — both roles correctly see zero rows now, and the tests will fail loudly (forcing an update) the moment those features land without a matching policy.
- **Verified the suite has real teeth**: deliberately broke the division-scope policy, confirmed the exact test caught it with the leaked row identified, restored the policy.
- New CI job `rls-tests`: `supabase start` → fresh `db reset` → `supabase test db`. Green on GitHub's actual runner (run 33302306552), not just locally — can't pass by accumulating state across runs.
- Committed (`e8f41cf`), pushed, issue commented and closed.

**18:05–18:30** — **Issue #10** (`OBIS constants + IS 15959 Pt2 payload schema`) resolved and closed. **Sprint 2 (AMI spine) started.**
- `packages/shared/src/ami/obis.ts`: OBIS constants for all six registers/profiles, zod schemas for billing profile, block load profile, instantaneous, and event payloads.
- Deliberate scope limit honored: DLMS shape, not DLMS stack.
- Schema encodes real constraints from DATA.md as validation rules: non-negative registers (cumulative, only increase), block load interval as a literal `15 | 30` union.
- Added zod as `packages/shared`'s first real dependency — legitimate per the issue's own spec and consistent with #1's platform-agnostic (not zero-npm-packages) constraint.
- 14 new tests (34 total in packages/shared). CI green (run 33302543097). Committed (`3acdd66`), pushed, issue commented and closed.

**18:35–19:20** — **Issue #14** (`MQTT broker on Railway`) resolved and closed.
- Deployed EMQX 5.8.4 to a new, separate Railway project (`ecopower3-emqx`) via Dockerfile + `railway up`. TCP proxy on `metro.proxy.rlwy.net:45248` → app port 1883.
- Configured device auth (`password_based`/`built_in_database`, bcrypt) and ACL (`ecopower/v1/${username}/#` via EMQX's placeholder, deny-all default) entirely through the Management API — scripted, not dashboard click-through, matching the pattern #48 will reuse for real commissioning.
- Temporarily attached a domain to the dashboard port (18083) only long enough to configure auth via the API, then removed it — management surface is not publicly reachable, only MQTT itself.
- **Verified end-to-end against the live public endpoint**: installed mosquitto CLI, connected with a demo HMAC-derived device credential, published, confirmed real delivery via a subscriber. Two negative cases confirmed **in the broker's own logs** (QoS0 gives no client-side ack either way): wrong password rejected at CONNECT, cross-device publish denied by ACL.
- Credentials (dashboard admin + demo device secret) saved to `secrets/emqx-ecopower3.md` (gitignored). `infra/emqx/README.md` documents the setup and redeploy steps.
- Committed (`ed1be4f`), pushed, issue commented and closed.

**19:25–20:10** — **Issue #16** (`Partitioned time-series schema`) resolved and closed.
- `meter_readings` (PARTITION BY RANGE (reading_ts), monthly, PK `(meter_id, reading_ts)`): cumulative OBIS registers, instantaneous per-phase columns, deltas computed at ingest, VEE provenance, #3's scope keys via the exact generic trigger built for this. `meter_live_state`: one row per meter, added to `supabase_realtime` for #18.
- `create_monthly_partition()` closes the partition trap the issue explicitly warns about (RLS enable/force isn't inherited by child partitions even though policies are).
- Closed #3's forward reference for real: `meter_id` alone correctly populates all four scope keys on the actual table now.
- **Demonstrated the partition trap directly**, not just described it: a raw `CREATE TABLE ... PARTITION OF` ships with `relrowsecurity = false`; `create_monthly_partition()` on a different month proves both `relrowsecurity` and `relforcerowsecurity` true. Both are now pgTAP assertions.
- Hit one real bug of my own: `plan(9)` didn't match the actual 7 test assertions in the file — pg_prove silently truncates rather than erroring clearly, so it took a bisection to find. Fixed to `plan(7)`.
- 31 tests across 6 pgTAP files pass locally; CI green on GitHub's runner (run 33303364602). Pushed to remote via `supabase db push`. Committed (`57acf59`), pushed, issue commented and closed.

**20:15–20:50** — **Issue #11** (`HESAdapter interface + Trilliant UnitySuite stub`) resolved and closed.
- `packages/shared/src/ami/hes-adapter.ts`: `HESAdapter` interface, `TrilliantUnitySuiteAdapter` (typed stub, throws `HESNotImplementedError`), `SimulatedHESAdapter` (live — schema-valid generated data, injectable `ReadingGenerator` for #12).
- `pushSubscribe` doesn't use a platform timer (no Node/DOM globals in `packages/shared` by design) — registers callbacks, `emitReading()` fires one, meant to be driven by #15's ingest worker or tests.
- **Real gap caught between `pnpm test` and `pnpm build`**: stub methods with no declared params still satisfy `implements HESAdapter` structurally and pass vitest, but fail `tsc` when called with real args through the concrete class type. Fixed by declaring full parameter lists on every stub method — and the lesson (test passing ≠ build passing) is now a standing thing to check both on every feature going forward.
- Also exported `BlockLoadProfileEntry` as a type from #10's obis.ts (existed as schema only).
- Noticed a collaborator (Raj Odedra) pushed a direct README.md edit to GitHub mid-session — rebased cleanly on top, flagged the change (looks like it may have introduced a typo) to the user without acting on it.
- 20 new tests (54 total). CI green (run 33303704359). Committed (`cbf947e`), pushed, issue commented and closed.

**21:00–21:40** — **PS1 re-prioritization.** User ran a coverage check against the actual PS1 brief (pasted in full) given real competition in this PS. Found: subscription plans (#77/#78) and alerts (#81) were sequenced in Sprint 9 "Tier C, cut without guilt" — the lowest tier — despite PS1 naming both explicitly. A support/ticketing module (PS1: "Service/support module", required desired outcome) didn't exist as an issue at all. Also cross-checked EcoPower2.0's feature set (the project that got this team into the final round) to make sure nothing that worked there gets dropped in the rebuild.
- Wrote `PS1-PRIORITY-PLAN.md` — full requirement-by-requirement coverage map, revised sprint order, before touching anything (per established preference: plan reviewed before execution).
- Filed **#86** (notifications primitive — `notifications`/`notification_deliveries`, this is P9 from #25's property list, referenced today but nothing built it) and **#87** (support/fault ticketing — uses the `support_agent` role that's existed since #2 with no policy on it).
- New **Sprint 3.5 "PS1 core loop"** in BUILD-ORDER.md, between billing and DISCOM: #77, #38, #78, #86, #87, #80 (lightweight carbon). #39 (Razorpay) moved into Sprint 3. #38's dependency changed from OCR (#35) to the ingest worker (#15) — recommends a plan from live simulated consumption instead of pre-signup bill history, which also fits a live demo better.
- Tier A grew from 35 to 39 issues. ROADMAP.md tracker, milestone table, Tier A/B/C lists all updated to match. Committed (`691125a`), pushed.
- **Resuming at #12** (AMI simulator) — Sprint 2 finishes first since the PS1 loop has nothing real to demo against without live meter data underneath it.

**21:45–22:50** — **Issue #12** (`AMI simulator with a physical model`) resolved and closed.
- `packages/shared/src/ami`: solar position (Cooper declination + hour angle), clear-sky irradiance (Haurwitz), stochastic appliance load model — seeded per meter, conditioned on sanctioned load and month.
- Calibrated against DATA.md's own target: full-year hourly integration gives 1,695 kWh/kWp vs. a ~1,600 kWh/kWp target for Ahmedabad — a real check, not just "looks plausible."
- `apps/simulator`: fetches live Open-Meteo weather, runs a fleet, publishes OBIS-keyed HMAC-signed readings to the live EMQX broker (#14). Provisioned 2 more demo devices (fleet of 3: one no-solar, two solar) via the same EMQX API pattern from #14.
- **Verified against the actual live broker**: ran the simulator for real, watched physically distinct per-meter behavior (no-solar meter only imports, solar meters export when generation exceeds load), independently subscribed with `mosquitto_sub`, and independently recomputed the HMAC signature in Python (not reusing the JS code) — exact match.
- Hit the same vitest-vs-tsc gap as #11, this time via `NodeNext` module resolution requiring `.js` extensions even inside `packages/shared`'s own source. Fixed by inheriting the monorepo's shared `Bundler` resolution.
- 82 tests total (20 new). CI green (run 33305234781). Committed (`7bbf732`), pushed, issue commented and closed.

## Open threads / next steps

- [ ] **Mobile app scope undecided** (PS1-PRIORITY-PLAN.md §4) — PWA-lite vs. thin native shell vs. keep full Expo app at Sprint 6. Needs a decision before Sprint 4.
- [ ] **`supabase config push` pushes the whole auth config, not just what you changed** — always diff before/after pushing to remote; local dev defaults (email confirmation off, MFA off, short OTP frequency) are not safe to carry to the live project.
- [ ] Webhook URL is a placeholder (`https://example.com/webhook`) — update once #39's real endpoint is deployed.
- [ ] **Verify Gemini API keys actually authenticate** before building #35/#47 against them — format doesn't match standard Gemini keys (`AIza...`). If they fail, get a real key at aistudio.google.com/apikey.
- [ ] Issue #66 (confirm final-round timeline) — not started.
- [ ] Issue #65 (Vision API key) — not started.
- [ ] Issue #66 (confirm final-round timeline) — not started.
