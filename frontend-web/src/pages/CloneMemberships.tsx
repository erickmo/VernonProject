import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Copy, Eye } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { useBoot, canManageUsers } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { mobileApi } from '@/lib/api'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { TransferUser } from '@/lib/types'

type Preview = { to_add: { project: string; title: string }[]; skipped_existing: number }

export default function CloneMemberships() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const toast = useToast()

  const usersQ = useQuery({
    queryKey: ['transferUsers'],
    queryFn: () => mobileApi.listTransferUsers(),
    enabled: canManageUsers(boot),
  })

  const [fromName, setFromName] = useState('') // B — template
  const [toName, setToName] = useState('') // A — new employee
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const users = usersQ.data?.users ?? []
  const nameFor = (u: string) => users.find((x: TransferUser) => x.name === u)?.full_name ?? u

  const fromOptions = useMemo(
    () =>
      users.map((u: TransferUser) => ({
        value: u.name,
        label: `${u.full_name} (${u.name})${u.enabled ? '' : ' — nonaktif'}`,
      })),
    [users],
  )
  const toOptions = useMemo(
    () =>
      users
        .filter((u: TransferUser) => u.enabled && u.name !== fromName)
        .map((u: TransferUser) => ({ value: u.name, label: `${u.full_name} (${u.name})` })),
    [users, fromName],
  )

  const pickFrom = (v: string) => {
    setFromName(v)
    if (v === toName) setToName('')
    setPreview(null)
  }
  const pickTo = (v: string) => {
    setToName(v)
    setPreview(null)
  }

  const blockedAccess = boot !== undefined && !canManageUsers(boot)
  useEffect(() => {
    if (blockedAccess) navigate('/me', { replace: true })
  }, [blockedAccess, navigate])

  if (bootLoading || blockedAccess) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const runPreview = async () => {
    if (!fromName || !toName) return toast('error', 'Pilih karyawan template dan karyawan baru')
    setPreviewing(true)
    try {
      const res = await mobileApi.cloneMemberships(fromName, toName, true)
      setPreview({ to_add: res.to_add ?? [], skipped_existing: res.skipped_existing ?? 0 })
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Pratinjau gagal')
    } finally {
      setPreviewing(false)
    }
  }

  const submit = async () => {
    if (!preview || submitting || !preview.to_add.length) return
    setSubmitting(true)
    try {
      const res = await mobileApi.cloneMemberships(fromName, toName)
      toast('success', `${nameFor(toName)} ditambahkan ke ${res.added?.length ?? 0} proyek.`)
      setFromName('')
      setToName('')
      setPreview(null)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Gagal menyalin')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!preview && preview.to_add.length > 0

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="space-y-6 max-w-2xl"
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Salin Keanggotaan Proyek</h1>
        <p className="mt-1 text-sm text-muted">
          Tambahkan karyawan baru ke semua proyek yang diikuti seorang karyawan template —
          sekaligus, tanpa menambah satu per satu. Hanya menambahkan; keanggotaan yang sudah ada
          tidak diubah.
        </p>
      </div>

      <div className="rounded-2xl bg-surface p-6 shadow-card space-y-5">
        {usersQ.isError ? (
          <ErrorState onRetry={() => usersQ.refetch()} />
        ) : usersQ.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <Field label="Salin dari (karyawan template)" required>
              {(id) => (
                <div id={id}>
                  <SearchableSelect
                    value={fromName}
                    onChange={pickFrom}
                    options={fromOptions}
                    placeholder="Cari karyawan…"
                  />
                </div>
              )}
            </Field>

            <Field label="Ke (karyawan baru)" required>
              {(id) => (
                <div id={id}>
                  <SearchableSelect
                    value={toName}
                    onChange={pickTo}
                    options={toOptions}
                    placeholder="Cari karyawan aktif…"
                  />
                </div>
              )}
            </Field>
          </>
        )}

        {preview && (
          <div className="rounded-xl border border-line bg-hover px-4 py-3 text-sm text-ink space-y-2">
            {preview.to_add.length === 0 ? (
              <span>
                {nameFor(toName)} sudah tergabung di semua proyek {nameFor(fromName)} — tidak ada
                yang perlu ditambahkan.
              </span>
            ) : (
              <>
                <span>
                  <b>{preview.to_add.length}</b> proyek akan ditambahkan untuk {nameFor(toName)}
                  {preview.skipped_existing > 0
                    ? ` (${preview.skipped_existing} sudah tergabung)`
                    : ''}
                  .
                </span>
                <ul className="list-disc pl-5 text-muted">
                  {preview.to_add.slice(0, 12).map((p) => (
                    <li key={p.project}>{p.title}</li>
                  ))}
                  {preview.to_add.length > 12 && <li>…dan {preview.to_add.length - 12} lainnya</li>}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={runPreview}
            disabled={previewing || !fromName || !toName}
            className="inline-flex items-center gap-2 rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:bg-hover disabled:opacity-60 transition active:scale-[0.99]"
          >
            {previewing ? <Spinner className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            Pratinjau
          </button>
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition active:scale-[0.99]"
          >
            {submitting ? <Spinner className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Salin ke proyek
          </button>
        </div>
      </div>
    </form>
  )
}
