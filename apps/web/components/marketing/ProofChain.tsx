"use client";

// The claim this whole product rests on is "every rupee traces to a register
// read". This walks that chain in four hops. The numbers are the same worked
// example the tariff engine's golden-file tests pin
// (packages/shared/src/billing/tariff-engine.golden.test.ts) — if the engine
// ever stops producing them, CI fails before this page can lie.

import { useState } from "react";

const HOPS = [
  {
    n: "01",
    title: "The meter reports",
    body: "A 15-minute interval arrives over MQTT, signed with the device key, and is checked for register monotonicity before anything is written.",
    code: "reading_ts   2026-08-30T18:30:00Z\nkwh_import   10,528.000   quality=good",
  },
  {
    n: "02",
    title: "Two registers bracket the period",
    body: "The invoice stores the opening and closing reading IDs — not a copied number. The reads themselves are immutable rows in a partitioned table.",
    code: "opening   10,240.000 · 01 Aug\nclosing   10,528.000 · 30 Aug\ndelta        288.000 kWh",
  },
  {
    n: "03",
    title: "Telescopic slabs price it",
    body: "The GERC RGP order, extracted from the primary PDF. Consumption fills each slab before it spills into the next — never one blended rate.",
    code: "50 @ ₹3.20    =   ₹160.00\n150 @ ₹3.95   =   ₹592.50\n88 @ ₹5.00    =   ₹440.00",
  },
  {
    n: "04",
    title: "The line you can audit",
    body: "Energy, fixed charge and 10% electricity duty compose the invoice. Every component is reproducible from the two reads above.",
    code: "energy ₹1,192.50 + fixed ₹25.00\nduty 10%          ₹121.75\ntotal          ₹1,339.02",
  },
];

export function ProofChain() {
  const [open, setOpen] = useState(0);

  return (
    <div>
      {HOPS.map((hop, i) => {
        const active = open === i;
        return (
          <button
            key={hop.n}
            type="button"
            onClick={() => setOpen(i)}
            className="w-full text-left cursor-pointer py-4 pl-6 transition-colors duration-state"
            style={{
              borderLeft: `2px solid ${active ? "var(--color-categorical-third)" : "var(--color-border)"}`,
            }}
            aria-expanded={active}
          >
            <div className="flex items-center gap-4">
              <span
                className="mono text-[11px]"
                style={{ color: active ? "var(--color-categorical-third)" : "var(--color-text-tertiary)" }}
              >
                {hop.n}
              </span>
              <span
                className="font-display font-semibold text-[17px]"
                style={{ color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}
              >
                {hop.title}
              </span>
            </div>
            <div
              className="overflow-hidden"
              style={{
                maxHeight: active ? 240 : 0,
                opacity: active ? 1 : 0,
                transition: "max-height 380ms cubic-bezier(.2,.7,.2,1), opacity 280ms ease",
              }}
            >
              <p className="text-sm mt-2.5 max-w-[470px]" style={{ color: "var(--color-text-secondary)", textWrap: "pretty" }}>
                {hop.body}
              </p>
              <div
                className="mt-3 rounded-control border p-4"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" }}
              >
                <pre
                  className="mono text-xs leading-relaxed m-0 whitespace-pre-wrap"
                  style={{ color: "var(--color-categorical-third)" }}
                >
                  {hop.code}
                </pre>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
