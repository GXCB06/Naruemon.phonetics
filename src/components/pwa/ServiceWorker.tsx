"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that makes Melobi installable and lets a cached page open without a network.
 * Production only: in `next dev` a worker would hide hot reloads behind a stale cache.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const id = window.setTimeout(() => {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
