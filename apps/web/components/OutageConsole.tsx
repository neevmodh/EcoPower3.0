"use client";

// DISCOM outage console (migration 0035). Log an outage, post updates to its
// timeline, revise the ETR, mark it restored. RLS confines every write to
// the officer's division; a write that isn't scoped simply fails.

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PanelIcon } from "./Icon";

type Feeder = { id: string; name: string };
type Dt = { id: string; name: string; feeder_id: string };
type Update = { id: string; note: string; new_eta: string | null; posted_at: string };
type Outage = {
  id: string;
  outage_type: string;
  cause: string | null;
  consumers_affected: number | null;
  started_at: string;
  estimated_restoration: string | null;
  restored_at: string | null;
  status: string;
  feeder_id: string | null;
  dt_id: string | null;
  updates: Update[];
};

const STATUS_COLOR: Record<string, string> = {
  active: "var(--color-status-serious)",
  partial_restore: "var(--color-status-warning)",
  restored: "var(--color-status-good)",
  cancelled: "var(--color-text-tertiary)",
};

function fmt(ts: string | null) {
  return ts ? new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

export function OutageConsole({
  divisionId,
  feeders,
  dts,
  outages,
}: {
  divisionId: string;
  feeders: Feeder[];
  dts: Dt[];
  outages: Outage[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reload = () => window.location.reload();

  // log form
  const [type, setType] = useState<"unplanned" | "planned">("unplanned");
  const [feeder, setFeeder] = useState("");
  const [dt, setDt] = useState("");
  const [cause, setCause] = useState("");
  const [affected, setAffected] = useState("");
  const [etr, setEtr] = useState("");

  async function logOutage(e: React.FormEvent) {
    e.preventDefault();
    setBusy("log");
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("outages").insert({
      division_id: divisionId,
      feeder_id: feeder || null,
      dt_id: dt || null,
      outage_type: type,
      cause: cause || null,
      consumers_affected: affected ? Number(affected) : null,
      estimated_restoration: etr ? new Date(etr).toISOString() : null,
    });
    if (err) {
      setError(err.message);
      setBusy(null);
      return;
    }
    reload();
  }

  async function postUpdate(outageId: string, note: string, newEta: string | null) {
    setBusy(outageId);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("outage_updates").insert({
      outage_id: outageId,
      note,
      new_eta: newEta,
    });
    if (!err && newEta) {
      await supabase.from("outages").update({ estimated_restoration: newEta }).eq("id", outageId);
    }
    if (err) {
      setError(err.message);
      setBusy(null);
      return;
    }
    reload();
  }

  async function restore(outageId: string) {
    setBusy(outageId);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("outages")
      .update({ status: "restored", restored_at: new Date().toISOString() })
      .eq("id", outageId);
    if (err) {
      setError(err.message);
      setBusy(null);
      return;
    }
    reload();
  }

  const dtsForFeeder = feeder ? dts.filter((d) => d.feeder_id === feeder) : dts;
  const active = outages.filter((o) => o.status === "active" || o.status === "partial_restore");
  const done = outages.filter((o) => o.status === "restored" || o.status === "cancelled");
  const feederName = (id: string | null) => feeders.find((f) => f.id === id)?.name;
  const dtName = (id: string | null) => dts.find((d) => d.id === id)?.name;

  const input = "rounded-control border px-3 py-1.5 text-sm";
  const inputStyle = { borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" } as const;

  return (
    <div className="space-y-8">
      {error && (
        <p className="text-sm" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}

      <form
        onSubmit={logOutage}
        className="rounded-card border card-shadow p-4 flex flex-wrap items-end gap-3"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
      >
        <div className="eyebrow w-full">Log an outage</div>
        <select value={type} onChange={(e) => setType(e.target.value as "unplanned" | "planned")} className={input} style={inputStyle}>
          <option value="unplanned">Unplanned</option>
          <option value="planned">Planned</option>
        </select>
        <select value={feeder} onChange={(e) => { setFeeder(e.target.value); setDt(""); }} className={input} style={inputStyle}>
          <option value="">Feeder (optional)</option>
          {feeders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <select value={dt} onChange={(e) => setDt(e.target.value)} className={input} style={inputStyle}>
          <option value="">DT (optional)</option>
          {dtsForFeeder.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <input value={cause} onChange={(e) => setCause(e.target.value)} placeholder="Cause" className={`${input} min-w-[220px]`} style={inputStyle} />
        <input value={affected} onChange={(e) => setAffected(e.target.value.replace(/[^\d]/g, ""))} placeholder="Consumers" className={`${input} w-28`} style={inputStyle} />
        <input type="datetime-local" value={etr} onChange={(e) => setEtr(e.target.value)} className={input} style={inputStyle} />
        <button type="submit" disabled={busy === "log"} className="rounded-control px-3 py-1.5 text-sm font-semibold on-accent disabled:opacity-50" style={{ background: "var(--color-categorical-consumption)" }}>
          {busy === "log" ? "Logging…" : "Log outage"}
        </button>
      </form>

      <div>
        <h2 className="text-base font-semibold mb-3">Active &amp; scheduled ({active.length})</h2>
        {active.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>None.</p>
        ) : (
          <div className="space-y-4">
            {active.map((o) => (
              <OutageCard
                key={o.id}
                o={o}
                busy={busy === o.id}
                feederName={feederName(o.feeder_id)}
                dtName={dtName(o.dt_id)}
                onUpdate={postUpdate}
                onRestore={restore}
              />
            ))}
          </div>
        )}
      </div>

      {done.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Recently restored</h2>
          <div
            className="rounded-card border card-shadow divide-y"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
          >
            {done.slice(0, 8).map((o) => (
              <div key={o.id} className="flex items-center justify-between p-4 text-sm">
                <span>
                  {o.outage_type} · {feederName(o.feeder_id) ?? dtName(o.dt_id) ?? "division"} · {o.cause}
                </span>
                <span className="mono text-xs" style={{ color: "var(--color-status-good)" }}>
                  restored {fmt(o.restored_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  function OutageCard({
    o,
    busy: cardBusy,
    feederName: fn,
    dtName: dn,
    onUpdate,
    onRestore,
  }: {
    o: Outage;
    busy: boolean;
    feederName?: string;
    dtName?: string;
    onUpdate: (id: string, note: string, eta: string | null) => void;
    onRestore: (id: string) => void;
  }) {
    const [note, setNote] = useState("");
    const [newEta, setNewEta] = useState("");
    return (
      <div
        className="rounded-card border card-shadow p-5"
        style={{ borderColor: STATUS_COLOR[o.status], background: "var(--color-surface-card)" }}
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <span className="text-sm font-medium">
              {o.outage_type} · {fn ?? dn ?? "division-wide"}
            </span>
            <div className="mono text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
              started {fmt(o.started_at)} · ETR {fmt(o.estimated_restoration)}
              {o.consumers_affected != null && ` · ${o.consumers_affected} consumers`}
            </div>
          </div>
          <span
            className="mono text-[10px] rounded-full px-2 py-0.5 font-semibold"
            style={{ background: "var(--color-surface-sunken)", color: STATUS_COLOR[o.status] }}
          >
            {o.status.replace("_", " ")}
          </span>
        </div>
        {o.cause && (
          <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>
            {o.cause}
          </p>
        )}

        {o.updates.length > 0 && (
          <div className="border-l-2 pl-3 mb-3 space-y-2" style={{ borderColor: "var(--color-border)" }}>
            {o.updates.map((u) => (
              <div key={u.id} className="text-xs">
                <span className="mono" style={{ color: "var(--color-text-tertiary)" }}>
                  {fmt(u.posted_at)}
                </span>{" "}
                {u.note}
                {u.new_eta && <span style={{ color: "var(--color-status-warning)" }}> · ETR → {fmt(u.new_eta)}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 pt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Post an update" className={`${input} flex-1 min-w-[200px]`} style={inputStyle} />
          <input type="datetime-local" value={newEta} onChange={(e) => setNewEta(e.target.value)} className={input} style={inputStyle} />
          <button
            type="button"
            disabled={cardBusy || !note.trim()}
            onClick={() => onUpdate(o.id, note.trim(), newEta ? new Date(newEta).toISOString() : null)}
            className="rounded-control border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            style={{ borderColor: "var(--color-border)" }}
          >
            Post
          </button>
          <button
            type="button"
            disabled={cardBusy}
            onClick={() => onRestore(o.id)}
            className="rounded-control px-3 py-1.5 text-xs font-semibold on-accent disabled:opacity-50"
            style={{ background: "var(--color-status-good)" }}
          >
            <PanelIcon name="check" size={12} /> Mark restored
          </button>
        </div>
      </div>
    );
  }
}
