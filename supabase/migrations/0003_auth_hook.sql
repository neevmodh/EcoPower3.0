-- 0003_auth_hook.sql
-- Custom access token hook: injects flattened scope into the JWT at login, so
-- RLS policies read an in-memory claim array instead of joining user_roles per row.
--
-- app_metadata shape after this hook runs:
--   { "roles": [...], "org_ids": [...], "division_ids": [...] }
-- division_ids is the transitive closure of every division directly granted to the
-- user, computed once at login by a recursive CTE — a Circle head sees every
-- subdivision beneath them at zero extra RLS cost.
--
-- Staleness caveat: JWT claims are stale until refresh (see config.toml
-- [auth.jwt] expiry). Revocation-sensitive operations (disconnect commands, NM
-- approvals) must re-check user_roles inside the SECURITY DEFINER RPC rather than
-- trusting the claim.

create function custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (event ->> 'user_id')::uuid;
  v_roles text[];
  v_org_ids uuid[];
  v_division_ids uuid[];
  v_claims jsonb;
begin
  select coalesce(array_agg(distinct role::text), '{}')
    into v_roles
    from public.user_roles
    where user_id = v_user_id and revoked_at is null;

  select coalesce(array_agg(distinct org_id), '{}')
    into v_org_ids
    from public.user_roles
    where user_id = v_user_id and revoked_at is null and org_id is not null;

  with recursive division_tree as (
    select id
    from public.discom_divisions
    where id in (
      select division_id from public.user_roles
      where user_id = v_user_id and revoked_at is null and division_id is not null
    )
    union
    select d.id
    from public.discom_divisions d
    join division_tree dt on d.parent_division_id = dt.id
  )
  select coalesce(array_agg(id), '{}') into v_division_ids from division_tree;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_claims := jsonb_set(
    v_claims,
    '{app_metadata}',
    coalesce(v_claims -> 'app_metadata', '{}'::jsonb) || jsonb_build_object(
      'roles', to_jsonb(v_roles),
      'org_ids', to_jsonb(v_org_ids),
      'division_ids', to_jsonb(v_division_ids)
    )
  );

  event := jsonb_set(event, '{claims}', v_claims);
  return event;
end;
$$;

-- Only the auth service may call this; it must never be reachable from PostgREST.
revoke execute on function custom_access_token_hook from authenticated, anon, public;
grant execute on function custom_access_token_hook to supabase_auth_admin;

grant usage on schema public to supabase_auth_admin;
grant select on user_roles to supabase_auth_admin;
grant select on discom_divisions to supabase_auth_admin;

-- ============================================================
-- Claim readers — stable, read auth.jwt() directly. Used inside RLS policies (#5).
-- ============================================================

create function auth_roles() returns text[] language sql stable as $$
  select coalesce(
    array(select jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'roles')),
    '{}'
  );
$$;

create function auth_orgs() returns uuid[] language sql stable as $$
  select coalesce(
    array(select jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'org_ids')::uuid),
    '{}'
  );
$$;

create function auth_divisions() returns uuid[] language sql stable as $$
  select coalesce(
    array(select jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'division_ids')::uuid),
    '{}'
  );
$$;

create function has_role(p_role text) returns boolean language sql stable as $$
  select p_role = any(auth_roles());
$$;
