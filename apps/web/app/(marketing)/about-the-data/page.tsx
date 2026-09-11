import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { createClient } from "@/lib/supabase/server";

// Public disclosure table (#74/#75) — anon-readable, same published-catalog
// exception as /pricing.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "About the data — EcoPower",
  description: "What's real, what's synthesised, and the source for every number on this platform.",
};

type ProvenanceRow = {
  id: string;
  entity: string;
  kind: "synthetic_series" | "real_cited";
  generator_version: string | null;
  calibrated_to: string | null;
  description: string;
  source_document_url: string | null;
};

export default async function AboutTheDataPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("data_provenance")
    .select("id, entity, kind, generator_version, calibrated_to, description, source_document_url")
    .order("kind");

  const rows = (data ?? []) as ProvenanceRow[];
  const synthetic = rows.filter((r) => r.kind === "synthetic_series");
  const real = rows.filter((r) => r.kind === "real_cited");

  return (
    <>
      <MarketingNav />
      <main
        className="max-w-[900px] mx-auto px-6 md:px-10 py-16"
        style={{ background: "var(--color-surface)" }}
      >
        <span className="eyebrow" style={{ color: "var(--color-text-tertiary)" }}>
          Data honesty
        </span>
        <h1 className="text-[36px] font-display font-bold leading-[1.1] mt-2">About the data</h1>
        <p className="mt-4 text-[16px] max-w-[62ch]" style={{ color: "var(--color-text-secondary)" }}>
          Per-consumer smart-meter data is not published anywhere in India — DISCOMs hold it as
          commercially sensitive and personally identifying. Every entry in this competition
          demonstrates on generated data; there is no alternative. Our rule instead: <strong>synthetic
          series, real cited parameters, honest about which is which.</strong> This page is that
          discipline made checkable, not just claimed.
        </p>

        <section className="mt-12">
          <h2 className="text-[20px] font-display font-bold mb-1">Real, cited</h2>
          <p className="text-[13px] mb-5" style={{ color: "var(--color-text-tertiary)" }}>
            Numbers taken directly from a published source — never synthesised.
          </p>
          <div className="space-y-3">
            {real.map((r) => (
              <div
                key={r.id}
                className="rounded-card border p-5 card-shadow"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
              >
                <div className="font-display font-semibold text-[14px]">{r.entity}</div>
                <p className="text-[13px] mt-1.5" style={{ color: "var(--color-text-secondary)" }}>
                  {r.description}
                </p>
                {r.source_document_url && (
                  <a
                    href={r.source_document_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mono text-[11px] mt-2 inline-block underline break-all"
                    style={{ color: "var(--color-categorical-third)" }}
                  >
                    {r.source_document_url}
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-[20px] font-display font-bold mb-1">Synthetic, calibrated</h2>
          <p className="text-[13px] mb-5" style={{ color: "var(--color-text-tertiary)" }}>
            Generated series, checked against a real published aggregate — the test is: aggregate
            our synthetic population up, and does it reproduce the published number?
          </p>
          <div className="space-y-3">
            {synthetic.map((r) => (
              <div
                key={r.id}
                className="rounded-card border p-5 card-shadow"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="font-display font-semibold text-[14px]">{r.entity}</div>
                  {r.generator_version && (
                    <span
                      className="mono text-[10px] rounded-full px-2 py-0.5"
                      style={{ background: "var(--color-surface-sunken)", color: "var(--color-text-tertiary)" }}
                    >
                      generator {r.generator_version}
                    </span>
                  )}
                </div>
                <p className="text-[13px] mt-1.5" style={{ color: "var(--color-text-secondary)" }}>
                  {r.description}
                </p>
                {r.calibrated_to && (
                  <p className="text-[12px] mt-2" style={{ color: "var(--color-text-tertiary)" }}>
                    <strong>Calibrated to:</strong> {r.calibrated_to}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {rows.length === 0 && (
          <p className="mt-10 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            The provenance table is empty in this environment — see{" "}
            <code className="mono">supabase/migrations/0041_data_provenance.sql</code>.
          </p>
        )}
      </main>
    </>
  );
}
