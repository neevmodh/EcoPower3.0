import type { OperationKind } from "./operations";

export type OutboxStatus = "pending" | "syncing" | "failed" | "conflict";

export interface OutboxRow {
  id: string;
  kind: OperationKind;
  payload: string;
  status: OutboxStatus;
  attempt_count: number;
  next_attempt_at: number;
  last_error: string | null;
  created_at: number;
}
