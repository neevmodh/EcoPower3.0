"use client";

// The capability grid, filterable by domain and persona and searchable.
// Every entry names something that exists in this repo — a migration, an
// RPC, a route, a test suite. Nothing here is a roadmap item; DESIGN.md P1
// applies to marketing copy too.

import { useMemo, useState } from "react";
import { PanelIcon, type IconName } from "@/components/Icon";

type Domain = "Metering" | "Billing" | "Money" | "Solar" | "Grid" | "Green" | "Care";
type Persona = "Consumer" | "DISCOM" | "Operator" | "Field";

type Capability = {
  domain: Domain;
  persona: Persona;
  title: string;
  body: string;
  tint: string;
  icon: IconName;
};

const LIME = "var(--color-categorical-third)";
const CYAN = "var(--color-categorical-consumption)";
const AMBER = "var(--color-categorical-generation)";
const CORAL = "var(--color-status-serious)";
const VIOLET = "#b394ff";

const CAPABILITIES: Capability[] = [
  { domain: "Metering", persona: "Consumer", title: "Sub-second live metering", body: "Register reads pushed over Realtime Broadcast, or an honest reason the socket is down.", tint: LIME, icon: "radio" },
  { domain: "Metering", persona: "Consumer", title: "Load disaggregation", body: "Interval deltas split into base and cooling load against the ambient curve.", tint: CYAN, icon: "trend" },
  { domain: "Metering", persona: "DISCOM", title: "Tamper and event flags", body: "A non-zero IS 15959 event bitfield reaches the consumer and the inspection queue.", tint: CORAL, icon: "shield" },
  { domain: "Metering", persona: "DISCOM", title: "VEE labelling", body: "Every read is measured, estimated or missing — never silently interpolated.", tint: CYAN, icon: "box" },
  { domain: "Metering", persona: "Operator", title: "HES adapter layer", body: "One interface with vendor stubs behind it: Trilliant today, another head-end tomorrow.", tint: VIOLET, icon: "box" },
  { domain: "Metering", persona: "Operator", title: "Monotonic register guard", body: "A register that runs backwards is quarantined at ingest, not billed.", tint: AMBER, icon: "shield" },
  { domain: "Billing", persona: "Consumer", title: "Provable invoices", body: "Open a line, see the two bracketing reads. bigint paise throughout — no floats.", tint: LIME, icon: "receipt" },
  { domain: "Billing", persona: "Consumer", title: "Bill explainer", body: "Deterministic: slab crossings, degree-days, days billed. No model guesses a rupee.", tint: AMBER, icon: "search" },
  { domain: "Billing", persona: "Consumer", title: "Slab-position meter", body: "How deep you are into the ₹5.00 slab, and what the next unit will cost.", tint: AMBER, icon: "gauge" },
  { domain: "Billing", persona: "DISCOM", title: "Golden-file test suite", body: "Twelve invariants and pinned worked examples guard every tariff change in CI.", tint: LIME, icon: "check" },
  { domain: "Billing", persona: "Operator", title: "Guarantee settlement", body: "Contracted performance ratio and uptime measured against meter data; credits raised automatically.", tint: VIOLET, icon: "wrench" },
  { domain: "Money", persona: "Consumer", title: "Prepaid balance", body: "Drawn down daily at the account vend rate, with a low-balance state before cut-off.", tint: LIME, icon: "wallet" },
  { domain: "Money", persona: "Consumer", title: "Razorpay checkout", body: "Order creation and webhook signature verification — the payment confirms the invoice, not the UI.", tint: CYAN, icon: "rupee" },
  { domain: "Money", persona: "Consumer", title: "Annual and PAYG cycles", body: "Pay yearly and save two months, or run a zero-base-fee pay-as-you-go plan.", tint: CYAN, icon: "clock" },
  { domain: "Money", persona: "DISCOM", title: "Disconnection watch list", body: "Prepaid accounts at or below threshold, with the balance history attached.", tint: CORAL, icon: "lock" },
  { domain: "Solar", persona: "Consumer", title: "Real solar yield model", body: "Physically modelled generation from solar position, cloud cover and cell temperature.", tint: AMBER, icon: "sun" },
  { domain: "Solar", persona: "Consumer", title: "Backup readiness", body: "Hours at present load, and when the pack last completed a full cycle.", tint: LIME, icon: "battery" },
  { domain: "Solar", persona: "DISCOM", title: "Net-metering state machine", body: "Apply, watch the statutory clock, read the decision and its stated reason.", tint: CYAN, icon: "plug" },
  { domain: "Grid", persona: "DISCOM", title: "DT loss localisation", body: "Drill a high-loss transformer to the consumers under it, ranked by real signal.", tint: CYAN, icon: "grid" },
  { domain: "Grid", persona: "DISCOM", title: "AT&C loss accounting", body: "Delivered at the DT head against summed consumer registers, aggregated in SQL.", tint: CYAN, icon: "trend" },
  { domain: "Grid", persona: "DISCOM", title: "Outage detection", body: "A pg_cron job scans meter staleness and notifies the affected consumers.", tint: CORAL, icon: "alert" },
  { domain: "Grid", persona: "Field", title: "Work-order workflow", body: "Claim, start, complete or cancel — with the transitions written to an immutable ledger.", tint: VIOLET, icon: "pin" },
  { domain: "Grid", persona: "Consumer", title: "Society allocation", body: "Six units, one society main meter, an editable cost split that must total 100%.", tint: VIOLET, icon: "users" },
  { domain: "Green", persona: "Consumer", title: "Carbon accounting", body: "CO₂ avoided at the CEA combined-margin factor, with the citation on the tile.", tint: LIME, icon: "leaf" },
  { domain: "Care", persona: "Consumer", title: "Grounded AI advisor", body: "Answers only from your account data. It narrates real numbers; it never invents one.", tint: LIME, icon: "chat" },
  { domain: "Care", persona: "Consumer", title: "Support ticketing", body: "A real queue with threaded replies, and a notification when an agent answers.", tint: CYAN, icon: "chat" },
  { domain: "Care", persona: "Consumer", title: "Three languages", body: "English, हिन्दी and ગુજરાતી — server-rendered from a cookie, with English fallback.", tint: AMBER, icon: "doc" },
  { domain: "Care", persona: "DISCOM", title: "Append-only audit ledger", body: "Approvals and status changes written by a database trigger. UPDATE and DELETE raise.", tint: CORAL, icon: "lock" },
];

const DOMAINS: Domain[] = ["Metering", "Billing", "Money", "Solar", "Grid", "Green", "Care"];
const PERSONAS: Persona[] = ["Consumer", "DISCOM", "Operator", "Field"];

export function CapabilityExplorer() {
  const [domain, setDomain] = useState<Domain | "all">("all");
  const [persona, setPersona] = useState<Persona | "all">("all");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CAPABILITIES.filter(
      (c) =>
        (domain === "all" || c.domain === domain) &&
        (persona === "all" || c.persona === persona) &&
        (q === "" || `${c.title} ${c.body}`.toLowerCase().includes(q)),
    );
  }, [domain, persona, query]);

  const filtered = domain !== "all" || persona !== "all";

  return (
    <div>
      <div className="flex justify-between items-end gap-10 flex-wrap">
        <div>
          <div className="eyebrow">Platform</div>
          <h2 className="text-4xl mt-3.5 font-bold">
            {CAPABILITIES.length} capabilities.
            <br />
            One row-secured spine.
          </h2>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="relative">
            <span className="absolute left-3 top-2.5" style={{ color: "var(--color-text-tertiary)" }}>
              <PanelIcon name="search" size={16} />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search capabilities…"
              aria-label="Search capabilities"
              className="field pl-9"
              style={{ width: 272 }}
            />
          </div>
          <span className="mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {shown.length} of {CAPABILITIES.length} shown
          </span>
        </div>
      </div>

      <div className="flex gap-2 mt-7 flex-wrap items-center">
        <span className="eyebrow w-[62px]">Domain</span>
        <button type="button" className={`chip ${domain === "all" ? "chip-on" : ""}`} onClick={() => setDomain("all")}>
          All<span className="mono opacity-50">{CAPABILITIES.length}</span>
        </button>
        {DOMAINS.map((d) => (
          <button key={d} type="button" className={`chip ${domain === d ? "chip-on" : ""}`} onClick={() => setDomain(d)}>
            {d}
            <span className="mono opacity-50">{CAPABILITIES.filter((c) => c.domain === d).length}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2 mt-2.5 flex-wrap items-center">
        <span className="eyebrow w-[62px]">Persona</span>
        <button type="button" className={`chip ${persona === "all" ? "chip-on" : ""}`} onClick={() => setPersona("all")}>
          Everyone
        </button>
        {PERSONAS.map((p) => (
          <button key={p} type="button" className={`chip ${persona === p ? "chip-on" : ""}`} onClick={() => setPersona(p)}>
            {p}
          </button>
        ))}
        {filtered && (
          <button
            type="button"
            className="chip"
            onClick={() => {
              setDomain("all");
              setPersona("all");
            }}
            style={{ borderColor: "var(--color-status-serious)", color: "var(--color-status-serious)" }}
          >
            <PanelIcon name="x" size={13} />
            Clear
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div
          className="mt-8 rounded-card border p-12 text-center text-sm"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-tertiary)" }}
        >
          Nothing matches that filter.
        </div>
      ) : (
        <div className="grid gap-3.5 mt-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(258px, 1fr))" }}>
          {shown.map((c) => (
            <div
              key={c.title}
              className="rounded-card border p-4 card-lift"
              style={{
                borderColor: "var(--color-border)",
                borderTop: `2px solid ${c.tint}`,
                background: "var(--color-surface-card)",
              }}
            >
              <div className="flex justify-between items-start">
                <span style={{ color: c.tint }}>
                  <PanelIcon name={c.icon} size={19} />
                </span>
                <span className="eyebrow text-[9.5px]">{c.persona}</span>
              </div>
              <h3 className="text-sm mt-3 font-semibold leading-snug">{c.title}</h3>
              <p className="text-xs mt-1.5" style={{ color: "var(--color-text-secondary)", textWrap: "pretty" }}>
                {c.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
