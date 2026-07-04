import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import type { BannerSlide } from '@/lib/types'

// Full-bleed promo banner strip at the very top of the home screen. Images are
// managed in Settings → Home Banners. Auto-rotates; tap follows the banner's
// link (in-app route when it starts with "/", otherwise opens the URL).
export function BannerCarousel({ slides }: { slides: BannerSlide[] }) {
  const navigate = useNavigate()
  const [i, setI] = useState(0)
  const n = slides.length
  const idx = n ? i % n : 0

  useEffect(() => {
    if (n <= 1) return
    const t = setInterval(() => setI((v) => (v + 1) % n), 5000)
    return () => clearInterval(t)
  }, [n])

  if (!n) return null
  const s = slides[idx]

  const go = (link: string) => {
    if (!link) return
    if (link.startsWith('/')) navigate(link)
    else window.open(link, '_blank', 'noopener')
  }

  return (
    // -mx-4 cancels TabScreen's px-4 so the strip bleeds edge to edge.
    <div className="-mx-4">
      <button
        onClick={() => go(s.link)}
        disabled={!s.link}
        className="relative block aspect-[16/7] w-full overflow-hidden bg-paper-line dark:bg-slate-800"
      >
        {/* key => cross-fade when the slide changes */}
        <img key={s.image} src={s.image} alt="" className="h-full w-full animate-fade-in object-cover" />
        {n > 1 && (
          <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1.5">
            {slides.map((sl, k) => (
              <span
                key={sl.image + k}
                className={clsx('h-1.5 rounded-full transition-all', k === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/55')}
              />
            ))}
          </div>
        )}
      </button>
    </div>
  )
}
