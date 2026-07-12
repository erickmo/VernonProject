import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, CheckCircle2, Clock, Download, Play } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { ErrorState, Button } from '@web/components/ui'
import { Page, PageHeader } from '@web/components/Page'
import { useCourse, useCompleteLesson } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { sanitizeHtml } from '@/lib/format'
import type { LmsLessonView } from '@/lib/types'

export default function Course() {
  const navigate = useNavigate()
  const { course: courseName = '' } = useParams<{ course: string }>()
  const toast = useToast()

  // Both hooks at top level — hooks must not be conditional
  const { data, isLoading, error, refetch } = useCourse(courseName)
  const complete = useCompleteLesson(courseName)

  const [activeLesson, setActiveLesson] = useState<LmsLessonView | null>(null)

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (error || !data) {
    return <ErrorState onRetry={() => refetch()} />
  }

  const { course: c, lessons, enrollment } = data

  const markComplete = () => {
    if (!activeLesson) return
    complete.mutate(
      { course: courseName, lesson: activeLesson.name },
      {
        onSuccess: (r) => {
          if (r.points_awarded > 0) toast('success', `+${r.points_awarded} pts earned!`)
          else toast('success', 'Lesson complete')
          setActiveLesson((prev) => (prev ? { ...prev, done: true } : null))
        },
        onError: (e) =>
          toast('error', e instanceof Error ? e.message : 'Could not mark complete'),
      },
    )
  }

  return (
    <Page>
      <button
        type="button"
        onClick={() => navigate('/learn')}
        className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Learn
      </button>

      <PageHeader icon={BookOpen} title={c.title} subtitle={c.summary ?? undefined} />

      {enrollment && (
        <div className="mb-6 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: `${enrollment.progress_pct}%` }}
            />
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums text-muted">
            {enrollment.progress_pct}% complete
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Lesson list */}
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
            {lessons.length} Lesson{lessons.length !== 1 ? 's' : ''}
          </p>
          {lessons.length === 0 ? (
            <EmptyState icon={BookOpen} title="No lessons yet" subtitle="Check back soon." />
          ) : (
            <div className="space-y-2">
              {lessons.map((l, i) => (
                <button
                  key={l.name}
                  onClick={() => setActiveLesson(l)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    activeLesson?.name === l.name
                      ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/10'
                      : 'border-line bg-surface hover:bg-hover/[0.04]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        l.done
                          ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
                          : 'bg-hover/[0.06] text-muted'
                      }`}
                    >
                      {l.done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-medium leading-tight ${
                          l.done ? 'text-muted' : 'text-ink'
                        }`}
                      >
                        {l.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        {l.estimated_minutes ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {l.estimated_minutes} min
                          </span>
                        ) : null}
                        {l.video_url && <Play className="h-3 w-3" />}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {c.points_reward > 0 && (
            <p className="mt-3 text-xs font-semibold text-amber-600 dark:text-amber-400">
              +{c.points_reward} pts on completion
            </p>
          )}
        </div>

        {/* Lesson viewer */}
        {activeLesson ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="mb-4 text-lg font-semibold text-ink">{activeLesson.title}</h2>

              {activeLesson.video_url && (
                <div className="mb-4 aspect-video w-full overflow-hidden rounded-lg bg-black">
                  <iframe
                    src={activeLesson.video_url}
                    className="h-full w-full"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    title={activeLesson.title}
                  />
                </div>
              )}

              {/* ponytail: sanitizeHtml from @/lib/format — same pattern as EventDetail.tsx */}
              {activeLesson.body && (
                <div
                  className="prose prose-sm max-w-none text-ink"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(activeLesson.body) }}
                />
              )}

              {activeLesson.files.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Files</p>
                  {activeLesson.files.map((f, i) => (
                    <a
                      key={i}
                      href={f.file}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-brand-600 hover:bg-hover/[0.04] transition-colors"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      {f.label ?? f.file.split('/').pop()}
                    </a>
                  ))}
                </div>
              )}

              <div className="mt-5 flex justify-end">
                <Button
                  variant="primary"
                  disabled={activeLesson.done || complete.isPending}
                  onClick={markComplete}
                >
                  {complete.isPending ? (
                    <Spinner className="h-4 w-4" />
                  ) : activeLesson.done ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Completed
                    </>
                  ) : (
                    'Mark as complete'
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-line py-20 text-center">
            <div>
              <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted" />
              <p className="text-sm text-muted">Select a lesson to start learning</p>
            </div>
          </div>
        )}
      </div>
    </Page>
  )
}
