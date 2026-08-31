import type { MetadataRoute } from "next";

// PS1 §1 asks for "web and mobile channels." No native app exists (that
// decision is still open, see WORKLOG.md) — this is the honest, working
// middle ground: a real installable PWA (standalone display, real icon,
// a service worker satisfying install criteria) rather than a claim of
// mobile support the platform can't back up.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EcoPower — Energy-as-a-Service",
    short_name: "EcoPower",
    description: "Subscribe, track, and pay for solar, backup, and metered energy services.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1baf7a",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
