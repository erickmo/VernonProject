import { describe, it, expect } from 'vitest'
import { shiftIntoView, placeCursorMenu, flipSubmenu } from './menuPlacement'

const VH = 800
const VW = 1200

describe('shiftIntoView', () => {
  it('does not move a block that already fits', () => {
    expect(shiftIntoView(100, 200, VH)).toBe(0)
  })

  it('lifts a block whose bottom overruns the viewport', () => {
    // a 300px submenu opening at y=700 would end at 1000, 200 past the edge
    const shift = shiftIntoView(700, 300, VH)
    expect(shift).toBe(-208) // bottom lands on 800 - 8 padding
    expect(700 + shift + 300).toBe(VH - 8)
  })

  it('pins a block taller than the viewport to the top padding', () => {
    expect(shiftIntoView(400, 2000, VH)).toBe(-392)
    expect(400 + shiftIntoView(400, 2000, VH)).toBe(8)
  })

  it('pushes a block starting above the viewport back into view', () => {
    expect(-50 + shiftIntoView(-50, 100, VH)).toBe(8)
  })

  it('leaves a block flush against the bottom padding alone', () => {
    expect(shiftIntoView(VH - 8 - 200, 200, VH)).toBe(0)
  })
})

describe('placeCursorMenu', () => {
  const W = 240
  const H = 260

  it('opens down-right from the cursor when there is room', () => {
    expect(placeCursorMenu({ x: 100, y: 100 }, VW, VH, W, H)).toEqual({ left: 100, top: 100 })
  })

  it('flips to the left of the cursor near the right edge', () => {
    expect(placeCursorMenu({ x: 1150, y: 100 }, VW, VH, W, H).left).toBe(1150 - W)
  })

  it('lifts the menu near the bottom edge instead of clipping it', () => {
    const { top } = placeCursorMenu({ x: 100, y: 780 }, VW, VH, W, H)
    expect(top + H).toBe(VH - 8)
  })

  it('handles the bottom-right corner on both axes at once', () => {
    const { left, top } = placeCursorMenu({ x: 1190, y: 795 }, VW, VH, W, H)
    expect(left).toBe(1190 - W)
    expect(top + H).toBe(VH - 8)
  })

  it('clamps into view when the viewport is narrower than the menu', () => {
    expect(placeCursorMenu({ x: 10, y: 10 }, 200, VH, W, H).left).toBe(8)
  })

  it('never places the menu left of the padding near the left edge', () => {
    expect(placeCursorMenu({ x: 2, y: 400 }, VW, VH, W, H).left).toBe(8)
  })
})

describe('flipSubmenu', () => {
  const MENU_W = 240
  const SUB_W = 224

  it('opens to the right when there is room', () => {
    expect(flipSubmenu(100, MENU_W, SUB_W, VW)).toBe(false)
  })

  it('flips left when the right edge would cut it off', () => {
    expect(flipSubmenu(900, MENU_W, SUB_W, VW)).toBe(true)
  })

  it('stays right on a viewport too narrow for either side', () => {
    // 400px wide: the menu sits at the left padding, neither side fits the fly-out
    expect(flipSubmenu(8, MENU_W, SUB_W, 400)).toBe(false)
  })
})
