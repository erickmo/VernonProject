import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ListChecks, AlertCircle, Plus, Pencil, Trash2, ChevronRight } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { CreateProjectItemSheet } from '@/components/CreateProjectItemSheet'
import { ProjectDetailEditSheet } from '@/components/ProjectDetailEditSheet'
import CommentThread from '@/components/CommentThread'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useProjectDetail, useDeleteProjectDetail } from '@/hooks/useData'
import { stripHtml, byDeadlineAsc } from '@/lib/format'

export default function ProjectDetailScreen() {
  const { name = '' } = useParams()
  const id = decodeURIComponent(name)
  const { data, isLoading } = useProjectDetail(id)
  const navigate = useNavigate()
  const toast = useToast()
  const del = useDeleteProjectDetail()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  if (isLoading && !data) {
    return (
      <DetailScreen title="Detail">
        <FullScreenLoader />
      </DetailScreen>
    )
  }
  if (!data) {
    return (
      <DetailScreen title="Detail">
        <EmptyState icon={AlertCircle} title="Couldn't load detail" />
      </DetailScreen>
    )
  }

  const condition = stripHtml(data.current_condition || '')
  const outcome = stripHtml(data.expected_outcome || '')
  const projectItems = data.project_items.slice().sort(byDeadlineAsc)

  return (
    <DetailScreen title={data.title}>
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {data.project_name}
        </p>
        <h2 className="mt-1 text-lg font-bold leading-snug text-slate-900">{data.title}</h2>
        <span className="mt-2 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {data.status}
        </span>

        {data.can_edit && (
          <div className="mt-3 flex gap-2">
            <button onClick={() => setEditOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-700 active:scale-95">
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button
              disabled={projectItems.length > 0}
              title={projectItems.length > 0 ? 'Remove all todos before deleting this detail' : undefined}
              onClick={() => {
                if (!confirm('Delete this detail?')) return
                del.mutate(data.name, {
                  onSuccess: () => { toast('success', 'Project detail deleted'); navigate(`/project/${encodeURIComponent(data.project)}`) },
                  onError: (e) => toast('error', (e as Error).message),
                })
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-rose-600 active:scale-95 disabled:cursor-not-allowed disabled:text-slate-300 disabled:active:scale-100">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        )}

        {(condition || outcome) && (
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
            {condition && (
              <div>
                <p className="text-xs font-semibold text-slate-400">Current condition</p>
                <p className="text-slate-600">{condition}</p>
              </div>
            )}
            {outcome && (
              <div>
                <p className="text-xs font-semibold text-slate-400">Expected outcome</p>
                <p className="text-slate-600">{outcome}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
            <ListChecks className="h-4 w-4" /> Todos ({projectItems.length})
          </h3>
          {data.can_create && (
            <button
              onClick={() => setSheetOpen(true)}
              className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" /> Todo
            </button>
          )}
        </div>
        {projectItems.length ? (
          <div className="flex flex-col gap-1.5">
            {projectItems.map((t) => (
              <Link
                key={t.name}
                to={`/project-item/${encodeURIComponent(t.name)}`}
                className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-card transition active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${t.is_overdue ? 'text-rose-700' : 'text-slate-800'}`}>
                    {t.to_do}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                    <span>{t.status}</span>
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
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={ListChecks} title="No todos in this detail" />
        )}
      </section>

      <CommentThread referenceDoctype="Project Detail" referenceName={id} />

      <CreateProjectItemSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        projectDetail={data.name}
        team={data.team}
      />

      <ProjectDetailEditSheet open={editOpen} onClose={() => setEditOpen(false)} projectDetail={data} />
    </DetailScreen>
  )
}
