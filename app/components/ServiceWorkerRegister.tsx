"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // The worker is only built for production (see next.config.ts), so in dev there is no
    // /sw.js. Drop any worker left over from a production build so it stops 404ing and
    // serving stale cached pages.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((reg) => reg.unregister()));
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((err) => console.error("SW failed", err));
  }, []);

  return null;
}
