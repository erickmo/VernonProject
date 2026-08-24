import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Keep the Android back button from unloading the installed PWA to a blank page
// while the user is at the app root. We seed a same-URL "buffer" history entry so
// back pops onto home instead of leaving the app, and re-seed on every back.
//
// Constraints:
//   - Chrome's history-manipulation intervention marks pushState entries made
//     WITHOUT user activation as "skippable", so a gesture-less buffer can be
//     skipped and back sails out of the app. A WebAPK launched by tapping the
//     icon may still carry transient activation, so we seed once immediately AND
//     again on the first in-page interaction (which is guaranteed non-skippable).
//   - Only trap inside an INSTALLED standalone PWA; in a browser tab back must go
//     to the previous page.
export function useRootBackGuard() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (pathname !== '/') return
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true
    if (!standalone) return

    const seed = () => window.history.pushState({ rootGuard: true }, '')
    seed()
    let interacted = false
    const onInteract = () => {
      if (interacted) return
      interacted = true
      seed()
    }
    const onPop = () => seed()
    window.addEventListener('pointerdown', onInteract)
    window.addEventListener('keydown', onInteract)
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('pointerdown', onInteract)
      window.removeEventListener('keydown', onInteract)
      window.removeEventListener('popstate', onPop)
    }
  }, [pathname])
}
