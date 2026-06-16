// Vernon Project — hand-written service worker.
// Served at /vernon_sw.js (site root) and registered with scope "/m" so it
// controls the app. Uses only absolute URLs + runtime caching, so it works
// regardless of where the script itself is served from.

const ASSET_CACHE = 'vernon-assets-v2'
const API_CACHE = 'vernon-api-v2'
const ASSET_PREFIX = '/assets/vernon_project/frontend/'
const API_PREFIX = '/api/method/vernon_project.api.mobile.'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions.
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k !== ASSET_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k)),
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

  // Mobile read API: network-first, fall back to last cached response offline.
  if (url.pathname.startsWith(API_PREFIX)) {
    event.respondWith(networkFirst(req, API_CACHE))
    return
  }

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

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(req)
    if (res && res.status === 200) cache.put(req, res.clone())
    return res
  } catch (err) {
    const hit = await cache.match(req)
    if (hit) return hit
    throw err
  }
}

async function navigationHandler(req) {
  const cache = await caches.open(ASSET_CACHE)
  try {
    const res = await fetch(req)
    if (res && res.status === 200) cache.put('/m', res.clone())
    return res
  } catch (err) {
    // Offline: serve the last good shell, else the precachable index.
    const shell = (await cache.match('/m')) || (await cache.match(ASSET_PREFIX + 'index.html'))
    if (shell) return shell
    throw err
  }
}
