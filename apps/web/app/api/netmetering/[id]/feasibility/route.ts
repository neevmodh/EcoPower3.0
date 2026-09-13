// Runs the DT feasibility check (#30) for a net-metering application.
// Authorization lives inside run_dt_feasibility_check itself (SECURITY
// DEFINER, 0056) — it needs to read every consumer's assets on the DT to
// compute existing_solar_kw, which a plain RLS-scoped SELECT from a
// discom_officer's session can't do (assets has no discom-scoped policy).
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("run_dt_feasibility_check", {
    p_application_id: id,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : 500;
    return Response.json({ error: error.message }, { status });
  }

  return Response.json({ check: data });
}
