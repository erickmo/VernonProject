// After `vite build`, copy the built index.html into the app's www/ folder so
// Frappe serves it at /m (via the website_route_rule in hooks.py). The route
// also needs to map sub-paths, which the rule handles. We rename to m.html.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const src = '../vernon_project/public/frontend/index.html'
const dest = '../vernon_project/www/m.html'

if (!existsSync(src)) {
  console.error(`[copy-html] build output not found at ${src}`)
  process.exit(1)
}
mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)
console.log(`[copy-html] ${src} -> ${dest}`)

// Serve the hand-written service worker from the site root (/vernon_sw.js) so it
// can be registered with scope "/m" (a SW can only control paths at or below
// where it is served). Frappe serves www/*.js as static JavaScript.
const swSrc = 'sw-custom.js'
const swDest = '../vernon_project/www/vernon_sw.js'
if (existsSync(swSrc)) {
  copyFileSync(swSrc, swDest)
  console.log(`[copy-html] ${swSrc} -> ${swDest}`)
} else {
  console.warn('[copy-html] sw-custom.js not found — PWA service worker not copied')
}
