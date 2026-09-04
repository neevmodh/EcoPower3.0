import { redirect } from "next/navigation";
import { formatInrFromPaise } from "@ecopower/shared";
import { PanelShell } from "@/components/PanelShell";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { RankedBar, type RankedRow } from "@/components/charts/RankedBar";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Listing = {
  id: string;
  quantity_kwh: number;
  remaining_kwh: number;
  price_paise_per_kwh: number;
  status: string;
  delivery_window_start: string;
  seller_connection_id: string;
};
type Trade = { id: string; quantity_kwh: number; price_paise_per_kwh: number; amount_paise: number; traded_at: string };

export default async function DiscomP2pPage() {
  const supabase = await createClient();
  const scope = await getScope(supabase);
  if (!scope) redirect("/login");
  const { user, divisionIds } = scope;

  // RLS (0027): a DISCOM officer sees the P2P market and trades in their
  // own division — oversight, read only. No WHERE clause here.
  const [{ data: listingsRaw }, { data: tradesRaw }] = await Promise.all([
    supabase
      .from("p2p_listings")
      .select("id, quantity_kwh, remaining_kwh, price_paise_per_kwh, status, delivery_window_start, seller_connection_id")
      .order("delivery_window_start", { ascending: false }),
    supabase
      .from("p2p_trades")
      .select("id, quantity_kwh, price_paise_per_kwh, amount_paise, traded_at")
      .order("traded_at", { ascending: false })
      .limit(50),
  ]);

  const listings = (listingsRaw ?? []) as Listing[];
  const trades = (tradesRaw ?? []) as Trade[];

  const open = listings.filter((l) => l.status === "open" || l.status === "partially_filled");
  const offeredKwh = open.reduce((s, l) => s + Number(l.remaining_kwh), 0);
  const tradedKwh = trades.reduce((s, t) => s + Number(t.quantity_kwh), 0);
  const tradedValue = trades.reduce((s, t) => s + Number(t.amount_paise), 0);
  const avgTradePrice = trades.length > 0 ? trades.reduce((s, t) => s + t.price_paise_per_kwh, 0) / trades.length : null;

  // Trade volume by day, last 14 days.
  const byDay = new Map<string, number>();
  for (const t of trades) {
    const d = t.traded_at.slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + Number(t.quantity_kwh));
  }
  const volRows: RankedRow[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([d, v]) => ({
      key: d,
      label: new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      value: v,
      display: `${v.toFixed(1)} kWh`,
    }));

  return (
    <PanelShell
      scopeNote={`division_ids · ${divisionIds.length} claim${divisionIds.length === 1 ? "" : "s"}`}
      panel="discom"
      email={user.email ?? ""}
      nav={[
        { href: "/discom", label: "Overview" },
        { href: "/discom/connections", label: "Connections" },
        { href: "/discom/losses", label: "AT&C losses" },
        { href: "/discom/netmetering", label: "Net-metering" },
        { href: "/discom/prepaid", label: "Prepaid" },
        { href: "/discom/outages", label: "Outages" },
        { href: "/discom/p2p", label: "P2P market", active: true },
        { href: "/discom/audit", label: "Audit log" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-1">P2P solar market</h1>
      <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>
        Peer-to-peer solar trades between consumers in your division — read-only oversight. RLS confines this to your
        division; there is no WHERE clause on it.
      </p>

      <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Open offers</div>
          <div className="text-2xl font-semibold tabular">{open.length}</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>kWh offered now</div>
          <div className="text-2xl font-semibold tabular">{offeredKwh.toFixed(0)}</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>kWh traded (50 latest)</div>
          <div className="text-2xl font-semibold tabular" style={{ color: "var(--color-diverging-export)" }}>
            {tradedKwh.toFixed(0)}
          </div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Avg clearing price</div>
          <div className="text-2xl font-semibold tabular">
            {avgTradePrice != null ? `₹${(avgTradePrice / 100).toFixed(2)}` : "—"}
          </div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Traded value</div>
          <div className="text-2xl font-semibold tabular">{formatInrFromPaise(BigInt(tradedValue))}</div>
        </div>
      </div>

      {volRows.length >= 2 ? (
        <ChartFrame title="Trade volume by day" caption="kWh matched per day in your division, last 14 days">
          <RankedBar rows={volRows} unit="kWh" accent="var(--color-diverging-export)" sort={false} />
        </ChartFrame>
      ) : (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No P2P trades recorded in your division yet.
        </p>
      )}
    </PanelShell>
  );
}
