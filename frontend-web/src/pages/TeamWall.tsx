import { useState } from 'react'
import { UsersRound } from 'lucide-react'
import { EmptyState, Spinner, Segmented } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'
import { useTeamWall } from '@/hooks/useData'
import { TeamWallCanvas, WALL_MODES, type WallMode } from '@/components/TeamWallCanvas'

export default function TeamWall() {
  const [mode, setMode] = useState<WallMode>('photo')
  const q = useTeamWall()
  const { data, isLoading } = q

  return (
    <Page>
      <PageHeader icon={UsersRound} title="Team Wall" actions={<Segmented options={WALL_MODES} value={mode} onChange={setMode} />} />

      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : isLoading && !data ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !data || data.users.length === 0 ? (
        <EmptyState icon={UsersRound} title="No teammates yet" />
      ) : (
        <BentoGrid>
          <BentoTile span="full" tone="plain">
            <TeamWallCanvas users={data.users} mode={mode} />
          </BentoTile>
        </BentoGrid>
      )}
    </Page>
  )
}
