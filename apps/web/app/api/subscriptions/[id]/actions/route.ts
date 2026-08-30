// Subscription lifecycle transitions (#78, trimmed to pause/resume/
// upgrade/cancel — transfer-on-sale and buyout wait for #22/#25, per
// PS1-PRIORITY-PLAN.md). Every transition writes a subscription_events
// row: the audit chain the issue asks for, not just a status flip.
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_TRANSITIONS: Record<string, string[]> = {
  pause: ["active"],
  resume: ["paused"],
  cancel: ["active", "paused"],
  upgrade: ["active"],
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { action?: string; reason?: string; toPlanId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const action = body.action;
  if (!action || !VALID_TRANSITIONS[action]) {
    return Response.json({ error: "invalid action" }, { status: 400 });
  }
  if (action === "upgrade" && !body.toPlanId) {
    return Response.json({ error: "toPlanId required for upgrade" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  // RLS confines this to a subscription the caller actually owns.
  const { data: subscription, error: subError } = await supabase
    .from("subscriptions")
    .select("id, status, plan_id")
    .eq("id", id)
    .single();
  if (subError || !subscription) {
    return Response.json({ error: "subscription not found" }, { status: 404 });
  }
  if (!VALID_TRANSITIONS[action].includes(subscription.status)) {
    return Response.json(
      { error: `cannot ${action} a subscription in status "${subscription.status}"` },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  let updatePayload: Record<string, unknown> = {};
  // subscription_event_type is past-tense ('paused', not 'pause') — the
  // action verb and the audit-log event name are deliberately different
  // vocabularies, so this map is not the identity function.
  const EVENT_TYPE: Record<string, string> = {
    pause: "paused",
    resume: "resumed",
    cancel: "cancelled",
    upgrade: "upgraded",
  };
  const eventType = EVENT_TYPE[action];
  let toPlanId: string | null = null;

  switch (action) {
    case "pause":
      updatePayload = { status: "paused", paused_at: now };
      break;
    case "resume":
      updatePayload = { status: "active", resumed_at: now };
      break;
    case "cancel":
      updatePayload = { status: "cancelled", cancelled_at: now, cancel_reason: body.reason ?? null };
      break;
    case "upgrade": {
      const { data: newPlan, error: newPlanError } = await supabase
        .from("plans")
        .select("id, active")
        .eq("id", body.toPlanId)
        .single();
      if (newPlanError || !newPlan || !newPlan.active) {
        return Response.json({ error: "target plan not found or inactive" }, { status: 404 });
      }
      updatePayload = { plan_id: newPlan.id };
      toPlanId = newPlan.id;
      break;
    }
  }

  const { error: updateError } = await supabase.from("subscriptions").update(updatePayload).eq("id", id);
  if (updateError) {
    return Response.json({ error: "failed to update subscription" }, { status: 500 });
  }

  const { error: eventError } = await supabase.from("subscription_events").insert({
    subscription_id: id,
    event_type: eventType,
    from_plan_id: subscription.plan_id,
    to_plan_id: toPlanId,
    actor_user_id: userData.user.id,
    reason: body.reason ?? null,
  });
  if (eventError) {
    // The subscription transition itself already committed — surfacing
    // this as a 500 would lie about what happened. Log loudly instead:
    // a missing audit row is a real defect, just not one to hide the
    // successful transition behind.
    console.error("failed to record subscription_event", id, eventType, eventError);
  }

  return Response.json({ ok: true });
}
