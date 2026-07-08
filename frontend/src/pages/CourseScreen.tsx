import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { BookOpen, CheckCircle2, Download, X, Play } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader, ProgressBar, Spinner } from '@/components/ui'
import { useCourse, useCompleteLesson } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { sanitizeHtml } from '@/lib/format'
import type { LmsLessonView } from '@/lib/types'

export default function CourseScreen() {
  const { course: courseName = '' } = useParams<{ course: string }>()
  const { data, isLoading, error } = useCourse(courseName)
  const complete = useCompleteLesson(courseName)
  const toast = useToast()
  const [activeLesson, setActiveLesson] = useState<LmsLessonView | null>(null)

  if (isLoading && !data) {
    return (
      <DetailScreen title="Course">
        <FullScreenLoader />
      </DetailScreen>
    )
  }

  if (error || !data) {
    return (
      <DetailScreen title="Course">
        <p className="py-10 text-center text-sm text-rose-500">Could not load course. Please go back and try again.</p>
      </DetailScreen>
    )
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
          // Optimistic update — refetch will confirm
          setActiveLesson((prev) => (prev ? { ...prev, done: true } : null))
        },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not mark complete'),
      },
    )
  }

  return (
    <DetailScreen title={c.title}>
      {/* Header card */}
      <div className="mb-4 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
        {c.summary && (
          <p className="mb-3 text-sm text-stone-600 dark:text-slate-300">{c.summary}</p>
        )}
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-stone-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" />
            {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}
          </span>
          {c.points_reward > 0 && (
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {c.points_reward} pts on completion
            </span>
          )}
        </div>
        {enrollment && (
          <>
            <ProgressBar value={enrollment.progress_pct} />
            <p className="mt-1.5 text-right text-xs text-stone-400 dark:text-slate-500">
              {enrollment.progress_pct}% complete
            </p>
          </>
        )}
      </div>

      {/* Lesson list */}
      {lessons.length === 0 ? (
        <EmptyState icon={BookOpen} title="No lessons yet" subtitle="Check back soon." />
      ) : (
        <div className="space-y-2">
          {lessons.map((l, i) => (
            <button
              key={l.name}
              onClick={() => setActiveLesson(l)}
              className="w-full rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 text-left shadow-card transition active:scale-[0.99]"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    l.done
                      ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
                      : 'bg-paper-line dark:bg-slate-700 text-stone-400 dark:text-slate-500'
                  }`}
                >
                  {l.done ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span className="text-xs font-semibold">{i + 1}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold leading-tight ${
                      l.done ? 'text-stone-500 dark:text-slate-400' : 'text-stone-800 dark:text-slate-50'
                    }`}
                  >
                    {l.title}
                  </p>
                  {l.estimated_minutes ? (
                    <p className="mt-0.5 text-xs text-stone-400 dark:text-slate-500">{l.estimated_minutes} min</p>
                  ) : null}
                </div>
                {l.video_url && <Play className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lesson viewer sheet */}
      {activeLesson && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={() => !complete.isPending && setActiveLesson(null)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative mx-auto max-h-[92vh] w-full sm:max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-800 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-3 mb-3 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
            <div className="mb-4 flex items-start justify-between gap-3 px-5">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">{activeLesson.title}</h2>
              <button
                onClick={() => !complete.isPending && setActiveLesson(null)}
                className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5">
              {/* Video embed */}
              {activeLesson.video_url && (
                <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                  <iframe
                    src={activeLesson.video_url}
                    className="h-full w-full"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                    title={activeLesson.title}
                  />
                </div>
              )}

              {/* Rich text body — same pattern as EventDetailScreen */}
              {activeLesson.body && (
                <div
                  className="prose prose-sm max-w-none text-stone-700 dark:prose-invert dark:text-slate-200"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(activeLesson.body) }}
                />
              )}

              {/* File downloads */}
              {activeLesson.files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">Files</p>
                  {activeLesson.files.map((f, i) => (
                    <a
                      key={i}
                      href={f.file}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-700 px-3 py-2.5 text-sm font-medium text-brand-600 dark:text-brand-300 active:scale-[0.99]"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      {f.label ?? f.file.split('/').pop()}
                    </a>
                  ))}
                </div>
              )}

              {/* Mark complete */}
              <button
                disabled={activeLesson.done || complete.isPending}
                onClick={markComplete}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
              >
                {complete.isPending ? (
                  <Spinner className="h-4 w-4" />
                ) : activeLesson.done ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Completed
                  </>
                ) : (
                  'Mark as complete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </DetailScreen>
  )
}
