import { describe, expect, it } from "vitest";
import { BillingProfileSchema, BlockLoadProfileEntrySchema } from "./obis";
import {
  type HESAdapter,
  HESNotImplementedError,
  SimulatedHESAdapter,
  TrilliantUnitySuiteAdapter,
} from "./hes-adapter";

// Compile-time proof both adapters actually satisfy the interface — if
// either drifts from HESAdapter's shape, this file fails to build.
const _simulated: HESAdapter = new SimulatedHESAdapter();
const _trilliant: HESAdapter = new TrilliantUnitySuiteAdapter();

describe("SimulatedHESAdapter", () => {
  it("onDemandRead returns a reading tagged with the requested meter", async () => {
    const adapter = new SimulatedHESAdapter();
    const reading = await adapter.onDemandRead("MTR-001", []);
    expect(reading.meterId).toBe("MTR-001");
    expect(reading.registers.length).toBeGreaterThan(0);
  });

  it("onDemandRead filters registers to the requested OBIS codes", async () => {
    const adapter = new SimulatedHESAdapter(() => ({
      registers: [
        { obis: "1.0.1.8.0.255", value: 100, unit: "kWh" },
        { obis: "1.0.2.8.0.255", value: 5, unit: "kWh" },
      ],
    }));
    const reading = await adapter.onDemandRead("MTR-001", ["1.0.2.8.0.255"]);
    expect(reading.registers).toHaveLength(1);
    expect(reading.registers[0].obis).toBe("1.0.2.8.0.255");
  });

  it("ping reports reachable with a latency", async () => {
    const adapter = new SimulatedHESAdapter();
    const result = await adapter.ping("MTR-001");
    expect(result.reachable).toBe(true);
    expect(result.latencyMs).not.toBeNull();
  });

  it("connect/disconnect accept", async () => {
    const adapter = new SimulatedHESAdapter();
    expect((await adapter.connect("MTR-001")).status).toBe("accepted");
    expect((await adapter.disconnect("MTR-001")).status).toBe("accepted");
  });

  it("setLoadLimit rejects a non-positive limit rather than silently accepting it", async () => {
    const adapter = new SimulatedHESAdapter();
    const ok = await adapter.setLoadLimit("MTR-001", 5);
    const bad = await adapter.setLoadLimit("MTR-001", 0);
    expect(ok.status).toBe("accepted");
    expect(bad.status).toBe("rejected");
  });

  it("getBillingProfile returns one entry per month in range, each schema-valid", async () => {
    const adapter = new SimulatedHESAdapter();
    const profiles = await adapter.getBillingProfile(
      "MTR-001",
      new Date("2026-06-01"),
      new Date("2026-08-01"),
    );
    expect(profiles.length).toBe(3);
    for (const p of profiles) {
      expect(BillingProfileSchema.safeParse(p).success).toBe(true);
    }
  });

  it("getBlockLoadProfile returns 30-minute entries, each schema-valid", async () => {
    const adapter = new SimulatedHESAdapter();
    const entries = await adapter.getBlockLoadProfile(
      "MTR-001",
      new Date("2026-08-30T00:00:00Z"),
      new Date("2026-08-30T02:00:00Z"),
    );
    expect(entries.length).toBe(5); // 00:00, 00:30, 01:00, 01:30, 02:00
    for (const e of entries) {
      expect(BlockLoadProfileEntrySchema.safeParse(e).success).toBe(true);
    }
  });

  it("getEvents returns an array (empty by default, never throws)", async () => {
    const adapter = new SimulatedHESAdapter();
    await expect(adapter.getEvents("MTR-001", new Date())).resolves.toEqual([]);
  });

  it("pushSubscribe + emitReading actually delivers a reading to the callback — proves this is live, not a stub", async () => {
    const adapter = new SimulatedHESAdapter();
    const received: string[] = [];
    await adapter.pushSubscribe(["MTR-001"], (r) => received.push(r.meterId));
    adapter.emitReading("MTR-001");
    expect(received).toEqual(["MTR-001"]);
  });

  it("emitReading is a no-op for a meter that was never subscribed", () => {
    const adapter = new SimulatedHESAdapter();
    expect(() => adapter.emitReading("MTR-NEVER-SUBSCRIBED")).not.toThrow();
  });

  it("unsubscribe stops further deliveries", async () => {
    const adapter = new SimulatedHESAdapter();
    const received: string[] = [];
    await adapter.pushSubscribe(["MTR-001"], (r) => received.push(r.meterId));
    adapter.unsubscribe("MTR-001");
    adapter.emitReading("MTR-001");
    expect(received).toEqual([]);
  });
});

describe("TrilliantUnitySuiteAdapter", () => {
  const adapter = new TrilliantUnitySuiteAdapter();

  it.each([
    ["pushSubscribe", () => adapter.pushSubscribe([], () => {})],
    ["onDemandRead", () => adapter.onDemandRead("MTR-001", [])],
    ["ping", () => adapter.ping("MTR-001")],
    ["connect", () => adapter.connect("MTR-001")],
    ["disconnect", () => adapter.disconnect("MTR-001")],
    ["setLoadLimit", () => adapter.setLoadLimit("MTR-001", 5)],
    ["getBillingProfile", () => adapter.getBillingProfile("MTR-001", new Date(), new Date())],
    ["getBlockLoadProfile", () => adapter.getBlockLoadProfile("MTR-001", new Date(), new Date())],
    ["getEvents", () => adapter.getEvents("MTR-001", new Date())],
  ] as const)("%s throws HESNotImplementedError, not a bare Error", async (_name, call) => {
    await expect(call()).rejects.toBeInstanceOf(HESNotImplementedError);
  });
});
