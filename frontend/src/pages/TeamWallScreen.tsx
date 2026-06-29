// frontend/src/pages/TeamWallScreen.tsx
import { useState } from 'react'
import { UsersRound } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Segmented } from '@/components/ui'
import { useTeamWall } from '@/hooks/useData'
import { TeamWallCanvas, WALL_MODES, type WallMode } from '@/components/TeamWallCanvas'

export default function TeamWallScreen() {
  const [mode, setMode] = useState<WallMode>('photo')
  const { data, isLoading } = useTeamWall()

  return (
    <DetailScreen title="Team Wall">
      <Segmented options={WALL_MODES} value={mode} onChange={setMode} />
      {isLoading && !data ? (
        <FullScreenLoader />
      ) : !data || data.users.length === 0 ? (
        <EmptyState icon={UsersRound} title="No teammates yet" />
      ) : (
        <div className="mt-4">
          <TeamWallCanvas users={data.users} mode={mode} />
        </div>
      )}
    </DetailScreen>
  )
}
