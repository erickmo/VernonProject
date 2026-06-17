# Controller for the /m PWA shell (companion to the vite-generated m.html).
#
# The shell must never be served stale. Every frontend build produces new
# content-hashed asset filenames, and m.html references them by hash. A cached
# shell therefore points at JS/CSS that no longer exists on disk, and the app
# white-screens until the user manually clears their cache.
#
# `no_cache = 1` disables Frappe's server-side (redis) page cache for this route
# so each request renders the latest m.html on disk. Combined with the service
# worker fetching the navigation shell with `cache: "reload"` (see
# frontend/sw-custom.js), returning users always pick up the newest bundle.
#
# This .py is hand-written and is NOT overwritten by the build (copy-html.mjs
# only regenerates m.html and vernon_sw.js).

no_cache = 1
