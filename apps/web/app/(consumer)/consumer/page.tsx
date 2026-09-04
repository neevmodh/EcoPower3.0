import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { PanelIcon } from "@/components/Icon";
import { StatTile } from "@/components/StatTile";
import { LiveMeterTile } from "@/components/LiveMeterTile";
import { PrepaidBalanceCard } from "@/components/PrepaidBalanceCard";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { getScope } from "@/lib/auth";
import { getLocale, getT } from "@/lib/i18n.server";
import { createClient } from "@/lib/supabase/server";

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

  // Prepaid account for the first prepaid connection, if any (#22).
  const prepaidConnection = (connections ?? []).find((c) => c.connection_type === "prepaid");
  const { data: prepaid } = prepaidConnection
    ? await supabase
        .from("prepaid_accounts")
        .select("balance_paise, low_balance_threshold_paise, disconnect_pending")
        .eq("service_connection_id", prepaidConnection.id)
        .maybeSingle()
    : { data: null };

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
          // No meter commissioned yet — honestly no data, not a fabricated
          // 0.0 with a badge. The exact distinction #68 exists to enforce.
          <StatTile icon={<PanelIcon name="sun" />} label={t("consumer.stat.solarGenerated")} value={null} unit="kWh" />
        )}
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
          <StatTile icon={<PanelIcon name="rupee" />} label={t("consumer.stat.estSavings")} valuePaise={null} />
        )}
      </div>

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
              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--color-text-secondary)" }}>
                {c.tariff_category} · {c.connection_type}
              </div>
              <div className="text-xl tabular">{c.consumer_number}</div>
              <div className="text-sm mt-2 tabular" style={{ color: "var(--color-text-secondary)" }}>
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
