import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, Check, Store, RefreshCw } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { MergeIntoCard } from '@/components/MergeIntoCard'
import { deleteErrorMessage } from '@/lib/format'
import { SearchableSelect } from '@/components/SearchableSelect'
import { resource, mobileApi } from '@/lib/api'
import { BRAND_WEEKDAY_KEYS } from '@/lib/types'
import {
  useBrand,
  useBrands,
  useCompanies,
  useCreateBrand,
  useUpdateBrand,
  useDeleteBrand,
  useMergeBrand,
  useBoot,
  canManageBrands,
} from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'
const card =
  'rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type HRow = { name?: string; holiday_date: string; description?: string; is_cuti_bersama?: number }

export default function BrandFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useBrand(name, isEdit)
  const create = useCreateBrand()
  const update = useUpdateBrand()
  const del = useDeleteBrand()
  const merge = useMergeBrand()
  const { data: allBrands } = useBrands()
  const { data: companies } = useCompanies()

  const [form, setForm] = useState<{
    brand_name: string
    company: string
    holiday_list: string
    default_annual_leave_quota: string
  }>({ brand_name: '', company: '', holiday_list: '', default_annual_leave_quota: '' })
  const [minByWeekday, setMinByWeekday] = useState<string[]>(['0', '0', '0', '0', '0', '0', '0'])

  const [hlists, setHlists] = useState<{ name: string; list_name: string }[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [syncing, setSyncing] = useState(false)
  const [rows, setRows] = useState<HRow[] | null>(null)

  useEffect(() => {
    if (isEdit && existing) {
      setForm({
        brand_name: existing.brand_name,
        company: existing.company,
        holiday_list: existing.holiday_list ?? '',
        default_annual_leave_quota: existing.default_annual_leave_quota ? String(existing.default_annual_leave_quota) : '',
      })
      setMinByWeekday(BRAND_WEEKDAY_KEYS.map((k) => String(existing[k] ?? 0)))
    }
  }, [isEdit, existing])

  // Holiday-list options for the picker.
  useEffect(() => {
    resource
      .list<{ name: string; list_name: string }[]>('Attendance Holiday List', { fields: ['name', 'list_name'], limit: 0 })
      .then(setHlists)
      .catch(() => setHlists([]))
  }, [])

  // Read-only rows of the selected list (null = loading / none selected).
  const loadRows = (hl: string) => {
    if (!hl) {
      setRows(null)
      return
    }
    setRows(null)
    resource
      .get<{ holidays?: HRow[] }>('Attendance Holiday List', hl)
      .then((doc) => setRows(doc.holidays ?? []))
      .catch(() => setRows([]))
  }
  useEffect(() => {
    loadRows(form.holiday_list)
  }, [form.holiday_list])

  const doSync = async () => {
    if (!form.holiday_list) return
    setSyncing(true)
    try {
      const r = await mobileApi.syncHolidays(form.holiday_list, year)
      toast('success', `+${r.added} baru, ${r.updated} diperbarui`)
      loadRows(form.holiday_list)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  // Access gate: redirect outside render (useEffect-safe pattern)
  const blocked = !boot ? false : !canManageBrands(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (blocked) return null

  if (isEdit && isLoading) {
    return (
      <DetailScreen title="Brand">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  const validate = (): string | null => {
    if (!form.brand_name.trim()) return 'Brand name is required'
    if (!form.company) return 'Company is required'
    return null
  }

  const save = () => {
    const err = validate()
    if (err) {
      toast('error', err)
      return
    }
    const opts = {
      onSuccess: () => {
        toast('success', isEdit ? 'Brand updated' : 'Brand created')
        navigate('/brands')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    const n = (s: string) => (s === '' ? 0 : Number(s))
    const weekdays = Object.fromEntries(BRAND_WEEKDAY_KEYS.map((k, i) => [k, n(minByWeekday[i])]))
    const cuti = {
      holiday_list: form.holiday_list || null,
      default_annual_leave_quota: n(form.default_annual_leave_quota),
    }
    if (isEdit) update.mutate({ name, payload: { company: form.company, ...weekdays, ...cuti } }, opts)
    else create.mutate({ brand_name: form.brand_name.trim(), company: form.company, ...weekdays, ...cuti }, opts)
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this brand?', confirmLabel: 'Delete', destructive: true })))
      return
    del.mutate(name, {
      onSuccess: () => {
        toast('success', 'Brand deleted')
        navigate('/brands')
      },
      onError: (e) => toast('error', deleteErrorMessage(e, 'brand')),
    })
  }

  const doMerge = (target: string) =>
    merge.mutate(
      { source: name, target },
      {
        onSuccess: () => {
          toast('success', 'Brands merged')
          navigate('/brands')
        },
        onError: (e) => toast('error', (e as Error).message),
      },
    )

  const mergeOptions = (allBrands ?? [])
    .filter((b) => b.name !== name)
    .map((b) => ({ value: b.name, label: b.brand_name }))

  const saving = create.isPending || update.isPending

  return (
    <DetailScreen title={isEdit ? 'Edit brand' : 'New brand'}>
      <div className="flex flex-col gap-4">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400">
          <Store className="h-6 w-6" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Brand name</label>
          <input
            className={field + (isEdit ? ' bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' : '')}
            value={form.brand_name}
            readOnly={isEdit}
            onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value }))}
            placeholder="e.g. Acme"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Company</label>
          <SearchableSelect
            value={form.company}
            onChange={(v) => setForm((f) => ({ ...f, company: v }))}
            options={(companies ?? []).map((c) => ({ value: c.name, label: c.company_name }))}
            placeholder="Select a company…"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
            Minimum minutes per weekday
          </label>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            0 = this brand does not work that day (no recurring todos land there).
          </p>
          <div className="grid grid-cols-2 gap-2">
            {WEEKDAY_LABELS.map((lbl, i) => (
              <label key={lbl} className="flex items-center gap-2">
                <span className="w-9 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">{lbl}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className={field}
                  value={minByWeekday[i]}
                  onChange={(e) => setMinByWeekday((m) => m.map((v, k) => (k === i ? e.target.value : v)))}
                  placeholder="0"
                />
              </label>
            ))}
          </div>
        </div>

        <div className={card + ' flex flex-col gap-4'}>
          <p className="text-sm font-bold text-stone-800 dark:text-slate-100">Cuti & Libur</p>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Daftar libur</label>
            <SearchableSelect
              value={form.holiday_list}
              onChange={(v) => setForm((f) => ({ ...f, holiday_list: v }))}
              options={hlists.map((l) => ({ value: l.name, label: l.list_name }))}
              placeholder="Tanpa daftar libur"
              allowClear
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
              Kuota cuti tahunan
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className={field}
              value={form.default_annual_leave_quota}
              onChange={(e) => setForm((f) => ({ ...f, default_annual_leave_quota: e.target.value }))}
              placeholder="0"
            />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">0 = pakai default 12 hari</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              aria-label="Sync year"
              className={field + ' w-24 shrink-0'}
              value={String(year)}
              onChange={(e) => setYear(e.target.value === '' ? new Date().getFullYear() : Number(e.target.value))}
            />
            <button
              onClick={doSync}
              disabled={!form.holiday_list || syncing}
              className="flex shrink-0 items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {syncing ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync {year}
            </button>
          </div>

          {form.holiday_list && (
            <div className="rounded-xl bg-paper-line p-2 dark:bg-slate-900/40">
              {rows === null ? (
                <div className="flex justify-center py-4">
                  <Spinner className="h-4 w-4" />
                </div>
              ) : rows.length === 0 ? (
                <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">Belum ada hari libur.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {rows.map((h, i) => (
                    <li key={h.name ?? i} className="flex items-center gap-2 px-1 py-1 text-xs">
                      <span className="w-24 shrink-0 font-mono text-slate-600 dark:text-slate-300">{h.holiday_date}</span>
                      <span className="min-w-0 flex-1 truncate text-stone-700 dark:text-slate-200">{h.description}</span>
                      {!!h.is_cuti_bersama && (
                        <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-600/20 dark:text-brand-300">
                          Cuti Bersama
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {isEdit ? 'Save changes' : 'Create brand'}
        </button>

        {isEdit && (
          <button
            onClick={remove}
            disabled={del.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-sm active:bg-rose-50 disabled:opacity-60 dark:bg-slate-800 dark:active:bg-rose-500/15"
          >
            {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete brand
          </button>
        )}

        {isEdit && mergeOptions.length > 0 && (
          <MergeIntoCard
            entity="brand"
            currentLabel={existing?.brand_name || name}
            options={mergeOptions}
            isPending={merge.isPending}
            onConfirm={doMerge}
          />
        )}
      </div>
    </DetailScreen>
  )
}
