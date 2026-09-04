"use client";

// Support knowledge base (migration 0033). Search, filter by category,
// expand an article, and copy a canned response. Copying bumps usage_count
// via kb_touch so the most-used replies float up.

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PanelIcon } from "./Icon";

export type Article = {
  slug: string;
  category: string;
  title: string;
  body_md: string;
  canned_response: string | null;
  audience: string;
  usage_count: number;
};

export function KbBrowser({ articles }: { articles: Article[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const categories = useMemo(() => Array.from(new Set(articles.map((a) => a.category))).sort(), [articles]);

  const shown = articles
    .filter((a) => cat === "all" || a.category === cat)
    .filter((a) => {
      if (!q.trim()) return true;
      const s = `${a.title} ${a.body_md} ${a.canned_response ?? ""}`.toLowerCase();
      return s.includes(q.toLowerCase());
    })
    .sort((a, b) => b.usage_count - a.usage_count);

  async function copy(a: Article) {
    if (!a.canned_response) return;
    await navigator.clipboard.writeText(a.canned_response);
    setCopied(a.slug);
    setTimeout(() => setCopied(null), 1500);
    const supabase = createClient();
    await supabase.rpc("kb_touch", { p_slug: a.slug });
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search articles and canned responses"
          className="flex-1 min-w-[220px] rounded-control border px-3 py-2 text-sm"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" }}
        />
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        {["all", ...categories].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className="mono text-xs rounded-full px-3 h-7"
            style={{
              background: cat === c ? "var(--color-categorical-third)" : "var(--color-surface-sunken)",
              color: cat === c ? "#04140b" : "var(--color-text-secondary)",
            }}
          >
            {c === "all" ? "All" : c}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Nothing matches.
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((a) => {
            const expanded = open === a.slug;
            return (
              <div
                key={a.slug}
                className="rounded-card border card-shadow"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : a.slug)}
                  className="w-full text-left p-4 flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-medium">{a.title}</div>
                    <div className="mono text-[11px] mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>
                      {a.category}
                      {a.audience !== "agent" && " · consumer-facing"}
                      {a.usage_count > 0 && ` · used ${a.usage_count}×`}
                    </div>
                  </div>
                  <span style={{ color: "var(--color-text-tertiary)" }}>
                    <PanelIcon name={expanded ? "chevronDown" : "chevronRight"} size={16} />
                  </span>
                </button>
                {expanded && (
                  <div className="px-4 pb-4">
                    <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      {a.body_md}
                    </p>
                    {a.canned_response && (
                      <div className="mt-3">
                        <div className="eyebrow mb-1.5">Canned response</div>
                        <div
                          className="rounded-control border p-3 text-sm"
                          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-sunken)", color: "var(--color-text-secondary)" }}
                        >
                          {a.canned_response}
                        </div>
                        <button
                          type="button"
                          onClick={() => copy(a)}
                          className="mt-2 rounded-control border px-3 py-1.5 text-xs font-semibold"
                          style={{ borderColor: "var(--color-border)" }}
                        >
                          {copied === a.slug ? "Copied" : "Copy"}
                        </button>
                        <p className="text-[10px] mt-1.5" style={{ color: "var(--color-text-tertiary)" }}>
                          Placeholders in {"{ }"} fill from the consumer 360 bundle before you send.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
