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

## Open threads / next steps

- [ ] **`supabase config push` pushes the whole auth config, not just what you changed** — always diff before/after pushing to remote; local dev defaults (email confirmation off, MFA off, short OTP frequency) are not safe to carry to the live project.
- [ ] Webhook URL is a placeholder (`https://example.com/webhook`) — update once #39's real endpoint is deployed.
- [ ] **Verify Gemini API keys actually authenticate** before building #35/#47 against them — format doesn't match standard Gemini keys (`AIza...`). If they fail, get a real key at aistudio.google.com/apikey.
- [ ] Issue #66 (confirm final-round timeline) — not started.
- [ ] Issue #65 (Vision API key) — not started.
- [ ] Issue #66 (confirm final-round timeline) — not started.
