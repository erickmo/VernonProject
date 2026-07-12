import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Clock, ChevronRight } from 'lucide-react'
import { Spinner, EmptyState, ProgressBar } from '@/components/ui'
import { ErrorState, Button } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader, Section } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import type { Column } from '@web/components/DataTable'
import { useCatalog, useMyLearning, useEnroll } from '@/hooks/useData'
import type { LmsCourseCard, LmsMyEnrollment } from '@/lib/types'
import { useToast } from '@/components/Toast'

const STATUS_CLS: Record<string, string> = {
  'In Progress': 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        STATUS_CLS[status] ?? 'bg-canvas text-muted'
      }`}
    >
      {status}
    </span>
  )
}

export default function Learn() {
  const navigate = useNavigate()
  const toast = useToast()
  const mineQ = useMyLearning()
  const catalogQ = useCatalog()
  const enroll = useEnroll()
  const [enrolling, setEnrolling] = useState<string | null>(null)

  const myEnrollments = mineQ.data?.enrollments ?? []
  const catalog = catalogQ.data?.courses ?? []

  const doEnroll = (name: string) => {
    setEnrolling(name)
    enroll.mutate(name, {
      onSuccess: () => {
        toast('success', 'Enrolled!')
        navigate(`/learn/${encodeURIComponent(name)}`)
      },
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not enroll'),
      onSettled: () => setEnrolling(null),
    })
  }

  const mineCols: Column<LmsMyEnrollment>[] = [
    {
      key: 'title',
      header: 'Course',
      render: (e) => (
        <span className="font-medium text-ink">{e.course_title}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => <StatusChip status={e.overdue ? 'Overdue' : e.status} />,
    },
    {
      key: 'progress',
      header: 'Progress',
      align: 'right',
      sortValue: (e) => e.progress_pct,
      render: (e) => (
        <span className="text-sm font-medium tabular-nums">{e.progress_pct}% complete</span>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      render: (e) => (
        <span className="text-sm text-muted">{e.due_date ?? '—'}</span>
      ),
    },
  ]

  return (
    <Page>
      <PageHeader icon={BookOpen} title="Learn" subtitle="Your assigned courses and the full catalog." />

      <Section title="My Learning">
        {mineQ.isError ? (
          <ErrorState onRetry={() => mineQ.refetch()} />
        ) : mineQ.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : myEnrollments.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Nothing assigned yet"
            subtitle="Enroll in a course from the catalog below."
          />
        ) : (
          <BentoGrid>
            <BentoTile span="sm" tone="tint" accent="brand">
              <BentoStat value={myEnrollments.length} label="enrolled" />
            </BentoTile>
            <BentoTile span="sm" tone="tint" accent="emerald">
              <BentoStat
                value={myEnrollments.filter((e) => e.status === 'Completed').length}
                label="completed"
              />
            </BentoTile>
            <BentoTile span="sm" tone="tint" accent="rose">
              <BentoStat value={myEnrollments.filter((e) => e.overdue).length} label="overdue" />
            </BentoTile>
            <BentoTile span="full" tone="plain">
              <div className="-mx-5 -mb-5">
                <DataTable
                  rows={myEnrollments}
                  columns={mineCols}
                  getKey={(e) => e.name}
                  onRowClick={(e) => navigate(`/learn/${encodeURIComponent(e.course)}`)}
                />
              </div>
            </BentoTile>
          </BentoGrid>
        )}
      </Section>

      <Section title="Catalog">
        {catalogQ.isError ? (
          <ErrorState onRetry={() => catalogQ.refetch()} />
        ) : catalogQ.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : catalog.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            subtitle="Courses will appear here once published."
          />
        ) : (
          <BentoGrid>
            {catalog.map((c: LmsCourseCard) => (
              <BentoTile key={c.name} span="md" tone={c.my_status ? 'tint' : 'plain'} accent="brand">
                <div className="flex h-full flex-col gap-2">
                  {c.cover_image && (
                    <div className="-mx-4 -mt-4 mb-1 overflow-hidden rounded-t-2xl">
                      <img src={c.cover_image} alt={c.title} className="h-32 w-full object-cover" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => navigate(`/learn/${encodeURIComponent(c.name)}`)}
                      className="text-left font-semibold leading-tight text-ink hover:text-brand-600 transition-colors"
                    >
                      {c.title}
                    </button>
                    {c.category && <p className="mt-0.5 text-xs text-muted">{c.category}</p>}
                    {c.summary && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-muted">{c.summary}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {c.lesson_count} lesson{c.lesson_count !== 1 ? 's' : ''}
                    </span>
                    {c.estimated_minutes ? (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {c.estimated_minutes} min
                      </span>
                    ) : null}
                    {c.points_reward > 0 && (
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {c.points_reward} pts
                      </span>
                    )}
                  </div>
                  {c.my_status ? (
                    <div className="mt-auto flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <StatusChip status={c.my_status} />
                        <span className="text-xs font-medium tabular-nums text-muted">
                          {c.my_progress}%
                        </span>
                      </div>
                      <ProgressBar value={c.my_progress} />
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => navigate(`/learn/${encodeURIComponent(c.name)}`)}
                      >
                        {c.my_status === 'Completed' ? 'Review' : 'Continue'}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={enrolling === c.name || enroll.isPending}
                      onClick={() => doEnroll(c.name)}
                      className="mt-auto"
                    >
                      {enrolling === c.name ? 'Enrolling…' : 'Enroll'}
                    </Button>
                  )}
                </div>
              </BentoTile>
            ))}
          </BentoGrid>
        )}
      </Section>
    </Page>
  )
}
