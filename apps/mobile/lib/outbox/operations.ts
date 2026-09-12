// The per-kind execute functions the sync engine dispatches to. Each
// returns one of three outcomes, not just ok/fail — the distinction is the
// whole point of #45's "conflict surface" requirement:
//   ok        — applied, delete from the queue
//   conflict  — the precondition no longer holds (someone else changed it
//               while offline) — stop retrying, surface it to the
//               technician instead of silently hammering a doomed request
//   retry     — transient (no network, a 500, etc.) — keep it queued and
//               back off
import { supabase } from "../supabase";

export type OperationResult =
  | { outcome: "ok" }
  | { outcome: "conflict"; error: string }
  | { outcome: "retry"; error: string };

// Mirrors apps/web/app/api/work-orders/[id]/status/route.ts exactly — same
// transition table, same concurrency-safe UPDATE filter (re-asserting the
// precondition status in the WHERE clause, not just checking it up front,
// so two technicians racing the same work order can't both win). RLS
// (work_orders_update, 0019) is the actual authorization boundary on both
// platforms; this is just the same well-reasoned query, not server logic
// being duplicated insecurely.
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

export interface WorkOrderStatusPayload {
  workOrderId: string;
  action: keyof typeof VALID_TRANSITIONS;
}

async function executeWorkOrderStatus(
  payload: WorkOrderStatusPayload,
): Promise<OperationResult> {
  const { action, workOrderId } = payload;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { outcome: "retry", error: "not authenticated yet" };

  const { data: workOrder, error: fetchError } = await supabase
    .from("work_orders")
    .select("id, status, assigned_user_id")
    .eq("id", workOrderId)
    .single();
  if (fetchError || !workOrder)
    return {
      outcome: "retry",
      error: fetchError?.message ?? "work order not found",
    };

  if (!VALID_TRANSITIONS[action].includes(workOrder.status)) {
    return {
      outcome: "conflict",
      error: `cannot ${action} a work order in status "${workOrder.status}"`,
    };
  }

  const updatePayload: Record<string, unknown> = {
    status: NEXT_STATUS[action],
  };
  if (action === "claim") updatePayload.assigned_user_id = user.id;

  let query = supabase
    .from("work_orders")
    .update(updatePayload)
    .eq("id", workOrderId)
    .in("status", VALID_TRANSITIONS[action]);
  if (action === "claim") query = query.is("assigned_user_id", null);

  const { data: updated, error: updateError } = await query.select("id");
  if (updateError) return { outcome: "retry", error: updateError.message };
  if (!updated || updated.length === 0) {
    return {
      outcome: "conflict",
      error: "work order status changed under you while offline",
    };
  }
  return { outcome: "ok" };
}

// Registry, keyed by the same `kind` string stored on each queued row.
// New mutation kinds (the commissioning submission in #48, self-reads,
// etc.) register here — the queue/retry/conflict machinery in sync.ts
// never needs to change to support them. Insert-shaped operations (a new
// row, unlike this update-shaped one) should reuse the outbox's
// idempotency key as the row's own primary key on the client side, so a
// retried INSERT after a lost response hits a harmless duplicate-key
// conflict instead of creating a second row — not exercised here since no
// insert-shaped field mutation exists in the app yet.
export const OPERATIONS = {
  work_order_status: executeWorkOrderStatus,
} satisfies Record<string, (payload: never) => Promise<OperationResult>>;

export type OperationKind = keyof typeof OPERATIONS;
