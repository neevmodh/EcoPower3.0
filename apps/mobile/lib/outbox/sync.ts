// The retry loop (#45). Exponential backoff, capped — a technician in a
// basement with no signal for an hour shouldn't have the app hammering
// Supabase every few seconds the whole time, but the first retry after a
// blip should still be fast.
import { getDb } from "./db";
import { OPERATIONS, type OperationKind } from "./operations";
import type { OutboxRow } from "./types";

const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

function backoffFor(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

let syncing = false;

// Safe to call opportunistically and often (AppState becoming active, a
// periodic timer, a manual "sync now" tap) — the `syncing` guard collapses
// overlapping calls into one pass, and each row's own next_attempt_at
// filter means a call that finds nothing due does honestly nothing.
export async function runSync(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const db = await getDb();
    const now = Date.now();
    const due = await db.getAllAsync<OutboxRow>(
      "select * from outbox_operations where status in ('pending', 'failed') and next_attempt_at <= ? order by created_at asc",
      [now],
    );

    for (const row of due) {
      await db.runAsync(
        "update outbox_operations set status = 'syncing' where id = ?",
        [row.id],
      );

      const execute = OPERATIONS[row.kind as OperationKind];
      const result = await execute(JSON.parse(row.payload)).catch(
        (err: unknown) => ({
          outcome: "retry" as const,
          error: err instanceof Error ? err.message : "unknown error",
        }),
      );

      if (result.outcome === "ok") {
        await db.runAsync("delete from outbox_operations where id = ?", [
          row.id,
        ]);
      } else if (result.outcome === "conflict") {
        await db.runAsync(
          "update outbox_operations set status = 'conflict', last_error = ? where id = ?",
          [result.error, row.id],
        );
      } else {
        const attempt = row.attempt_count + 1;
        await db.runAsync(
          "update outbox_operations set status = 'failed', attempt_count = ?, next_attempt_at = ?, last_error = ? where id = ?",
          [attempt, now + backoffFor(attempt), result.error, row.id],
        );
      }
    }
  } finally {
    syncing = false;
  }
}
