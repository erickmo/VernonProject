import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Copy, Eye, Users } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useBoot, canManageUsers } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { mobileApi } from '@/lib/api'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { TransferUser } from '@/lib/types'

type Preview = { to_add: { project: string; title: string }[]; skipped_existing: number }

export default function CloneMembershipsScreen() {
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

  const users: TransferUser[] = usersQ.data?.users ?? []
  const nameFor = (u: string) => users.find((x) => x.name === u)?.full_name ?? u

  // Template (B) may be disabled — offboarded colleague is a valid template.
  const fromOptions = useMemo(
    () =>
      users.map((u) => ({
        value: u.name,
        label: `${u.full_name} (${u.name})${u.enabled ? '' : ' — nonaktif'}`,
      })),
    [users],
  )
  // Target (A) must be enabled and differ from B.
  const toOptions = useMemo(
    () =>
      users
        .filter((u) => u.enabled && u.name !== fromName)
        .map((u) => ({ value: u.name, label: `${u.full_name} (${u.name})` })),
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

  const gateBlocked = boot !== undefined && !canManageUsers(boot)
  useEffect(() => {
    if (gateBlocked) navigate('/me', { replace: true })
  }, [gateBlocked, navigate])

  if (bootLoading || gateBlocked) {
    return (
      <DetailScreen title="Salin Keanggotaan Proyek" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  const runPreview = async () => {
    if (!fromName || !toName) return toast('error', 'Pilih karyawan template dan karyawan baru')
    setPreviewing(true)
    try {
      const res = await mobileApi.cloneMemberships(fromName, toName, true)
      setPreview({ to_add: res.to_add ?? [], skipped_existing: res.skipped_existing ?? 0 })
    } catch (e: any) {
      toast('error', e?.message || 'Pratinjau gagal')
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
    } catch (e: any) {
      toast('error', e?.message || 'Gagal menyalin')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!preview && preview.to_add.length > 0

  return (
    <DetailScreen title="Salin Keanggotaan Proyek" right={null}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
        <Users className="h-6 w-6" />
      </div>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Tambahkan karyawan baru ke semua proyek yang diikuti seorang karyawan template — sekaligus,
        tanpa menambah satu per satu. Hanya menambahkan; keanggotaan yang sudah ada tidak diubah.
      </p>

      {usersQ.isLoading ? (
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Salin dari (karyawan template)
              </span>
              <SearchableSelect
                value={fromName}
                onChange={pickFrom}
                options={fromOptions}
                placeholder="Cari karyawan…"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ke (karyawan baru)
              </span>
              <SearchableSelect
                value={toName}
                onChange={pickTo}
                options={toOptions}
                placeholder="Cari karyawan aktif…"
              />
            </label>
          </div>

          {preview && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-sm text-slate-700 dark:text-slate-200 shadow-sm space-y-2">
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
                  <ul className="list-disc pl-5 text-slate-500 dark:text-slate-400">
                    {preview.to_add.slice(0, 12).map((p) => (
                      <li key={p.project}>{p.title}</li>
                    ))}
                    {preview.to_add.length > 12 && <li>…dan {preview.to_add.length - 12} lainnya</li>}
                  </ul>
                </>
              )}
            </div>
          )}

          <button
            onClick={runPreview}
            disabled={previewing || !fromName || !toName}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 py-3 font-semibold text-slate-700 dark:text-slate-200 active:scale-[0.99] disabled:opacity-50"
          >
            {previewing ? <Spinner className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            Pratinjau
          </button>
          <button
            onClick={submit}
            disabled={submitting || !canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white active:scale-[0.99] disabled:opacity-50"
          >
            {submitting ? <Spinner className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Salin ke proyek
          </button>
        </div>
      )}
    </DetailScreen>
  )
}
