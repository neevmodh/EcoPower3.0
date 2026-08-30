import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { StatTile } from "@/components/StatTile";
import { LiveMeterTile } from "@/components/LiveMeterTile";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ConsumerPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;

  // No owner filter here either — RLS scopes it to this consumer's rows.
  const { data: connections } = await supabase
    .from("service_connections")
    .select("id, consumer_number, tariff_category, connection_type, sanctioned_load_kw");

  // The consumer's own meter, if one is commissioned — powers the live tile
  // below via #15/#18's Realtime pipeline. RLS scopes meters the same way.
  const connectionIds = (connections ?? []).map((c) => c.id);
  const { data: meter } =
    connectionIds.length > 0
      ? await supabase.from("meters").select("id").in("service_connection_id", connectionIds).limit(1).maybeSingle()
      : { data: null };

  const { data: liveState } = meter
    ? await supabase
        .from("meter_live_state")
        .select("meter_id, last_reading_ts, kwh_import, kwh_export")
        .eq("meter_id", meter.id)
        .maybeSingle()
    : { data: null };

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      nav={[
        { href: "/consumer", label: "My energy", active: true },
        { href: "/consumer/bills", label: "Bills" },
        { href: "/consumer/plan", label: "Plan" },
      ]}
    >
      <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        <StatTile icon="⚡" label="Connections" value={connections?.length ?? 0} />
        {meter ? (
          <LiveMeterTile
            meterId={meter.id}
            initial={
              liveState
                ? {
                    meterId: liveState.meter_id,
                    readingTs: liveState.last_reading_ts,
                    kwhImport: liveState.kwh_import,
                    kwhExport: liveState.kwh_export,
                  }
                : null
            }
          />
        ) : (
          // No meter commissioned yet — honestly no data, not a fabricated
          // 0.0 with a badge. The exact distinction #68 exists to enforce.
          <StatTile icon="☀️" label="Solar generated" value={null} unit="kWh" />
        )}
        <StatTile icon="₹" label="Est. savings" valuePaise={null} />
      </div>

      <h1 className="text-2xl font-semibold mb-6">My connections</h1>
      {(connections ?? []).length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)" }}>
          No connection linked to this account yet.
        </p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {(connections ?? []).map((c) => (
            <div
              key={c.consumer_number}
              className="rounded-card border p-4"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
            >
              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--color-text-secondary)" }}>
                {c.tariff_category} · {c.connection_type}
              </div>
              <div className="text-xl tabular">{c.consumer_number}</div>
              <div className="text-sm mt-2 tabular" style={{ color: "var(--color-text-secondary)" }}>
                {c.sanctioned_load_kw != null ? `${c.sanctioned_load_kw} kW sanctioned` : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}
