// The simulated meter fleet. Credentials come from env vars (see .env,
// gitignored) — provisioned in EMQX the same way #14 documents, one secret
// per device, no shared secret.

export interface SimulatedMeter {
  serial: string;
  mqttPassword: string;
  hmacSecret: string;
  sanctionedLoadKw: number;
  pvCapacityKw: number; // 0 = no solar, pure consumption
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name}`);
  return value;
}

export function loadFleet(): SimulatedMeter[] {
  return [
    {
      serial: "DEMO-METER-001",
      mqttPassword: requireEnv("METER_DEMO_METER_001_PASSWORD"),
      hmacSecret: requireEnv("METER_DEMO_METER_001_SECRET"),
      sanctionedLoadKw: 5,
      pvCapacityKw: 5, // net-metered rooftop solar
    },
    {
      serial: "DEMO-METER-002",
      mqttPassword: requireEnv("METER_DEMO_METER_002_PASSWORD"),
      hmacSecret: requireEnv("METER_DEMO_METER_002_SECRET"),
      sanctionedLoadKw: 3,
      pvCapacityKw: 0, // consumption only — no solar
    },
    {
      serial: "DEMO-METER-003",
      mqttPassword: requireEnv("METER_DEMO_METER_003_PASSWORD"),
      hmacSecret: requireEnv("METER_DEMO_METER_003_SECRET"),
      sanctionedLoadKw: 8,
      pvCapacityKw: 3,
    },
  ];
}
