// Self-destructing service worker.
//
// Why this exists: while project-www.vernon.id briefly resolved to the Akira PWA
// (nginx default_server catch-all before its server_name was added), the Akira
// Vite/Workbox service worker registered itself at "/sw.js" (scope "/") in
// visitors' browsers and kept serving the cached Akira shell — so non-incognito
// users saw the Akira login even after this origin started serving VernonCorp.
//
// A 404 at /sw.js does NOT unregister an existing SW; the browser keeps the last
// good one. So we serve a real script here that removes itself: on the next SW
// update check (fired on navigation), the browser fetches this, activates it,
// wipes caches, unregisters, and reloads open windows onto the real content.
//
// This is safe to leave in place permanently: for a browser with no SW at /sw.js
// it does nothing; for a poisoned one it cleans up once and is gone.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch (e) {
        /* ignore */
      }
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try {
          client.navigate(client.url);
        } catch (e) {
          /* ignore */
        }
      }
    })()
  );
});
