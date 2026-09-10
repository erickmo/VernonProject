import { useEffect, useRef } from 'react'

// Attach the returned ref to a sentinel element at the bottom of a list; calls
// onIntersect once each time it scrolls into view while enabled. rootMargin
// pre-fires a little before the sentinel is actually visible so the next page
// is usually ready by the time the user reaches the bottom.
export function useInfiniteScrollTrigger(onIntersect: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null)
  const onIntersectRef = useRef(onIntersect)
  onIntersectRef.current = onIntersect

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onIntersectRef.current()
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled])

  return ref
}
