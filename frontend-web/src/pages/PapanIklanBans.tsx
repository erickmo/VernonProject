import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { Button, ErrorState } from '@web/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canModerateAds, useAdBans, useUnbanUser } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'

export default function PapanIklanBans() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const bans = useAdBans()
  const unban = useUnbanUser()

  const blocked = !!boot && !canModerateAds(boot)
  useEffect(() => { if (blocked) navigate('/', { replace: true }) }, [blocked, navigate])
  if (blocked) return null

  return (
    <Page>
      <PageHeader icon={Ban} title="Papan Iklan — Ban" />
      {bans.isLoading ? <div className="flex justify-center py-20"><Spinner /></div>
        : bans.isError ? <ErrorState onRetry={() => bans.refetch()} />
        : (bans.data ?? []).length === 0 ? <EmptyState icon={Ban} title="Tidak ada ban aktif" />
        : (
          <DataTable
            rows={bans.data ?? []}
            columns={[
              { key: 'user', header: 'Pengguna', render: (b) => <span className="font-medium text-ink">{b.user_name}</span> },
              { key: 'until', header: 'Sampai', render: (b) => <span className="text-muted">{b.banned_until}</span> },
              { key: 'reason', header: 'Alasan', render: (b) => <span className="text-muted">{b.reason}</span> },
              { key: 'by', header: 'Oleh', render: (b) => <span className="text-muted">{b.banned_by}</span> },
              { key: 'act', header: '', render: (b) => <Button variant="secondary" size="sm" onClick={() => unban.mutate(b.user, { onSuccess: () => toast('success', 'Dicabut'), onError: (e) => toast('error', (e as Error).message) })}>Cabut</Button> },
            ]}
            getKey={(b) => b.name}
          />
        )}
    </Page>
  )
}
