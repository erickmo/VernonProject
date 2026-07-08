import { useState, useEffect } from 'react'
import { Plus, X, BookOpen, ChevronLeft, Trash2 } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader, ProgressBar, Segmented, Spinner } from '@/components/ui'
import {
  useManageCourses,
  useCourse,
  useSaveCourse,
  useDeleteCourse,
  useSaveLesson,
  useDeleteLesson,
  useAssignCourse,
  useCourseReport,
  useAssignableUsers,
} from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { formatDate } from '@/lib/format'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import type { LmsManagedCourse, LmsLessonView } from '@/lib/types'

// ─── shared input class (matches IncomeAdminScreen) ────────────────────────────
const inputCls =
  'w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 p-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500'

// ─── status colours ────────────────────────────────────────────────────────────
const STATUS_HUE: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  Published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Archived: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'In Progress': 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

function Chip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_HUE[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}

// ─── draft types ───────────────────────────────────────────────────────────────
type CourseDraft = {
  name?: string
  title: string
  category: string
  summary: string
  description: string
  cover_image: string
  points_reward: number | ''
  estimated_minutes: number | ''
  status: string
}

type FileDraft = { file: string; label: string }
type LessonDraft = {
  name?: string
  title: string
  position: number | ''
  body: string
  video_url: string
  files: FileDraft[]
}

const EMPTY_COURSE: CourseDraft = {
  title: '', category: '', summary: '', description: '', cover_image: '',
  points_reward: '', estimated_minutes: '', status: 'Draft',
}
const EMPTY_LESSON: LessonDraft = {
  title: '', position: '', body: '', video_url: '', files: [],
}

function toLessonDraft(l: LmsLessonView): LessonDraft {
  return {
    name: l.name,
    title: l.title,
    position: l.position,
    body: l.body ?? '',
    video_url: l.video_url ?? '',
    files: l.files.map((f) => ({ file: f.file, label: f.label ?? '' })),
  }
}

type Tab = 'courses' | 'assign' | 'report'

// ─── main component ────────────────────────────────────────────────────────────
export default function LmsAdminScreen() {
  const { data, isLoading } = useManageCourses()
  const [tab, setTab] = useState<Tab>('courses')

  // Courses sub-state
  const [managedCourse, setManagedCourse] = useState<string | null>(null)
  const [courseDraft, setCourseDraft] = useState<CourseDraft | null>(null)
  const [lessonDraft, setLessonDraft] = useState<LessonDraft | null>(null)
  // ponytail: tracks which course the admin wants to edit; cleared once full data populates courseDraft
  const [editCourseId, setEditCourseId] = useState<string | null>(null)

  // Assign tab state
  const [assignCourse, setAssignCourse] = useState('')
  const [assignUsers, setAssignUsers] = useState<string[]>([])
  const [assignDue, setAssignDue] = useState('')

  // Report tab state
  const [reportCourse, setReportCourse] = useState('')

  // Hooks
  const { data: courseDetail, isLoading: lessonsLoading } = useCourse(managedCourse ?? '')
  const { data: editDetail } = useCourse(editCourseId ?? '')

  // Populate edit form once full course data arrives (belt-and-suspenders with backend fix)
  useEffect(() => {
    if (editCourseId && editDetail?.course) {
      const c = editDetail.course
      setCourseDraft({
        name: c.name, title: c.title, category: c.category ?? '',
        summary: c.summary ?? '', description: c.description ?? '',
        cover_image: c.cover_image ?? '', points_reward: c.points_reward,
        estimated_minutes: c.estimated_minutes ?? '', status: c.status,
      })
      setEditCourseId(null)
    }
  }, [editDetail, editCourseId])
  const saveCourse = useSaveCourse()
  const deleteCourse = useDeleteCourse()
  const saveLesson = useSaveLesson(managedCourse ?? '')
  const deleteLesson = useDeleteLesson(managedCourse ?? '')
  const assignMutation = useAssignCourse()
  const { data: usersData } = useAssignableUsers()
  const userOptions = (usersData?.users ?? []).map((u) => ({ value: u.name, label: u.full_name || u.name }))
  const { data: report, isLoading: reportLoading } = useCourseReport(reportCourse)

  const toast = useToast()
  const confirm = useConfirm()

  const courses = data?.courses ?? []

  // ── save course ──────────────────────────────────────────────────────────────
  const doSaveCourse = () => {
    if (!courseDraft || !courseDraft.title.trim()) return
    saveCourse.mutate(
      {
        ...(courseDraft.name ? { name: courseDraft.name } : {}),
        title: courseDraft.title.trim(),
        category: courseDraft.category.trim() || undefined,
        summary: courseDraft.summary.trim() || undefined,
        description: courseDraft.description.trim() || undefined,
        cover_image: courseDraft.cover_image.trim() || undefined,
        points_reward: courseDraft.points_reward !== '' ? Number(courseDraft.points_reward) : 0,
        estimated_minutes: courseDraft.estimated_minutes !== '' ? Number(courseDraft.estimated_minutes) : undefined,
        status: courseDraft.status,
      },
      {
        onSuccess: () => { toast('success', courseDraft.name ? 'Updated' : 'Course created'); setCourseDraft(null) },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not save'),
      },
    )
  }

  // ── delete course ────────────────────────────────────────────────────────────
  const doDeleteCourse = async (c: LmsManagedCourse) => {
    const ok = await confirm({
      title: 'Delete course',
      message: `Delete "${c.title}"? This removes all lessons and enrollments.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    deleteCourse.mutate(c.name, {
      onSuccess: () => toast('success', 'Deleted'),
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not delete'),
    })
  }

  // ── save lesson ──────────────────────────────────────────────────────────────
  const doSaveLesson = () => {
    if (!lessonDraft || !lessonDraft.title.trim() || !managedCourse) return
    saveLesson.mutate(
      {
        ...(lessonDraft.name ? { name: lessonDraft.name } : {}),
        course: managedCourse,
        title: lessonDraft.title.trim(),
        position: lessonDraft.position !== '' ? Number(lessonDraft.position) : 1,
        body: lessonDraft.body.trim() || undefined,
        video_url: lessonDraft.video_url.trim() || undefined,
        files: lessonDraft.files.filter((f) => f.file.trim()),
      },
      {
        onSuccess: () => { toast('success', lessonDraft.name ? 'Updated' : 'Lesson added'); setLessonDraft(null) },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not save'),
      },
    )
  }

  // ── delete lesson ────────────────────────────────────────────────────────────
  const doDeleteLesson = async (l: LmsLessonView) => {
    const ok = await confirm({
      title: 'Delete lesson',
      message: `Delete "${l.title}"?`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    deleteLesson.mutate(l.name, {
      onSuccess: () => toast('success', 'Lesson deleted'),
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not delete'),
    })
  }

  // ── assign course ────────────────────────────────────────────────────────────
  const doAssign = () => {
    if (!assignCourse || assignUsers.length === 0) return
    assignMutation.mutate(
      { course: assignCourse, users: assignUsers, due_date: assignDue || undefined },
      {
        onSuccess: (r) => { toast('success', `Assigned to ${r.created} user(s)`); setAssignUsers([]); setAssignDue('') },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not assign'),
      },
    )
  }

  const lessons = courseDetail?.lessons ?? []

  return (
    <DetailScreen title="Manage Learning">
      <Segmented
        options={[
          { value: 'courses', label: 'Courses' },
          { value: 'assign', label: 'Assign' },
          { value: 'report', label: 'Report' },
        ]}
        value={tab}
        onChange={(v) => { setTab(v); setManagedCourse(null) }}
      />

      <div className="mt-4">
        {/* ── COURSES TAB ─────────────────────────────────────────────────── */}
        {tab === 'courses' && (
          <>
            {managedCourse ? (
              /* ── Lesson management sub-view ─────────────────────────────── */
              <>
                <button
                  onClick={() => setManagedCourse(null)}
                  className="mb-3 flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-300 active:scale-95"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Courses
                </button>
                <p className="mb-3 font-display text-base font-bold text-stone-800 dark:text-slate-50">
                  {courses.find((c) => c.name === managedCourse)?.title ?? managedCourse} — Lessons
                </p>
                <button
                  onClick={() => setLessonDraft({ ...EMPTY_LESSON, position: lessons.length + 1 })}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  New lesson
                </button>
                {lessonsLoading && !courseDetail ? (
                  <FullScreenLoader />
                ) : lessons.length === 0 ? (
                  <EmptyState icon={BookOpen} title="No lessons" subtitle="Add the first lesson for this course." />
                ) : (
                  <div className="space-y-2">
                    {lessons.map((l) => (
                      <div
                        key={l.name}
                        className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-stone-800 dark:text-slate-50">{l.title}</p>
                            <p className="text-xs text-stone-400 dark:text-slate-500">Position {l.position}</p>
                          </div>
                          <button
                            onClick={() => setLessonDraft(toLessonDraft(l))}
                            className="rounded-lg bg-brand-50 dark:bg-brand-500/15 px-2.5 py-1.5 text-xs font-semibold text-brand-600 dark:text-brand-300 active:scale-95"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => doDeleteLesson(l)}
                            className="rounded-lg p-1.5 text-stone-400 dark:text-slate-500 active:bg-rose-50 dark:active:bg-rose-500/15 active:text-rose-600"
                            aria-label="Delete lesson"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* ── Course list ─────────────────────────────────────────────── */
              <>
                <button
                  onClick={() => setCourseDraft({ ...EMPTY_COURSE })}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  New course
                </button>
                {isLoading && !data ? (
                  <FullScreenLoader />
                ) : courses.length === 0 ? (
                  <EmptyState icon={BookOpen} title="No courses" subtitle="Create the first course to get started." />
                ) : (
                  <div className="space-y-2">
                    {courses.map((c) => (
                      <div
                        key={c.name}
                        className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card"
                      >
                        <div className="mb-1.5 flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-display text-base font-bold text-stone-800 dark:text-slate-50">{c.title}</p>
                            <p className="text-xs text-stone-400 dark:text-slate-500">
                              {c.lesson_count} lessons · {c.enrolled} enrolled · {c.completed} completed
                            </p>
                          </div>
                          <Chip status={c.status} />
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => setEditCourseId(c.name)}
                            className="flex-1 rounded-xl bg-brand-50 dark:bg-brand-500/15 py-2 text-xs font-semibold text-brand-600 dark:text-brand-300 active:scale-95"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setManagedCourse(c.name)}
                            className="flex-1 rounded-xl border border-paper-edge dark:border-slate-700 py-2 text-xs font-semibold text-stone-600 dark:text-slate-300 active:scale-95"
                          >
                            Lessons
                          </button>
                          <button
                            onClick={() => doDeleteCourse(c)}
                            className="rounded-xl p-2 text-stone-400 dark:text-slate-500 active:bg-rose-50 dark:active:bg-rose-500/15 active:text-rose-600"
                            aria-label="Delete course"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── ASSIGN TAB ──────────────────────────────────────────────────── */}
        {tab === 'assign' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-slate-400">Course</label>
              <select
                className={inputCls}
                value={assignCourse}
                onChange={(e) => setAssignCourse(e.target.value)}
              >
                <option value="">Select a course…</option>
                {courses.map((c) => (
                  <option key={c.name} value={c.name}>{c.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-slate-400">Users</label>
              <MultiSelectSearch
                options={userOptions}
                value={assignUsers}
                onChange={setAssignUsers}
                placeholder="Search users…"
                emptyText="No users"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-slate-400">Due date (optional)</label>
              <input type="date" className={inputCls} value={assignDue} onChange={(e) => setAssignDue(e.target.value)} />
            </div>
            <button
              disabled={!assignCourse || assignUsers.length === 0 || assignMutation.isPending}
              onClick={doAssign}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              {assignMutation.isPending ? <Spinner className="h-4 w-4" /> : 'Assign course'}
            </button>
          </div>
        )}

        {/* ── REPORT TAB ──────────────────────────────────────────────────── */}
        {tab === 'report' && (
          <div className="space-y-3">
            <select
              className={inputCls}
              value={reportCourse}
              onChange={(e) => setReportCourse(e.target.value)}
            >
              <option value="">Select a course…</option>
              {courses.map((c) => (
                <option key={c.name} value={c.name}>{c.title}</option>
              ))}
            </select>

            {reportLoading ? (
              <FullScreenLoader />
            ) : report && report.rows.length > 0 ? (
              <div className="space-y-2">
                {report.rows.map((row) => (
                  <div
                    key={row.user}
                    className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card"
                  >
                    <div className="mb-1.5 flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">{row.user_name}</p>
                        <p className="text-xs text-stone-400 dark:text-slate-500">{row.user}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Chip status={row.status} />
                        {row.overdue && <Chip status="Overdue" />}
                      </div>
                    </div>
                    <ProgressBar value={row.progress_pct} className="mb-1.5" />
                    <div className="flex items-center justify-between text-xs text-stone-400 dark:text-slate-500">
                      <span>{row.progress_pct}% complete</span>
                      {row.due_date && <span>Due {formatDate(row.due_date)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : reportCourse ? (
              <EmptyState icon={BookOpen} title="No enrollments" subtitle="No one has been assigned this course yet." />
            ) : null}
          </div>
        )}
      </div>

      {/* ── Course form sheet ─────────────────────────────────────────────── */}
      {courseDraft && (
        <Sheet title={courseDraft.name ? 'Edit course' : 'New course'} onClose={() => !saveCourse.isPending && setCourseDraft(null)}>
          <div className="space-y-3">
            <input className={inputCls} placeholder="Title *" value={courseDraft.title} onChange={(e) => setCourseDraft({ ...courseDraft, title: e.target.value })} />
            <input className={inputCls} placeholder="Category (optional)" value={courseDraft.category} onChange={(e) => setCourseDraft({ ...courseDraft, category: e.target.value })} />
            <input className={inputCls} placeholder="Summary (short)" value={courseDraft.summary} onChange={(e) => setCourseDraft({ ...courseDraft, summary: e.target.value })} />
            <textarea className={inputCls} rows={3} placeholder="Description (optional)" value={courseDraft.description} onChange={(e) => setCourseDraft({ ...courseDraft, description: e.target.value })} />
            <input className={inputCls} placeholder="Cover image URL (optional)" value={courseDraft.cover_image} onChange={(e) => setCourseDraft({ ...courseDraft, cover_image: e.target.value })} />
            <div className="flex gap-2">
              <label className="flex-1 text-xs font-medium text-stone-500 dark:text-slate-400">
                Points reward
                <input type="number" min={0} className={`${inputCls} mt-1`} placeholder="0" value={courseDraft.points_reward} onChange={(e) => setCourseDraft({ ...courseDraft, points_reward: e.target.value === '' ? '' : Number(e.target.value) })} />
              </label>
              <label className="flex-1 text-xs font-medium text-stone-500 dark:text-slate-400">
                Est. minutes
                <input type="number" min={1} className={`${inputCls} mt-1`} placeholder="—" value={courseDraft.estimated_minutes} onChange={(e) => setCourseDraft({ ...courseDraft, estimated_minutes: e.target.value === '' ? '' : Number(e.target.value) })} />
              </label>
            </div>
            <div className="flex gap-2">
              {['Draft', 'Published', 'Archived'].map((s) => (
                <button
                  key={s}
                  onClick={() => setCourseDraft({ ...courseDraft, status: s })}
                  className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                    courseDraft.status === s ? 'bg-brand-600 text-white' : 'border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              disabled={!courseDraft.title.trim() || saveCourse.isPending}
              onClick={doSaveCourse}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              {saveCourse.isPending ? <Spinner className="h-4 w-4" /> : 'Save'}
            </button>
          </div>
        </Sheet>
      )}

      {/* ── Lesson form sheet ─────────────────────────────────────────────── */}
      {lessonDraft && (
        <Sheet title={lessonDraft.name ? 'Edit lesson' : 'New lesson'} onClose={() => !saveLesson.isPending && setLessonDraft(null)}>
          <div className="space-y-3">
            <input className={inputCls} placeholder="Title *" value={lessonDraft.title} onChange={(e) => setLessonDraft({ ...lessonDraft, title: e.target.value })} />
            <input type="number" min={1} className={inputCls} placeholder="Position" value={lessonDraft.position} onChange={(e) => setLessonDraft({ ...lessonDraft, position: e.target.value === '' ? '' : Number(e.target.value) })} />
            <textarea className={inputCls} rows={5} placeholder="Body (HTML/rich text, optional)" value={lessonDraft.body} onChange={(e) => setLessonDraft({ ...lessonDraft, body: e.target.value })} />
            <input className={inputCls} placeholder="Video URL (optional)" value={lessonDraft.video_url} onChange={(e) => setLessonDraft({ ...lessonDraft, video_url: e.target.value })} />

            {/* File rows */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-stone-500 dark:text-slate-400">Files</p>
              {lessonDraft.files.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="File URL"
                    value={f.file}
                    onChange={(e) => {
                      const files = [...lessonDraft.files]
                      files[i] = { ...files[i], file: e.target.value }
                      setLessonDraft({ ...lessonDraft, files })
                    }}
                  />
                  <input
                    className={`${inputCls} w-28`}
                    placeholder="Label"
                    value={f.label}
                    onChange={(e) => {
                      const files = [...lessonDraft.files]
                      files[i] = { ...files[i], label: e.target.value }
                      setLessonDraft({ ...lessonDraft, files })
                    }}
                  />
                  <button
                    onClick={() => setLessonDraft({ ...lessonDraft, files: lessonDraft.files.filter((_, j) => j !== i) })}
                    className="rounded-lg p-2 text-stone-400 active:text-rose-600"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setLessonDraft({ ...lessonDraft, files: [...lessonDraft.files, { file: '', label: '' }] })}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-300"
              >
                <Plus className="h-3.5 w-3.5" /> Add file
              </button>
            </div>

            <button
              disabled={!lessonDraft.title.trim() || saveLesson.isPending}
              onClick={doSaveLesson}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              {saveLesson.isPending ? <Spinner className="h-4 w-4" /> : 'Save'}
            </button>
          </div>
        </Sheet>
      )}
    </DetailScreen>
  )
}

// ─── Sheet (local, matches IncomeAdminScreen exactly) ─────────────────────────
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative mx-auto max-h-[90vh] w-full sm:max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
