# Service worker check (10.4 clean-ups)

Run 2026-10-18 on Next.js 16.1.0 and @serwist/next 9.5.13.

## Today's build (`pnpm run build` = `next build`, Turbopack)

The build log warns that @serwist/next doesn't support Turbopack, and no `public/sw.js` is produced. Production
therefore has **no service worker**: no offline page, no caching. The old manual registration in
ServiceWorkerRegister.tsx pointed at that missing `/sw.js`, so removing it loses nothing.

## The same code built with webpack (`next build --webpack`)

```
▲ Next.js 16.1.0 (webpack)

  Creating an optimized production build ...
✓ (serwist) Bundling the service worker script with the URL '/sw.js' and the scope '/'...
✓ Compiled successfully in 34.2s
  Running TypeScript ...
  Collecting page data using 3 workers ...
  Generating static pages using 3 workers (0/71) ...
```

With `additionalPrecacheEntries: [{ url: "/~offline", … }]` added to next.config.ts (now committed; Turbopack
ignores it), checked in Chromium with `sw-offline-check.mjs`:

- One service worker registration (scope `/`, script `/sw.js`). Serwist calls `register` itself; the app
  no longer adds a second call.
- `/~offline` is in the Serwist precache.
- With the frontend server stopped, opening a page never visited (`/stores/never-visited-store-id`) is
  answered by the worker (200, fromServiceWorker) with the offline page: `sw-offline-fallback-webpack.png`.

Playwright's `setOffline` doesn't stop the worker's own requests, so the check stops the server instead.

Switching the build command is listed under "Needs from you" in phase-10-remaining.md.
