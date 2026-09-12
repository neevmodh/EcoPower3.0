// HMAC payload signing — a second integrity layer independent of the MQTT
// connection itself (which #14 already authenticates by username/password).
// #15's ingest worker recomputes this over the raw bytes and rejects a
// mismatch, so a compromised network path between broker and worker can't
// silently alter a reading.

import { createHmac } from "node:crypto";
import type { Reading } from "@ecopower/shared";

export interface SignedPayload {
  reading: Reading;
  signature: string;
}

export function signReading(reading: Reading, hmacSecret: string): SignedPayload {
  const canonical = JSON.stringify(reading);
  const signature = createHmac("sha256", hmacSecret).update(canonical).digest("hex");
  return { reading, signature };
}

export function verifyReading(payload: SignedPayload, hmacSecret: string): boolean {
  const expected = createHmac("sha256", hmacSecret).update(JSON.stringify(payload.reading)).digest("hex");
  return expected === payload.signature;
}
