# Scale / load testing (#57, #58)

**Status: the generator exists and is pgTAP-verified at small scale; nobody
has run it at real scale yet, and no k6 scripts exist.** Both need a live
target (a real Supabase project, real credentials) that wasn't available in
the session that wrote this — do this by hand before quoting a number in the
pitch. Don't present a projected number as a measured one.

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

```sql
set role authenticated;
set request.jwt.claims = '{"sub":"...","role":"authenticated","app_metadata":{"roles":["discom_officer"],"org_ids":["99000000-0000-0000-0000-000000000001"],"division_ids":["99000000-0000-0000-0000-000000000002"]}}';

explain (analyze, buffers) select * from dt_loss_summary();
explain (analyze, buffers) select * from meter_readings where division_id = '99000000-0000-0000-0000-000000000002' order by reading_ts desc limit 100;

reset role;
```

Save the real output here as `supabase/tests/perf/<date>.txt` (directory
doesn't exist yet — create it with the first real run) so the numbers in a
pitch are traceable to an actual `EXPLAIN` output, the same discipline as
every other number this platform shows.

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
