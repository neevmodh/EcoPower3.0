import { describe, expect, it } from "vitest";
import { verifySignature, isWithinReplayWindow, isFromTheFuture, REPLAY_WINDOW_MS, FUTURE_SKEW_TOLERANCE_MS } from "./hmac";
import { createHmac } from "node:crypto";
import type { Reading } from "@ecopower/shared";

const reading: Reading = {
  meterId: "MTR-001",
  timestamp: "2026-06-15T00:00:00.000Z",
  registers: [{ obis: "1.0.1.8.0.255", value: 41.8, unit: "kWh" }],
};

function sign(r: Reading, secret: string) {
  return createHmac("sha256", secret).update(JSON.stringify(r)).digest("hex");
}

describe("verifySignature", () => {
  it("accepts a correctly signed payload", () => {
    const signature = sign(reading, "secret-1");
    expect(verifySignature({ reading, signature }, "secret-1")).toBe(true);
  });

  it("rejects the wrong secret", () => {
    const signature = sign(reading, "secret-1");
    expect(verifySignature({ reading, signature }, "secret-2")).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const signature = sign(reading, "secret-1");
    const tampered: Reading = { ...reading, registers: [{ obis: "1.0.1.8.0.255", value: 999999, unit: "kWh" }] };
    expect(verifySignature({ reading: tampered, signature }, "secret-1")).toBe(false);
  });
});

describe("isWithinReplayWindow", () => {
  it("accepts a fresh reading", () => {
    const now = new Date("2026-06-15T00:05:00Z");
    expect(isWithinReplayWindow("2026-06-15T00:04:50Z", now)).toBe(true);
  });

  it("rejects a reading older than the replay window", () => {
    const now = new Date("2026-06-15T01:00:00Z");
    expect(isWithinReplayWindow("2026-06-15T00:00:00Z", now)).toBe(false);
  });

  it("does NOT reject a reading dated in the future — that's a separate clock-skew concern", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const future = new Date(now.getTime() + REPLAY_WINDOW_MS * 10).toISOString();
    expect(isWithinReplayWindow(future, now)).toBe(true);
  });
});

describe("isFromTheFuture", () => {
  it("is false for a reading at or near the current time", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    expect(isFromTheFuture(now.toISOString(), now)).toBe(false);
  });

  it("is true once a reading exceeds the future-skew tolerance", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const tooFarAhead = new Date(now.getTime() + FUTURE_SKEW_TOLERANCE_MS + 1000).toISOString();
    expect(isFromTheFuture(tooFarAhead, now)).toBe(true);
  });

  it("is false for a reading just inside the tolerance", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const justInside = new Date(now.getTime() + FUTURE_SKEW_TOLERANCE_MS - 1000).toISOString();
    expect(isFromTheFuture(justInside, now)).toBe(false);
  });
});
