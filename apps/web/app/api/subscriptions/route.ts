// Subscribing to a plan (#77/#78). Creates the subscription, logs the
// "created" event, and materializes any guarantee terms bundled into the
// plan's service lines as real service_guarantees rows (#76) — a plan is
// a template, a subscription is the live contract.
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { planId?: string; serviceConnectionId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.planId || !body.serviceConnectionId) {
    return Response.json({ error: "planId and serviceConnectionId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  // RLS confines this to a connection the caller actually owns.
  const { data: connection, error: connectionError } = await supabase
    .from("service_connections")
    .select("id")
    .eq("id", body.serviceConnectionId)
    .single();
  if (connectionError || !connection) {
    return Response.json({ error: "service connection not found" }, { status: 404 });
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, active")
    .eq("id", body.planId)
    .single();
  if (planError || !plan || !plan.active) {
    return Response.json({ error: "plan not found or inactive" }, { status: 404 });
  }

  const { data: subscription, error: insertError } = await supabase
    .from("subscriptions")
    .insert({ service_connection_id: connection.id, plan_id: plan.id })
    .select("id")
    .single();

  if (insertError || !subscription) {
    // The partial unique index (one active/paused subscription per
    // connection) is what turns a double-click or a stale UI into this,
    // not a 500 — the caller already has a live subscription.
    return Response.json({ error: "could not create subscription (an active subscription may already exist)" }, { status: 409 });
  }

  await supabase.from("subscription_events").insert({
    subscription_id: subscription.id,
    event_type: "created",
    to_plan_id: plan.id,
    actor_user_id: userData.user.id,
  });

  const { data: guaranteedServices } = await supabase
    .from("plan_services")
    .select("guarantee_metric, guarantee_contracted_value, guarantee_rate_paise_per_unit_shortfall, guarantee_cap_paise")
    .eq("plan_id", plan.id)
    .not("guarantee_metric", "is", null);

  for (const service of guaranteedServices ?? []) {
    const { error: guaranteeError } = await supabase.from("service_guarantees").insert({
      service_connection_id: connection.id,
      subscription_id: subscription.id,
      metric: service.guarantee_metric,
      contracted_value: service.guarantee_contracted_value,
      measurement_window: "monthly",
      rate_paise_per_unit_shortfall: service.guarantee_rate_paise_per_unit_shortfall,
      cap_paise: service.guarantee_cap_paise,
      effective_from: new Date().toISOString().slice(0, 10),
    });
    if (guaranteeError) {
      // The subscription itself is already created and real — a failed
      // guarantee materialization shouldn't roll that back, but it must
      // not be silent either.
      console.error("failed to materialize service_guarantee for subscription", subscription.id, guaranteeError);
    }
  }

  return Response.json({ subscriptionId: subscription.id });
}
