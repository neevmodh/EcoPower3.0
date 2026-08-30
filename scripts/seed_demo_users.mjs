#!/usr/bin/env node
// Seeds five demo logins, one per panel, plus the minimum topology their
// RLS scopes need. Idempotent-ish: re-running against a fresh `supabase db
// reset` is the expected path.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed_demo_users.mjs

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required");
  process.exit(1);
}

const PASSWORD = process.env.SEED_PASSWORD ?? "EcoPower!2026";

const ORG_ID = "30000000-0000-0000-0000-000000000001";
const SOCIETY_ORG_ID = "30000000-0000-0000-0000-000000000002";
const DIVISION_A = "30000000-0000-0000-0000-00000000000a";
const DIVISION_B = "30000000-0000-0000-0000-00000000000b";

const USERS = [
  { email: "consumer@ecopower.demo", role: "consumer", org: null, division: null },
  { email: "society@ecopower.demo", role: "society_admin", org: SOCIETY_ORG_ID, division: null },
  { email: "discom@ecopower.demo", role: "discom_officer", org: ORG_ID, division: DIVISION_A },
  { email: "operator@ecopower.demo", role: "resco_ops", org: ORG_ID, division: null },
  { email: "field@ecopower.demo", role: "field_technician", org: ORG_ID, division: DIVISION_A },
];

async function adminFetch(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

async function createUser(email) {
  const created = await adminFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (created.ok) return created.body.id;

  // Already exists — find it.
  const list = await adminFetch(`/auth/v1/admin/users?page=1&per_page=200`);
  const found = list.body?.users?.find((u) => u.email === email);
  if (found) return found.id;

  throw new Error(`could not create or find ${email}: ${JSON.stringify(created.body)}`);
}

async function sql(query) {
  // PostgREST has no raw-SQL endpoint; these writes go through the tables
  // directly with the service_role key (RLS bypassed by design for seeding).
  const res = await adminFetch(query.path, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(query.rows),
  });
  if (!res.ok) {
    throw new Error(`seed failed for ${query.path}: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

async function main() {
  console.log(`Seeding against ${SUPABASE_URL}`);

  await sql({
    path: "/rest/v1/orgs",
    rows: [
      { id: ORG_ID, name: "Torrent Power (demo)", type: "discom" },
      { id: SOCIETY_ORG_ID, name: "Sunrise Residency (demo)", type: "society" },
    ],
  });

  await sql({
    path: "/rest/v1/discom_divisions",
    rows: [
      { id: DIVISION_A, discom_org_id: ORG_ID, name: "Ahmedabad Division A", level: "division" },
      { id: DIVISION_B, discom_org_id: ORG_ID, name: "Ahmedabad Division B", level: "division" },
    ],
  });

  await sql({
    path: "/rest/v1/substations",
    rows: [
      { id: "30000000-0000-0000-0000-0000000000a1", division_id: DIVISION_A, name: "SS Vastrapur" },
      { id: "30000000-0000-0000-0000-0000000000b1", division_id: DIVISION_B, name: "SS Maninagar" },
    ],
  });

  await sql({
    path: "/rest/v1/feeders",
    rows: [
      { id: "30000000-0000-0000-0000-0000000000a2", substation_id: "30000000-0000-0000-0000-0000000000a1", name: "Feeder A-7" },
      { id: "30000000-0000-0000-0000-0000000000b2", substation_id: "30000000-0000-0000-0000-0000000000b1", name: "Feeder B-3" },
    ],
  });

  await sql({
    path: "/rest/v1/distribution_transformers",
    rows: [
      { id: "30000000-0000-0000-0000-0000000000a3", feeder_id: "30000000-0000-0000-0000-0000000000a2", name: "DT A-21", capacity_kva: 250 },
      { id: "30000000-0000-0000-0000-0000000000b3", feeder_id: "30000000-0000-0000-0000-0000000000b2", name: "DT B-14", capacity_kva: 400 },
    ],
  });

  const userIds = {};
  for (const u of USERS) {
    userIds[u.role] = await createUser(u.email);
    console.log(`  user ${u.email} -> ${userIds[u.role]}`);
  }

  // Division A connection is owned by the demo consumer; Division B's is not,
  // so the DISCOM officer scoped to A provably cannot see it.
  await sql({
    path: "/rest/v1/service_connections",
    rows: [
      {
        id: "30000000-0000-0000-0000-0000000000a4",
        consumer_number: "AHD-A-100001",
        dt_id: "30000000-0000-0000-0000-0000000000a3",
        owner_user_id: userIds.consumer,
        tariff_category: "RGP",
        phase: "single",
        connection_type: "postpaid",
        sanctioned_load_kw: 5,
        connected_load_kw: 4.2,
      },
      {
        id: "30000000-0000-0000-0000-0000000000b4",
        consumer_number: "AHD-B-200001",
        dt_id: "30000000-0000-0000-0000-0000000000b3",
        // Explicit null: PostgREST bulk insert requires uniform keys.
        owner_user_id: null,
        tariff_category: "NRGP",
        phase: "three",
        connection_type: "postpaid",
        sanctioned_load_kw: 25,
        connected_load_kw: 21.5,
      },
    ],
  });

  await sql({
    path: "/rest/v1/assets",
    rows: [
      {
        service_connection_id: "30000000-0000-0000-0000-0000000000a4",
        asset_type: "pv_array",
        capacity_kw: 5,
        commissioning_ref: "COM-2026-0001",
      },
      {
        service_connection_id: "30000000-0000-0000-0000-0000000000a4",
        asset_type: "inverter",
        capacity_kw: 5,
        commissioning_ref: "COM-2026-0001",
      },
    ],
  });

  await sql({
    path: "/rest/v1/user_roles",
    rows: USERS.map((u) => ({
      user_id: userIds[u.role],
      role: u.role,
      org_id: u.org,
      division_id: u.division,
    })),
  });

  console.log("\nSeeded five logins (password: %s):", PASSWORD);
  for (const u of USERS) console.log(`  ${u.role.padEnd(18)} ${u.email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
