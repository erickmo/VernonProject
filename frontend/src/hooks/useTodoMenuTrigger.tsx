import { useRef } from 'react'
import { useTodoContextMenu } from '@/hooks/useTodoMenu'
import type { ProjectItem } from '@/lib/types'

// Long-press delay + movement cancel threshold — mirror TodoCard's inline trigger.
const LONG_MS = 450

// Shared trigger for the todo context menu (right-click on /w, long-press on /m).
// Call ONCE at a component's top level, then use the returned makeTriggerProps(todo)
// per card — so a list rendered via .map()/card() never calls a hook per row (Rules
// of Hooks). All handlers no-op when no menu provider is mounted. consumeLongPress()
// lets a card whose root ALSO has an onClick (navigate / pick) bail when a long-press
// just fired, so the hold isn't also treated as a tap.
export function useTodoMenuTrigger() {
  const menu = useTodoContextMenu()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPt = useRef<{ x: number; y: number } | null>(null)
  const longFired = useRef(false)

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  const makeTriggerProps = (todo: ProjectItem) => {
    if (!menu) return {}
    return {
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault()
        menu.open(todo, { x: e.clientX, y: e.clientY })
      },
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') return
        const pt = { x: e.clientX, y: e.clientY }
        startPt.current = pt
        longFired.current = false
        clear()
        timer.current = setTimeout(() => {
          longFired.current = true
          menu.open(todo, pt)
        }, LONG_MS)
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!startPt.current) return
        if (Math.abs(e.clientX - startPt.current.x) > 10 || Math.abs(e.clientY - startPt.current.y) > 10) clear()
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    }
  }

  // Call at the top of a card's own onClick: returns true (and resets) if the last
  // pointer sequence was a long-press, so the click should be ignored.
  const consumeLongPress = () => {
    if (longFired.current) {
      longFired.current = false
      return true
    }
    return false
  }

  return { makeTriggerProps, consumeLongPress }
}
