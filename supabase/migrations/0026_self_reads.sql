-- 0026_self_reads.sql
-- Consumer meter self-reads via photo + OCR, the way Torrent Power's app
-- lets a consumer submit their own reading. The photo is OCR'd on the
-- client; the consumer confirms (correcting any low-confidence digit) and
-- submits. It lands in a review queue, NOT straight into billing — a field
-- technician / support agent / DISCOM officer accepts it, and only then is a
-- meter_readings row written, with source='ocr', quality='estimated' and the
-- OCR confidence carried through (DESIGN.md P3: a below-threshold read is
-- rendered differently from a measured fact).

-- ---------------------------------------------------------------------------
-- meter_readings: carry OCR provenance. Nullable + additive; the parent's
-- policies and the partition trap (0005) are untouched.
-- ---------------------------------------------------------------------------
alter table meter_readings add column if not exists confidence numeric;   -- 0..1, for source in ('ocr','estimated')
alter table meter_readings add column if not exists photo_path text;      -- storage path of the meter photo, if any

-- ---------------------------------------------------------------------------
-- self_read_submissions — the review queue.
-- ---------------------------------------------------------------------------
create type self_read_status as enum ('pending', 'accepted', 'rejected');

create table self_read_submissions (
  id uuid primary key default gen_random_uuid(),
  service_connection_id uuid not null references service_connections (id) on delete cascade,
  meter_id uuid not null references meters (id) on delete restrict,
  submitted_by uuid not null references auth.users (id) on delete set null,
  submitted_at timestamptz not null default now(),

  reading_kwh numeric not null,            -- the value the consumer confirmed
  ocr_raw text,                            -- what OCR read before any correction
  min_digit_confidence numeric,            -- lowest per-digit confidence, 0..1
  corrected boolean not null default false, -- did the consumer change a digit?
  photo_path text,

  -- Plausibility snapshot, frozen at submit time so a reviewer sees what the
  -- consumer saw.
  prev_reading_kwh numeric,
  prev_reading_ts timestamptz,

  status self_read_status not null default 'pending',
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  review_note text,
  accepted_reading_ts timestamptz,         -- reading_ts of the meter_readings row created on accept

  -- Denormalized scope keys, filled by the trigger below (same pattern as #3).
  dt_id uuid,
  division_id uuid,
  org_id uuid,

  constraint self_read_reviewed_consistency check (
    (status = 'pending' and reviewed_by is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  )
);

create index self_read_submissions_sc_idx on self_read_submissions (service_connection_id, submitted_at desc);
create index self_read_submissions_status_idx on self_read_submissions (status, submitted_at) where status = 'pending';
create index self_read_submissions_division_idx on self_read_submissions (division_id) where status = 'pending';

create function self_read_set_scope_keys() returns trigger as $$
begin
  select m.dt_id, sc.division_id, sc.org_id
    into new.dt_id, new.division_id, new.org_id
  from meters m
  join service_connections sc on sc.id = m.service_connection_id
  where m.id = new.meter_id;
  return new;
end;
$$ language plpgsql;

create trigger self_read_submissions_scope_keys
  before insert on self_read_submissions
  for each row execute function self_read_set_scope_keys();

-- ---------------------------------------------------------------------------
-- accept_self_read(id) — the reviewer action. Writes the meter_readings row
-- and marks the submission accepted, atomically. SECURITY DEFINER so the
-- reviewer doesn't need INSERT on meter_readings directly; it re-checks the
-- caller's role and scope itself.
-- ---------------------------------------------------------------------------
create function accept_self_read(p_id uuid, p_note text default null)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v self_read_submissions%rowtype;
  v_ts timestamptz;
begin
  select * into v from self_read_submissions where id = p_id for update;
  if not found then
    raise exception 'submission % not found', p_id;
  end if;
  if v.status <> 'pending' then
    raise exception 'submission % already %', p_id, v.status;
  end if;

  -- Authorisation: platform-wide reviewers, or a DISCOM officer in the
  -- submission's own division.
  if not (
    has_role('field_technician')
    or has_role('support_agent')
    or ((has_role('discom_officer') or has_role('discom_admin'))
        and v.division_id = any ((select auth_divisions())::uuid[]))
  ) then
    raise exception 'not authorised to review this submission';
  end if;

  v_ts := v.submitted_at;

  insert into meter_readings (meter_id, reading_ts, kwh_import, source, quality, confidence, photo_path)
  values (v.meter_id, v_ts, v.reading_kwh, 'ocr', 'estimated', v.min_digit_confidence, v.photo_path)
  on conflict (meter_id, reading_ts) do update
    set kwh_import = excluded.kwh_import,
        source = 'ocr',
        quality = 'estimated',
        confidence = excluded.confidence,
        photo_path = excluded.photo_path;

  update self_read_submissions
     set status = 'accepted',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = p_note,
         accepted_reading_ts = v_ts
   where id = p_id;

  return v_ts;
end;
$$;

revoke all on function accept_self_read(uuid, text) from public, anon;
grant execute on function accept_self_read(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table self_read_submissions enable row level security;
alter table self_read_submissions force row level security;

-- Consumer: insert + read own submissions (RLS scopes by connection ownership).
create policy self_read_consumer_insert on self_read_submissions
  for insert to authenticated
  with check (
    submitted_by = (select auth.uid())
    and service_connection_id = any ((select my_service_connection_ids())::uuid[])
  );

create policy self_read_consumer_select on self_read_submissions
  for select to authenticated
  using ( service_connection_id = any ((select my_service_connection_ids())::uuid[]) );

-- Field technicians & support agents: platform-wide review queue (same
-- rationale as the ticket queue — it is not division-scoped work).
create policy self_read_reviewer_select on self_read_submissions
  for select to authenticated
  using ( has_role('field_technician') or has_role('support_agent') );

create policy self_read_reviewer_update on self_read_submissions
  for update to authenticated
  using ( has_role('field_technician') or has_role('support_agent') )
  with check ( has_role('field_technician') or has_role('support_agent') );

-- DISCOM officers: review queue confined to their own division.
create policy self_read_discom_select on self_read_submissions
  for select to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );

create policy self_read_discom_update on self_read_submissions
  for update to authenticated
  using (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  )
  with check (
    (has_role('discom_officer') or has_role('discom_admin'))
    and division_id = any ((select auth_divisions())::uuid[])
  );
