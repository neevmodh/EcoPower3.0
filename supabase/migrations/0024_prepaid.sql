-- 0024_prepaid.sql
-- Prepaid as a first-class commercial model (#22). PS1 names prepaid
-- explicitly; connection_type has had a 'prepaid' enum value since 0001
-- but nothing behind it. This adds the balance, the append-only movement
-- ledger, a recharge RPC, and a daily settlement function.
--
-- Tariff: prepaid settles at a single flat rate per kWh, not the
-- telescopic postpaid slabs — this matches how Indian prepaid pilots
-- actually meter (a fixed vend rate), and keeps settlement doable in the
-- database without the TS tariff engine. The rate is stored per account.

alter type notification_type add value if not exists 'prepaid_low_balance';

create table prepaid_accounts (
  service_connection_id uuid primary key references service_connections (id) on delete cascade,
  balance_paise bigint not null default 0,
  vend_rate_paise_per_kwh bigint not null default 650,        -- ₹6.50/kWh flat (demo default)
  low_balance_threshold_paise bigint not null default 10000,  -- ₹100
  disconnect_pending boolean not null default false,
  last_settled_on date,
  division_id uuid,
  org_id uuid,
  updated_at timestamptz not null default now()
);

create table prepaid_ledger (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  service_connection_id uuid not null references service_connections (id) on delete cascade,
  occurred_at timestamptz not null default clock_timestamp(),
  kind text not null check (kind in ('recharge', 'debit', 'adjustment')),
  amount_paise bigint not null,               -- signed: + recharge, - debit
  balance_after_paise bigint not null,
  detail jsonb not null default '{}',
  division_id uuid,
  org_id uuid
);

create index prepaid_ledger_conn_idx on prepaid_ledger (service_connection_id, seq desc);
create index prepaid_accounts_disconnect_idx on prepaid_accounts (division_id) where disconnect_pending;

-- The ledger is append-only, same guarantee as audit_log (0023).
create trigger prepaid_ledger_no_update_or_delete
  before update or delete on prepaid_ledger
  for each row execute function audit_log_reject_mutation();

-- Scope keys from the connection's DT. search_path='' + fully-qualified —
-- prepaid_settle_day() calls UPDATE on prepaid_accounts from inside its own
-- search_path='' scope, and this trigger inherits it.
create function prepaid_set_scope_keys() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Inlined DT -> division/org walk (not a call to resolve_scope_from_dt():
  -- that's a plain SQL function, Postgres inlines it, and the inlined body's
  -- unqualified table names would not resolve under this search_path='').
  select s.division_id, dv.discom_org_id
    into new.division_id, new.org_id
  from public.service_connections sc
  join public.distribution_transformers dt on dt.id = sc.dt_id
  join public.feeders f on f.id = dt.feeder_id
  join public.substations s on s.id = f.substation_id
  join public.discom_divisions dv on dv.id = s.division_id
  where sc.id = new.service_connection_id;
  return new;
end;
$$;

create trigger prepaid_accounts_scope_keys
  before insert or update on prepaid_accounts
  for each row execute function prepaid_set_scope_keys();
create trigger prepaid_ledger_scope_keys
  before insert on prepaid_ledger
  for each row execute function prepaid_set_scope_keys();

alter table prepaid_accounts enable row level security;
alter table prepaid_accounts force row level security;
alter table prepaid_ledger enable row level security;
alter table prepaid_ledger force row level security;

-- Consumer: their own connection's account + ledger.
create policy prepaid_accounts_consumer_read on prepaid_accounts
  for select to authenticated
  using (service_connection_id = any ((select my_service_connection_ids())::uuid[]));
create policy prepaid_ledger_consumer_read on prepaid_ledger
  for select to authenticated
  using (service_connection_id = any ((select my_service_connection_ids())::uuid[]));

-- DISCOM officer: prepaid oversight for their division (read only).
create policy prepaid_accounts_discom_read on prepaid_accounts
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );

-- No direct INSERT/UPDATE for authenticated — balance only ever moves
-- through prepaid_recharge() and prepaid_settle_day().

-- ============================================================
-- prepaid_recharge(p_connection_id, p_amount_paise) — a consumer tops up
-- their own prepaid balance. In a real deployment the amount is confirmed
-- by the Razorpay webhook before this is called; the demo calls it
-- directly. SECURITY DEFINER to write past the no-write RLS, but it
-- re-checks ownership itself by reading auth.uid() (no has_role/auth_*
-- calls — the search_path='' inlining trap, architecture note #5).
-- ============================================================
create function prepaid_recharge(p_connection_id uuid, p_amount_paise bigint)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_new_balance bigint;
begin
  if p_amount_paise <= 0 then
    raise exception 'recharge amount must be positive';
  end if;

  select owner_user_id into v_owner from public.service_connections where id = p_connection_id;
  if v_owner is null or v_owner <> (select auth.uid()) then
    raise exception 'not your connection';
  end if;

  insert into public.prepaid_accounts as pa (service_connection_id, balance_paise)
    values (p_connection_id, p_amount_paise)
  on conflict (service_connection_id) do update
    set balance_paise = pa.balance_paise + excluded.balance_paise,
        disconnect_pending = case
          when pa.balance_paise + excluded.balance_paise > pa.low_balance_threshold_paise then false
          else pa.disconnect_pending end,
        updated_at = now()
  returning pa.balance_paise into v_new_balance;

  insert into public.prepaid_ledger (service_connection_id, kind, amount_paise, balance_after_paise, detail)
    values (p_connection_id, 'recharge', p_amount_paise, v_new_balance, jsonb_build_object('source', 'app'));

  return v_new_balance;
end;
$$;

revoke all on function prepaid_recharge(uuid, bigint) from public, anon;
grant execute on function prepaid_recharge(uuid, bigint) to authenticated;

-- ============================================================
-- prepaid_settle_day() — draws each prepaid account down by yesterday's
-- metered consumption x its vend rate, appends a debit to the ledger, and
-- raises disconnect_pending when the balance falls to/through the
-- threshold. Idempotent per day (last_settled_on guard). Wired to pg_cron.
-- ============================================================
create function prepaid_settle_day() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'utc')::date - 1;
  r record;
  v_kwh numeric;
  v_charge bigint;
  v_new_balance bigint;
begin
  for r in
    select pa.service_connection_id, pa.balance_paise, pa.vend_rate_paise_per_kwh, pa.low_balance_threshold_paise
    from public.prepaid_accounts pa
    where pa.last_settled_on is distinct from v_day
  loop
    select coalesce(sum(mr.delta_import_kwh), 0) into v_kwh
    from public.meters m
    join public.meter_readings mr on mr.meter_id = m.id
    where m.service_connection_id = r.service_connection_id
      and mr.reading_ts >= v_day and mr.reading_ts < v_day + 1;

    v_charge := round(v_kwh * r.vend_rate_paise_per_kwh);
    if v_charge <= 0 then
      update public.prepaid_accounts set last_settled_on = v_day, updated_at = now()
        where service_connection_id = r.service_connection_id;
      continue;
    end if;

    v_new_balance := r.balance_paise - v_charge;

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
  end loop;
end;
$$;

revoke all on function prepaid_settle_day() from public, anon;

select cron.schedule('prepaid-settle-day', '15 0 * * *', $$select prepaid_settle_day()$$);
