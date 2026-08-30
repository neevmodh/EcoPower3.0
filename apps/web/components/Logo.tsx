// EcoPower's mark: a leaf and a bolt sharing one stroke — energy generated
// (leaf) becomes energy delivered (bolt). Replaces the emoji-in-a-box
// placeholder used everywhere before this. Pure SVG, no image asset, so it
// stays crisp at any size and costs nothing extra in the bundle.

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" role="img" aria-label="EcoPower">
      <rect width="32" height="32" rx="9" fill="url(#ecopower-logo-gradient)" />
      <path
        d="M17.6 6.5 10 17.4h4.9l-1.5 8.1 8.1-11.6h-5.1l1.2-7.4Z"
        fill="#fff"
      />
      <defs>
        <linearGradient id="ecopower-logo-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1baf7a" />
          <stop offset="1" stopColor="#0f8a5c" />
        </linearGradient>
      </defs>
    </svg>
  );
}
