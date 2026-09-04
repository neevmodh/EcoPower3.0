export default function Loading() {
  return (
    <div className="min-h-screen animate-pulse" style={{ background: "var(--color-surface)" }} aria-busy="true">
      <div className="h-[70px] border-b" style={{ borderColor: "var(--color-border)" }} />
      <div className="max-w-[1000px] mx-auto px-10 pt-24 space-y-4">
        <div className="h-4 w-40 rounded" style={{ background: "var(--color-surface-sunken)" }} />
        <div className="h-14 w-3/4 rounded" style={{ background: "var(--color-surface-sunken)" }} />
        <div className="h-4 w-1/2 rounded" style={{ background: "var(--color-surface-sunken)" }} />
      </div>
    </div>
  );
}
