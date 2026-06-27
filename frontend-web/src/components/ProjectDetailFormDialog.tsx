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
  const [discount, setDiscount] = useState('')
  const [price, setPrice] = useState('')
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
      setDiscount(d.discount != null ? String(d.discount) : '')
      setPrice(d.price != null ? String(d.price) : '')
      setGlossaries(d.glossaries ?? [])
    }
  }, [open, detail, detailQuery.data])

  const reset = () => {
    setTitle(''); setIsPending(false); setCondition(''); setOutcome('')
    setSow(''); setDiscount(''); setPrice(''); setGlossaries([])
  }
  const close = () => { reset(); onClose() }

  const glossaryOpts = (glossaryList ?? []).map((g) => ({ value: g.name, label: g.glossary }))

  const field =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500'

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
      discount: Number(discount) || 0,
      price: Number(price) || 0,
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
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Title<span className="text-red-500"> *</span>
          <input className={field + ' mt-1'} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className="flex items-center justify-between text-sm font-medium text-slate-600 dark:text-slate-300">
          <span>
            Mark as pending
            <span className="mt-0.5 block text-xs font-normal text-slate-400 dark:text-slate-500">
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

        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Current condition
          <RichEditor value={condition} onChange={setCondition} placeholder="Current condition…" />
        </label>

        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Expected outcome
          <RichEditor value={outcome} onChange={setOutcome} placeholder="Expected outcome…" />
        </label>

        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Keterangan di SOW
          <RichEditor value={sow} onChange={setSow} placeholder="Describe the SOW…" />
        </label>

        <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Glossaries
          <MultiSelectChips
            options={glossaryOpts}
            value={glossaries}
            onChange={setGlossaries}
            emptyText="No glossaries for this project yet"
          />
        </div>

        <div className="flex gap-3">
          <label className="flex-1 text-sm font-medium text-slate-600 dark:text-slate-300">
            Discount (Rp)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className={field + ' mt-1'}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </label>
          <label className="flex-1 text-sm font-medium text-slate-600 dark:text-slate-300">
            Price (Rp)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className={field + ' mt-1'}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        </div>
      </div>
      )}
    </Drawer>
  )
}
