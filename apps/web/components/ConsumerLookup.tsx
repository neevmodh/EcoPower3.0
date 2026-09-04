"use client";

// Support "consumer 360" (migration 0030). A support agent types a consumer
// number and gets a curated bundle — connection basics, meter status, last
// three bills, open ticket count — via the support_consumer_360() RPC. The
// agent has no blanket SELECT on invoices/connections; the function returns
// exactly this much and re-checks the role server-side.

import { useState } from "react";
import { formatInrFromPaise } from "@ecopower/shared";
import { createClient } from "@/lib/supabase/browser";
import { PanelIcon } from "./Icon";

type Bundle = {
  found: boolean;
  connection?: {
    consumer_number: string;
    tariff_category: string;
    connection_type: string;
    phase: string;
    sanctioned_load_kw: number | null;
  };
  meter?: { serial: string; status: string; last_reading_ts: string | null; quality: string | null } | null;
  prepaid?: { balance_paise: number; disconnect_pending: boolean } | null;
  recent_invoices?: Array<{
    period_start: string;
    period_end: string;
    units_kwh: number;
    total_paise: number;
    status: string;
  }>;
  tickets?: { open: number; total: number };
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 border-b last:border-b-0 text-sm" style={{ borderColor: "var(--color-border)" }}>
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

export function ConsumerLookup() {
  const [q, setQ] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);

  async function lookup() {
    const cn = q.trim();
    if (!cn) return;
    setState("loading");
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("support_consumer_360", { p_consumer_number: cn });
    if (err) {
      setState("error");
      setError(err.message);
      return;
    }
    setBundle(data as Bundle);
    setState("done");
  }

  return (
    <div className="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup();
        }}
        className="flex gap-2 mb-6"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Consumer number, e.g. AHD-A-100001"
          className="flex-1 rounded-control border px-3 py-2 mono text-sm"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" }}
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="rounded-control px-4 py-2 text-sm font-semibold on-accent disabled:opacity-50"
          style={{ background: "var(--color-categorical-third)" }}
        >
          {state === "loading" ? "Looking up…" : "Look up"}
        </button>
      </form>

      {error && (
        <p className="text-sm" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}

      {state === "done" && bundle && !bundle.found && (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No connection with that consumer number.
        </p>
      )}

      {state === "done" && bundle?.found && bundle.connection && (
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div
            className="rounded-card border card-shadow p-4"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <div className="eyebrow mb-3">Connection</div>
            <Field label="Consumer no." value={bundle.connection.consumer_number} />
            <Field label="Tariff" value={bundle.connection.tariff_category} />
            <Field label="Type" value={bundle.connection.connection_type} />
            <Field label="Phase" value={bundle.connection.phase} />
            <Field
              label="Sanctioned load"
              value={bundle.connection.sanctioned_load_kw != null ? `${bundle.connection.sanctioned_load_kw} kW` : "—"}
            />
          </div>

          <div
            className="rounded-card border card-shadow p-4"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <div className="eyebrow mb-3">Meter</div>
            {bundle.meter ? (
              <>
                <Field label="Serial" value={bundle.meter.serial} />
                <Field
                  label="Status"
                  value={
                    <span
                      style={{
                        color: bundle.meter.status === "active" ? "var(--color-status-good)" : "var(--color-status-serious)",
                      }}
                    >
                      {bundle.meter.status}
                    </span>
                  }
                />
                <Field
                  label="Last reading"
                  value={
                    bundle.meter.last_reading_ts ? (
                      <span suppressHydrationWarning>{new Date(bundle.meter.last_reading_ts).toLocaleString("en-GB")}</span>
                    ) : (
                      "no reads yet"
                    )
                  }
                />
                {bundle.meter.quality && <Field label="Quality" value={bundle.meter.quality} />}
              </>
            ) : (
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                No meter linked.
              </p>
            )}
            {bundle.prepaid && (
              <>
                <Field label="Prepaid balance" value={formatInrFromPaise(BigInt(bundle.prepaid.balance_paise))} />
                {bundle.prepaid.disconnect_pending && (
                  <Field
                    label="Prepaid status"
                    value={<span style={{ color: "var(--color-status-serious)" }}>Disconnect pending</span>}
                  />
                )}
              </>
            )}
          </div>

          <div
            className="rounded-card border card-shadow p-4"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <div className="eyebrow mb-3">Recent bills</div>
            {(bundle.recent_invoices ?? []).length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                None issued.
              </p>
            ) : (
              (bundle.recent_invoices ?? []).map((i) => (
                <div key={i.period_start} className="flex justify-between py-1.5 border-b last:border-b-0 text-sm" style={{ borderColor: "var(--color-border)" }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    <span suppressHydrationWarning>{new Date(i.period_start).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}</span>
                    {" · "}
                    {i.units_kwh} kWh
                  </span>
                  <span className="mono">
                    {formatInrFromPaise(BigInt(i.total_paise))} · {i.status}
                  </span>
                </div>
              ))
            )}
          </div>

          <div
            className="rounded-card border card-shadow p-4"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            <div className="eyebrow mb-3">Tickets</div>
            <div className="flex items-center gap-3">
              <PanelIcon name="chat" size={16} />
              <span className="text-sm">
                {bundle.tickets?.open ?? 0} open · {bundle.tickets?.total ?? 0} total
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
