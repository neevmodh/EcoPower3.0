-- 0064_rls_force_and_function_grants.sql
-- Found by a schema-wide security audit. Two consistency gaps, neither
-- exploitable through the normal app path today, both closed for
-- defense-in-depth against a future mistake rather than a live one:
--
-- 1. FORCE ROW LEVEL SECURITY. 12 tables had RLS enabled but never forced,
--    against 47+ others in this same codebase that have both. FORCE only
--    changes behavior for the table OWNER role — anon/authenticated are
--    never the owner, so this isn't attacker-reachable through the app's
--    normal request path — but a future SECURITY DEFINER function that
--    (by mistake) runs a query against one of these as the owner would
--    silently bypass RLS rather than being caught by it. Matches this
--    codebase's own otherwise-consistent pattern everywhere else.
--
-- 2. Explicit REVOKE on three SECURITY INVOKER maintenance functions.
--    Postgres grants EXECUTE to PUBLIC by default on function creation.
--    None of these three are ever called via .rpc(...) from apps/web or
--    apps/mobile (verified by grep), and every actual call site is either
--    pg_cron, migration-time DDL, or reached only through a SECURITY
--    DEFINER boundary (provision_sandbox_tenant) that already re-checks
--    privilege against the definer, not the original caller — so there is
--    no legitimate reason `authenticated`/`anon` should be able to invoke
--    them directly as RPC endpoints. Matches the explicit
--    `revoke all ... from public, anon` already on every other
--    maintenance/sweep function in this codebase (my_service_connection_ids,
--    dr_settle_participation, health_check_cron_jobs, sweep_*, etc.) —
--    these three were simply missed, not deliberately left open.
--
--    resolve_scope_from_dt()/resolve_scope_from_meter() were deliberately
--    NOT included here despite being the same shape: they're called from
--    several SECURITY INVOKER scope-key triggers (set_scope_keys_from_meter,
--    service_connections_set_scope_keys, etc.) that fire on tables this
--    audit did not exhaustively trace every INSERT/UPDATE path for across
--    the whole schema. Revoking EXECUTE there risks silently breaking a
--    real authenticated write this session didn't find, for a marginal
--    gain (they're read-only helpers over RLS-protected reference tables
--    anyway, so even direct invocation couldn't return more than the
--    caller's own RLS-scoped view already permits) — left open
--    deliberately, flagged rather than guessed at.

alter table charging_stations force row level security;
alter table discom_divisions force row level security;
alter table distribution_transformers force row level security;
alter table feeders force row level security;
alter table kb_articles force row level security;
alter table orgs force row level security;
alter table substations force row level security;
alter table tariff_fixed_charge_bands force row level security;
alter table tariff_slabs force row level security;
alter table tariff_tou_windows force row level security;
alter table tariffs force row level security;
alter table utilities force row level security;

revoke all on function create_monthly_partition(date) from public, anon, authenticated;
revoke all on function scan_meter_outages() from public, anon, authenticated;
revoke all on function seed_scale_readings(int, int) from public, anon, authenticated;
