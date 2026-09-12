// Verifies the signature #12's simulator (and eventually real meters via
// #48's commissioning) attaches to every reading. Mirrors
// apps/simulator/src/publisher.ts's signing logic — duplicated rather than
// imported, since packages/shared has no Node built-ins by design (#1) and
// this is a five-line function, not worth a new shared-Node package for.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Reading } from "@ecopower/shared";

export interface SignedPayload {
  reading: Reading;
  signature: string;
}

export function verifySignature(payload: SignedPayload, hmacSecret: string): boolean {
  const expected = createHmac("sha256", hmacSecret).update(JSON.stringify(payload.reading)).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(payload.signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Replay window: how old a signed reading is allowed to be before it's
// treated as a replayed (captured-and-resent) message rather than fresh
// data. One-sided on purpose — a reading dated in the FUTURE isn't a replay,
// it's a clock-skew problem, and that's handled separately by the
// quarantine check downstream, not rejected outright here.
export const REPLAY_WINDOW_MS = 30 * 60_000;

export function isWithinReplayWindow(readingTimestamp: string, receivedAt: Date = new Date()): boolean {
  const readingTime = new Date(readingTimestamp).getTime();
  const age = receivedAt.getTime() - readingTime;
  return age <= REPLAY_WINDOW_MS;
}

// Clock skew, not a replay: a reading timestamped more than this far in the
// future goes to quarantine_readings, not the bin. Silently dropping bad
// data is how billing disputes start.
export const FUTURE_SKEW_TOLERANCE_MS = 5 * 60_000;

export function isFromTheFuture(readingTimestamp: string, receivedAt: Date = new Date()): boolean {
  const readingTime = new Date(readingTimestamp).getTime();
  return readingTime - receivedAt.getTime() > FUTURE_SKEW_TOLERANCE_MS;
}
