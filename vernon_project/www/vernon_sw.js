// Vernon Project — hand-written service worker.
// Served at /vernon_sw.js (site root) and registered with scope "/m" so it
// controls the app. Uses only absolute URLs + runtime caching, so it works
// regardless of where the script itself is served from.

const ASSET_CACHE = 'vernon-assets-v5'
const ASSET_PREFIX = '/assets/vernon_project/frontend/'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions (incl. the retired API cache).
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => k !== ASSET_CACHE).map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return // mutations always hit the network

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Built app assets (JS/CSS/icons): cache-first — they are content-hashed.
  if (url.pathname.startsWith(ASSET_PREFIX)) {
    event.respondWith(cacheFirst(req, ASSET_CACHE))
    return
  }

  // Mobile read API is never cached: always hit the network so data is fresh.
  // (No respondWith → default browser fetch, no SW fallback.)

  // App navigations under /m: network-first, fall back to the cached shell.
  if (req.mode === 'navigate' && url.pathname.startsWith('/m')) {
    event.respondWith(navigationHandler(req))
    return
  }
  // Everything else (e.g. /api/method/login, Frappe assets): default network.
})

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res && res.status === 200) cache.put(req, res.clone())
  return res
}

async function navigationHandler(req) {
  const cache = await caches.open(ASSET_CACHE)
  try {
    // Bypass the browser HTTP cache for the shell: every deploy changes the
    // hashed asset filenames m.html references, so a heuristically-cached shell
    // would load deleted JS and white-screen the app. `cache: 'reload'` forces
    // a fresh fetch; hashed assets below stay cache-first.
    const res = await fetch(req, { cache: 'reload' })
    if (res && res.status === 200) cache.put('/m', res.clone())
    return res
  } catch (err) {
    // Offline: serve the last good shell, else the precachable index.
    const shell = (await cache.match('/m')) || (await cache.match(ASSET_PREFIX + 'index.html'))
    if (shell) return shell
    throw err
  }
}
