import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ListChecks, AlertCircle, Plus, Pencil, Trash2 } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { TodoCard } from '@/components/TodoCard'
import { CreateTaskSheet } from '@/components/CreateTaskSheet'
import { WorkItemEditSheet } from '@/components/WorkItemEditSheet'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useWorkItem, useDeleteWorkItem } from '@/hooks/useData'
import { stripHtml, byDeadlineAsc } from '@/lib/format'

export default function WorkItemPage() {
  const { name = '' } = useParams()
  const id = decodeURIComponent(name)
  const { data, isLoading } = useWorkItem(id)
  const navigate = useNavigate()
  const toast = useToast()
  const del = useDeleteWorkItem()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  if (isLoading && !data) {
    return (
      <DetailScreen title="Work item">
        <FullScreenLoader />
      </DetailScreen>
    )
  }
  if (!data) {
    return (
      <DetailScreen title="Work item">
        <EmptyState icon={AlertCircle} title="Couldn't load work item" />
      </DetailScreen>
    )
  }

  const condition = stripHtml(data.current_condition || '')
  const outcome = stripHtml(data.expected_outcome || '')
  const todos = data.todos.slice().sort(byDeadlineAsc)

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
              onClick={() => {
                if (!confirm('Delete this work item?')) return
                del.mutate(data.name, {
                  onSuccess: () => { toast('success', 'Work item deleted'); navigate(`/project/${encodeURIComponent(data.project)}`) },
                  onError: (e) => toast('error', (e as Error).message),
                })
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-rose-600 active:scale-95">
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
            <ListChecks className="h-4 w-4" /> Tasks ({todos.length})
          </h3>
          {data.can_create && (
            <button
              onClick={() => setSheetOpen(true)}
              className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" /> Add task
            </button>
          )}
        </div>
        {todos.length ? (
          <div className="flex flex-col gap-2.5">
            {todos.map((t) => (
              <TodoCard key={t.name} todo={t} showProject={false} showAssignee />
            ))}
          </div>
        ) : (
          <EmptyState icon={ListChecks} title="No tasks in this work item" />
        )}
      </section>

      <CreateTaskSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        workItem={data.name}
        team={data.team}
      />

      <WorkItemEditSheet open={editOpen} onClose={() => setEditOpen(false)} workItem={data} />
    </DetailScreen>
  )
}
