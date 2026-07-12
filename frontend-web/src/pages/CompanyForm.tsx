import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { safeDecode } from '@web/lib/route'
import { ArrowLeft, Trash2, Check } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
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
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

export default function CompanyForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? safeDecode(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useCompany(name, isEdit)
  const create = useCreateCompany()
  const del = useDeleteCompany()
  const merge = useMergeCompany()
  const { data: allCompanies } = useCompanies()

  const [companyName, setCompanyName] = useState('')
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')

  const blocked = !boot ? false : !canManageCompanies(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (blocked) return null

  if (isEdit && isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (isEdit && !isLoading && !existing) {
    return (
      <ErrorState
        title="Not found"
        subtitle="This company could not be found. It may have been deleted."
        onRetry={() => navigate('/companies')}
      />
    )
  }

  const displayName = isEdit ? existing?.company_name || name : companyName

  const goBack = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Leave without saving?',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
      })
      if (!ok) return
    }
    navigate('/companies')
  }

  const save = () => {
    if (!companyName.trim()) {
      setError('Company name is required')
      toast('error', 'Company name is required')
      return
    }
    setError('')
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
    <div className="space-y-6">
      <div>
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 mb-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Companies
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{isEdit ? 'Edit company' : 'New company'}</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!isEdit) save()
        }}
      >
        <BentoGrid>
          {/* Field tile */}
          <BentoTile span="lg" tone="plain" title="Company details">
            <div className="mt-1 max-w-md space-y-4">
              <Field
                label="Company name"
                required
                error={error}
                hint={isEdit ? "Can't be changed after creation" : undefined}
              >
                {(id) => (
                  <input
                    id={id}
                    className={field + (isEdit ? ' bg-canvas text-muted' : '')}
                    value={displayName}
                    readOnly={isEdit}
                    autoFocus={!isEdit}
                    onChange={(e) => {
                      setCompanyName(e.target.value)
                      setDirty(true)
                      if (error) setError('')
                    }}
                    placeholder="e.g. Acme Inc"
                  />
                )}
              </Field>

              {!isEdit && (
                <button
                  type="submit"
                  disabled={create.isPending}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
                >
                  {create.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  Create company
                </button>
              )}
            </div>
          </BentoTile>

          {/* Preview / summary tile */}
          <BentoTile span="sm" tone="tint" accent="brand" title="Preview">
            <div className="mt-1 space-y-2">
              <p className="text-lg font-bold text-ink truncate">
                {displayName || <span className="opacity-40">Untitled</span>}
              </p>
              <p className="text-xs text-muted">Company</p>
            </div>
          </BentoTile>

          {/* Danger zone (edit only) */}
          {isEdit && (
            <BentoTile span="md" tone="plain" title="Danger zone">
              <div className="mt-1 space-y-4">
                <button
                  type="button"
                  onClick={remove}
                  disabled={del.isPending}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-surface py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/30 dark:hover:bg-rose-500/10 transition-colors"
                >
                  {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete company
                </button>

                {mergeOptions.length > 0 && (
                  <MergeIntoCard
                    entity="company"
                    currentLabel={existing?.company_name || name}
                    options={mergeOptions}
                    isPending={merge.isPending}
                    onConfirm={doMerge}
                  />
                )}
              </div>
            </BentoTile>
          )}
        </BentoGrid>
      </form>
    </div>
  )
}
