// Scenario injection (#13) — trigger a fault live on stage and watch it
// surface in the DISCOM loss map. inject_scenario() (0040) is the actual
// gate: platform_admin only, checked inside the SECURITY DEFINER function
// itself, not here. This route just validates the body shape.
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_SCENARIOS = ["theft", "soiling", "inverter_trip", "tamper"];

export async function POST(request: Request) {
  let body: { meterSerial?: string; scenario?: string; magnitude?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.meterSerial) {
    return Response.json({ error: "meterSerial is required" }, { status: 400 });
  }
  if (!body.scenario || !VALID_SCENARIOS.includes(body.scenario)) {
    return Response.json({ error: `scenario must be one of ${VALID_SCENARIOS.join(", ")}` }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("inject_scenario", {
    p_meter_serial: body.meterSerial,
    p_scenario: body.scenario,
    p_magnitude: body.magnitude ?? 0.4,
  });

  if (error) {
    // 42501 = not_authorized (raised inside inject_scenario for a non-admin).
    const status = error.code === "42501" ? 403 : 400;
    return Response.json({ error: error.message }, { status });
  }

  return Response.json({ ok: true, event: data });
}
