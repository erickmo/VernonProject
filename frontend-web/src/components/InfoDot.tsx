import { Info } from 'lucide-react'
import { HoverCard } from '@web/components/HoverCard'
import { internHelp } from '@/lib/internAllocation'

type HelpEntry = { title: string; body: string }

// An (i) that explains one term on hover/focus. Copy comes from a shared help map, so
// /w and /m never drift apart on what a number means. `lookup` picks which map — the
// intern report's by default, but any feature can pass its own.
export function InfoDot({
  term, className, lookup = internHelp,
}: {
  term: string; className?: string; lookup?: (term: string) => HelpEntry | undefined
}) {
  const entry = lookup(term)
  if (!entry) return null
  return (
    <HoverCard
      className={className}
      content={
        <div>
          <p className="mb-1 font-semibold text-ink">{entry.title}</p>
          <p className="leading-relaxed text-muted">{entry.body}</p>
        </div>
      }
    >
      <button
        type="button"
        aria-label={`Penjelasan: ${entry.title}`}
        className="ml-1 inline-flex text-muted transition hover:text-ink focus:text-ink focus:outline-none"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </HoverCard>
  )
}
