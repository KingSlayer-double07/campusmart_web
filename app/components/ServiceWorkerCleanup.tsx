"use client";

import { useEffect } from "react";

// Serwist registers the production worker itself (@serwist/next registers by default), so this
// no longer registers a second copy (guide Phase 10 clean-ups). In development the worker isn't
// built (see next.config.ts), so drop any worker left over from a production build so it stops
// 404ing and serving stale cached pages.
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV === "production") return;
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((reg) => reg.unregister()));
  }, []);

  return null;
}
