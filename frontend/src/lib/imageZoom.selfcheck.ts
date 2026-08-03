// @ts-nocheck — test-only, run via esbuild (see planDay.selfcheck.ts pattern).
// Run: npx esbuild --bundle src/lib/imageZoom.selfcheck.ts --platform=node | node
import assert from 'node:assert'
import { IDENTITY, MAX_SCALE, pan, zoomAbout } from './imageZoom'

// screen position of a content point c under a view (center-relative).
const screen = (v, c) => v.tx + v.scale * c

// Focal invariant: the content point under the focal stays under the focal.
for (const target of [2, 3.5, 5]) {
  const start = { scale: 1.4, tx: 12, ty: -7 }
  const fx = 40
  const c0 = (fx - start.tx) / start.scale // content point currently under fx
  const after = zoomAbout(start, target, fx, 0)
  assert.ok(Math.abs(screen(after, c0) - fx) < 1e-9, `focal fixed @${target}`)
}

// Clamp to MAX_SCALE.
assert.strictEqual(zoomAbout(IDENTITY, 99, 0, 0).scale, MAX_SCALE)

// Zooming to (or below) min snaps back to identity/centre.
assert.deepStrictEqual(zoomAbout({ scale: 2, tx: 50, ty: 50 }, 1, 30, 30), IDENTITY)
assert.deepStrictEqual(zoomAbout({ scale: 2, tx: 50, ty: 50 }, 0.2, 30, 30), IDENTITY)

// Pan is additive.
assert.deepStrictEqual(pan({ scale: 2, tx: 5, ty: 5 }, 3, -4), { scale: 2, tx: 8, ty: 1 })

console.log('imageZoom.selfcheck: all assertions passed')
