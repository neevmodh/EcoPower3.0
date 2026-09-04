"use client";

// The DESIGN.md P5 payoff: click an energy line, see the two register
// reads and the telescopic slab breakdown it came from (#21). No invented
// deltas, no decorative badges — every figure here is a real column value.

import { useState } from "react";
import { formatInrFromPaise } from "@ecopower/shared";
import { PayButton } from "./PayButton";
import { BillExplainer } from "./BillExplainer";
import { InvoicePdfButton } from "./InvoicePdfButton";
import { PanelIcon } from "./Icon";

type InvoiceLine = {
  id: string;
  line_type: string;
  label: string;
  amount_paise: number;
  slab_from: number | null;
  slab_to: number | null;
  source_reading_start_ts: string | null;
  source_reading_end_ts: string | null;
};

type Invoice = {
  id: string;
  billing_period_start: string;
  billing_period_end: string;
  units_imported_milli_kwh: number;
  total_paise: number;
  status: string;
  invoice_lines: InvoiceLine[];
};

const STATUS_COLOR: Record<string, string> = {
  paid: "var(--color-status-good)",
  issued: "var(--color-status-warning)",
  overdue: "var(--color-status-critical)",
  draft: "var(--color-text-secondary)",
};

export function InvoiceCard({ invoice, consumerNumber }: { invoice: Invoice; consumerNumber: string }) {
  const [expanded, setExpanded] = useState(false);
  const unitsKwh = invoice.units_imported_milli_kwh / 1000;

  return (
    <div className="rounded-card border card-lift" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold on-accent"
              style={{ background: STATUS_COLOR[invoice.status] ?? "var(--color-text-secondary)" }}
            >
              {invoice.status}
            </span>
            <span className="text-sm font-medium tabular">
              {new Date(invoice.billing_period_start).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
              {" – "}
              {new Date(invoice.billing_period_end).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
          <div className="text-xs tabular" style={{ color: "var(--color-text-secondary)" }}>
            {unitsKwh.toFixed(1)} kWh
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-lg font-semibold mono">{formatInrFromPaise(BigInt(invoice.total_paise))}</span>
          <span
            style={{
              color: "var(--color-text-tertiary)",
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 250ms cubic-bezier(.2,.7,.2,1)",
              display: "inline-flex",
            }}
          >
            <PanelIcon name="chevronRight" size={16} />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: "var(--color-border)" }}>
          <table className="w-full text-sm mt-3">
            <tbody>
              {invoice.invoice_lines.map((line) => (
                <tr key={line.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-2">
                    <div>{line.label}</div>
                    {line.slab_from != null && line.slab_to != null && (
                      <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                        {(line.slab_to - line.slab_from).toFixed(1)} kWh, slab {line.slab_from.toFixed(0)}–{line.slab_to.toFixed(0)}
                      </div>
                    )}
                    {line.source_reading_start_ts && line.source_reading_end_ts && (
                      <div className="text-xs tabular" style={{ color: "var(--color-text-secondary)" }}>
                        {new Date(line.source_reading_start_ts).toLocaleString("en-IN")} → {new Date(line.source_reading_end_ts).toLocaleString("en-IN")}
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right mono whitespace-nowrap">{formatInrFromPaise(BigInt(line.amount_paise))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {invoice.status !== "paid" && (
              <PayButton invoiceId={invoice.id} label={`Pay ${formatInrFromPaise(BigInt(invoice.total_paise))}`} />
            )}
            <BillExplainer invoiceId={invoice.id} />
            <InvoicePdfButton
              consumerNumber={consumerNumber}
              billingPeriodStart={invoice.billing_period_start}
              billingPeriodEnd={invoice.billing_period_end}
              unitsKwh={unitsKwh}
              totalPaise={invoice.total_paise}
              status={invoice.status}
              lines={invoice.invoice_lines}
            />
          </div>
        </div>
      )}
    </div>
  );
}
