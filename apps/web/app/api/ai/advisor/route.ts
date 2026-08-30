// AI Energy Advisor — grounded in the caller's own real data (RLS-scoped,
// same session as every other route), not a generic chatbot. The model
// narrates numbers this route already computed; it is never asked to
// invent a consumption figure or a bill amount — that would be exactly
// the failure mode DESIGN.md P1 exists to prevent, just moved into a chat
// bubble instead of a stat tile.
import { createClient } from "@/lib/supabase/server";
import { geminiGenerate } from "@/lib/ai/gemini";
import { isSuspiciousPrompt, isRateLimited } from "@/lib/ai/guardrails";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) {
    return Response.json({ error: "message required" }, { status: 400 });
  }
  if (message.length > 500) {
    return Response.json({ error: "message too long" }, { status: 400 });
  }
  if (isSuspiciousPrompt(message)) {
    return Response.json({ error: "message not allowed" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  if (isRateLimited(userData.user.id)) {
    return Response.json({ error: "rate limit exceeded, try again in a minute" }, { status: 429 });
  }

  // Real context, nothing invented. RLS confines every query to this
  // caller's own rows, same as every page in the app.
  const { data: connections } = await supabase.from("service_connections").select("id, consumer_number, sanctioned_load_kw");
  const connectionId = connections?.[0]?.id;

  const { data: subscription } = connectionId
    ? await supabase
        .from("subscriptions")
        .select("status, plans(name, price_paise_per_month)")
        .in("service_connection_id", [connectionId])
        .in("status", ["active", "paused"])
        .maybeSingle()
    : { data: null };

  const { data: recentInvoice } = await supabase
    .from("invoices")
    .select("billing_period_start, billing_period_end, units_imported_milli_kwh, total_paise, status")
    .order("billing_period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const plan = subscription?.plans as unknown as { name: string; price_paise_per_month: number } | null;

  const contextLines = [
    connections && connections.length > 0
      ? `Connection: ${connections[0].consumer_number}, sanctioned load ${connections[0].sanctioned_load_kw ?? "unknown"} kW.`
      : "No service connection linked to this account.",
    plan
      ? `Current plan: ${plan.name} at ₹${(plan.price_paise_per_month / 100).toFixed(2)}/month, status ${subscription?.status}.`
      : "No active subscription.",
    recentInvoice
      ? `Most recent invoice: ${recentInvoice.billing_period_start} to ${recentInvoice.billing_period_end}, ${(recentInvoice.units_imported_milli_kwh / 1000).toFixed(1)} kWh, ₹${(recentInvoice.total_paise / 100).toFixed(2)}, status ${recentInvoice.status}.`
      : "No invoices yet.",
  ].join("\n");

  const systemPrompt = `You are the EcoPower energy advisor, embedded in an Indian Energy-as-a-Service platform (solar, battery backup, and performance-guarantee subscriptions billed on real smart-meter data under Gujarat's GERC tariff).

Rules:
- Only use the account data given below. Never invent a kWh figure, a rupee amount, or a date that isn't in this context.
- If the data needed to answer isn't in the context, say so plainly and suggest which EcoPower page has it (Bills, Analytics, Plan, Support).
- Keep answers under 120 words, plain language, no markdown headers.
- You are not a financial or legal advisor — for billing disputes, point the user to Support.

Account context:
${contextLines}`;

  try {
    const reply = await geminiGenerate(systemPrompt, message);
    return Response.json({ reply });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "AI request failed" }, { status: 502 });
  }
}
