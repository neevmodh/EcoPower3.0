"use client";

// Field site-inspection panel (migration 0036). Start an inspection from an
// assigned work order, work the checklist, mark complete. RLS confines every
// row to the technician who created it.

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PanelIcon } from "./Icon";

type WorkOrder = { id: string; title: string; service_connection_id: string; consumer_number: string };

type ChecklistItem = { item: string; ok: boolean | null; note?: string };

type Inspection = {
  id: string;
  inspection_type: string;
  status: string;
  findings: string | null;
  started_at: string;
  completed_at: string | null;
  consumer_number: string;
  checklist: ChecklistItem[];
};

const TEMPLATES: Record<string, string[]> = {
  tamper: [
    "Meter seal intact — photographed",
    "Terminal cover — no bypass found",
    "CT ratio verified against nameplate",
    "Load survey with clamp meter",
    "Neutral / earth check",
  ],
  roof_survey: [
    "Roof azimuth & tilt measured",
    "Shading photos — 4 compass points",
    "Structural condition noted",
    "Meter position & cable run",
    "Access & safety for install crew",
  ],
  commissioning: [
    "String voltages within spec",
    "Inverter firmware current",
    "Earthing continuity",
    "Export test — meter registers both directions",
    "Consumer handover & app walkthrough",
  ],
  routine: ["Panel cleanliness", "Inverter fault log clear", "Cable & conduit condition", "Meter comms healthy"],
};

const TYPE_LABEL: Record<string, string> = {
  tamper: "Tamper check",
  roof_survey: "Roof survey",
  commissioning: "Commissioning",
  routine: "Routine",
};

export function InspectionPanel({
  userId,
  workOrders,
  inspections,
}: {
  userId: string;
  workOrders: WorkOrder[];
  inspections: Inspection[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [wo, setWo] = useState(workOrders[0]?.id ?? "");
  const [type, setType] = useState<keyof typeof TEMPLATES>("tamper");
  const reload = () => window.location.reload();

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const workOrder = workOrders.find((w) => w.id === wo);
    if (!workOrder) return;
    setBusy("start");
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("site_inspections").insert({
      service_connection_id: workOrder.service_connection_id,
      work_order_id: workOrder.id,
      inspector_user_id: userId,
      inspection_type: type,
      checklist: TEMPLATES[type].map((item) => ({ item, ok: null })),
    });
    if (err) {
      setError(err.message);
      setBusy(null);
      return;
    }
    reload();
  }

  async function toggleItem(insp: Inspection, idx: number, ok: boolean) {
    setBusy(insp.id);
    const next = insp.checklist.map((c, i) => (i === idx ? { ...c, ok } : c));
    const supabase = createClient();
    const { error: err } = await supabase.from("site_inspections").update({ checklist: next }).eq("id", insp.id);
    if (err) setError(err.message);
    reload();
  }

  async function complete(insp: Inspection, findings: string) {
    setBusy(insp.id);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("site_inspections")
      .update({ status: "completed", completed_at: new Date().toISOString(), findings: findings || null })
      .eq("id", insp.id);
    if (err) {
      setError(err.message);
      setBusy(null);
      return;
    }
    reload();
  }

  const input = "rounded-control border px-3 py-1.5 text-sm";
  const inputStyle = { borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" } as const;

  return (
    <div className="space-y-8">
      {error && (
        <p className="text-sm" style={{ color: "var(--color-status-critical)" }}>
          {error}
        </p>
      )}

      {workOrders.length > 0 && (
        <form
          onSubmit={start}
          className="rounded-card border card-shadow p-4 flex flex-wrap items-end gap-3"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
        >
          <div className="eyebrow w-full">Start an inspection</div>
          <select value={wo} onChange={(e) => setWo(e.target.value)} className={`${input} min-w-[260px]`} style={inputStyle}>
            {workOrders.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title} · {w.consumer_number}
              </option>
            ))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value as keyof typeof TEMPLATES)} className={input} style={inputStyle}>
            {Object.keys(TEMPLATES).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy === "start"}
            className="rounded-control px-3 py-1.5 text-sm font-semibold on-accent disabled:opacity-50"
            style={{ background: "var(--color-categorical-generation)" }}
          >
            {busy === "start" ? "Starting…" : "Start"}
          </button>
        </form>
      )}

      {inspections.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No inspections yet.
        </p>
      ) : (
        <div className="space-y-4">
          {inspections.map((insp) => (
            <InspectionCard key={insp.id} insp={insp} busy={busy === insp.id} onToggle={toggleItem} onComplete={complete} />
          ))}
        </div>
      )}
    </div>
  );

  function InspectionCard({
    insp,
    busy: cardBusy,
    onToggle,
    onComplete,
  }: {
    insp: Inspection;
    busy: boolean;
    onToggle: (insp: Inspection, idx: number, ok: boolean) => void;
    onComplete: (insp: Inspection, findings: string) => void;
  }) {
    const [findings, setFindings] = useState(insp.findings ?? "");
    const done = insp.checklist.filter((c) => c.ok != null).length;
    const isComplete = insp.status === "completed";
    return (
      <div
        className="rounded-card border card-shadow p-5"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-sm font-medium">{TYPE_LABEL[insp.inspection_type] ?? insp.inspection_type}</span>
            <span className="mono text-xs ml-2" style={{ color: "var(--color-text-secondary)" }}>
              {insp.consumer_number}
            </span>
          </div>
          <span
            className="mono text-[10px] rounded-full px-2 py-0.5 font-semibold"
            style={{
              background: "var(--color-surface-sunken)",
              color: isComplete ? "var(--color-status-good)" : "var(--color-status-warning)",
            }}
          >
            {isComplete ? "completed" : `${done}/${insp.checklist.length}`}
          </span>
        </div>
        <div className="space-y-1.5">
          {insp.checklist.map((c, i) => (
            <div key={c.item} className="flex items-center justify-between text-sm">
              <span style={{ color: c.ok === false ? "var(--color-status-serious)" : undefined }}>{c.item}</span>
              {!isComplete ? (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onToggle(insp, i, true)}
                    disabled={cardBusy}
                    className="rounded-control border px-2 py-0.5 text-xs disabled:opacity-50"
                    style={{
                      borderColor: c.ok === true ? "var(--color-status-good)" : "var(--color-border)",
                      color: c.ok === true ? "var(--color-status-good)" : "var(--color-text-tertiary)",
                    }}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggle(insp, i, false)}
                    disabled={cardBusy}
                    className="rounded-control border px-2 py-0.5 text-xs disabled:opacity-50"
                    style={{
                      borderColor: c.ok === false ? "var(--color-status-serious)" : "var(--color-border)",
                      color: c.ok === false ? "var(--color-status-serious)" : "var(--color-text-tertiary)",
                    }}
                  >
                    Fail
                  </button>
                </div>
              ) : (
                <span style={{ color: c.ok ? "var(--color-status-good)" : "var(--color-status-serious)" }}>
                  <PanelIcon name={c.ok ? "check" : "alert"} size={14} />
                </span>
              )}
            </div>
          ))}
        </div>
        {!isComplete && (
          <div className="flex flex-wrap items-end gap-2 pt-3 mt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
            <input
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              placeholder="Findings / notes"
              className={`${input} flex-1 min-w-[220px]`}
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => onComplete(insp, findings)}
              disabled={cardBusy || done < insp.checklist.length}
              className="rounded-control px-3 py-1.5 text-xs font-semibold on-accent disabled:opacity-50"
              style={{ background: "var(--color-status-good)" }}
            >
              Complete inspection
            </button>
          </div>
        )}
        {isComplete && insp.findings && (
          <p className="text-xs mt-3 pt-3 border-t" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
            {insp.findings}
          </p>
        )}
      </div>
    );
  }
}
