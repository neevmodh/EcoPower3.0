# Scale / load testing (#57, #58)

**Status: the generator has now been run for real — 1.44M rows locally,
`supabase/tests/perf/2026-09-27-local.txt` — proving the InitPlan idiom and
partition pruning both work as designed. Full 10M+ scale against a real
deployed target, and the k6 throughput scenarios (§4), still need a live
target (a real Supabase project, real credentials) that wasn't available in
the session that wrote this.** Do the real-scale run by hand before quoting
an absolute latency number in the pitch — the local run's own honest caveat
about its own small `shared_buffers` is exactly why. Don't present a
projected number as a measured one.

## 1. Seed real volume

`seed_scale_readings(p_meter_count, p_days)` (`0042_scale_seed.sql`) is a
set-based generator — one `INSERT ... SELECT` over `generate_series`, not a
row-at-a-time loop — so it can actually produce millions of rows in a
reasonable wall-clock time. It's dormant: no migration calls it, so a normal
`supabase db reset` (including in CI) never touches it.

```bash
# Against a target you're willing to fill with ~10M synthetic rows —
# a scratch/staging project, not your seeded demo project, unless you're
# prepared to drop the LOADTEST- rows afterward.
psql "$DATABASE_URL" -c "select seed_scale_readings(4800, 90);"   -- ~10.37M rows, defaults
```

Bigger or smaller: `select seed_scale_readings(<meters>, <days>);` — rows =
`meters * days * 24`. Re-running is a no-op once `LOADTEST-` meters exist
(drop them first to reseed: `delete from meters where serial like 'LOADTEST-%'`
cascades via FK).

## 2. Capture real query timings

Once seeded, run `EXPLAIN (ANALYZE, BUFFERS)` on the queries the DISCOM panel
actually issues, as the `authenticated` role with real claims — not as the
table owner, which bypasses RLS and would understate the real cost:

```bash
node tools/loadtest/capture_explain.mjs > supabase/tests/perf/<date>.txt
# DATABASE_URL / ORG_ID / DIVISION_ID env vars point it at a real target's
# own discom_officer org/division instead of the LOADTEST- fixture's.
```

`supabase/tests/perf/2026-09-27-local.txt` is a first real run, done locally
— read its own caveat section before trusting its absolute numbers past
"the mechanism works."

## 3. The extrapolation (do this after step 2, with real numbers)

ROADMAP.md §5 has the arithmetic shape:

> 20M meters at a 15-minute block interval = 96 reads/day each ≈ 1.92B rows/day
> ≈ 22,000 rows/s sustained. Report what the ingest worker (#15) actually
> sustains on 1 vCPU, then extrapolate the worker count, not the other way
> around.

## 4. k6 (#57) — not built

No `tools/loadtest/*.js` k6 scripts exist yet. Building one blind (no live
URL to point it at) risks shipping something that's never actually been run —
worse than not having it. Write it against a real staging deployment, so the
first time it runs is also the first time its numbers are real.
