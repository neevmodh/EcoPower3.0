import { describe, expect, it } from "vitest";
import { signReading, verifyReading } from "./publisher";
import type { Reading } from "@ecopower/shared";

const reading: Reading = {
  meterId: "MTR-001",
  timestamp: "2026-06-15T00:00:00.000Z",
  registers: [{ obis: "1.0.1.8.0.255", value: 41.8, unit: "kWh" }],
};

describe("signReading / verifyReading", () => {
  it("a payload signed with the correct secret verifies", () => {
    const signed = signReading(reading, "correct-secret");
    expect(verifyReading(signed, "correct-secret")).toBe(true);
  });

  it("verification fails against the wrong secret — this is the whole point of per-device keys", () => {
    const signed = signReading(reading, "correct-secret");
    expect(verifyReading(signed, "wrong-secret")).toBe(false);
  });

  it("verification fails if the payload was tampered with after signing", () => {
    const signed = signReading(reading, "correct-secret");
    const tampered = {
      ...signed,
      reading: { ...signed.reading, registers: [{ obis: "1.0.1.8.0.255" as const, value: 9999, unit: "kWh" as const }] },
    };
    expect(verifyReading(tampered, "correct-secret")).toBe(false);
  });
});
