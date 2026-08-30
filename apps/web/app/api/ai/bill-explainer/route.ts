// AI Bill Explainer — narrates one real invoice's real line items in
// plain language. The model gets the exact computed numbers (from the
// real tariff engine, #19) and is told explicitly to use only those
// numbers — this is deterministic data with an AI narration layer, not an
// AI computing a bill. PS1/2.0's "why is my bill high" feature (#84),
// built for real.
import { createClient } from "@/lib/supabase/server";
import { geminiGenerate } from "@/lib/ai/gemini";
import { isRateLimited } from "@/lib/ai/guardrails";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { invoiceId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.invoiceId) {
    return Response.json({ error: "invoiceId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  if (isRateLimited(userData.user.id)) {
    return Response.json({ error: "rate limit exceeded, try again in a minute" }, { status: 429 });
  }

  // RLS confines this to the caller's own invoice.
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "billing_period_start, billing_period_end, units_imported_milli_kwh, total_paise, invoice_lines(label, amount_paise, line_type)",
    )
    .eq("id", body.invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return Response.json({ error: "invoice not found" }, { status: 404 });
  }

  const lines = (invoice.invoice_lines as unknown as Array<{ label: string; amount_paise: number; line_type: string }>)
    .map((l) => `- ${l.label}: ₹${(l.amount_paise / 100).toFixed(2)}`)
    .join("\n");

  const prompt = `Explain this real electricity invoice to a residential customer in plain, friendly language. Do not restate every line as a bullet list — write 2-3 short sentences a non-technical person would understand, focused on why the total is what it is (e.g. "most of your bill is from X units used at the highest slab rate"). Use ONLY the numbers given below, do not compute or estimate anything new.

Billing period: ${invoice.billing_period_start} to ${invoice.billing_period_end}
Units used: ${(invoice.units_imported_milli_kwh / 1000).toFixed(1)} kWh
Line items:
${lines}
Total: ₹${(invoice.total_paise / 100).toFixed(2)}`;

  try {
    const explanation = await geminiGenerate(
      "You are a plain-language electricity bill explainer for an Indian residential consumer. Be concise, warm, and factual. Never invent a number not given to you.",
      prompt,
    );
    return Response.json({ explanation });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "AI request failed" }, { status: 502 });
  }
}
