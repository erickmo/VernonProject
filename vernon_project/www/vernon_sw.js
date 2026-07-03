// Vernon Project — hand-written service worker.
// Served at /vernon_sw.js (site root) and registered with scope "/m" so it
// controls the app. Uses only absolute URLs + runtime caching, so it works
// regardless of where the script itself is served from.

const ASSET_CACHE = 'vernon-assets-v8'
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

// --- Web Push -------------------------------------------------------------
function deepLinkFor(data) {
  const d = (data && data.reference_doctype) || ''
  const n = (data && data.reference_name) || ''
  if (d === 'Project Todo' && n) return '/m/project-item/' + encodeURIComponent(n)
  if (d === 'Project Detail' && n) return '/m/project-detail/' + encodeURIComponent(n)
  if (d === 'Project' && n) return '/m/project/' + encodeURIComponent(n)
  if (d === 'Wallet') return '/m/wallet'
  if (d === 'Reward Redemption') return '/m/marketplace'
  return '/m'
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = { title: 'Vernon', body: event.data ? event.data.text() : '' }
  }
  const title = payload.title || 'Vernon'
  const url = deepLinkFor(payload)
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: ASSET_PREFIX + 'icon-192.png',
      badge: ASSET_PREFIX + 'icon-192.png',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/m'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if (client.url.includes('/m') && 'focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(url)
            } catch (e) {
              /* cross-scope navigate may fail; focus is enough */
            }
          }
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url)
    })(),
  )
})
