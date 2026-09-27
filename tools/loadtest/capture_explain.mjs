// tools/loadtest/capture_explain.mjs (#57) — captures EXPLAIN (ANALYZE,
// BUFFERS) as the `authenticated` role with real JWT claims, the same
// discipline every other number this platform shows is held to: not as
// the table owner (which bypasses RLS and understates the real cost).
//
// Usage: node tools/loadtest/capture_explain.mjs > supabase/tests/perf/<date>.txt
// Point DATABASE_URL, ORG_ID, DIVISION_ID at a real target and its own
// discom_officer's org/division to profile against real scale instead of
// the LOADTEST- fixture seed_scale_readings() creates locally.
import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ORG_ID = process.env.ORG_ID ?? "99000000-0000-0000-0000-000000000001";
const DIVISION_ID = process.env.DIVISION_ID ?? "99000000-0000-0000-0000-000000000002";

const c = new pg.Client({ connectionString: DATABASE_URL });
await c.connect();

const claims = JSON.stringify({
  sub: "99000000-0000-0000-0000-0000000000f1",
  role: "authenticated",
  app_metadata: {
    roles: ["discom_officer"],
    org_ids: [ORG_ID],
    division_ids: [DIVISION_ID],
  },
});

let out = "";
async function run(label, sql) {
  await c.query("begin");
  await c.query("set local role authenticated");
  await c.query(`set local request.jwt.claims = '${claims}'`);
  const res = await c.query(`explain (analyze, buffers, format text) ${sql}`);
  await c.query("rollback");
  out += `\n### ${label}\n\n\`\`\`\n${sql}\n\`\`\`\n\n\`\`\`\n${res.rows.map((r) => r["QUERY PLAN"]).join("\n")}\n\`\`\`\n`;
}

await run(
  "DT loss summary (dt_loss_summary(), #26/#27 — the DISCOM losses page's real query)",
  "select * from dt_loss_summary()",
);

await run(
  "Division-scoped meter_readings scan (partition pruning target — last 7 days, one division)",
  `select * from meter_readings where division_id = '${DIVISION_ID}' and reading_ts >= now() - interval '7 days' order by reading_ts desc limit 100`,
);

await run(
  "Full-table meter_readings count for this division (worst case for the InitPlan claim — touches every matching row, not just the top 100)",
  `select count(*) from meter_readings where division_id = '${DIVISION_ID}'`,
);

console.log(out);
await c.end();
