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

  const { error: updateError } = await supabase.from("work_orders").update(updatePayload).eq("id", id);
  if (updateError) {
    return Response.json({ error: "failed to update work order" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
