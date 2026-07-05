import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useCreateProjectDetail, useUpdateProjectDetail, useProjectDetail, useGroups } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { MultiSelectChips } from '@/components/MultiSelectChips'
import { RichEditor } from '@/components/RichEditor'
import { Drawer } from '@web/components/overlays/Drawer'
import { Button } from '@web/components/ui'

interface Props {
  open: boolean
  onClose: () => void
  /** Project name (parent). */
  project: string
  /** Project Detail name to edit; omit for create. */
  detail?: string
}

export function ProjectDetailFormDialog({ open, onClose, project, detail }: Props) {
  const toast = useToast()
  const isEdit = !!detail
  const create = useCreateProjectDetail(project)
  const update = useUpdateProjectDetail(detail ?? '')
  // In edit mode, refetch the full detail to hydrate condition/outcome/etc.
  const detailQuery = useProjectDetail(detail ?? '')
  const { data: glossaryList } = useGroups(project, open && !!project)
  const [title, setTitle] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [condition, setCondition] = useState('')
  const [outcome, setOutcome] = useState('')
  const [sow, setSow] = useState('')
  const [glossaries, setGlossaries] = useState<string[]>([])

  // Hydrate from the loaded detail when editing.
  useEffect(() => {
    if (open && detail && detailQuery.data) {
      const d = detailQuery.data
      setTitle(d.title)
      setIsPending(!!d.is_pending)
      setCondition(d.current_condition ?? '')
      setOutcome(d.expected_outcome ?? '')
      setSow(d.keterangan_di_sow ?? '')
      setGlossaries(d.glossaries ?? [])
    }
  }, [open, detail, detailQuery.data])

  const reset = () => {
    setTitle(''); setIsPending(false); setCondition(''); setOutcome('')
    setSow(''); setGlossaries([])
  }
  const close = () => { reset(); onClose() }

  const glossaryOpts = (glossaryList ?? []).map((g) => ({ value: g.name, label: g.glossary }))

  const field =
    'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

  const submit = () => {
    if (!title.trim()) {
      toast('error', 'Title is required')
      return
    }
    const payload = {
      title: title.trim(),
      is_pending: isPending ? 1 : 0,
      current_condition: condition,
      expected_outcome: outcome,
      keterangan_di_sow: sow,
      glossaries: glossaries.map((g) => ({ glossary: g })),
    }
    const handlers = {
      onSuccess: () => { toast('success', isEdit ? 'Project detail updated' : 'Project detail created'); close() },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    if (isEdit) update.mutate(payload, handlers)
    else create.mutate(payload, handlers)
  }

  const busy = create.isPending || update.isPending

  return (
    <Drawer
      open={open}
      onClose={close}
      title={isEdit ? 'Edit detail' : 'New detail'}
      widthClass="max-w-lg"
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : !isEdit && <Plus className="h-4 w-4" />}
            {isEdit ? 'Save changes' : 'Create detail'}
          </Button>
        </>
      }
    >
      {isEdit && detailQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
      <div className="flex flex-col gap-4">
        <label className="text-sm font-medium text-muted">
          Title<span className="text-red-500"> *</span>
          <input className={field + ' mt-1'} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className="flex items-center justify-between text-sm font-medium text-muted">
          <span>
            Mark as pending
            <span className="mt-0.5 block text-xs font-normal text-muted">
              The deadline follows the project's; status is set automatically from the tasks.
            </span>
          </span>
          <input
            type="checkbox"
            checked={isPending}
            onChange={(e) => setIsPending(e.target.checked)}
            className="ml-3 h-5 w-5 shrink-0 accent-brand-600"
          />
        </label>

        <label className="text-sm font-medium text-muted">
          Current condition
          <RichEditor value={condition} onChange={setCondition} placeholder="Current condition…" />
        </label>

        <label className="text-sm font-medium text-muted">
          Expected outcome
          <RichEditor value={outcome} onChange={setOutcome} placeholder="Expected outcome…" />
        </label>

        <label className="text-sm font-medium text-muted">
          Keterangan di SOW
          <RichEditor value={sow} onChange={setSow} placeholder="Describe the SOW…" />
        </label>

        <div className="text-sm font-medium text-muted">
          Glossaries
          <MultiSelectChips
            options={glossaryOpts}
            value={glossaries}
            onChange={setGlossaries}
            emptyText="No glossaries for this project yet"
          />
        </div>

      </div>
      )}
    </Drawer>
  )
}
