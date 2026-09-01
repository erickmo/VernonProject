import { useEffect, useRef } from 'react'
import { pushModal, popModal, isTopModal } from '@/lib/modalStack'

// Escape-to-close for overlays that DON'T use the web-only useModalA11y (the
// shared confirms/dialogs, mobile overlays, popovers). Registers the layer in
// the shared modalStack so only the top-most open overlay closes on Escape —
// a parent (e.g. the todo drawer) stays put while its child confirm closes.
//
// Replaces the hand-rolled `useEffect(open){ addEventListener('keydown', …) }`
// each of these components used to carry. Keep any Enter/scroll-lock the caller
// still needs in its own effect; this hook owns only Escape + stack membership.
export function useModalEscape(active: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!active) return
    const token = pushModal()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal(token)) onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      popModal(token)
      document.removeEventListener('keydown', onKey)
    }
  }, [active])
}
