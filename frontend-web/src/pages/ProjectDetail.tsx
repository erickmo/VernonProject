import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, CalendarClock, ListChecks, Plus, ChevronRight,
  Pencil, Trash2,
} from 'lucide-react'
import { useProjectDetail, useDeleteProjectDetail } from '@/hooks/useData'
import { sanitizeHtml, stripHtml, formatDate } from '@/lib/format'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import CommentThread from '@/components/CommentThread'
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'
import { STATUS } from '@/lib/status'
import type { StatusKey } from '@/lib/types'

export default function ProjectDetail() {
  const { name = '' } = useParams()
  const id = decodeURIComponent(name)
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const [createOpen, setCreateOpen] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)

  const detail = useProjectDetail(id, showCancelled)
  const deleteDetail = useDeleteProjectDetail()

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

  const items = d.project_items
  const completedCount = items.filter((t) => t.status_key === 'completed').length
  const openCount = items.filter((t) => t.status_key !== 'completed' && t.status_key !== 'cancelled').length
  const visibleItems = showCancelled
    ? items
    : items.filter((t) => t.status_key !== 'cancelled')

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete this detail?',
      message: `"${d.title}" and all its todos will be permanently deleted.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    deleteDetail.mutate(id, {
      onSuccess: () => {
        toast('success', 'Detail deleted')
        nav(`/project/${d.project}`)
      },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + title */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => nav(`/project/${d.project}`)}
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

        {d.can_edit && (
          <div className="flex items-center gap-2 shrink-0 mt-1">
            <button
              onClick={() => {/* edit handled via ProjectDetailFormDialog if needed */}}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              title="Edit detail"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteDetail.isPending}
              className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-500 hover:text-rose-600 disabled:opacity-50"
              title="Delete detail"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Header content cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hasCondition && (
          <div className="rounded-xl bg-white dark:bg-slate-900 shadow-card p-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-wide">
              Current condition
            </p>
            <div
              className="text-sm prose-notes text-slate-700 dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(conditionHtml) }}
            />
          </div>
        )}
        {hasOutcome && (
          <div className="rounded-xl bg-white dark:bg-slate-900 shadow-card p-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-wide">
              Expected outcome
            </p>
            <div
              className="text-sm prose-notes text-slate-700 dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(outcomeHtml) }}
            />
          </div>
        )}
        {hasSow && (
          <div className="rounded-xl bg-white dark:bg-slate-900 shadow-card p-4 md:col-span-2">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-wide">
              Keterangan di SOW
            </p>
            <div
              className="text-sm prose-notes text-slate-700 dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(sowHtml) }}
            />
          </div>
        )}
        {(d.price != null && d.price > 0) || (d.discount != null && d.discount > 0) ? (
          <div className="rounded-xl bg-white dark:bg-slate-900 shadow-card p-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wide">
              Pricing
            </p>
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
          </div>
        ) : null}
      </div>

      {/* Tasks section */}
      <section>
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
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" /> Todo
              </button>
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
                      return (
                        <button
                          key={t.name}
                          onClick={() => nav(`/project-item/${encodeURIComponent(t.name)}`)}
                          className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-card text-left transition active:scale-[0.99] w-full ${
                            isCancelled
                              ? 'bg-slate-50 dark:bg-slate-900 opacity-60'
                              : 'bg-white dark:bg-slate-800'
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
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* Comments */}
      <CommentThread referenceDoctype="Project Detail" referenceName={id} />

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
