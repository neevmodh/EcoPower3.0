// The boundary interface between EcoPower and a real head-end system.
// ~200 LOC that converts the pitch from "a solar app" to "an EaaS layer
// that plugs into your existing HES." IntelliSmart's head-end system is
// Trilliant UnitySuite — naming the adapter after it, with a real typed
// interface behind it, says "drop us in tomorrow" to the people who would
// do the dropping.
//
// `meterId` throughout this interface is the physical meter serial (what a
// real HES addresses a device by), not our internal meters.id — #15's
// ingest worker maps serial -> internal id at the boundary.

import type { BillingProfile, BlockLoadProfileEntry, EventPayload, ObisCode, RegisterReading } from "./obis";

export interface Reading {
  meterId: string;
  timestamp: string;
  registers: RegisterReading[];
  instantaneous?: {
    voltageR: number;
    voltageY: number;
    voltageB: number;
    currentR: number;
    currentY: number;
    currentB: number;
    powerFactor: number;
    frequencyHz: number;
  };
}

export interface PingResult {
  meterId: string;
  reachable: boolean;
  latencyMs: number | null;
  timestamp: string;
}

export type CommandType = "connect" | "disconnect" | "set_load_limit";
export type CommandStatus = "accepted" | "rejected" | "timeout";

export interface CommandAck {
  meterId: string;
  command: CommandType;
  status: CommandStatus;
  detail?: string;
  timestamp: string;
}

export type MeterEvent = EventPayload;
export type BlockLoad = BlockLoadProfileEntry;

export interface HESAdapter {
  pushSubscribe(meterIds: string[], cb: (r: Reading) => void): Promise<void>;
  onDemandRead(meterId: string, obis: ObisCode[]): Promise<Reading>;
  ping(meterId: string): Promise<PingResult>;
  connect(meterId: string): Promise<CommandAck>;
  disconnect(meterId: string): Promise<CommandAck>;
  setLoadLimit(meterId: string, kw: number): Promise<CommandAck>;
  getBillingProfile(meterId: string, from: Date, to: Date): Promise<BillingProfile[]>;
  getBlockLoadProfile(meterId: string, from: Date, to: Date): Promise<BlockLoad[]>;
  getEvents(meterId: string, from: Date): Promise<MeterEvent[]>;
}

// Thrown by every TrilliantUnitySuiteAdapter method — a distinct type so
// callers can distinguish "not wired up yet" from a real integration
// failure, rather than catching a bare Error.
export class HESNotImplementedError extends Error {
  constructor(method: string) {
    super(`TrilliantUnitySuiteAdapter.${method} is not implemented — this is a typed stub for the real UnitySuite integration.`);
    this.name = "HESNotImplementedError";
  }
}

// Typed stub. Every method has the real UnitySuite-facing signature and
// throws immediately — the point is the interface compiling against real
// call sites (#13, #15) today, not a working SOAP/REST client.
export class TrilliantUnitySuiteAdapter implements HESAdapter {
  async pushSubscribe(_meterIds: string[], _cb: (r: Reading) => void): Promise<void> {
    throw new HESNotImplementedError("pushSubscribe");
  }
  async onDemandRead(_meterId: string, _obis: ObisCode[]): Promise<Reading> {
    throw new HESNotImplementedError("onDemandRead");
  }
  async ping(_meterId: string): Promise<PingResult> {
    throw new HESNotImplementedError("ping");
  }
  async connect(_meterId: string): Promise<CommandAck> {
    throw new HESNotImplementedError("connect");
  }
  async disconnect(_meterId: string): Promise<CommandAck> {
    throw new HESNotImplementedError("disconnect");
  }
  async setLoadLimit(_meterId: string, _kw: number): Promise<CommandAck> {
    throw new HESNotImplementedError("setLoadLimit");
  }
  async getBillingProfile(_meterId: string, _from: Date, _to: Date): Promise<BillingProfile[]> {
    throw new HESNotImplementedError("getBillingProfile");
  }
  async getBlockLoadProfile(_meterId: string, _from: Date, _to: Date): Promise<BlockLoad[]> {
    throw new HESNotImplementedError("getBlockLoadProfile");
  }
  async getEvents(_meterId: string, _from: Date): Promise<MeterEvent[]> {
    throw new HESNotImplementedError("getEvents");
  }
}

// A pluggable reading generator, so #12's physical model can be dropped in
// without changing the adapter shape — SimulatedHESAdapter's job is being a
// correctly-typed, working HESAdapter; #12's job is making the numbers
// physically plausible.
export type ReadingGenerator = (meterId: string, timestamp: Date) => Omit<Reading, "meterId" | "timestamp">;

const defaultGenerator: ReadingGenerator = (_meterId, _timestamp) => ({
  registers: [{ obis: "1.0.1.8.0.255", value: 0, unit: "kWh" }],
  instantaneous: {
    voltageR: 230,
    voltageY: 230,
    voltageB: 230,
    currentR: 0,
    currentY: 0,
    currentB: 0,
    powerFactor: 1,
    frequencyHz: 50,
  },
});

// Live in the sense that every method returns real, working, correctly
// shaped data — not a mock returning hardcoded constants regardless of
// input. The default reading generator is a flat placeholder; #12 supplies
// the stochastic appliance model via the constructor.
//
// pushSubscribe deliberately does not start a platform timer itself —
// packages/shared has no Node/DOM globals (#1), so setInterval isn't
// available here, and a real HES pushes on its own schedule regardless of
// what timer API the caller's runtime has. It registers the callback per
// meter; emitReading() is what actually fires one, called either by a
// caller's own scheduler (#15's ingest worker, running in Node) or by tests.
export class SimulatedHESAdapter implements HESAdapter {
  private readonly generate: ReadingGenerator;
  private readonly subscriptions = new Map<string, (r: Reading) => void>();

  constructor(generate: ReadingGenerator = defaultGenerator) {
    this.generate = generate;
  }

  private makeReading(meterId: string, timestamp: Date): Reading {
    return { meterId, timestamp: timestamp.toISOString(), ...this.generate(meterId, timestamp) };
  }

  async pushSubscribe(meterIds: string[], cb: (r: Reading) => void): Promise<void> {
    for (const meterId of meterIds) {
      this.subscriptions.set(meterId, cb);
    }
  }

  unsubscribe(meterId: string): void {
    this.subscriptions.delete(meterId);
  }

  // Fires one push reading for a subscribed meter. No-op if not subscribed.
  emitReading(meterId: string, timestamp: Date = new Date()): void {
    const cb = this.subscriptions.get(meterId);
    if (cb) cb(this.makeReading(meterId, timestamp));
  }

  async onDemandRead(meterId: string, obis: ObisCode[]): Promise<Reading> {
    const reading = this.makeReading(meterId, new Date());
    if (obis.length > 0) {
      reading.registers = reading.registers.filter((r) => obis.includes(r.obis));
    }
    return reading;
  }

  async ping(meterId: string): Promise<PingResult> {
    return { meterId, reachable: true, latencyMs: 20 + Math.round(Math.random() * 30), timestamp: new Date().toISOString() };
  }

  async connect(meterId: string): Promise<CommandAck> {
    return { meterId, command: "connect", status: "accepted", timestamp: new Date().toISOString() };
  }

  async disconnect(meterId: string): Promise<CommandAck> {
    return { meterId, command: "disconnect", status: "accepted", timestamp: new Date().toISOString() };
  }

  async setLoadLimit(meterId: string, kw: number): Promise<CommandAck> {
    if (kw <= 0) {
      return { meterId, command: "set_load_limit", status: "rejected", detail: "load limit must be positive", timestamp: new Date().toISOString() };
    }
    return { meterId, command: "set_load_limit", status: "accepted", detail: `${kw} kW`, timestamp: new Date().toISOString() };
  }

  async getBillingProfile(meterId: string, from: Date, to: Date): Promise<BillingProfile[]> {
    const profiles: BillingProfile[] = [];
    const cursor = new Date(from);
    cursor.setDate(1);
    while (cursor <= to) {
      profiles.push({
        obis: "1.0.98.1.0.255",
        meterSerial: meterId,
        billingDate: cursor.toISOString().slice(0, 10),
        registers: this.makeReading(meterId, cursor).registers,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return profiles;
  }

  async getBlockLoadProfile(meterId: string, from: Date, to: Date): Promise<BlockLoad[]> {
    const entries: BlockLoad[] = [];
    const cursor = new Date(from);
    while (cursor <= to) {
      entries.push({
        timestamp: cursor.toISOString(),
        registers: this.makeReading(meterId, cursor).registers,
      });
      cursor.setMinutes(cursor.getMinutes() + 30);
    }
    return entries;
  }

  async getEvents(_meterId: string, _from: Date): Promise<MeterEvent[]> {
    return [];
  }
}
