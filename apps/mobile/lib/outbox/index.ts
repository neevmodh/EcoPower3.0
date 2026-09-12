// The queue itself (#45). enqueue() is the only thing UI code calls —
// screens never talk to Supabase directly for a mutation that needs to
// survive going offline mid-tap.
import * as Crypto from "expo-crypto";
import { getDb } from "./db";
import type { OPERATIONS, OperationKind } from "./operations";
import type { OutboxRow, OutboxStatus } from "./types";

export type { OutboxRow, OutboxStatus };

// Enqueuing the exact same logical action twice before the first sync
// completes (a double-tap on "Complete", or tapping again after backing
// out and back in) reuses the existing pending/failed row instead of
// piling up a second one — the idempotency key (the row's own id) is what
// makes this safe to de-duplicate on, and it's also what a retried
// INSERT-shaped operation (once one exists) would send as its own primary
// key so a lost-response retry can't create a duplicate row server-side.
export async function enqueue<K extends OperationKind>(
  kind: K,
  payload: Parameters<(typeof OPERATIONS)[K]>[0],
): Promise<string> {
  const db = await getDb();
  const payloadJson = JSON.stringify(payload);

  const existing = await db.getFirstAsync<{ id: string }>(
    "select id from outbox_operations where kind = ? and payload = ? and status in ('pending', 'failed') limit 1",
    [kind, payloadJson],
  );
  if (existing) return existing.id;

  const id = Crypto.randomUUID();
  await db.runAsync(
    "insert into outbox_operations (id, kind, payload, status, attempt_count, next_attempt_at, created_at) values (?, ?, ?, 'pending', 0, 0, ?)",
    [id, kind, payloadJson, Date.now()],
  );
  return id;
}

export async function listOutbox(): Promise<OutboxRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxRow>(
    "select * from outbox_operations order by created_at asc",
  );
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    "select count(*) as n from outbox_operations where status != 'conflict'",
  );
  return row?.n ?? 0;
}

// A conflicted operation is dead — the precondition it needed is gone, and
// retrying it can only ever fail the same way. The technician has to see
// it and explicitly dismiss it (never silently drop it — #45's whole
// point is not hiding queue state).
export async function dismissConflict(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "delete from outbox_operations where id = ? and status = 'conflict'",
    [id],
  );
}

export { runSync } from "./sync";
