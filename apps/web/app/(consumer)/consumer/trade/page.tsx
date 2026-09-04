import { redirect } from "next/navigation";
import { PanelShell } from "@/components/PanelShell";
import { P2pMarket } from "@/components/P2pMarket";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { consumerNav } from "@/lib/panelNav";
import { getScope } from "@/lib/auth";
import { getLocale, getT } from "@/lib/i18n.server";
import { createClient } from "@/lib/supabase/server";

type DailyRow = { day: string; import_kwh: number; export_kwh: number };

export default async function ConsumerTradePage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user } = scope;
  const t = await getT();
  const locale = await getLocale();

  const { data: connections } = await supabase.from("service_connections").select("id");
  const myConnIds = new Set((connections ?? []).map((c) => c.id));
  const myConnectionId = connections?.[0]?.id ?? null;

  const { data: meter } = myConnectionId
    ? await supabase.from("meters").select("id").eq("service_connection_id", myConnectionId).limit(1).maybeSingle()
    : { data: null };
  const { data: dailyRaw } = meter
    ? await supabase.rpc("daily_energy_summary", { p_meter_id: meter.id, p_days: 7 })
    : { data: null };
  const recentExportKwh = ((dailyRaw ?? []) as DailyRow[]).reduce((s, d) => s + Number(d.export_kwh), 0);

  // RLS returns the open market + this consumer's own listings.
  const { data: listingsRaw } = await supabase
    .from("p2p_listings")
    .select("id, seller_connection_id, quantity_kwh, remaining_kwh, price_paise_per_kwh, delivery_window_start, delivery_window_end, status")
    .order("delivery_window_start", { ascending: true });

  const { data: tradesRaw } = await supabase
    .from("p2p_trades")
    .select("id, quantity_kwh, price_paise_per_kwh, amount_paise, traded_at, buyer_connection_id, seller_connection_id")
    .order("traded_at", { ascending: false })
    .limit(20);

  const listings = (listingsRaw ?? []).map((l) => ({
    id: l.id,
    seller_connection_id: l.seller_connection_id,
    quantity_kwh: Number(l.quantity_kwh),
    remaining_kwh: Number(l.remaining_kwh),
    price_paise_per_kwh: Number(l.price_paise_per_kwh),
    delivery_window_start: l.delivery_window_start as string,
    delivery_window_end: l.delivery_window_end as string,
    status: l.status as string,
    mine: myConnIds.has(l.seller_connection_id),
  }));

  const trades = (tradesRaw ?? []).map((tr) => ({
    id: tr.id,
    quantity_kwh: Number(tr.quantity_kwh),
    price_paise_per_kwh: Number(tr.price_paise_per_kwh),
    amount_paise: Number(tr.amount_paise),
    traded_at: tr.traded_at as string,
    side: (myConnIds.has(tr.buyer_connection_id) ? "bought" : "sold") as "bought" | "sold",
  }));

  return (
    <PanelShell
      panel="consumer"
      email={user.email ?? ""}
      panelLabel={t("consumer.panelName")}
      signOutLabel={t("nav.signOut")}
      headerExtra={<LocaleSwitcher current={locale} />}
      nav={consumerNav("/consumer/trade", t)}
    >
      <h1 className="text-2xl font-semibold mb-1">P2P solar trading</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Offer surplus rooftop export to other consumers on the network, or buy from them. Trades settle against your bill;
        prices are set by the seller. Demo market.
      </p>
      <P2pMarket
        myConnectionId={myConnectionId}
        recentExportKwh={recentExportKwh}
        listings={listings}
        trades={trades}
      />
    </PanelShell>
  );
}
