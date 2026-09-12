// The UI-facing half of #45: keeps a live view of the queue (never hide
// its state from the technician) and drives the retry loop opportunistically
// — on mount, whenever the app comes back to the foreground, and on a
// periodic timer as a floor. No @react-native-community/netinfo dependency
// yet: AppState-on-foreground plus the periodic timer covers "reconnect"
// well enough for a first cut without adding a new native module this
// session has no device to verify — a real reconnect-triggered sync (fire
// the instant connectivity returns, not up to POLL_INTERVAL_MS later) is a
// worthwhile follow-up, not a silently-dropped requirement.
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import {
  dismissConflict,
  enqueue,
  listOutbox,
  pendingCount,
  runSync,
} from "../lib/outbox";
import type { OPERATIONS, OperationKind } from "../lib/outbox/operations";
import type { OutboxRow } from "../lib/outbox/types";

const POLL_INTERVAL_MS = 10_000;

export function useOutbox() {
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    const [all, count] = await Promise.all([listOutbox(), pendingCount()]);
    setRows(all);
    setPending(count);
  }, []);

  const sync = useCallback(async () => {
    await runSync();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    sync();
    const interval = setInterval(sync, POLL_INTERVAL_MS);
    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "active") sync();
    });
    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [sync]);

  const enqueueOperation = useCallback(
    async <K extends OperationKind>(
      kind: K,
      payload: Parameters<(typeof OPERATIONS)[K]>[0],
    ) => {
      await enqueue(kind, payload);
      await refresh();
      sync();
    },
    [refresh, sync],
  );

  const dismiss = useCallback(
    async (id: string) => {
      await dismissConflict(id);
      await refresh();
    },
    [refresh],
  );

  return {
    rows,
    pending,
    sync,
    enqueue: enqueueOperation,
    dismissConflict: dismiss,
  };
}
