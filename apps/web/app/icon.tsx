// The PWA/browser-tab icon, generated at request time via next/og — no static
// PNG asset to keep in sync with Logo.tsx's SVG mark. It draws the same bolt
// path Logo.tsx does rather than an emoji, so the installed-app icon is
// pixel-identical to the mark in the product and renders the same on every
// platform (an emoji glyph would be whatever font the renderer happened to
// have).
import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6fea77 0%, #17a06a 100%)",
          borderRadius: 112,
        }}
      >
        <svg width="300" height="300" viewBox="0 0 32 32" fill="none">
          <title>EcoPower</title>
          <path d="M17.6 6.5 10 17.4h4.9l-1.5 8.1 8.1-11.6h-5.1l1.2-7.4Z" fill="#04140b" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
