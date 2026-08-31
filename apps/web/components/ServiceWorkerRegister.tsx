"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability is a nice-to-have, not a hard requirement — a
        // failed registration (e.g. an unsupported browser) shouldn't
        // surface as an error to the user.
      });
    }
  }, []);
  return null;
}
