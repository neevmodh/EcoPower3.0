-- 0063_prepaid_settle_day_fault_isolation.sql
-- Found by review audit: prepaid_settle_day() (0024) runs as a single
-- PL/pgSQL function call, which is a single Postgres transaction —
-- plpgsql cannot COMMIT/ROLLBACK internally, only a nested
-- BEGIN...EXCEPTION...END block creates an implicit savepoint. The
-- original loop had no such block: an exception on ANY one account (a
-- dangling FK on the notifications insert, any row-specific error) rolled
-- back every account already settled earlier in that same tick, not just
-- the failing one.
--
-- Worse, v_day was always "yesterday relative to whenever this runs," with
-- no catch-up for a day that failed to settle — tomorrow's tick asks about
-- *tomorrow's* yesterday, never revisiting the missed day. A single bad
-- tick meant that calendar day's charge was gone, permanently, fleet-wide,
-- silently: no error surfaces anywhere durable.
--
-- Fixed two ways:
-- 1. Each account's settlement, and within it each individual day, runs
--    inside its own BEGIN...EXCEPTION...END block — a failure there rolls
--    back only that day's work (via the implicit savepoint) and is logged
--    with RAISE WARNING (visible in cron.job_run_details.return_message
--    and the Postgres log), not silently swallowed. Every other account,
--    and every other day already processed for the SAME account this
--    tick, still commits normally when the function itself returns.
-- 2. Catch-up: an account settles every day between
--    last_settled_on + 1 and yesterday, not just yesterday alone — so a
--    tick that failed (or an account that was offline/unreadable) self-heals
--    on the next successful tick instead of the gap being permanent.
--    Bounded to the most recent 60 days so a very old or never-settled
--    account doesn't turn one cron tick into an unbounded per-day loop —
--    a deliberate, documented scope limit (older than that is accepted as
--    unrecoverable), same shape as #163's bounded resettlement window.

create or replace function prepaid_settle_day() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_yesterday date := (now() at time zone 'utc')::date - 1;
  v_day date;
  v_start_day date;
  v_balance bigint;
  v_kwh numeric;
  v_charge bigint;
  v_new_balance bigint;
  r record;
begin
  for r in
    select pa.service_connection_id, pa.vend_rate_paise_per_kwh,
           pa.low_balance_threshold_paise, pa.last_settled_on
    from public.prepaid_accounts pa
    where pa.last_settled_on is distinct from v_yesterday
  loop
    v_start_day := greatest(
      coalesce(r.last_settled_on + 1, v_yesterday - 59),
      v_yesterday - 59
    );

    for v_day in select generate_series(v_start_day, v_yesterday, interval '1 day')::date loop
      begin
        select coalesce(sum(mr.delta_import_kwh), 0) into v_kwh
        from public.meters m
        join public.meter_readings mr on mr.meter_id = m.id
        where m.service_connection_id = r.service_connection_id
          and mr.reading_ts >= v_day and mr.reading_ts < v_day + 1;

        v_charge := round(v_kwh * r.vend_rate_paise_per_kwh);

        if v_charge <= 0 then
          update public.prepaid_accounts set last_settled_on = v_day, updated_at = now()
            where service_connection_id = r.service_connection_id;
        else
          -- Read the current balance fresh each day rather than carrying
          -- an in-memory running total across this account's whole
          -- catch-up range — a concurrent prepaid_recharge() landing
          -- mid-batch must not get clobbered by a stale value computed
          -- before it committed.
          select balance_paise into v_balance
          from public.prepaid_accounts where service_connection_id = r.service_connection_id;

          v_new_balance := v_balance - v_charge;

          update public.prepaid_accounts
            set balance_paise = v_new_balance,
                disconnect_pending = (v_new_balance <= low_balance_threshold_paise),
                last_settled_on = v_day,
                updated_at = now()
            where service_connection_id = r.service_connection_id;

          insert into public.prepaid_ledger (service_connection_id, kind, amount_paise, balance_after_paise, detail)
            values (
              r.service_connection_id, 'debit', -v_charge, v_new_balance,
              jsonb_build_object('day', v_day, 'kwh', round(v_kwh, 3), 'rate_paise', r.vend_rate_paise_per_kwh)
            );

          if v_new_balance <= r.low_balance_threshold_paise then
            insert into public.notifications (user_id, type, title, body, link)
            select sc.owner_user_id, 'prepaid_low_balance', 'Low prepaid balance',
                   'Your balance is running low — recharge to avoid disconnection.', '/consumer/plan'
            from public.service_connections sc
            where sc.id = r.service_connection_id and sc.owner_user_id is not null;
          end if;
        end if;
      exception when others then
        -- Stop this account's catch-up at the first failure, in day
        -- order — last_settled_on is deliberately left at the last day
        -- that actually succeeded, so the next tick resumes exactly here
        -- instead of skipping ahead out of order.
        raise warning 'prepaid_settle_day: failed for service_connection_id=%, day=%: %',
          r.service_connection_id, v_day, sqlerrm;
        exit;
      end;
    end loop;
  end loop;
end;
$$;
