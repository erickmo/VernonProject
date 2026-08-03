// Pure pan/zoom math for the comment image lightbox (ImageZoom.tsx).
// Screen coords are measured from the element's center (transform-origin: center);
// with transform `translate(tx,ty) scale(scale)` a content point c maps to
// screen s = tx + scale*c. See imageZoom.selfcheck.ts.

export const MIN_SCALE = 1
export const MAX_SCALE = 5

export type View = { scale: number; tx: number; ty: number }
export const IDENTITY: View = { scale: 1, tx: 0, ty: 0 }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Zoom to `target` scale keeping the focal screen point (fx,fy) fixed under the
// finger/cursor. Snaps back to identity (recentres) once fully zoomed out.
export function zoomAbout(
  v: View,
  target: number,
  fx: number,
  fy: number,
  min = MIN_SCALE,
  max = MAX_SCALE,
): View {
  const scale = clamp(target, min, max)
  if (scale === min) return IDENTITY
  const r = scale / v.scale
  return { scale, tx: fx - r * (fx - v.tx), ty: fy - r * (fy - v.ty) }
}

export const pan = (v: View, dx: number, dy: number): View => ({
  scale: v.scale,
  tx: v.tx + dx,
  ty: v.ty + dy,
})

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)
