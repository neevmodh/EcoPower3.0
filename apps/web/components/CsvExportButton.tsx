"use client";

// Real CSV export, client-side blob download — 2.0's one genuinely working
// export pattern (jspdf/CSV), rebuilt without the Mongo/Express plumbing.

export function CsvExportButton({
  filename,
  rows,
}: {
  filename: string;
  rows: Array<Record<string, string | number>>;
}) {
  function download() {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={download}
      className="rounded-control px-3 py-1.5 text-xs font-semibold border transition-colors duration-state"
      style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
    >
      Export CSV
    </button>
  );
}
