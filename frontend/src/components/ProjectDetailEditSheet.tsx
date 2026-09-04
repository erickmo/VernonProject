import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import { useUpdateProjectDetail, useProjectDetail } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { MultiSelectChips } from '@/components/MultiSelectChips'
import { RichEditor } from '@/components/RichEditor'

interface Props {
  open: boolean
  onClose: () => void
  projectDetailName: string
}

export function ProjectDetailEditSheet({ open, onClose, projectDetailName }: Props) {
  const toast = useToast()
  const update = useUpdateProjectDetail(projectDetailName)
  // Fetch the full detail so condition/outcome aren't lost on save.
  const { data: projectDetail, isLoading } = useProjectDetail(projectDetailName)

  const [title, setTitle] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [condition, setCondition] = useState('')
  const [outcome, setOutcome] = useState('')
  const [sow, setSow] = useState('')
  const [goal, setGoal] = useState('')
  const [success, setSuccess] = useState('')
  const [failure, setFailure] = useState('')
  const [ctx, setCtx] = useState('')
  const [glossaries, setGlossaries] = useState<string[]>([])

  useEffect(() => {
    if (open && projectDetail) {
      setTitle(projectDetail.title)
      setIsPending(!!projectDetail.is_pending)
      setCondition(projectDetail.current_condition || '')
      setOutcome(projectDetail.expected_outcome || '')
      setSow(projectDetail.keterangan_di_sow || '')
      setGoal(projectDetail.goal || '')
      setSuccess(projectDetail.success_condition || '')
      setFailure(projectDetail.failure_condition || '')
      setCtx(projectDetail.context || '')
      setGlossaries(projectDetail.glossaries ?? [])
    }
  }, [open, projectDetail])

  const glossaryOpts = (projectDetail?.glossary_options ?? []).map((g) => ({ value: g.name, label: g.glossary }))

  if (!open) return null

  const field =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500'
  const head = 'mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500'

  const submit = () => {
    if (!title.trim()) {
      toast('error', 'Title is required')
      return
    }
    update.mutate(
      {
        title: title.trim(),
        is_pending: isPending ? 1 : 0,
        current_condition: condition,
        expected_outcome: outcome,
        keterangan_di_sow: sow,
        goal,
        success_condition: success,
        failure_condition: failure,
        context: ctx,
        glossaries: glossaries.map((g) => ({ glossary: g })),
      },
      {
        onSuccess: () => { toast('success', 'Project detail updated'); onClose() },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Edit detail</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading || !projectDetail ? (
          <Spinner className="mx-auto my-8 h-6 w-6 text-slate-400 dark:text-slate-500" />
        ) : (
        <div className="flex flex-col gap-3">
          {/* Grouped into sections (mirrors the /w drawer). */}
          <div className={head}>Basics</div>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Title<span className="text-red-500"> *</span>
            <input className={field + ' mt-1'} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="flex items-center justify-between text-sm font-medium text-slate-600 dark:text-slate-300">
            <span>
              Mark as pending
              <span className="mt-0.5 block text-xs font-normal text-slate-400 dark:text-slate-500">Status is otherwise set automatically from the tasks (Completed when all done, else Ongoing).</span>
            </span>
            <input type="checkbox" checked={isPending} onChange={(e) => setIsPending(e.target.checked)} className="ml-3 h-5 w-5 shrink-0 accent-brand-600" />
          </label>

          <div className={head}>Analysis</div>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Current condition
            <RichEditor value={condition} onChange={setCondition} placeholder="Current condition…" />
          </label>

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Expected outcome
            <RichEditor value={outcome} onChange={setOutcome} placeholder="Expected outcome…" />
          </label>

          <div className={head}>SOW</div>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Keterangan di SOW
            <RichEditor value={sow} onChange={setSow} placeholder="Describe the SOW…" />
          </label>

          <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Glossaries
            <MultiSelectChips options={glossaryOpts} value={glossaries} onChange={setGlossaries} emptyText="No glossaries for this project yet" />
          </div>

          <div className={head}>AI context</div>
          <span className="-mt-1 block text-xs font-normal text-slate-400 dark:text-slate-500">Feeds the “Generate with AI” drafts for this subgoal. All optional.</span>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Goal
            <textarea className={field + ' mt-1'} rows={2} placeholder="This subgoal's purpose" value={goal} onChange={(e) => setGoal(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Success condition
            <textarea className={field + ' mt-1'} rows={2} placeholder="What success looks like — helps AI draft tasks" value={success} onChange={(e) => setSuccess(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Failure condition
            <textarea className={field + ' mt-1'} rows={2} placeholder="What would count as failure" value={failure} onChange={(e) => setFailure(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Context
            <textarea className={field + ' mt-1'} rows={2} placeholder="Extra context for AI" value={ctx} onChange={(e) => setCtx(e.target.value)} />
          </label>

          <button onClick={submit} disabled={update.isPending}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {update.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            Save changes
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
