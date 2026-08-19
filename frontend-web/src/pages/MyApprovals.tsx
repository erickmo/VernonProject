import { History } from 'lucide-react'
import { TodoCard } from '@/components/TodoCard'
import { EmptyState, Spinner } from '@/components/ui'
import { useMyApprovals } from '@/hooks/useData'
import { Page, PageHeader, rise } from '@web/components/Page'
import { ThreeColProjectList } from '@web/components/ProjectColumns'

// History of approvals THIS user has personally granted (Leader's Done->Checked
// or Owner's Checked->Completed), newest first — server-sorted. Each card shows
// its normal Undo button (TodoCard, gated on can_undo) while it's still valid.
export default function MyApprovals() {
  const { data, isLoading } = useMyApprovals()
  const approvals = data ?? []

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <Page>
      <PageHeader title="My Approvals" subtitle={`${approvals.length} approved by you`} />
      {approvals.length > 0 ? (
        <ThreeColProjectList
          items={approvals}
          storageKey="my-approvals"
          renderCard={(t, i) => (
            <div key={t.name} {...rise(i)}>
              <TodoCard todo={t} showAssignee />
            </div>
          )}
        />
      ) : (
        <EmptyState
          icon={History}
          title="No approvals yet"
          subtitle="Todos you approve as a Leader or Owner show up here."
        />
      )}
    </Page>
  )
}
