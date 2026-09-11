// Net-metering application decisions (#89 / issue #28 — reopened because
// it was closed with no corresponding code; this is the real thing).
// netmetering_applications_discom_decide (0019) is the actual gate: a
// discom_officer can only reach an application in their own division.
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_DECISIONS = ["approved", "rejected"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { decision?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.decision || !VALID_DECISIONS.includes(body.decision)) {
    return Response.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data: application, error: fetchError } = await supabase
    .from("netmetering_applications")
    .select("id, status")
    .eq("id", id)
    .single();
  if (fetchError || !application) {
    return Response.json({ error: "application not found" }, { status: 404 });
  }
  const DECIDABLE = ["submitted", "under_review"];
  if (!DECIDABLE.includes(application.status)) {
    return Response.json({ error: `application already ${application.status}` }, { status: 409 });
  }

  // Re-assert the pre-state inside the UPDATE filter, not just in the read
  // above — two officers deciding the same application concurrently would
  // otherwise both pass the check and the second would silently overwrite
  // the first. A zero-row result means someone else got there first.
  const { data: updated, error: updateError } = await supabase
    .from("netmetering_applications")
    .update({
      status: body.decision,
      decision_notes: body.notes ?? null,
      decided_by_user_id: userData.user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", DECIDABLE)
    .select("id");
  if (updateError) {
    return Response.json({ error: "failed to record decision" }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return Response.json({ error: "application was already decided by someone else" }, { status: 409 });
  }

  return Response.json({ ok: true });
}
