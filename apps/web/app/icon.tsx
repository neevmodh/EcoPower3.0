// The PWA/browser-tab icon, generated at request time via next/og — no
// static PNG asset to keep in sync with Logo.tsx's SVG mark. Same gradient
// and bolt glyph used across the panel rails (PanelShell's ⚡ badge), so
// the installed-app icon matches what's actually in the product.
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
          background: "linear-gradient(135deg, #1baf7a 0%, #0f8a5c 100%)",
          borderRadius: 112,
          color: "#fff",
          fontSize: 300,
        }}
      >
        ⚡
      </div>
    ),
    { ...size },
  );
}
