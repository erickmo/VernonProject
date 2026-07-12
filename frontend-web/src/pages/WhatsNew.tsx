import { useAppReleases } from '@/hooks/useData'
import { formatDate } from '@/lib/format'
import { Page, PageHeader, Section } from '@web/components/Page'
import { Skeleton } from '@web/components/ui'

export default function WhatsNew() {
  const { data, isLoading } = useAppReleases('Web')
  const releases = data ?? []

  return (
    <Page className="max-w-2xl">
      <PageHeader title="What's New" subtitle="Recent updates and improvements." />
      {isLoading ? (
        <div className="space-y-4 py-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : releases.length === 0 ? (
        <p className="py-8 text-sm text-muted">No release notes yet.</p>
      ) : (
        releases.map((r) => (
          <Section key={r.version}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-bold text-ink">{r.version}</span>
              <span className="text-xs text-muted">{formatDate(r.release_date)}</span>
            </div>
            {r.title && <p className="mt-1 text-sm font-medium text-ink">{r.title}</p>}
            <ul className="mt-2 list-disc pl-5 text-sm text-muted">
              {r.notes.split('\n').filter(Boolean).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </Section>
        ))
      )}
    </Page>
  )
}
