-- health_check_cron_jobs (#110, 0062): /api/health's cron-freshness check.
-- Every job scheduled by an earlier migration should be reported, a job
-- with no successful run ever is stale, and one with a very recent
-- successful run is not.

begin;
select plan(4);

select isnt_empty(
  $$ select 1 from jsonb_array_elements(health_check_cron_jobs()) j where j->>'jobname' = 'sweep-demand-response-events' $$,
  'every cron.schedule()''d job from earlier migrations shows up, including sweep-demand-response-events'
);

select results_eq(
  $$ select (j->>'stale')::boolean from jsonb_array_elements(health_check_cron_jobs()) j where j->>'jobname' = 'sweep-demand-response-events' $$,
  $$ values (true) $$,
  'a job with no run history at all (fresh database) is stale'
);

-- A real successful run, well within its 15-minute job's 3x=45-minute
-- freshness window. runid is explicit, not left to its sequence default —
-- the pgTAP test role has no USAGE grant on cron.runid_seq (scheduler
-- internals, reasonably locked down), same reasoning 0062 gives for why
-- this needed its own SECURITY DEFINER function in the first place.
insert into cron.job_run_details (runid, jobid, status, end_time)
select 9000000, jobid, 'succeeded', now() - interval '5 minutes'
from cron.job where jobname = 'sweep-demand-response-events';

select results_eq(
  $$ select (j->>'stale')::boolean from jsonb_array_elements(health_check_cron_jobs()) j where j->>'jobname' = 'sweep-demand-response-events' $$,
  $$ values (false) $$,
  'a recent successful run marks the job fresh, not stale'
);

-- A successful run from well outside the window (this job's 3x is 45
-- minutes) must not count as fresh just because SOME success exists —
-- max(end_time) has to actually be recent, not merely non-null.
update cron.job_run_details set end_time = now() - interval '2 hours'
where jobid = (select jobid from cron.job where jobname = 'sweep-demand-response-events');

select results_eq(
  $$ select (j->>'stale')::boolean from jsonb_array_elements(health_check_cron_jobs()) j where j->>'jobname' = 'sweep-demand-response-events' $$,
  $$ values (true) $$,
  'a stale-but-non-null last success (outside the 3x window) is still reported stale'
);

select finish();
rollback;
