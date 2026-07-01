import { useEffect, useRef } from 'react'

/**
 * Shared modal accessibility for desktop overlays (Dialog, Drawer, Onboarding):
 * - Esc closes
 * - body scroll-lock while open
 * - focus moves into the panel on open, restores to the trigger on close
 * - Tab/Shift+Tab is trapped within the panel
 *
 * Returns a ref to attach to the panel element.
 */
// Module-level stack of open modals so only the TOP-most one reacts to
// Escape/Tab. Without it, a Drawer nested inside another Drawer (e.g. the todo
// slide-over hosting ProjectItem, which itself opens dialogs) would have both
// panels' Escape fire on one press and both Tab-traps fight over focus.
const modalStack: symbol[] = []

export function useModalA11y(
  open: boolean,
  onClose: () => void,
  opts?: { closeOnEscape?: boolean },
) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep the latest onClose without making it an effect dependency. Callers pass
  // an inline handler (new identity every render); if the effect depended on it,
  // it would tear down and re-run on EVERY keystroke inside the panel — a
  // querySelectorAll + listener churn + focus() steal per character.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const closeOnEscapeRef = useRef(true)
  closeOnEscapeRef.current = opts?.closeOnEscape ?? true

  useEffect(() => {
    if (!open) return
    const token = Symbol()
    modalStack.push(token)
    const isTop = () => modalStack[modalStack.length - 1] === token
    const panel = ref.current
    const restoreTo = document.activeElement as HTMLElement | null

    const focusable = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null || el === document.activeElement)
        : []

    // initial focus: first focusable inside the panel, else the panel itself
    const first = focusable()[0]
    if (first) first.focus()
    else panel?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return
      if (e.key === 'Escape') {
        if (closeOnEscapeRef.current) onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const active = document.activeElement as HTMLElement
      if (e.shiftKey && (active === firstEl || !panel?.contains(active))) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      const i = modalStack.indexOf(token)
      if (i >= 0) modalStack.splice(i, 1)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      restoreTo?.focus?.()
    }
  }, [open])

  return ref
}
