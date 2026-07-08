import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Plus, Trash2, ChevronLeft, Users, FileText } from 'lucide-react'
import { Spinner, EmptyState, Segmented } from '@/components/ui'
import { ErrorState, Button, Field } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader, Section } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import type { Column } from '@web/components/DataTable'
import {
  useBoot,
  canManageLms,
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
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import type { LmsManagedCourse, LmsLessonView, LmsReportRow } from '@/lib/types'

// ponytail: shared input style mirrors GroupForm.tsx web pattern
const field =
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

const STATUS_CLS: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  Published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Archived: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'In Progress': 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        STATUS_CLS[status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
      }`}
    >
      {status}
    </span>
  )
}

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
  title: '',
  category: '',
  summary: '',
  description: '',
  cover_image: '',
  points_reward: '',
  estimated_minutes: '',
  status: 'Draft',
}

const EMPTY_LESSON: LessonDraft = {
  title: '',
  position: '',
  body: '',
  video_url: '',
  files: [],
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

export default function LmsAdmin() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const { data: boot } = useBoot()
  const { data, isLoading } = useManageCourses()

  const [tab, setTab] = useState<Tab>('courses')
  const [managedCourse, setManagedCourse] = useState<string | null>(null)
  const [courseDraft, setCourseDraft] = useState<CourseDraft | null>(null)
  const [lessonDraft, setLessonDraft] = useState<LessonDraft | null>(null)
  // ponytail: editCourseId triggers useCourse fetch for prefill; cleared once data populates courseDraft
  const [editCourseId, setEditCourseId] = useState<string | null>(null)

  const [assignCourse, setAssignCourse] = useState('')
  const [assignUsers, setAssignUsers] = useState<string[]>([])
  const [assignDue, setAssignDue] = useState('')
  const [reportCourse, setReportCourse] = useState('')

  // All hooks must run unconditionally before any early return
  const { data: courseDetail, isLoading: lessonsLoading } = useCourse(managedCourse ?? '')
  const { data: editDetail } = useCourse(editCourseId ?? '')
  const { data: report, isLoading: reportLoading } = useCourseReport(reportCourse)
  const { data: assignableData } = useAssignableUsers()

  const saveCourse = useSaveCourse()
  const deleteCourse = useDeleteCourse()
  const saveLesson = useSaveLesson(managedCourse ?? '')
  const deleteLesson = useDeleteLesson(managedCourse ?? '')
  const assignMutation = useAssignCourse()

  // Prefill course form from full course data when editing
  // ponytail: avoids data-loss bug — LmsManagedCourse row lacks summary/description/estimated_minutes
  useEffect(() => {
    if (editCourseId && editDetail?.course) {
      const c = editDetail.course
      setCourseDraft({
        name: c.name,
        title: c.title,
        category: c.category ?? '',
        summary: c.summary ?? '',
        description: c.description ?? '',
        cover_image: c.cover_image ?? '',
        points_reward: c.points_reward,
        estimated_minutes: c.estimated_minutes ?? '',
        status: c.status,
      })
      setEditCourseId(null)
    }
  }, [editDetail, editCourseId])

  // Gating — redirect must happen after all hooks (rules of hooks)
  const blocked = !!boot && !canManageLms(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (blocked) return null

  const courses = data?.courses ?? []
  const lessons = courseDetail?.lessons ?? []

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const doSaveCourse = () => {
    if (!courseDraft || !courseDraft.title.trim()) {
      toast('error', 'Title is required')
      return
    }
    saveCourse.mutate(
      {
        ...(courseDraft.name ? { name: courseDraft.name } : {}),
        title: courseDraft.title.trim(),
        category: courseDraft.category.trim() || undefined,
        summary: courseDraft.summary.trim() || undefined,
        description: courseDraft.description.trim() || undefined,
        cover_image: courseDraft.cover_image.trim() || undefined,
        points_reward: courseDraft.points_reward !== '' ? Number(courseDraft.points_reward) : 0,
        estimated_minutes:
          courseDraft.estimated_minutes !== '' ? Number(courseDraft.estimated_minutes) : undefined,
        status: courseDraft.status,
      },
      {
        onSuccess: () => {
          toast('success', courseDraft.name ? 'Course updated' : 'Course created')
          setCourseDraft(null)
        },
        onError: (e) =>
          toast('error', e instanceof Error ? e.message : 'Could not save course'),
      },
    )
  }

  const doDeleteCourse = async (c: LmsManagedCourse) => {
    const ok = await confirm({
      title: 'Delete course',
      message: `Delete "${c.title}"? This removes all lessons and enrollments.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    deleteCourse.mutate(c.name, {
      onSuccess: () => toast('success', 'Course deleted'),
      onError: (e) =>
        toast('error', e instanceof Error ? e.message : 'Could not delete course'),
    })
  }

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
        onSuccess: () => {
          toast('success', lessonDraft.name ? 'Lesson updated' : 'Lesson added')
          setLessonDraft(null)
        },
        onError: (e) =>
          toast('error', e instanceof Error ? e.message : 'Could not save lesson'),
      },
    )
  }

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
      onError: (e) =>
        toast('error', e instanceof Error ? e.message : 'Could not delete lesson'),
    })
  }

  const doAssign = () => {
    if (!assignCourse || assignUsers.length === 0) {
      toast('error', 'Select a course and at least one user')
      return
    }
    assignMutation.mutate(
      { course: assignCourse, users: assignUsers, due_date: assignDue || undefined },
      {
        onSuccess: (r) => {
          toast('success', `Assigned to ${r.created} user(s)`)
          setAssignUsers([])
          setAssignDue('')
        },
        onError: (e) =>
          toast('error', e instanceof Error ? e.message : 'Could not assign'),
      },
    )
  }

  const patchCourse = useCallback(
    (patch: Partial<CourseDraft>) =>
      setCourseDraft((d) => (d ? { ...d, ...patch } : d)),
    [],
  )

  const patchLesson = useCallback(
    (patch: Partial<LessonDraft>) =>
      setLessonDraft((d) => (d ? { ...d, ...patch } : d)),
    [],
  )

  // ── Report columns ──────────────────────────────────────────────────────────

  const reportCols: Column<LmsReportRow>[] = [
    {
      key: 'user',
      header: 'User',
      render: (r) => <span className="font-medium text-ink">{r.user_name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusChip status={r.overdue ? 'Overdue' : r.status} />,
    },
    {
      key: 'progress',
      header: 'Progress',
      align: 'right',
      sortValue: (r) => r.progress_pct,
      render: (r) => (
        <span className="text-sm font-medium tabular-nums">{r.progress_pct}%</span>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      render: (r) => <span className="text-sm text-muted">{r.due_date ?? '—'}</span>,
    },
    {
      key: 'completed',
      header: 'Completed',
      render: (r) => (
        <span className="text-sm text-muted">{r.completed_on ?? '—'}</span>
      ),
    },
  ]

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <Page>
      <PageHeader icon={BookOpen} title="Manage Learning" subtitle="Author courses, assign, and track progress." />

      <div className="mb-5">
        <Segmented
          options={[
            { value: 'courses', label: 'Courses' },
            { value: 'assign', label: 'Assign' },
            { value: 'report', label: 'Report' },
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v as Tab)
            setManagedCourse(null)
            setCourseDraft(null)
            setLessonDraft(null)
          }}
        />
      </div>

      {/* ── COURSES TAB ─────────────────────────────────────────────────────── */}
      {tab === 'courses' && (
        <div className="space-y-4">
          {/* Lesson sub-view */}
          {managedCourse ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setManagedCourse(null)
                    setLessonDraft(null)
                  }}
                  className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {courses.find((c) => c.name === managedCourse)?.title ?? managedCourse}
                </button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setLessonDraft({ ...EMPTY_LESSON, position: lessons.length + 1 })}
                >
                  <Plus className="h-4 w-4" /> New lesson
                </Button>
              </div>

              {/* Lesson form */}
              {lessonDraft && (
                <BentoGrid>
                  <BentoTile span="full" tone="tint" accent="brand" title={lessonDraft.name ? 'Edit lesson' : 'New lesson'}>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Title" required>
                        {(id) => (
                          <input
                            id={id}
                            className={field}
                            value={lessonDraft.title}
                            onChange={(e) => patchLesson({ title: e.target.value })}
                            placeholder="Lesson title"
                            autoFocus
                          />
                        )}
                      </Field>
                      <Field label="Position">
                        {(id) => (
                          <input
                            id={id}
                            type="number"
                            className={field}
                            value={lessonDraft.position}
                            onChange={(e) =>
                              patchLesson({
                                position: e.target.value === '' ? '' : Number(e.target.value),
                              })
                            }
                            placeholder="1"
                          />
                        )}
                      </Field>
                      <Field label="Video URL" className="sm:col-span-2">
                        {(id) => (
                          <input
                            id={id}
                            className={field}
                            value={lessonDraft.video_url}
                            onChange={(e) => patchLesson({ video_url: e.target.value })}
                            placeholder="https://…"
                          />
                        )}
                      </Field>
                      <Field label="Body (HTML/rich text)" className="sm:col-span-2">
                        {(id) => (
                          <textarea
                            id={id}
                            className={field}
                            rows={5}
                            value={lessonDraft.body}
                            onChange={(e) => patchLesson({ body: e.target.value })}
                            placeholder="Lesson content…"
                          />
                        )}
                      </Field>
                    </div>

                    {/* Files */}
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                        Files
                      </p>
                      <div className="space-y-2">
                        {lessonDraft.files.map((f, i) => (
                          <div key={i} className="flex gap-2">
                            <input
                              className={field}
                              value={f.file}
                              onChange={(e) => {
                                const files = [...lessonDraft.files]
                                files[i] = { ...files[i], file: e.target.value }
                                patchLesson({ files })
                              }}
                              placeholder="File URL or path"
                            />
                            <input
                              className={`${field} max-w-[160px]`}
                              value={f.label}
                              onChange={(e) => {
                                const files = [...lessonDraft.files]
                                files[i] = { ...files[i], label: e.target.value }
                                patchLesson({ files })
                              }}
                              placeholder="Label"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                patchLesson({ files: lessonDraft.files.filter((_, j) => j !== i) })
                              }
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          patchLesson({ files: [...lessonDraft.files, { file: '', label: '' }] })
                        }
                        className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add file
                      </button>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setLessonDraft(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={saveLesson.isPending}
                        onClick={doSaveLesson}
                      >
                        {saveLesson.isPending ? (
                          <Spinner className="h-4 w-4" />
                        ) : lessonDraft.name ? (
                          'Save changes'
                        ) : (
                          'Add lesson'
                        )}
                      </Button>
                    </div>
                  </BentoTile>
                </BentoGrid>
              )}

              {/* Lesson list */}
              {lessonsLoading && !courseDetail ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : lessons.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No lessons"
                  subtitle="Add the first lesson for this course."
                />
              ) : (
                <div className="space-y-2">
                  {lessons.map((l) => (
                    <div
                      key={l.name}
                      className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">{l.title}</p>
                        <p className="text-xs text-muted">Position {l.position}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setLessonDraft(toLessonDraft(l))}
                      >
                        Edit
                      </Button>
                      <button
                        type="button"
                        onClick={() => doDeleteLesson(l)}
                        aria-label="Delete lesson"
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : courseDraft ? (
            /* ── Course form ───────────────────────────────────────────────── */
            <>
              <button
                type="button"
                onClick={() => setCourseDraft(null)}
                className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
              >
                <ChevronLeft className="h-4 w-4" /> Back to courses
              </button>

              <BentoGrid>
                <BentoTile
                  span="full"
                  tone="plain"
                  title={courseDraft.name ? 'Edit course' : 'New course'}
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Title" required className="sm:col-span-2">
                      {(id) => (
                        <input
                          id={id}
                          className={field}
                          value={courseDraft.title}
                          onChange={(e) => patchCourse({ title: e.target.value })}
                          placeholder="Course title"
                          autoFocus
                        />
                      )}
                    </Field>
                    <Field label="Category">
                      {(id) => (
                        <input
                          id={id}
                          className={field}
                          value={courseDraft.category}
                          onChange={(e) => patchCourse({ category: e.target.value })}
                          placeholder="e.g. Onboarding"
                        />
                      )}
                    </Field>
                    <Field label="Status">
                      {(id) => (
                        <select
                          id={id}
                          className={field}
                          value={courseDraft.status}
                          onChange={(e) => patchCourse({ status: e.target.value })}
                        >
                          <option value="Draft">Draft</option>
                          <option value="Published">Published</option>
                          <option value="Archived">Archived</option>
                        </select>
                      )}
                    </Field>
                    <Field label="Points reward">
                      {(id) => (
                        <input
                          id={id}
                          type="number"
                          className={field}
                          value={courseDraft.points_reward}
                          onChange={(e) =>
                            patchCourse({
                              points_reward: e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                          placeholder="0"
                        />
                      )}
                    </Field>
                    <Field label="Estimated minutes">
                      {(id) => (
                        <input
                          id={id}
                          type="number"
                          className={field}
                          value={courseDraft.estimated_minutes}
                          onChange={(e) =>
                            patchCourse({
                              estimated_minutes:
                                e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                          placeholder="30"
                        />
                      )}
                    </Field>
                    <Field label="Summary" className="sm:col-span-2">
                      {(id) => (
                        <input
                          id={id}
                          className={field}
                          value={courseDraft.summary}
                          onChange={(e) => patchCourse({ summary: e.target.value })}
                          placeholder="Short description shown in catalog"
                        />
                      )}
                    </Field>
                    <Field label="Description (HTML/rich text)" className="sm:col-span-2">
                      {(id) => (
                        <textarea
                          id={id}
                          className={field}
                          rows={5}
                          value={courseDraft.description}
                          onChange={(e) => patchCourse({ description: e.target.value })}
                          placeholder="Full course description…"
                        />
                      )}
                    </Field>
                    <Field label="Cover image URL" className="sm:col-span-2">
                      {(id) => (
                        <input
                          id={id}
                          className={field}
                          value={courseDraft.cover_image}
                          onChange={(e) => patchCourse({ cover_image: e.target.value })}
                          placeholder="https://…"
                        />
                      )}
                    </Field>
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setCourseDraft(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      disabled={saveCourse.isPending}
                      onClick={doSaveCourse}
                    >
                      {saveCourse.isPending ? (
                        <Spinner className="h-4 w-4" />
                      ) : courseDraft.name ? (
                        'Save changes'
                      ) : (
                        'Create course'
                      )}
                    </Button>
                  </div>
                </BentoTile>
              </BentoGrid>
            </>
          ) : (
            /* ── Course list ────────────────────────────────────────────────── */
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted">{courses.length} course{courses.length !== 1 ? 's' : ''}</p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setCourseDraft({ ...EMPTY_COURSE })}
                >
                  <Plus className="h-4 w-4" /> New course
                </Button>
              </div>

              {courses.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No courses yet"
                  subtitle="Create your first course."
                />
              ) : (
                <BentoGrid>
                  <BentoTile span="sm" tone="tint" accent="brand">
                    <BentoStat value={courses.length} label="courses" />
                  </BentoTile>
                  <BentoTile span="sm" tone="tint" accent="emerald">
                    <BentoStat
                      value={courses.filter((c) => c.status === 'Published').length}
                      label="published"
                    />
                  </BentoTile>
                  <BentoTile span="full" tone="plain">
                    <div className="-mx-5 -mb-5">
                      <DataTable
                        rows={courses}
                        columns={[
                          {
                            key: 'title',
                            header: 'Course',
                            render: (c) => (
                              <span className="font-medium text-ink">{c.title}</span>
                            ),
                          },
                          {
                            key: 'status',
                            header: 'Status',
                            render: (c) => <StatusChip status={c.status} />,
                          },
                          {
                            key: 'lessons',
                            header: 'Lessons',
                            align: 'right',
                            sortValue: (c) => c.lesson_count,
                            render: (c) => (
                              <span className="text-sm tabular-nums text-muted">
                                {c.lesson_count}
                              </span>
                            ),
                          },
                          {
                            key: 'enrolled',
                            header: 'Enrolled',
                            align: 'right',
                            sortValue: (c) => c.enrolled,
                            render: (c) => (
                              <span className="text-sm tabular-nums text-muted">{c.enrolled}</span>
                            ),
                          },
                          {
                            key: 'actions',
                            header: '',
                            render: (c) => (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setManagedCourse(c.name)
                                  }}
                                  className="rounded px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
                                >
                                  Lessons
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditCourseId(c.name)
                                  }}
                                  className="rounded px-2 py-1 text-xs font-medium text-ink hover:bg-hover/[0.04] transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    doDeleteCourse(c)
                                  }}
                                  className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                                  aria-label="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ),
                          },
                        ] satisfies Column<LmsManagedCourse>[]}
                        getKey={(c) => c.name}
                      />
                    </div>
                  </BentoTile>
                </BentoGrid>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ASSIGN TAB ──────────────────────────────────────────────────────── */}
      {tab === 'assign' && (
        <BentoGrid>
          <BentoTile span="wide" tone="plain" title="Assign course" icon={Users}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Course" required className="sm:col-span-2">
                {(id) => (
                  <select
                    id={id}
                    className={field}
                    value={assignCourse}
                    onChange={(e) => setAssignCourse(e.target.value)}
                  >
                    <option value="">Select a course…</option>
                    {courses
                      .filter((c) => c.status === 'Published')
                      .map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.title}
                        </option>
                      ))}
                  </select>
                )}
              </Field>
              <Field label="Users" required className="sm:col-span-2">
                {() => (
                  <MultiSelectSearch
                    options={(assignableData?.users ?? []).map((u) => ({
                      value: u.name,
                      label: u.full_name || u.name,
                    }))}
                    value={assignUsers}
                    onChange={setAssignUsers}
                    placeholder="Search and select users…"
                  />
                )}
              </Field>
              <Field label="Due date (optional)">
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    className={field}
                    value={assignDue}
                    onChange={(e) => setAssignDue(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="primary"
                disabled={assignMutation.isPending}
                onClick={doAssign}
              >
                {assignMutation.isPending ? <Spinner className="h-4 w-4" /> : 'Assign'}
              </Button>
            </div>
          </BentoTile>
        </BentoGrid>
      )}

      {/* ── REPORT TAB ──────────────────────────────────────────────────────── */}
      {tab === 'report' && (
        <div className="space-y-4">
          <div className="max-w-sm">
            <Field label="Select course">
              {(id) => (
                <select
                  id={id}
                  className={field}
                  value={reportCourse}
                  onChange={(e) => setReportCourse(e.target.value)}
                >
                  <option value="">Select a course…</option>
                  {courses.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.title}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          {reportCourse && (
            <>
              {reportLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : !report ? null : report.rows.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No enrollments"
                  subtitle="Nobody is enrolled in this course yet."
                />
              ) : (
                <BentoGrid>
                  <BentoTile span="sm" tone="tint" accent="brand">
                    <BentoStat value={report.rows.length} label="enrolled" />
                  </BentoTile>
                  <BentoTile span="sm" tone="tint" accent="emerald">
                    <BentoStat
                      value={report.rows.filter((r) => r.status === 'Completed').length}
                      label="completed"
                    />
                  </BentoTile>
                  <BentoTile span="sm" tone="tint" accent="rose">
                    <BentoStat
                      value={report.rows.filter((r) => r.overdue).length}
                      label="overdue"
                    />
                  </BentoTile>
                  <BentoTile span="full" tone="plain">
                    <div className="-mx-5 -mb-5">
                      <DataTable
                        rows={report.rows}
                        columns={reportCols}
                        getKey={(r) => r.user}
                      />
                    </div>
                  </BentoTile>
                </BentoGrid>
              )}
            </>
          )}

          {!reportCourse && (
            <EmptyState
              icon={FileText}
              title="Select a course"
              subtitle="Choose a course above to view the enrollment report."
            />
          )}
        </div>
      )}
    </Page>
  )
}
