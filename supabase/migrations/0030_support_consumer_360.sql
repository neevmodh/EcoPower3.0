-- 0030_support_consumer_360.sql
-- A support agent handling a ticket needs a little context about the
-- consumer — which connection, is the meter reporting, what did the last
-- few bills look like, how many open tickets. The schema deliberately does
-- NOT give support_agent blanket SELECT on service_connections / invoices /
-- meters (that would be every consumer's billing history). Instead this one
-- SECURITY DEFINER function returns a curated bundle for a single consumer
-- number, and re-checks the caller's role itself.
--
-- What it does NOT return: invoice line detail, register reads, payment
-- instrument data, personal contact fields. Just enough to route a ticket.

create function support_consumer_360(p_consumer_number text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  stable
as $$
declare
  v_sc service_connections%rowtype;
  v_result jsonb;
begin
  if not has_role('support_agent') then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select * into v_sc from service_connections where consumer_number = p_consumer_number;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  select jsonb_build_object(
    'found', true,
    'connection', jsonb_build_object(
      'consumer_number', v_sc.consumer_number,
      'tariff_category', v_sc.tariff_category,
      'connection_type', v_sc.connection_type,
      'phase', v_sc.phase,
      'sanctioned_load_kw', v_sc.sanctioned_load_kw
    ),
    'meter', (
      select jsonb_build_object(
        'serial', m.serial,
        'status', m.status,
        'last_reading_ts', mls.last_reading_ts,
        'quality', mls.quality
      )
      from meters m
      left join meter_live_state mls on mls.meter_id = m.id
      where m.service_connection_id = v_sc.id
      order by m.created_at
      limit 1
    ),
    'prepaid', (
      select jsonb_build_object(
        'balance_paise', pa.balance_paise,
        'disconnect_pending', pa.disconnect_pending
      )
      from prepaid_accounts pa
      where pa.service_connection_id = v_sc.id
    ),
    'recent_invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'period_start', i.billing_period_start,
        'period_end', i.billing_period_end,
        'units_kwh', round(i.units_imported_milli_kwh / 1000.0, 1),
        'total_paise', i.total_paise,
        'status', i.status
      ) order by i.billing_period_start desc)
      from (
        select * from invoices
        where service_connection_id = v_sc.id
        order by billing_period_start desc
        limit 3
      ) i
    ), '[]'::jsonb),
    'tickets', (
      select jsonb_build_object(
        'open', count(*) filter (where status in ('open', 'in_progress')),
        'total', count(*)
      )
      from support_tickets
      where service_connection_id = v_sc.id
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function support_consumer_360(text) from public, anon;
grant execute on function support_consumer_360(text) to authenticated;
