import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { EvCharging } from "@/components/EvCharging";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { consumerNav } from "@/lib/panelNav";
import { getScope } from "@/lib/auth";
import { getLocale, getT } from "@/lib/i18n.server";
import { createClient } from "@/lib/supabase/server";

export default async function ConsumerEvPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;
  const t = await getT();
  const locale = await getLocale();

  const { data: connections } = await supabase.from("service_connections").select("id");
  const connectionId = connections?.[0]?.id ?? null;

  const [{ data: vehicles }, { data: stations }, { data: sessions }] = await Promise.all([
    supabase.from("ev_vehicles").select("id, make_model, battery_kwh, range_km").order("created_at"),
    supabase
      .from("charging_stations")
      .select("id, name, operator, area, connector_type, price_paise_per_kwh, fast_charge, bays")
      .order("price_paise_per_kwh"),
    supabase
      .from("ev_sessions")
      .select("id, vehicle_id, station_id, preferred_source, scheduled_for, energy_kwh, cost_paise, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      panelLabel={t("consumer.panelName")}
      signOutLabel={t("nav.signOut")}
      headerExtra={<LocaleSwitcher current={locale} />}
      nav={consumerNav("/consumer/ev", t)}
    >
      <h1 className="text-2xl font-semibold mb-1">EV charging</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Register a vehicle, find nearby public charging, and log home or public sessions with a preferred source. Charging
        against solar hours keeps the cost near your generation rate.
      </p>
      <EvCharging
        userId={user.id}
        connectionId={connectionId}
        vehicles={(vehicles ?? []).map((v) => ({
          id: v.id,
          make_model: v.make_model,
          battery_kwh: Number(v.battery_kwh),
          range_km: v.range_km == null ? null : Number(v.range_km),
        }))}
        stations={(stations ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          operator: s.operator,
          area: s.area,
          connector_type: s.connector_type,
          price_paise_per_kwh: Number(s.price_paise_per_kwh),
          fast_charge: s.fast_charge,
          bays: Number(s.bays),
        }))}
        sessions={(sessions ?? []).map((se) => ({
          id: se.id,
          vehicle_id: se.vehicle_id,
          station_id: se.station_id,
          preferred_source: se.preferred_source,
          scheduled_for: se.scheduled_for,
          energy_kwh: se.energy_kwh == null ? null : Number(se.energy_kwh),
          cost_paise: se.cost_paise == null ? null : Number(se.cost_paise),
          status: se.status,
          created_at: se.created_at,
        }))}
      />
    </PanelShell>
  );
}
