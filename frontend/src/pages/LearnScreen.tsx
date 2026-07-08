import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Clock, Star, ChevronRight, Settings } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader, ProgressBar, Segmented } from '@/components/ui'
import { useCatalog, useMyLearning, useEnroll, useBoot, canManageLms } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { formatDate } from '@/lib/format'
import type { LmsCourseCard, LmsMyEnrollment } from '@/lib/types'

const STATUS_HUE: Record<string, string> = {
  'In Progress': 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Enrolled: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
}

type Tab = 'catalog' | 'mine'

export default function LearnScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const { data: catalogData, isLoading: catLoading, error: catError } = useCatalog()
  const { data: mineData, isLoading: mineLoading, error: mineError } = useMyLearning()
  const enroll = useEnroll()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('catalog')
  const [enrollingCourse, setEnrollingCourse] = useState<string | null>(null)

  const catalog = catalogData?.courses
  const mine = mineData?.enrollments
  const isLoading = tab === 'catalog' ? (catLoading && !catalog) : (mineLoading && !mine)

  const doEnroll = (courseName: string) => {
    setEnrollingCourse(courseName)
    enroll.mutate(courseName, {
      onSuccess: () => { toast('success', 'Enrolled!'); setEnrollingCourse(null) },
      onError: (e) => { toast('error', e instanceof Error ? e.message : 'Could not enroll'); setEnrollingCourse(null) },
    })
  }

  return (
    <DetailScreen
      title="Learn"
      right={
        canManageLms(boot) ? (
          <button
            onClick={() => navigate('/learn-admin')}
            className="flex items-center gap-1.5 rounded-full bg-brand-50 dark:bg-brand-500/15 px-3 py-1.5 text-sm font-semibold text-brand-600 dark:text-brand-300 active:scale-95"
          >
            <Settings className="h-3.5 w-3.5" />
            Manage
          </button>
        ) : undefined
      }
    >
      <Segmented
        options={[
          { value: 'catalog', label: 'Catalog' },
          { value: 'mine', label: 'My Learning' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="mt-4">
        {isLoading ? (
          <FullScreenLoader />
        ) : tab === 'catalog' ? (
          catError ? (
            <p className="py-10 text-center text-sm text-rose-500">Could not load. Please refresh.</p>
          ) : !catalog || catalog.length === 0 ? (
            <EmptyState icon={BookOpen} title="No courses yet" subtitle="Check back soon for learning content." />
          ) : (
            <div className="space-y-3">
              {catalog.map((c) => (
                <CourseCard
                  key={c.name}
                  course={c}
                  enrolling={enrollingCourse === c.name}
                  onNavigate={() => navigate(`/learn/${c.name}`)}
                  onEnroll={() => doEnroll(c.name)}
                />
              ))}
            </div>
          )
        ) : mineError ? (
          <p className="py-10 text-center text-sm text-rose-500">Could not load. Please refresh.</p>
        ) : !mine || mine.length === 0 ? (
          <EmptyState icon={BookOpen} title="No enrollments yet" subtitle="Browse the catalog to get started." />
        ) : (
          <div className="space-y-2">
            {mine.map((e) => (
              <EnrollmentRow key={e.name} enrollment={e} onClick={() => navigate(`/learn/${e.course}`)} />
            ))}
          </div>
        )}
      </div>
    </DetailScreen>
  )
}

function CourseCard({
  course: c,
  enrolling,
  onNavigate,
  onEnroll,
}: {
  course: LmsCourseCard
  enrolling: boolean
  onNavigate: () => void
  onEnroll: () => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 shadow-card">
      {c.cover_image && (
        <img src={c.cover_image} alt={c.title} className="h-36 w-full object-cover" />
      )}
      <div className="p-4">
        <div className="mb-1 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold leading-tight text-stone-800 dark:text-slate-50">{c.title}</p>
            {c.category && (
              <p className="mt-0.5 text-xs text-stone-400 dark:text-slate-500">{c.category}</p>
            )}
          </div>
          {c.my_status && (
            <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_HUE[c.my_status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
              {c.my_status}
            </span>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-stone-400 dark:text-slate-500">
          <span className="flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" />
            {c.lesson_count} {c.lesson_count === 1 ? 'lesson' : 'lessons'}
          </span>
          {c.estimated_minutes ? (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {c.estimated_minutes} min
            </span>
          ) : null}
          {c.points_reward > 0 && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Star className="h-3.5 w-3.5" />
              {c.points_reward} pts
            </span>
          )}
        </div>

        {c.my_status ? (
          <>
            <ProgressBar value={c.my_progress} className="mb-3" />
            <button
              onClick={onNavigate}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition active:scale-95"
            >
              {c.my_status === 'Completed' ? 'Review' : 'Continue'}
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            disabled={enrolling}
            onClick={onEnroll}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
          >
            {enrolling ? 'Enrolling…' : 'Enroll'}
          </button>
        )}
      </div>
    </div>
  )
}

function EnrollmentRow({ enrollment: e, onClick }: { enrollment: LmsMyEnrollment; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 text-left shadow-card transition active:scale-[0.99]"
    >
      <div className="mb-1.5 flex items-start gap-2">
        <p className="min-w-0 flex-1 font-display text-sm font-bold leading-tight text-stone-800 dark:text-slate-50">{e.course_title}</p>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_HUE[e.status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
            {e.status}
          </span>
          {e.overdue && (
            <span className="inline-flex items-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 px-2.5 py-0.5 text-xs font-semibold">
              Overdue
            </span>
          )}
        </div>
      </div>
      <ProgressBar value={e.progress_pct} className="mb-2" />
      <div className="flex items-center justify-between text-xs text-stone-400 dark:text-slate-500">
        <span>{e.progress_pct}% complete</span>
        {e.due_date && <span>Due {formatDate(e.due_date)}</span>}
      </div>
    </button>
  )
}
