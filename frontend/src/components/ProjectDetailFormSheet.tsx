import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { useCreateProjectDetail, useGroups } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { MultiSelectChips } from '@/components/MultiSelectChips'
import { RichEditor } from '@/components/RichEditor'

interface Props {
  open: boolean
  onClose: () => void
  project: string
}

export function ProjectDetailFormSheet({ open, onClose, project }: Props) {
  const toast = useToast()
  const create = useCreateProjectDetail(project)
  const { data: glossaryList } = useGroups(project, open && !!project)
  const [title, setTitle] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [condition, setCondition] = useState('')
  const [outcome, setOutcome] = useState('')
  const [sow, setSow] = useState('')
  const [discount, setDiscount] = useState('')
  const [bonusAmount, setBonusAmount] = useState('')
  const [rewardType, setRewardType] = useState<'Rupiah' | 'Point'>('Rupiah')
  const [glossaries, setGlossaries] = useState<string[]>([])

  const reset = () => {
    setTitle(''); setIsPending(false); setCondition(''); setOutcome('')
    setSow(''); setDiscount(''); setBonusAmount(''); setRewardType('Rupiah'); setGlossaries([])
  }
  const close = () => { reset(); onClose() }

  const glossaryOpts = (glossaryList ?? []).map((g) => ({ value: g.name, label: g.glossary }))

  if (!open) return null

  const field =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500'

  const submit = () => {
    if (!title.trim()) {
      toast('error', 'Title is required')
      return
    }
    create.mutate(
      {
        title: title.trim(),
        is_pending: isPending ? 1 : 0,
        current_condition: condition,
        expected_outcome: outcome,
        keterangan_di_sow: sow,
        reward_type: rewardType,
        discount: Number(discount) || 0,
        bonus_amount: Number(bonusAmount) || 0,
        glossaries: glossaries.map((g) => ({ glossary: g })),
      },
      {
        onSuccess: () => { toast('success', 'Project detail created'); close() },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={close}>
      <div className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">New detail</h3>
          <button onClick={close} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Title<span className="text-red-500"> *</span>
            <input className={field + ' mt-1'} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="flex items-center justify-between text-sm font-medium text-slate-600 dark:text-slate-300">
            <span>
              Mark as pending
              <span className="mt-0.5 block text-xs font-normal text-slate-400 dark:text-slate-500">The deadline follows the project's; status is set automatically from the tasks.</span>
            </span>
            <input type="checkbox" checked={isPending} onChange={(e) => setIsPending(e.target.checked)} className="ml-3 h-5 w-5 shrink-0 accent-brand-600" />
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
            <MultiSelectChips options={glossaryOpts} value={glossaries} onChange={setGlossaries} emptyText="No glossaries for this project yet" />
          </div>

          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Reward type
            <select className={field + ' mt-1'} value={rewardType} onChange={(e) => setRewardType(e.target.value as 'Rupiah' | 'Point')}>
              <option value="Rupiah">Rupiah</option>
              <option value="Point">Point</option>
            </select>
          </label>

          <div className="flex gap-3">
            {rewardType === 'Rupiah' && (
              <label className="flex-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                Discount (Rp)
                <input type="number" inputMode="numeric" min={0} className={field + ' mt-1'} value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </label>
            )}
            <label className="flex-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              {rewardType === 'Point' ? 'Bonus Points' : 'Bonus Amount (Rp)'}
              <input type="number" inputMode="numeric" min={0} className={field + ' mt-1'} value={bonusAmount} onChange={(e) => setBonusAmount(e.target.value)} />
            </label>
          </div>

          <button onClick={submit} disabled={create.isPending}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {create.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Create detail
          </button>
        </div>
      </div>
    </div>
  )
}
