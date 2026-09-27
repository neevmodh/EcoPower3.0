// Real component checks (#56) — the previous version returned a hardcoded
// {status:'ok'} regardless of whether anything downstream actually worked.
// Point external uptime monitoring at this: a measured 99.x% over weeks
// beats a claimed 99.99%, and elapsed time can't be manufactured later.
import { GEMINI_MODEL } from "@/lib/ai/gemini";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 4000;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    // Without this, every request that resolves before the timeout still
    // leaves the timer running — it fires later and rejects a promise
    // nothing is awaiting, an unhandled rejection on every single healthy
    // check. On a route meant to be polled continuously, that's not rare.
    if (timer) clearTimeout(timer);
  }
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

type CronJobStatus = { jobname: string; last_success: string | null; stale: boolean };

async function checkCronJobs(): Promise<{ ok: boolean; detail?: string; jobs?: CronJobStatus[] }> {
  try {
    const supabase = await createClient();
    const { data, error } = await withTimeout(
      Promise.resolve(supabase.rpc("health_check_cron_jobs")),
      "cron",
    );
    if (error) return { ok: false, detail: error.message };
    const jobs = (data ?? []) as CronJobStatus[];
    const stale = jobs.filter((j) => j.stale);
    return {
      ok: stale.length === 0,
      detail: stale.length
        ? `stale: ${stale.map((j) => j.jobname).join(", ")}`
        : undefined,
      jobs,
    };
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
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}?key=${apiKey}`),
      "gemini",
    );
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "unknown error" };
  }
}

export async function GET() {
  const [database, gemini, cron] = await Promise.all([
    checkDatabase(),
    checkGemini(),
    checkCronJobs(),
  ]);

  // Gemini or a stale cron sweeper degrades the product (AI features, or a
  // sweeper's own downstream effect like SLA credit / offline status) but
  // isn't fatal the way an unreachable database is — reflected in overall
  // status, not treated as equally severe.
  const overall = !database.ok ? "down" : !gemini.ok || !cron.ok ? "degraded" : "ok";

  return Response.json(
    {
      status: overall,
      service: "ecopower-web",
      time: new Date().toISOString(),
      components: { database, gemini, cron },
    },
    { status: database.ok ? 200 : 503 },
  );
}
