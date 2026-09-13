// PM Surya Ghar subsidy disbursement (#31). Gated on 'approved' — the
// closest real signal this codebase's net-metering state machine has to
// "DISCOM has signed off"; there's no separate 'inspected' stage. Same
// existing RLS UPDATE policy (netmetering_applications_discom_decide, 0019)
// as /decide — a discom_officer/admin can only reach an application in
// their own division, no new privilege needed for this action.
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

  const { data: application, error: fetchError } = await supabase
    .from("netmetering_applications")
    .select("id, status, subsidy_disbursed_at, subsidy_claimed_paise")
    .eq("id", id)
    .single();
  if (fetchError || !application) {
    return Response.json({ error: "application not found" }, { status: 404 });
  }
  if (application.status !== "approved") {
    return Response.json(
      { error: "subsidy can only be disbursed for an approved application" },
      { status: 409 },
    );
  }
  if (application.subsidy_disbursed_at) {
    return Response.json(
      { error: "subsidy already disbursed" },
      { status: 409 },
    );
  }

  // Re-assert both pre-conditions in the UPDATE filter, not just the read
  // above — same TOCTOU guard as /decide (#94): two officers disbursing
  // concurrently should not both succeed.
  const { data: updated, error: updateError } = await supabase
    .from("netmetering_applications")
    .update({
      subsidy_disbursed_paise: application.subsidy_claimed_paise,
      subsidy_disbursed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "approved")
    .is("subsidy_disbursed_at", null)
    .select("id");
  if (updateError) {
    return Response.json(
      { error: "failed to record disbursement" },
      { status: 500 },
    );
  }
  if (!updated || updated.length === 0) {
    return Response.json(
      { error: "subsidy was already disbursed by someone else" },
      { status: 409 },
    );
  }

  return Response.json({
    ok: true,
    disbursedPaise: application.subsidy_claimed_paise,
  });
}
