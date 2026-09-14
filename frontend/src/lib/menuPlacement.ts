// Pure viewport placement math for floating menus (testable, no DOM). Shared by
// /w's todo context menu; AnchoredPanel keeps its own placePanel because it
// anchors to an element rect, not a cursor point.

const PAD = 8

// Shift needed to bring a block of height `h` that starts at viewport y `top`
// fully into view. 0 when it already fits; negative to lift it off the bottom
// edge; positive to push it down off the top edge. A block taller than the
// viewport is pinned to the top padding (the caller caps it with max-height).
export function shiftIntoView(top: number, h: number, vh: number, pad = PAD): number {
  return Math.max(pad, Math.min(top, vh - pad - h)) - top
}

// Cursor-anchored menu: opens down-right of the point, flips to the left of it
// when that would overrun the right edge, then clamps both axes into view.
export function placeCursorMenu(
  pt: { x: number; y: number },
  vw: number,
  vh: number,
  w: number,
  h: number,
  pad = PAD,
): { left: number; top: number } {
  const flipped = pt.x + w > vw - pad ? pt.x - w : pt.x
  return {
    left: Math.max(pad, Math.min(flipped, vw - pad - w)),
    top: pt.y + shiftIntoView(pt.y, h, vh, pad),
  }
}

// Which side a fly-out opens toward. Prefers the right of the parent menu and
// flips left only when that overruns the right edge AND the left actually has
// room — on a viewport too narrow for either, staying right keeps the items
// reachable instead of pushing them off the left edge entirely.
export function flipSubmenu(
  menuLeft: number,
  menuW: number,
  subW: number,
  vw: number,
  pad = PAD,
): boolean {
  return menuLeft + menuW + subW > vw && menuLeft - subW >= pad
}
