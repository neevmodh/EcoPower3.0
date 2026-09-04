import { redirect } from "next/navigation";
import { co2AvoidedKg } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { PanelIcon } from "@/components/Icon";
import { StatTile } from "@/components/StatTile";
import { LiveMeterTile } from "@/components/LiveMeterTile";
import { PrepaidBalanceCard } from "@/components/PrepaidBalanceCard";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { OnboardingCard } from "@/components/OnboardingCard";
import { ChartFrame, LegendDot } from "@/components/charts/ChartFrame";
import { AreaChart } from "@/components/charts/AreaChart";
import { LoadHeatmap, type ProfileCell } from "@/components/charts/LoadHeatmap";
import { getScope } from "@/lib/auth";
import { getLocale, getT } from "@/lib/i18n.server";
import { createClient } from "@/lib/supabase/server";

type DailyRow = { day: string; import_kwh: number; export_kwh: number };
type ProfileRow = { dow: number; hour: number; avg_import_kwh: number; avg_export_kwh: number; samples: number };

// Sum the last `n` entries of a series and the `n` before that, for an
// honest week-over-week basis — no partial-window comparison.
function windowPair(values: number[], n: number): { current: number; prior: number } | null {
  if (values.length < n * 2) return null;
  const current = values.slice(-n).reduce((a, b) => a + b, 0);
  const prior = values.slice(-n * 2, -n).reduce((a, b) => a + b, 0);
  return { current, prior };
}

export default async function ConsumerPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;
  const t = await getT();
  const locale = await getLocale();

  // No owner filter here either — RLS scopes it to this consumer's rows.
  const { data: connections } = await supabase
    .from("service_connections")
    .select("id, consumer_number, tariff_category, connection_type, sanctioned_load_kw");

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

  const prepaidConnection = (connections ?? []).find((c) => c.connection_type === "prepaid");
  const { data: prepaid } = prepaidConnection
    ? await supabase
        .from("prepaid_accounts")
        .select("balance_paise, low_balance_threshold_paise, disconnect_pending")
        .eq("service_connection_id", prepaidConnection.id)
        .maybeSingle()
    : { data: null };

  // Real rollups, server-side (0013 / 0025) — RLS confines both to this
  // consumer's own meter.
  const { data: dailyRaw } = meter
    ? await supabase.rpc("daily_energy_summary", { p_meter_id: meter.id, p_days: 30 })
    : { data: null };
  const { data: profileRaw } = meter
    ? await supabase.rpc("hourly_load_profile", { p_meter_id: meter.id, p_days: 28 })
    : { data: null };

  const daily = ((dailyRaw ?? []) as DailyRow[]).map((d) => ({
    day: d.day,
    importKwh: Number(d.import_kwh),
    exportKwh: Number(d.export_kwh),
  }));
  const importSeries = daily.map((d) => d.importKwh);
  const exportSeries = daily.map((d) => d.exportKwh);
  const dayLabels = daily.map((d) =>
    new Date(d.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
  );

  const importWk = windowPair(importSeries, 7);
  const exportWk = windowPair(exportSeries, 7);
  const totalExport = exportSeries.reduce((a, b) => a + b, 0);

  const profileCells: ProfileCell[] = ((profileRaw ?? []) as ProfileRow[]).map((r) => ({
    dow: r.dow,
    hour: r.hour,
    kwh: Number(r.avg_import_kwh),
    samples: Number(r.samples),
  }));

  const hasHistory = daily.length >= 2;

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      panelLabel={t("consumer.panelName")}
      signOutLabel={t("nav.signOut")}
      headerExtra={<LocaleSwitcher current={locale} />}
      nav={[
        { href: "/consumer", label: t("nav.myEnergy"), active: true },
        { href: "/consumer/bills", label: t("nav.bills") },
        { href: "/consumer/plan", label: t("nav.plan") },
        { href: "/consumer/analytics", label: t("nav.analytics") },
        { href: "/consumer/support", label: t("nav.support") },
      ]}
    >
      <OnboardingCard
        id="consumer-v1"
        heading="Welcome to your energy dashboard"
        steps={[
          { icon: "radio", title: "Live meter", body: "The tile below updates the moment a reading lands — the pulse means the socket is connected." },
          { icon: "trend", title: "30-day trend", body: "Every chart here is computed from your actual meter reads, not a synthetic curve." },
          { icon: "receipt", title: "Every bill, traceable", body: "Open Bills to see each line trace back to the two register reads that bracket it." },
          { icon: "leaf", title: "Your solar impact", body: "Analytics turns your exported kWh into CO₂ avoided using the CEA grid factor." },
        ]}
      />

      <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        <StatTile icon={<PanelIcon name="plug" />} label={t("consumer.stat.connections")} value={connections?.length ?? 0} />
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
          <StatTile icon={<PanelIcon name="sun" />} label={t("consumer.stat.solarGenerated")} value={null} unit="kWh" />
        )}

        <StatTile
          icon={<PanelIcon name="bolt" />}
          label="Grid import · last 7 days"
          value={importWk ? Math.round(importWk.current) : null}
          unit="kWh"
          sparkline={importSeries.slice(-14)}
          comparison={importWk ? { value: Math.round(importWk.prior), windowLabel: "prev 7 days" } : null}
          state={importWk && importWk.current > importWk.prior * 1.15 ? "warning" : undefined}
        />

        <StatTile
          icon={<PanelIcon name="sun" />}
          label="Solar exported · last 7 days"
          value={exportWk ? Math.round(exportWk.current) : null}
          unit="kWh"
          sparkline={exportSeries.slice(-14)}
          comparison={exportWk ? { value: Math.round(exportWk.prior), windowLabel: "prev 7 days" } : null}
        />

        {prepaid && prepaidConnection ? (
          <PrepaidBalanceCard
            connectionId={prepaidConnection.id}
            balancePaise={Number(prepaid.balance_paise)}
            thresholdPaise={Number(prepaid.low_balance_threshold_paise)}
            disconnectPending={prepaid.disconnect_pending}
            labels={{
              balance: t("prepaid.balance"),
              balanceLow: t("prepaid.balance.low"),
              belowThreshold: t("prepaid.belowThreshold"),
            }}
          />
        ) : (
          <StatTile
            icon={<PanelIcon name="leaf" />}
            label="CO₂ avoided · 30 days"
            value={totalExport > 0 ? Math.round(co2AvoidedKg(totalExport)) : null}
            unit="kg"
          />
        )}
      </div>

      {meter && hasHistory && (
        <div className="grid gap-5 mb-8" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
          <ChartFrame
            title="Grid import vs solar export"
            caption="Daily totals, last 30 days — from your meter reads"
            legend={
              <>
                <LegendDot color="var(--color-diverging-import)">Grid import</LegendDot>
                <LegendDot color="var(--color-diverging-export)">Solar export</LegendDot>
              </>
            }
            table={
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                    <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Day</th>
                    <th className="py-1.5 pr-4 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Import</th>
                    <th className="py-1.5 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Export</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.slice().reverse().map((d) => (
                    <tr key={d.day} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                      <td className="py-1 pr-4 mono">{d.day}</td>
                      <td className="py-1 pr-4 text-right mono">{d.importKwh.toFixed(2)}</td>
                      <td className="py-1 text-right mono">{d.exportKwh.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <AreaChart
              unit="kWh"
              labels={dayLabels}
              series={[
                { key: "imp", label: "Grid import", color: "var(--color-diverging-import)", points: importSeries },
                { key: "exp", label: "Solar export", color: "var(--color-diverging-export)", points: exportSeries },
              ]}
            />
          </ChartFrame>

          {profileCells.length > 0 && (
            <ChartFrame
              title="When you draw from the grid"
              caption="Average grid import by hour and weekday, last 4 weeks"
              table={
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
                      <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Weekday</th>
                      <th className="py-1.5 pr-4 font-medium" style={{ color: "var(--color-text-secondary)" }}>Hour</th>
                      <th className="py-1.5 font-medium text-right" style={{ color: "var(--color-text-secondary)" }}>Avg import (kWh)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profileCells
                      .filter((c) => c.kwh > 0)
                      .sort((a, b) => b.kwh - a.kwh)
                      .slice(0, 12)
                      .map((c) => (
                        <tr key={`${c.dow}-${c.hour}`} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                          <td className="py-1 pr-4 mono">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][c.dow]}</td>
                          <td className="py-1 pr-4 mono">{String(c.hour).padStart(2, "0")}:00</td>
                          <td className="py-1 text-right mono">{c.kwh.toFixed(2)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              }
            >
              <LoadHeatmap cells={profileCells} />
            </ChartFrame>
          )}
        </div>
      )}

      <h1 className="text-2xl font-semibold mb-6">{t("consumer.connections.heading")}</h1>
      {(connections ?? []).length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)" }}>{t("consumer.connections.none")}</p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {(connections ?? []).map((c) => (
            <div
              key={c.consumer_number}
              className="rounded-card border card-shadow p-4"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
            >
              <div className="eyebrow mb-2">
                {c.tariff_category} · {c.connection_type}
              </div>
              <div className="text-xl mono">{c.consumer_number}</div>
              <div className="text-sm mt-2 mono" style={{ color: "var(--color-text-secondary)" }}>
                {c.sanctioned_load_kw != null
                  ? t("consumer.connections.sanctioned", { kw: c.sanctioned_load_kw })
                  : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}
