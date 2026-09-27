-- 0062_health_cron_freshness.sql (#110)
-- /api/health checked the database and Gemini (#56) but never pg_cron
-- itself — a job silently failing or getting unscheduled (a bad migration,
-- a restored backup that dropped cron.job rows) would leave every sweeper
-- in this codebase quietly stale with nothing external ever noticing.
--
-- cron.job_run_details lives in the cron schema, which PostgREST does not
-- expose and which anon/authenticated have no privileges on directly (nor
-- should they — it is scheduler internals, not application data). A
-- narrow SECURITY DEFINER function is the same shape as the data_provenance
-- precedent the DB check already uses: expose exactly the one query an
-- external monitor needs, nothing else.
--
-- Expected intervals are hardcoded per job name rather than parsed from
-- cron.job.schedule at read time — this is a small, known, finite set of
-- jobs (one per migration that calls cron.schedule), and parsing arbitrary
-- cron syntax generically buys nothing here that a literal list doesn't
-- already give more simply. A job renamed without updating this list reads
-- as "unknown job, always stale" below — a loud failure, not a silent one.

create function health_check_cron_jobs() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb := '[]'::jsonb;
  v_job record;
  v_expected_minutes integer;
  v_last_success timestamptz;
  v_stale boolean;
begin
  for v_job in select jobname from cron.job order by jobname loop
    v_expected_minutes := case v_job.jobname
      when 'scan-meter-outages' then 15
      when 'sweep-meter-offline-status' then 5
      when 'sweep-netmetering-sla' then 15
      when 'sweep-demand-response-events' then 15
      when 'prepaid-settle-day' then 1440
      -- Monthly (1st of month, 0 0 1 * *) — 3x would be 3 months, an
      -- absurd staleness bar for something that runs 12x/year. Capped at
      -- 7 days: long enough that a delayed-but-fine run this week never
      -- pages, short enough that a job that's stopped scheduling entirely
      -- still gets caught well before the next monthly tick was ever due.
      when 'ensure-future-partitions' then 60 * 24 * 7 / 3
      else null
    end;

    select max(d.end_time) into v_last_success
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
    where j.jobname = v_job.jobname and d.status = 'succeeded';

    -- 3x the expected interval: enough slack for one or two missed ticks
    -- (a brief pg_cron worker hiccup) without paging on noise, while still
    -- catching a job that has genuinely stopped running.
    v_stale := v_expected_minutes is null
      or v_last_success is null
      or v_last_success < now() - (v_expected_minutes * 3 || ' minutes')::interval;

    result := result || jsonb_build_object(
      'jobname', v_job.jobname,
      'last_success', v_last_success,
      'stale', v_stale
    );
  end loop;

  return result;
end;
$$;

revoke all on function health_check_cron_jobs() from public;
grant execute on function health_check_cron_jobs() to anon, authenticated;
