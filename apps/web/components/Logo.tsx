// EcoPower's mark: a leaf flowing into a bolt — energy generated becomes
// energy delivered. Previous version's comment claimed this but the path
// was just a bare lightning bolt with no leaf in it at all. This one is a
// single silhouette: a rounded leaf tip at the top feeding straight into a
// bold zigzag bolt, so it still reads as "energy" at 18px (the browser-tab
// favicon size) and reads as "leaf + bolt" once it's bigger than that.
// Checked at 18/24/96/160px before landing on this shape — see WORKLOG.
// Pure SVG, no image asset.

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" role="img" aria-label="EcoPower">
      <rect width="32" height="32" rx="9" fill="url(#ecopower-logo-gradient)" />
      <path d="M11 2 Q22.5 2.5 19 11 Q9 10 11 2 Z" fill="#fff" />
      <path d="M18.3 8.5 10.5 19h4.7l-1.4 7.7L21.2 15h-4.9l1.9-6.5Z" fill="#fff" />
      <defs>
        <linearGradient id="ecopower-logo-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1baf7a" />
          <stop offset="1" stopColor="#0f8a5c" />
        </linearGradient>
      </defs>
    </svg>
  );
}
