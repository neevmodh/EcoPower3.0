"use client";

// P2P solar market (migration 0027). A consumer lists surplus export for a
// delivery window and a price; another buys some of it via p2p_place_order,
// which locks the listing and writes the trade. Prices are the sellers' own;
// the "recent export" figure is a soft hint, not an enforced cap (yet).

import { useState } from "react";
import { formatInrFromPaise } from "@ecopower/shared";
import { createClient } from "@/lib/supabase/browser";

type Listing = {
  id: string;
  seller_connection_id: string;
  quantity_kwh: number;
  remaining_kwh: number;
  price_paise_per_kwh: number;
  delivery_window_start: string;
  delivery_window_end: string;
  status: string;
  mine: boolean;
};

type Trade = {
  id: string;
  quantity_kwh: number;
  price_paise_per_kwh: number;
  amount_paise: number;
  traded_at: string;
  side: "bought" | "sold";
};

function fmtWindow(a: string, b: string) {
  const s = new Date(a);
  const e = new Date(b);
  return `${s.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} – ${e.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function P2pMarket({
  myConnectionId,
  recentExportKwh,
  listings,
  trades,
}: {
  myConnectionId: string | null;
  recentExportKwh: number;
  listings: Listing[];
  trades: Trade[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // create-listing form
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("5.50");
  const [creating, setCreating] = useState(false);

  const refresh = () => window.location.reload();

  async function buy(listingId: string, remaining: number) {
    if (!myConnectionId) return;
    const input = prompt(`How many kWh to buy? (up to ${remaining})`, String(Math.min(remaining, 2)));
    if (!input) return;
    const q = Number(input);
    if (!Number.isFinite(q) || q <= 0) return;
    setBusy(listingId);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("p2p_place_order", {
      p_listing_id: listingId,
      p_buyer_connection_id: myConnectionId,
      p_quantity_kwh: q,
    });
    if (err) {
      setError(err.message);
      setBusy(null);
      return;
    }
    refresh();
  }

  async function createListing(e: React.FormEvent) {
    e.preventDefault();
    if (!myConnectionId) return;
    const q = Number(qty);
    const p = Math.round(Number(price) * 100);
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p <= 0) return;
    setCreating(true);
    setError(null);
    const supabase = createClient();
    const now = new Date();
    const end = new Date(now.getTime() + 6 * 3600_000);
    const { error: err } = await supabase.from("p2p_listings").insert({
      seller_connection_id: myConnectionId,
      quantity_kwh: q,
      remaining_kwh: q,
      price_paise_per_kwh: p,
      delivery_window_start: now.toISOString(),
      delivery_window_end: end.toISOString(),
    });
    if (err) {
      setError(err.message);
      setCreating(false);
      return;
    }
    refresh();
  }

  const openMarket = listings.filter((l) => !l.mine && (l.status === "open" || l.status === "partially_filled"));
  const myListings = listings.filter((l) => l.mine);
  const avgPrice =
    openMarket.length > 0
      ? openMarket.reduce((s, l) => s + l.price_paise_per_kwh, 0) / openMarket.length
      : null;

  return (
    <div className="space-y-8">
      {error && (
        <p className="text-sm" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Open offers</div>
          <div className="text-2xl font-semibold tabular">{openMarket.length}</div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Average ask</div>
          <div className="text-2xl font-semibold tabular">
            {avgPrice != null ? `₹${(avgPrice / 100).toFixed(2)}/kWh` : "—"}
          </div>
        </div>
        <div className="rounded-card border card-shadow p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>Your export · 7 days</div>
          <div className="text-2xl font-semibold tabular" style={{ color: "var(--color-diverging-export)" }}>
            {recentExportKwh > 0 ? `${recentExportKwh.toFixed(0)} kWh` : "—"}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-3">Open market</h2>
        {openMarket.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            No offers open right now.
          </p>
        ) : (
          <div
            className="rounded-card border card-shadow divide-y"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            {openMarket.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <span className="mono text-sm font-medium">
                    {l.remaining_kwh.toFixed(1)} kWh
                    <span style={{ color: "var(--color-text-tertiary)" }}> of {l.quantity_kwh.toFixed(1)}</span>
                  </span>
                  <div className="mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    ₹{(l.price_paise_per_kwh / 100).toFixed(2)}/kWh · deliver {fmtWindow(l.delivery_window_start, l.delivery_window_end)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => buy(l.id, l.remaining_kwh)}
                  disabled={busy !== null || !myConnectionId}
                  className="rounded-control px-3 py-1.5 text-xs font-semibold on-accent disabled:opacity-50"
                  style={{ background: "var(--color-categorical-third)" }}
                >
                  {busy === l.id ? "Buying…" : "Buy"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {myConnectionId && (
        <div>
          <h2 className="text-base font-semibold mb-3">List your surplus</h2>
          <form
            onSubmit={createListing}
            className="rounded-card border card-shadow p-4 flex flex-wrap items-end gap-3 max-w-2xl"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <label className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              kWh to offer
              <input
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder={recentExportKwh > 0 ? `≤ ${recentExportKwh.toFixed(0)}` : "e.g. 5"}
                className="block mt-1 rounded-control border px-3 py-1.5 mono text-sm w-28"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" }}
              />
            </label>
            <label className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              ₹ per kWh
              <input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                className="block mt-1 rounded-control border px-3 py-1.5 mono text-sm w-24"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" }}
              />
            </label>
            <button
              type="submit"
              disabled={creating}
              className="rounded-control border px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: "var(--color-border)" }}
            >
              {creating ? "Listing…" : "List for the next 6 hours"}
            </button>
          </form>

          {myListings.length > 0 && (
            <div className="mt-4 space-y-2">
              {myListings.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between rounded-card border p-3 text-sm"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <span className="mono">
                    {l.quantity_kwh.toFixed(1)} kWh @ ₹{(l.price_paise_per_kwh / 100).toFixed(2)} ·{" "}
                    <span style={{ color: "var(--color-text-secondary)" }}>{l.status.replace("_", " ")}</span>
                  </span>
                  <span className="mono text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                    {l.remaining_kwh.toFixed(1)} kWh left
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {trades.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Your trades</h2>
          <div
            className="rounded-card border card-shadow divide-y"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            {trades.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-4 text-sm">
                <span>
                  <span
                    className="mono text-xs rounded-full px-2 py-0.5 mr-2"
                    style={{
                      background: "var(--color-surface-sunken)",
                      color: t.side === "bought" ? "var(--color-diverging-import)" : "var(--color-diverging-export)",
                    }}
                  >
                    {t.side}
                  </span>
                  <span className="mono">
                    {t.quantity_kwh.toFixed(1)} kWh @ ₹{(t.price_paise_per_kwh / 100).toFixed(2)}
                  </span>
                </span>
                <span className="mono">{formatInrFromPaise(BigInt(t.amount_paise))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
