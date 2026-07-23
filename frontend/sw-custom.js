// Vernon Project — hand-written service worker.
// Served at /vernon_sw.js (site root) and registered with scope "/m" so it
// controls the app. Uses only absolute URLs + runtime caching, so it works
// regardless of where the script itself is served from.

// v10: bumped to evict a poisoned 0-byte bundle entry a CDN edge cached during a
// same-hash rebuild; the old cache is dropped on activate so assets re-fetch fresh.
// v12: force installed /m clients off the stale shell after the move-detail deploy.
// v13: flush stale shell so the focus-timer FAB fix (completed todos no longer linger) lands.
// v14: flush stale /m shell for the Cuti Bersama holiday sync + per-Brand quota + Settings cards.
// v17: flush shell after moving per-Brand leave/holiday settings onto the brand form.
// v18: flush stale shell for the interview-assessment feature (DISC/personality/logical tests + fit).
const ASSET_CACHE = 'vernon-assets-v18'
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

  // version.json is the update-detection probe — never cache it, always hit network.
  if (url.pathname.endsWith('version.json')) return

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
// ponytail: mirrors deepLink() in frontend/src/lib/notifications.ts, which is the
// source of truth — change both. This file is copied verbatim by copy-html.mjs
// rather than bundled, so it cannot import the shared module. Wire the SW through
// the bundler if this ever drifts in anger.
function deepLinkFor(data) {
  const d = (data && data.reference_doctype) || ''
  const n = (data && data.reference_name) || ''
  const e = encodeURIComponent(n)
  if (d === 'Project Todo' && n) return '/m/project-item/' + e
  if (d === 'Project Detail' && n) return '/m/project-detail/' + e
  if (d === 'Project' && n) return '/m/project/' + e
  if (d === 'Papan Iklan') return n ? '/m/papan-iklan/' + e : '/m/papan-iklan'
  if (d === 'Papan Iklan Ban') return '/m/papan-iklan'
  if (d === 'Course') return n ? '/m/learn/' + e : '/m/learn'
  if (d === 'Company Feedback') return '/m/feedback-inbox'
  if (d === 'Meeting') return '/m/meetings'
  if (d === 'Team Wall') return '/m/team-wall'
  if (d === 'Reward Redemption') return '/m/marketplace'
  if (d === 'Wallet' || d === 'Daily Attendance') return '/m/wallet'
  if (d === 'Attendance Exception Approval') return '/m/attendance/approvals'
  if (d === 'Attendance Exception') return '/m/attendance/my-requests'
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
