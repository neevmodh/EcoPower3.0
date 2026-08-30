-- 0018_resco_operator_rls.sql
-- Closes the gap #5 documented and operator.test.sql explicitly asserted:
-- assets had no RESCO-ownership column, so resco_ops/resco_admin were
-- correctly default-denied everything — not a bug, a deliberate "nothing
-- to scope on yet" state.
--
-- assets.org_id already exists (#2) — but it's a *derived* scope key,
-- populated by assets_set_scope_keys() via resolve_scope_from_dt(), i.e.
-- the DISCOM's org, not who installed the equipment. #2's own comment
-- ("assets — RESCO-owned...") never matched what it actually populated.
-- RESCO ownership isn't implied by grid topology at all (a RESCO can
-- install equipment behind any DISCOM's meter), so this is a genuinely
-- separate, directly-settable column, not a rename or reuse of org_id.

alter table assets add column resco_org_id uuid references orgs (id);
create index assets_resco_org_id_idx on assets (resco_org_id);

create policy assets_resco_scope on assets
  for select to authenticated
  using (
    (has_role('resco_ops') or has_role('resco_admin'))
    and resco_org_id = any ((select auth_orgs())::uuid[])
  );

-- meters carry firmware/comm/last_seen_at fields a RESCO operator cares
-- about for fleet health, but ownership of the meter itself is DISCOM's
-- (meters_division_scope already covers that role). A RESCO operator's
-- legitimate view is "the meters behind the assets I operate" — scoped
-- through the asset's service_connection, not a new ownership column on
-- meters itself (meters already has exactly-one-parent semantics from #1;
-- adding a second ownership axis there would fight that).
create policy meters_resco_scope on meters
  for select to authenticated
  using (
    (has_role('resco_ops') or has_role('resco_admin'))
    and exists (
      select 1 from assets a
      where a.service_connection_id = meters.service_connection_id
        and a.resco_org_id = any ((select auth_orgs())::uuid[])
    )
  );
