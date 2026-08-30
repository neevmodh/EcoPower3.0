import { describe, expect, it } from "vitest";
import {
  OBIS,
  BillingProfileSchema,
  BlockLoadProfileSchema,
  EventPayloadSchema,
  InstantaneousSchema,
  RegisterReadingSchema,
} from "./obis";

describe("RegisterReadingSchema", () => {
  it("accepts a valid cumulative import register", () => {
    const result = RegisterReadingSchema.safeParse({
      obis: OBIS.CUMULATIVE_ACTIVE_IMPORT,
      value: 41.8,
      unit: "kWh",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative register — registers only ever increase", () => {
    const result = RegisterReadingSchema.safeParse({
      obis: OBIS.CUMULATIVE_ACTIVE_IMPORT,
      value: -1,
      unit: "kWh",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an OBIS code not in the defined register set", () => {
    const result = RegisterReadingSchema.safeParse({
      obis: "9.9.9.9.9.255",
      value: 41.8,
      unit: "kWh",
    });
    expect(result.success).toBe(false);
  });
});

describe("BlockLoadProfileSchema", () => {
  it("accepts the 30-minute consumer-meter interval", () => {
    const result = BlockLoadProfileSchema.safeParse({
      meterSerial: "MTR-001",
      intervalMinutes: 30,
      entries: [
        {
          timestamp: "2026-08-30T06:00:00Z",
          registers: [{ obis: OBIS.CUMULATIVE_ACTIVE_IMPORT, value: 100.5, unit: "kWh" }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts the 15-minute interface/feeder-meter interval", () => {
    const result = BlockLoadProfileSchema.safeParse({
      meterSerial: "MTR-FEEDER-001",
      intervalMinutes: 15,
      entries: [
        {
          timestamp: "2026-08-30T06:00:00Z",
          registers: [{ obis: OBIS.CUMULATIVE_ACTIVE_IMPORT, value: 100.5, unit: "kWh" }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an interval that isn't 15 or 30 minutes", () => {
    const result = BlockLoadProfileSchema.safeParse({
      meterSerial: "MTR-001",
      intervalMinutes: 60,
      entries: [{ timestamp: "2026-08-30T06:00:00Z", registers: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty entries array", () => {
    const result = BlockLoadProfileSchema.safeParse({
      meterSerial: "MTR-001",
      intervalMinutes: 30,
      entries: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("InstantaneousSchema", () => {
  it("accepts a valid three-phase instantaneous snapshot", () => {
    const result = InstantaneousSchema.safeParse({
      obis: OBIS.INSTANTANEOUS_BLOCK,
      meterSerial: "MTR-001",
      timestamp: "2026-08-30T06:00:00Z",
      frequency: 50.02,
      phases: [
        { phase: "R", voltage: 231.2, current: 4.1, powerFactor: 0.98 },
        { phase: "Y", voltage: 230.8, current: 3.9, powerFactor: 0.97 },
        { phase: "B", voltage: 229.9, current: 4.0, powerFactor: 0.96 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a power factor outside [-1, 1]", () => {
    const result = InstantaneousSchema.safeParse({
      obis: OBIS.INSTANTANEOUS_BLOCK,
      meterSerial: "MTR-001",
      timestamp: "2026-08-30T06:00:00Z",
      frequency: 50.0,
      phases: [{ phase: "R", voltage: 231.2, current: 4.1, powerFactor: 1.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a fourth phase", () => {
    const result = InstantaneousSchema.safeParse({
      obis: OBIS.INSTANTANEOUS_BLOCK,
      meterSerial: "MTR-001",
      timestamp: "2026-08-30T06:00:00Z",
      frequency: 50.0,
      phases: [
        { phase: "R", voltage: 231, current: 4, powerFactor: 0.9 },
        { phase: "Y", voltage: 231, current: 4, powerFactor: 0.9 },
        { phase: "B", voltage: 231, current: 4, powerFactor: 0.9 },
        { phase: "R", voltage: 231, current: 4, powerFactor: 0.9 },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("BillingProfileSchema", () => {
  it("accepts a valid monthly billing snapshot", () => {
    const result = BillingProfileSchema.safeParse({
      obis: OBIS.BILLING_PROFILE,
      meterSerial: "MTR-001",
      billingDate: "2026-08-01",
      registers: [{ obis: OBIS.CUMULATIVE_ACTIVE_IMPORT, value: 3420.5, unit: "kWh" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a billing profile tagged with the wrong OBIS code", () => {
    const result = BillingProfileSchema.safeParse({
      obis: OBIS.INSTANTANEOUS_BLOCK,
      meterSerial: "MTR-001",
      billingDate: "2026-08-01",
      registers: [{ obis: OBIS.CUMULATIVE_ACTIVE_IMPORT, value: 3420.5, unit: "kWh" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("EventPayloadSchema", () => {
  it("accepts the magnetic tamper event — the planted-defect signature (#59)", () => {
    const result = EventPayloadSchema.safeParse({
      meterSerial: "MTR-001",
      timestamp: "2026-08-30T06:00:00Z",
      eventCode: "MAGNETIC_TAMPER",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an event code outside the IS 15959 set", () => {
    const result = EventPayloadSchema.safeParse({
      meterSerial: "MTR-001",
      timestamp: "2026-08-30T06:00:00Z",
      eventCode: "SOMETHING_MADE_UP",
    });
    expect(result.success).toBe(false);
  });
});
