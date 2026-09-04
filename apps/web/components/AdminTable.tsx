"use client";

// A filterable table for the admin panel. Columns are declared by the page;
// the search box filters across the stringified row.

import { useMemo, useState } from "react";

export type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right";
  cell?: (row: T) => string; // value used for search + sort
};

export function AdminTable<T extends { id: string }>({
  rows,
  columns,
  searchPlaceholder = "Search…",
  pageSize = 40,
}: {
  rows: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  pageSize?: number;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      columns.some((c) => (c.cell ? c.cell(r) : String((r as Record<string, unknown>)[c.key] ?? "")).toLowerCase().includes(needle)),
    );
  }, [q, rows, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder={searchPlaceholder}
          className="rounded-control border px-3 py-1.5 text-sm w-full max-w-sm"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-sunken)" }}
        />
        <span className="mono text-xs shrink-0" style={{ color: "var(--color-text-tertiary)" }}>
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div
        className="rounded-card border card-shadow overflow-x-auto"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-card)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--color-border)" }}>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="p-3 font-medium text-xs whitespace-nowrap"
                  style={{ color: "var(--color-text-secondary)", textAlign: c.align ?? "left" }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                {columns.map((c) => (
                  <td key={c.key} className="p-3" style={{ textAlign: c.align ?? "left" }}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="p-6 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  Nothing matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-2 mt-3 text-xs">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-control border px-2 py-1 disabled:opacity-40"
            style={{ borderColor: "var(--color-border)" }}
          >
            Prev
          </button>
          <span className="mono" style={{ color: "var(--color-text-tertiary)" }}>
            {page + 1} / {pages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
            className="rounded-control border px-2 py-1 disabled:opacity-40"
            style={{ borderColor: "var(--color-border)" }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
