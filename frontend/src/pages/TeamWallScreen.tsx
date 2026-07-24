// frontend/src/pages/TeamWallScreen.tsx
import { useState } from 'react'
import { UsersRound } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Segmented } from '@/components/ui'
import { useTeamWall } from '@/hooks/useData'
import { TeamWallCanvas, WALL_MODES, type WallMode } from '@/components/TeamWallCanvas'
import { SuperpowerWall } from '@/components/SuperpowerWall'

type Mode = WallMode | 'super'
const MODES: { value: Mode; label: string }[] = [...WALL_MODES, { value: 'super', label: 'Superpower' }]

export default function TeamWallScreen() {
  const [mode, setMode] = useState<Mode>('photo')
  const { data, isLoading, refetch } = useTeamWall()

  return (
    <DetailScreen title="Team Wall">
      <PullToRefresh onRefresh={refetch}>
        <Segmented scroll options={MODES} value={mode} onChange={setMode} />
        {mode === 'super' ? (
          <SuperpowerWall />
        ) : isLoading && !data ? (
          <FullScreenLoader />
        ) : !data || data.users.length === 0 ? (
          <EmptyState icon={UsersRound} title="No teammates yet" />
        ) : (
          <div className="mt-4">
            <TeamWallCanvas users={data.users} mode={mode} />
          </div>
        )}
      </PullToRefresh>
    </DetailScreen>
  )
}
