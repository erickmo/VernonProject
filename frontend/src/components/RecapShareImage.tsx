import { useRef } from 'react'
import { toPng } from 'html-to-image'
import { Flame, Trophy, FolderKanban, Heart, Share2, Sparkles } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { formatEstimate } from '@/lib/format'
import type { WeeklyRecap } from '@/hooks/useData'

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-white/15 px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-white/90" />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-white/70">{label}</p>
        <p className="truncate text-sm font-semibold leading-tight">{value}</p>
      </div>
    </div>
  )
}

export function RecapShareImage({ recap }: { recap: WeeklyRecap }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const toast = useToast()

  const share = async () => {
    const node = cardRef.current
    if (!node) return
    try {
      // pixelRatio 2 = crisp retina export; cacheBust avoids stale data: URLs.
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true })
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], `vernon-recap-${recap.week_start}.png`, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
      if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: 'My week on Vernon' })
      } else {
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = file.name
        a.click()
      }
    } catch (e) {
      // User dismissing the native share sheet throws AbortError — not an error.
      if ((e as Error)?.name === 'AbortError') return
      toast('error', 'Could not create the image. Try again.')
    }
  }

  return (
    <div className="mt-3">
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-brand-600 via-[#7A5AF8] to-[#E879C7] p-5 text-white"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.16) 1px, transparent 1.4px)',
            backgroundSize: '15px 15px',
          }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-200" />
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
              Week of {recap.week_label}
            </p>
          </div>
          <p className="mt-1 font-display text-3xl font-semibold leading-none">{recap.completed} done</p>
          <p className="mt-1 text-sm font-semibold text-white/85">
            {formatEstimate(recap.minutes)} focused ·{' '}
            {recap.points.toLocaleString(undefined, { maximumFractionDigits: 1 })} pts
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {recap.streak > 0 && (
              <Stat icon={Flame} label="Streak" value={`${recap.streak} day${recap.streak > 1 ? 's' : ''}`} />
            )}
            {recap.best_day && (
              <Stat icon={Trophy} label="Best day" value={`${recap.best_day.label} (${recap.best_day.count})`} />
            )}
            {recap.top_project && (
              <Stat icon={FolderKanban} label="Top project" value={recap.top_project.name} />
            )}
            {recap.kudos_received > 0 && (
              <Stat icon={Heart} label="Kudos" value={`${recap.kudos_received} received`} />
            )}
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">Vernon</p>
        </div>
      </div>
      <button
        onClick={share}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-card transition active:scale-[0.98]"
      >
        <Share2 className="h-4 w-4" /> Share my week
      </button>
    </div>
  )
}
