import { History } from 'lucide-react'
import { TabScreen, PullToRefresh } from '@/components/Layout'
import { TodoCard } from '@/components/TodoCard'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { useMyApprovals } from '@/hooks/useData'

// History of approvals THIS user has personally granted (Leader's Done->Checked
// or Owner's Checked->Completed), newest first — server-sorted. Each card shows
// its normal Undo button (TodoCard, gated on can_undo) while it's still valid.
export default function MyApprovals() {
  const { data, isLoading, refetch } = useMyApprovals()
  const approvals = data ?? []

  return (
    <TabScreen title="My Approvals" subtitle={`${approvals.length} approved by you`}>
      {isLoading && !data ? (
        <FullScreenLoader label="Loading your approvals…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {approvals.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {approvals.map((t) => (
                <TodoCard key={t.name} todo={t} showAssignee />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={History}
              title="No approvals yet"
              subtitle="Todos you approve as a Leader or Owner show up here."
            />
          )}
        </PullToRefresh>
      )}
    </TabScreen>
  )
}
