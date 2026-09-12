// Work-order status transitions (#89, closes the Field panel's permanent
// "no open work orders" stub). RLS (work_orders_update, 0019) is the real
// gate — a field_technician can only move a work order assigned to them
// or unclaimed in their own RESCO org; this route just validates the verb.
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_TRANSITIONS: Record<string, string[]> = {
  claim: ["open"],
  start: ["open"],
  complete: ["in_progress", "open"],
  cancel: ["open", "in_progress"],
};

const NEXT_STATUS: Record<string, string> = {
  claim: "open",
  start: "in_progress",
  complete: "completed",
  cancel: "cancelled",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const action = body.action;
  if (!action || !VALID_TRANSITIONS[action]) {
    return Response.json({ error: "invalid action" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data: workOrder, error: fetchError } = await supabase
    .from("work_orders")
    .select("id, status, assigned_user_id")
    .eq("id", id)
    .single();
  if (fetchError || !workOrder) {
    return Response.json({ error: "work order not found" }, { status: 404 });
  }
  if (!VALID_TRANSITIONS[action].includes(workOrder.status)) {
    return Response.json({ error: `cannot ${action} a work order in status "${workOrder.status}"` }, { status: 409 });
  }

  const updatePayload: Record<string, unknown> = { status: NEXT_STATUS[action] };
  if (action === "claim") updatePayload.assigned_user_id = userData.user.id;

  // Re-assert the allowed pre-states in the UPDATE filter so two technicians
  // acting on the same work order can't both win the transition. This only
  // works because every OTHER action's NEXT_STATUS differs from its
  // precondition status — "claim" is the one action that doesn't touch
  // status at all (NEXT_STATUS.claim === "open", the same value
  // VALID_TRANSITIONS.claim requires), so the status filter alone is a
  // no-op for it: two concurrent claims both see status="open" before
  // either commits, both match, and the second silently overwrites the
  // first's assigned_user_id. The real precondition for claiming is "still
  // unclaimed," so assert that directly.
  let query = supabase.from("work_orders").update(updatePayload).eq("id", id).in("status", VALID_TRANSITIONS[action]);
  if (action === "claim") {
    query = query.is("assigned_user_id", null);
  }
  const { data: updated, error: updateError } = await query.select("id");
  if (updateError) {
    return Response.json({ error: "failed to update work order" }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return Response.json({ error: "work order status changed under you — reload" }, { status: 409 });
  }

  return Response.json({ ok: true });
}
