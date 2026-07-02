import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, Check, Building2 } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { MergeIntoCard } from '@/components/MergeIntoCard'
import { deleteErrorMessage } from '@/lib/format'
import {
  useCompany,
  useCompanies,
  useCreateCompany,
  useDeleteCompany,
  useMergeCompany,
  useBoot,
  canManageCompanies,
} from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function CompanyFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useCompany(name, isEdit)
  const create = useCreateCompany()
  const del = useDeleteCompany()
  const merge = useMergeCompany()
  const { data: allCompanies } = useCompanies()

  const [companyName, setCompanyName] = useState('')

  const blocked = !boot ? false : !canManageCompanies(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (blocked) return null

  if (isEdit && isLoading) {
    return (
      <DetailScreen title="Company">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  const displayName = isEdit ? existing?.company_name || name : companyName

  const save = () => {
    if (!companyName.trim()) {
      toast('error', 'Company name is required')
      return
    }
    create.mutate(
      { company_name: companyName.trim() },
      {
        onSuccess: () => {
          toast('success', 'Company created')
          navigate('/companies')
        },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this company?', confirmLabel: 'Delete', destructive: true })))
      return
    del.mutate(name, {
      onSuccess: () => {
        toast('success', 'Company deleted')
        navigate('/companies')
      },
      onError: (e) => toast('error', deleteErrorMessage(e, 'company')),
    })
  }

  const doMerge = (target: string) =>
    merge.mutate(
      { source: name, target },
      {
        onSuccess: () => {
          toast('success', 'Companies merged')
          navigate('/companies')
        },
        onError: (e) => toast('error', (e as Error).message),
      },
    )

  const mergeOptions = (allCompanies ?? [])
    .filter((c) => c.name !== name)
    .map((c) => ({ value: c.name, label: c.company_name }))

  return (
    <DetailScreen title={isEdit ? 'Company' : 'New company'}>
      <div className="flex flex-col gap-4">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
          <Building2 className="h-6 w-6" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Company name</label>
          <input
            className={field + (isEdit ? ' bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' : '')}
            value={isEdit ? displayName : companyName}
            readOnly={isEdit}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Acme Inc"
          />
        </div>

        {!isEdit && (
          <button
            onClick={save}
            disabled={create.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
          >
            {create.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            Create company
          </button>
        )}

        {isEdit && (
          <button
            onClick={remove}
            disabled={del.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-sm active:bg-rose-50 disabled:opacity-60 dark:bg-slate-800 dark:active:bg-rose-500/15"
          >
            {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete company
          </button>
        )}

        {isEdit && mergeOptions.length > 0 && (
          <MergeIntoCard
            entity="company"
            currentLabel={existing?.company_name || name}
            options={mergeOptions}
            isPending={merge.isPending}
            onConfirm={doMerge}
          />
        )}
      </div>
    </DetailScreen>
  )
}
