// Pointer-drag reorder maths, kept pure so it is checkable without a DOM
// (this repo has no jsdom — see dragOrder.selfcheck.ts). Used by Sortable.

// How far the pointer must travel before a press counts as a drag rather than a
// tap. Below this, the press stays a plain click so tapping a focus row still
// opens the task.
export const DRAG_THRESHOLD_PX = 6

/**
 * Where the row currently at `current` should move to, given every row's vertical
 * midpoint (in the order they are laid out) and the pointer's y.
 *
 * `mids` includes the dragged row itself, so an index found BELOW it counts that
 * row twice — hence the -1. Without it, nudging a row down past its neighbour's
 * midpoint threw it to the neighbour-after-next, and dragging down one slot
 * always moved two (or straight to the bottom in a 3-row list).
 */
export function dropIndex(mids: number[], y: number, current: number): number {
  let target = mids.findIndex((m) => y < m)
  if (target === -1) return mids.length - 1
  return target > current ? target - 1 : target
}
