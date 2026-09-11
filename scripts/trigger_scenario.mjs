#!/usr/bin/env node
// Demo-day fault injection (#13). Signs in as the platform_admin demo
// account (a real session — inject_scenario() checks is_platform_admin()
// off the JWT claims, same boundary as everything else), then calls the
// RPC directly over PostgREST. Bind this to a keyboard shortcut on demo day
// (a terminal alias + your OS's hotkey tool) — that's the "cause a fault
// live on stage" moment.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
//     node scripts/trigger_scenario.mjs <meterSerial> <theft|soiling|inverter_trip|tamper> [magnitude]
//
// Example:
//   node scripts/trigger_scenario.mjs AHD-B-300004 theft 0.6

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL ?? "admin@ecopower.demo";
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? "EcoPower!2026";

const [meterSerial, scenario, magnitudeArg] = process.argv.slice(2);

if (!ANON_KEY) {
  console.error("SUPABASE_ANON_KEY is required");
  process.exit(1);
}
if (!meterSerial || !scenario) {
  console.error("usage: trigger_scenario.mjs <meterSerial> <theft|soiling|inverter_trip|tamper> [magnitude]");
  process.exit(1);
}

async function main() {
  const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const session = await signInRes.json();
  if (!signInRes.ok || !session.access_token) {
    console.error("sign-in failed:", session);
    process.exit(1);
  }

  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/inject_scenario`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_meter_serial: meterSerial,
      p_scenario: scenario,
      p_magnitude: magnitudeArg ? Number(magnitudeArg) : 0.4,
    }),
  });
  const result = await rpcRes.json();
  if (!rpcRes.ok) {
    console.error(`inject_scenario failed (${rpcRes.status}):`, result);
    process.exit(1);
  }
  console.log(`[scenario] ${scenario} injected on ${meterSerial}:`, result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
