import { Section } from '@web/components/Page'
import { sanitizeHtml, stripHtml } from '@/lib/format'
import type { ProjectDetail } from '@/lib/types'

// Rich work-package meta (condition / outcome / SOW / pricing). Shared by the
// standalone ProjectDetail page and the embedded workspace todos pane.
export function DetailMeta({ d }: { d: ProjectDetail }) {
  const conditionHtml = d.current_condition || ''
  const outcomeHtml = d.expected_outcome || ''
  const sowHtml = d.keterangan_di_sow || ''
  const hasCondition = !!stripHtml(conditionHtml).trim()
  const hasOutcome = !!stripHtml(outcomeHtml).trim()
  const hasSow = !!stripHtml(sowHtml).trim()
  const hasPricing = (d.price != null && d.price > 0) || (d.discount != null && d.discount > 0)
  if (!hasCondition && !hasOutcome && !hasSow && !hasPricing) return null

  return (
    <>
      {hasCondition && (
        <Section title="Current condition">
          <div
            className="text-sm prose-notes text-slate-700 dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(conditionHtml) }}
          />
        </Section>
      )}
      {hasOutcome && (
        <Section title="Expected outcome">
          <div
            className="text-sm prose-notes text-slate-700 dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(outcomeHtml) }}
          />
        </Section>
      )}
      {hasSow && (
        <Section title="Keterangan di SOW">
          <div
            className="text-sm prose-notes text-slate-700 dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(sowHtml) }}
          />
        </Section>
      )}
      {hasPricing && (
        <Section title="Pricing">
          <div className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-300">
            {d.price != null && d.price > 0 && (
              <div className="flex justify-between">
                <span>Price</span>
                <span className="font-medium">Rp {d.price.toLocaleString('id-ID')}</span>
              </div>
            )}
            {d.discount != null && d.discount > 0 && (
              <div className="flex justify-between text-rose-600 dark:text-rose-400">
                <span>Discount</span>
                <span className="font-medium">− Rp {d.discount.toLocaleString('id-ID')}</span>
              </div>
            )}
          </div>
        </Section>
      )}
    </>
  )
}
