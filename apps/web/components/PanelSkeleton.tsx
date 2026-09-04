// Instant navigation feedback. Next renders this the moment a nav link is
// clicked — no server round trip — while the real page streams in behind it.
// It mirrors PanelShell's geometry so there's no layout jump on swap.

const ACCENTS: Record<string, string> = {
  consumer: "var(--color-categorical-third)",
  society: "#b394ff",
  discom: "var(--color-categorical-consumption)",
  operator: "#8fa0b4",
  field: "var(--color-categorical-generation)",
  support: "#4fd6c4",
};

function Bar({ w, h = 12 }: { w: string; h?: number }) {
  return (
    <span
      className="block rounded"
      style={{ width: w, height: h, background: "var(--color-surface-sunken)" }}
    />
  );
}

export function PanelSkeleton({ panel }: { panel: keyof typeof ACCENTS }) {
  const accent = ACCENTS[panel] ?? "var(--color-categorical-consumption)";
  return (
    <div className="min-h-screen flex animate-pulse" style={{ background: "var(--color-surface)" }} aria-busy="true">
      <nav
        className="w-56 shrink-0 border-r hidden md:flex flex-col px-3 py-4 gap-2"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}
      >
        <div className="flex items-center gap-2.5 px-2 pb-3">
          <span className="w-5 h-5 rounded" style={{ background: accent, opacity: 0.5 }} />
          <Bar w="90px" />
        </div>
        {[0,1,2,3,4,5,6].map((i) => (
          <Bar key={`n${i}`} w={`${70 + ((i * 13) % 40)}%`} h={16} />
        ))}
        <div className="flex-1" />
        <div className="rounded-card border p-3" style={{ borderColor: "var(--color-border)" }}>
          <Bar w="100%" h={40} />
        </div>
      </nav>

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="flex items-center justify-between px-4 md:px-6 h-14 border-b shrink-0"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-raised)" }}
        >
          <span className="rounded-full" style={{ width: 120, height: 26, background: accent, opacity: 0.35 }} />
          <Bar w="130px" h={16} />
        </header>

        <main className="p-4 md:p-6 space-y-6">
          <div className="space-y-2">
            <Bar w="220px" h={22} />
            <Bar w="min(420px, 80%)" h={14} />
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {[0,1,2,3].map((i) => (
              <div key={`s${i}`} className="rounded-card border p-4 space-y-3" style={{ borderColor: "var(--color-border)" }}>
                <Bar w="60%" h={10} />
                <Bar w="45%" h={24} />
              </div>
            ))}
          </div>
          <div
            className="rounded-card border"
            style={{ borderColor: "var(--color-border)", height: 260, background: "var(--color-surface-card)" }}
          />
        </main>
      </div>
    </div>
  );
}
