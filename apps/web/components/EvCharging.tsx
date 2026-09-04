"use client";

// EV charging (migration 0027). Register a vehicle, see nearby public
// stations from the seeded catalogue, and log or schedule a charging
// session with a preferred source (solar / grid / any). Sessions and
// vehicles are the consumer's own rows; the station list is demo reference
// data, labelled as such.

import { useState } from "react";
import { formatInrFromPaise } from "@ecopower/shared";
import { createClient } from "@/lib/supabase/browser";
import { PanelIcon } from "./Icon";

type Vehicle = { id: string; make_model: string; battery_kwh: number; range_km: number | null };
type Station = {
  id: string;
  name: string;
  operator: string;
  area: string;
  connector_type: string;
  price_paise_per_kwh: number;
  fast_charge: boolean;
  bays: number;
};
type Session = {
  id: string;
  vehicle_id: string;
  station_id: string | null;
  preferred_source: string;
  scheduled_for: string | null;
  energy_kwh: number | null;
  cost_paise: number | null;
  status: string;
  created_at: string;
};

export function EvCharging({
  userId,
  connectionId,
  vehicles,
  stations,
  sessions,
}: {
  userId: string;
  connectionId: string | null;
  vehicles: Vehicle[];
  stations: Station[];
  sessions: Session[];
}) {
  const [error, setError] = useState<string | null>(null);
  const reload = () => window.location.reload();

  // add vehicle
  const [vm, setVm] = useState("");
  const [batt, setBatt] = useState("");
  const [range, setRange] = useState("");
  const [addingV, setAddingV] = useState(false);

  // log session
  const [selVehicle, setSelVehicle] = useState(vehicles[0]?.id ?? "");
  const [selStation, setSelStation] = useState("");
  const [source, setSource] = useState<"solar" | "grid" | "any">("any");
  const [energy, setEnergy] = useState("");
  const [addingS, setAddingS] = useState(false);

  const stationById = new Map(stations.map((s) => [s.id, s]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!vm.trim() || !Number(batt)) return;
    setAddingV(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("ev_vehicles").insert({
      owner_user_id: userId,
      service_connection_id: connectionId,
      make_model: vm.trim(),
      battery_kwh: Number(batt),
      range_km: range ? Number(range) : null,
    });
    if (err) {
      setError(err.message);
      setAddingV(false);
      return;
    }
    reload();
  }

  async function logSession(e: React.FormEvent) {
    e.preventDefault();
    if (!selVehicle) return;
    const kwh = energy ? Number(energy) : null;
    const st = selStation ? stationById.get(selStation) : null;
    const home = !selStation;
    const cost =
      kwh != null && st ? Math.round(kwh * st.price_paise_per_kwh) : kwh != null && home ? Math.round(kwh * 650) : null;
    setAddingS(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("ev_sessions").insert({
      vehicle_id: selVehicle,
      station_id: selStation || null,
      preferred_source: source,
      energy_kwh: kwh,
      cost_paise: cost,
      status: kwh != null ? "completed" : "scheduled",
      started_at: kwh != null ? new Date().toISOString() : null,
      ended_at: kwh != null ? new Date().toISOString() : null,
    });
    if (err) {
      setError(err.message);
      setAddingS(false);
      return;
    }
    reload();
  }

  const inputCls = "rounded-control border px-3 py-1.5 text-sm";
  const inputStyle = { borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" } as const;

  return (
    <div className="space-y-8">
      {error && (
        <p className="text-sm" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}

      <div>
        <h2 className="text-base font-semibold mb-3">Your vehicles</h2>
        {vehicles.length > 0 && (
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {vehicles.map((v) => (
              <div
                key={v.id}
                className="rounded-card border card-shadow p-4"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
              >
                <div className="flex items-center gap-2">
                  <PanelIcon name="battery" size={16} />
                  <span className="font-medium text-sm">{v.make_model}</span>
                </div>
                <div className="mono text-xs mt-1.5" style={{ color: "var(--color-text-secondary)" }}>
                  {v.battery_kwh} kWh{v.range_km ? ` · ${v.range_km} km range` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={addVehicle} className="flex flex-wrap items-end gap-2">
          <input value={vm} onChange={(e) => setVm(e.target.value)} placeholder="Make & model" className={inputCls} style={inputStyle} />
          <input value={batt} onChange={(e) => setBatt(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Battery kWh" className={`${inputCls} w-28`} style={inputStyle} />
          <input value={range} onChange={(e) => setRange(e.target.value.replace(/[^\d]/g, ""))} placeholder="Range km" className={`${inputCls} w-24`} style={inputStyle} />
          <button
            type="submit"
            disabled={addingV}
            className="rounded-control border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            style={{ borderColor: "var(--color-border)" }}
          >
            {addingV ? "Adding…" : "Add vehicle"}
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-3">Nearby public charging</h2>
        <div
          className="rounded-card border card-shadow divide-y"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
        >
          {stations.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">
                  {s.name}
                  {s.fast_charge && (
                    <span className="mono text-[10px] ml-2 rounded-full px-2 py-0.5" style={{ background: "var(--color-surface-sunken)", color: "var(--color-categorical-generation)" }}>
                      fast DC
                    </span>
                  )}
                </div>
                <div className="mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {s.operator} · {s.area} · {s.connector_type} · {s.bays} bays
                </div>
              </div>
              <span className="mono text-sm">₹{(s.price_paise_per_kwh / 100).toFixed(2)}/kWh</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] mt-2" style={{ color: "var(--color-text-tertiary)" }}>
          Demo reference data — representative Gujarat public-charging tariffs.
        </p>
      </div>

      {vehicles.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Log or schedule a session</h2>
          <form
            onSubmit={logSession}
            className="rounded-card border card-shadow p-4 flex flex-wrap items-end gap-3"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <select value={selVehicle} onChange={(e) => setSelVehicle(e.target.value)} className={inputCls} style={inputStyle}>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make_model}
                </option>
              ))}
            </select>
            <select value={selStation} onChange={(e) => setSelStation(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">Home charger</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value as "solar" | "grid" | "any")} className={inputCls} style={inputStyle}>
              <option value="any">Any source</option>
              <option value="solar">Prefer solar hours</option>
              <option value="grid">Grid</option>
            </select>
            <input value={energy} onChange={(e) => setEnergy(e.target.value.replace(/[^\d.]/g, ""))} placeholder="kWh (blank = schedule)" className={`${inputCls} w-40`} style={inputStyle} />
            <button
              type="submit"
              disabled={addingS}
              className="rounded-control px-3 py-1.5 text-sm font-semibold on-accent disabled:opacity-50"
              style={{ background: "var(--color-categorical-third)" }}
            >
              {addingS ? "Saving…" : "Save session"}
            </button>
          </form>
        </div>
      )}

      {sessions.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Session history</h2>
          <div
            className="rounded-card border card-shadow divide-y"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            {sessions.map((se) => {
              const st = se.station_id ? stationById.get(se.station_id) : null;
              const v = vehicleById.get(se.vehicle_id);
              return (
                <div key={se.id} className="flex items-center justify-between p-4 text-sm">
                  <div>
                    <span className="font-medium">{v?.make_model ?? "vehicle"}</span>
                    <span style={{ color: "var(--color-text-secondary)" }}>
                      {" · "}
                      {st ? st.name : "Home charger"} · {se.preferred_source}
                    </span>
                  </div>
                  <div className="mono text-xs text-right">
                    {se.energy_kwh != null ? `${se.energy_kwh} kWh` : se.status}
                    {se.cost_paise != null && <> · {formatInrFromPaise(BigInt(se.cost_paise))}</>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
