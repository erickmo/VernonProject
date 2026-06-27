import { useState } from 'react'
import { useParams, useNavigate, Outlet } from 'react-router-dom'
import {
  ArrowLeft, CalendarClock, ListChecks, Plus, ChevronRight, ArrowRight, MousePointerClick,
} from 'lucide-react'
import { useProjectDetail } from '@/hooks/useData'
import { sanitizeHtml, stripHtml, formatEstimateRatio } from '@/lib/format'
import { Spinner, EmptyState } from '@/components/ui'
import { Button, rowButtonProps } from '@web/components/ui'
import { useAdvance } from '@/components/AdvanceProvider'
import { useSetCrumbs } from '@web/lib/crumbs'
import CommentThread from '@/components/CommentThread'
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { STATUS } from '@/lib/status'
import type { StatusKey } from '@/lib/types'

export default function ProjectDetail() {
  const { name = '', itemName } = useParams()
  const id = decodeURIComponent(name)
  const nav = useNavigate()
  const advance = useAdvance()

  const [createOpen, setCreateOpen] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)

  const detail = useProjectDetail(id, showCancelled)
  const itemSelected = !!itemName

  useSetCrumbs(
    detail.data
      ? [
          { label: 'Projects', to: '/projects' },
          { label: detail.data.project_name, to: `/project/${encodeURIComponent(detail.data.project)}` },
          { label: detail.data.title },
        ]
      : [],
  )

  if (detail.isLoading && !detail.data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (!detail.data) {
    return <EmptyState icon={ListChecks} title="Couldn't load detail" />
  }

  const d = detail.data

  const conditionHtml = d.current_condition || ''
  const outcomeHtml = d.expected_outcome || ''
  const sowHtml = d.keterangan_di_sow || ''
  const hasCondition = !!stripHtml(conditionHtml).trim()
  const hasOutcome = !!stripHtml(outcomeHtml).trim()
  const hasSow = !!stripHtml(sowHtml).trim()
  const hasPricing = (d.price != null && d.price > 0) || (d.discount != null && d.discount > 0)

  const items = d.project_items
  const completedCount = items.filter((t) => t.status_key === 'completed').length
  const openCount = items.filter((t) => t.status_key !== 'completed' && t.status_key !== 'cancelled').length
  const notCancelled = items.filter((t) => t.status_key !== 'cancelled')
  const minutesTotal = notCancelled.reduce((s, t) => s + (t.estimated || 0), 0)
  const minutesDone = notCancelled
    .filter((t) => t.status_key === 'completed')
    .reduce((s, t) => s + (t.estimated || 0), 0)
  const visibleItems = showCancelled
    ? items
    : items.filter((t) => t.status_key !== 'cancelled')

  return (
    <div className="space-y-6">
      {/* Back + title */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => nav(`/project/${encodeURIComponent(d.project)}`)}
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {d.project_name}
          </button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 leading-snug">
            {d.title}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-block rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              {d.status}
            </span>
            {d.is_pending ? (
              <span className="inline-block rounded-full bg-amber-100 dark:bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                Pending
              </span>
            ) : null}
            {d.deadline_human && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                <CalendarClock className="h-3.5 w-3.5" />
                {d.deadline_human}
              </span>
            )}
          </div>
        </div>
      </div>

      <BentoGrid>
        {/* Header hero */}
        <BentoTile span="wide" tone="gradient" accent="sky" title="Overview">
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-70 mb-0.5">Project</p>
              <p className="font-semibold">{d.project_name}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide opacity-70 mb-0.5">Status</p>
              <p className="font-semibold">{d.status}</p>
            </div>
            {d.deadline_human && (
              <div>
                <p className="text-xs uppercase tracking-wide opacity-70 mb-0.5">Deadline</p>
                <p className="font-semibold">{d.deadline_human}</p>
              </div>
            )}
          </div>
        </BentoTile>

        {/* Key stats */}
        <BentoTile span="sm" tone="tint" accent="sky">
          <BentoStat value={openCount} label="Open todos" />
        </BentoTile>
        <BentoTile span="sm" tone="tint" accent="sky">
          <BentoStat value={completedCount} label="Completed" delta={`of ${items.length} total`} />
        </BentoTile>
        <BentoTile span="sm" tone="tint" accent="sky">
          <BentoStat value={formatEstimateRatio(minutesDone, minutesTotal)} label="Est. done" />
        </BentoTile>

        {/* Meta rail: condition, outcome, SOW, pricing */}
        {hasCondition && (
          <BentoTile span="md" tone="plain" title="Current condition">
            <div
              className="text-sm prose-notes text-slate-700 dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(conditionHtml) }}
            />
          </BentoTile>
        )}
        {hasOutcome && (
          <BentoTile span="md" tone="plain" title="Expected outcome">
            <div
              className="text-sm prose-notes text-slate-700 dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(outcomeHtml) }}
            />
          </BentoTile>
        )}
        {hasSow && (
          <BentoTile span="full" tone="plain" title="Keterangan di SOW">
            <div
              className="text-sm prose-notes text-slate-700 dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(sowHtml) }}
            />
          </BentoTile>
        )}
        {hasPricing && (
          <BentoTile span="md" tone="plain" title="Pricing">
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
          </BentoTile>
        )}

        {/* Tasks — master/detail: todo list (left) + selected todo pane (right) */}
        <BentoTile span="full" tone="plain">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[22rem,1fr]">
            {/* Left: todo list */}
            <section className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  <ListChecks className="h-4 w-4" />
                  Todos ({items.length})
                </h2>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={showCancelled}
                      onChange={(e) => setShowCancelled(e.target.checked)}
                      className="h-3.5 w-3.5 accent-brand-600"
                    />
                    Show cancelled
                  </label>
                  {d.can_create && (
                    <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> Todo
                    </Button>
                  )}
                </div>
              </div>

              {items.length === 0 ? (
                <EmptyState icon={ListChecks} title="No todos in this detail" />
              ) : visibleItems.length === 0 ? (
                <EmptyState icon={ListChecks} title="No visible todos" />
              ) : (
                <div className="flex flex-col gap-3">
                  {[
                    {
                      label: 'Open',
                      sectionItems: visibleItems.filter(
                        (t) => t.status_key !== 'completed' && t.status_key !== 'cancelled',
                      ),
                    },
                    {
                      label: 'Completed',
                      sectionItems: visibleItems.filter((t) => t.status_key === 'completed'),
                    },
                    ...(showCancelled
                      ? [
                          {
                            label: 'Cancelled',
                            sectionItems: visibleItems.filter((t) => t.status_key === 'cancelled'),
                          },
                        ]
                      : []),
                  ]
                    .filter((s) => s.sectionItems.length > 0)
                    .map((s) => (
                      <div key={s.label}>
                        <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {s.label} ({s.sectionItems.length})
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {s.sectionItems.map((t) => {
                            const isCancelled = t.status_key === 'cancelled'
                            const statusMeta = STATUS[t.status_key as StatusKey]
                            const selected = itemName === t.name
                            return (
                              <div
                                key={t.name}
                                {...rowButtonProps(() =>
                                  nav(`/project-detail/${encodeURIComponent(d.name)}/item/${encodeURIComponent(t.name)}`),
                                )}
                                className={`group flex cursor-pointer items-center gap-2.5 rounded-xl px-4 py-3 text-left shadow-card transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                                  selected
                                    ? 'bg-white dark:bg-slate-800 ring-2 ring-brand-500'
                                    : isCancelled
                                    ? 'bg-slate-50 dark:bg-slate-900 opacity-60 hover:opacity-80'
                                    : 'bg-white dark:bg-slate-800 hover:shadow-md'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={`truncate text-sm font-medium ${
                                      isCancelled
                                        ? 'text-slate-400 dark:text-slate-500 line-through'
                                        : t.is_overdue
                                        ? 'text-rose-700'
                                        : 'text-slate-800 dark:text-slate-100'
                                    }`}
                                  >
                                    {t.to_do}
                                  </p>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                                    {statusMeta ? (
                                      <span
                                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusMeta.pill}`}
                                      >
                                        {statusMeta.emoji} {statusMeta.label}
                                      </span>
                                    ) : (
                                      <span>{t.status}</span>
                                    )}
                                    {t.deadline_human && (
                                      <>
                                        <span>·</span>
                                        <span className={t.is_overdue ? 'font-semibold text-rose-500' : ''}>
                                          {t.deadline_human}
                                        </span>
                                      </>
                                    )}
                                    {t.assigned_to_name && (
                                      <>
                                        <span>·</span>
                                        <span>{t.assigned_to_name}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                {/* Inline advance — confirms via dialog, does not open the todo */}
                                {t.can_advance && t.next_status_label && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      advance(t.name, t.next_status_label!, t.to_do)
                                    }}
                                    title={t.next_status_label}
                                    aria-label={`${t.to_do}: ${t.next_status_label}`}
                                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25"
                                  >
                                    <ArrowRight className="h-4 w-4" />
                                  </button>
                                )}
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </section>

            {/* Right: selected todo pane */}
            <div className="min-w-0 rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-card min-h-[320px]">
              {itemSelected ? (
                <Outlet />
              ) : (
                <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-400 dark:text-slate-500">
                  <MousePointerClick className="h-8 w-8 opacity-50" />
                  Select a todo to view its details here — or tap the arrow to advance it inline.
                </div>
              )}
            </div>
          </div>
        </BentoTile>

        {/* Comments */}
        <BentoTile span="full" tone="plain">
          <CommentThread referenceDoctype="Project Detail" referenceName={id} />
        </BentoTile>
      </BentoGrid>

      {/* Create todo dialog */}
      <CreateProjectItemDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projectDetail={d.name}
        team={d.team.map((t) => ({ user: t.user, name: t.name }))}
        defaultGroup={d.default_group ?? null}
        siblings={d.project_items.map((t) => ({ name: t.name, to_do: t.to_do }))}
      />
    </div>
  )
}
