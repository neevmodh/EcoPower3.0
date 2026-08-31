// Minimal service worker — satisfies browser install criteria for
// manifest.ts (a fetch handler is required for the "Add to Home Screen"
// prompt on Chrome/Android). Deliberately does no offline caching: this
// app's data is live, RLS-scoped, and per-user — caching responses here
// would risk serving one user's cached data to another, or serving stale
// meter readings as if they were live. Every request passes straight
// through to the network.
self.addEventListener("fetch", () => {});
