// Real component checks (#56) — the previous version returned a hardcoded
// {status:'ok'} regardless of whether anything downstream actually worked.
// Point external uptime monitoring at this: a measured 99.x% over weeks
// beats a claimed 99.99%, and elapsed time can't be manufactured later.
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 4000;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
  );
  return Promise.race([promise, timeout]);
}

async function checkDatabase(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const supabase = await createClient();
    // A real round trip against a genuinely public table (data_provenance,
    // #74/#75 — anon-readable by design) — proves the DB and PostgREST are
    // both up, not just that the process is running.
    const { error } = await withTimeout(
      Promise.resolve(supabase.from("data_provenance").select("id", { head: true, count: "exact" }).limit(1)),
      "database",
    );
    if (error) return { ok: false, detail: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "unknown error" };
  }
}

async function checkGemini(): Promise<{ ok: boolean; detail?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, detail: "GEMINI_API_KEY not configured" };
  try {
    // Model metadata, not generateContent — verifies the key actually
    // authenticates (the open question in #90) without spending generation
    // tokens on every health-check tick.
    const res = await withTimeout(
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite?key=${apiKey}`),
      "gemini",
    );
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "unknown error" };
  }
}

export async function GET() {
  const [database, gemini] = await Promise.all([checkDatabase(), checkGemini()]);

  // Gemini being down degrades the AI advisor/bill-explainer, not the core
  // product — reflected in overall status, not treated as equally fatal to
  // the database being unreachable.
  const overall = !database.ok ? "down" : !gemini.ok ? "degraded" : "ok";

  return Response.json(
    {
      status: overall,
      service: "ecopower-web",
      time: new Date().toISOString(),
      components: { database, gemini },
    },
    { status: database.ok ? 200 : 503 },
  );
}
