import { Section } from '@web/components/Page'
import { sanitizeHtml, stripHtml } from '@/lib/format'
import type { ProjectDetail } from '@/lib/types'

// Rich work-package meta (condition / outcome / SOW). Shared by the
// standalone ProjectDetail page and the embedded workspace todos pane.
export function DetailMeta({ d }: { d: ProjectDetail }) {
  const conditionHtml = d.current_condition || ''
  const outcomeHtml = d.expected_outcome || ''
  const sowHtml = d.keterangan_di_sow || ''
  const hasCondition = !!stripHtml(conditionHtml).trim()
  const hasOutcome = !!stripHtml(outcomeHtml).trim()
  const hasSow = !!stripHtml(sowHtml).trim()
  if (!hasCondition && !hasOutcome && !hasSow) return null

  return (
    <>
      {hasCondition && (
        <Section title="Current condition">
          <div
            className="text-sm prose-notes text-ink dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(conditionHtml) }}
          />
        </Section>
      )}
      {hasOutcome && (
        <Section title="Expected outcome">
          <div
            className="text-sm prose-notes text-ink dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(outcomeHtml) }}
          />
        </Section>
      )}
      {hasSow && (
        <Section title="Keterangan di SOW">
          <div
            className="text-sm prose-notes text-ink dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(sowHtml) }}
          />
        </Section>
      )}
    </>
  )
}
