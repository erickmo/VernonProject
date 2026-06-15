import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ListChecks, AlertCircle, Plus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { TodoCard } from '@/components/TodoCard'
import { CreateTaskSheet } from '@/components/CreateTaskSheet'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { useWorkItem } from '@/hooks/useData'
import { stripHtml } from '@/lib/format'

export default function WorkItemPage() {
  const { name = '' } = useParams()
  const id = decodeURIComponent(name)
  const { data, isLoading } = useWorkItem(id)
  const [sheetOpen, setSheetOpen] = useState(false)

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
            <ListChecks className="h-4 w-4" /> Tasks ({data.todos.length})
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
        {data.todos.length ? (
          <div className="flex flex-col gap-2.5">
            {data.todos.map((t) => (
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
    </DetailScreen>
  )
}
