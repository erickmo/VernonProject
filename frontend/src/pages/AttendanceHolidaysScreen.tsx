import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, CalendarDays, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource, mobileApi } from '@/lib/api'

type HList = { name: string; list_name: string }
type HRow = { name?: string; holiday_date: string; description?: string; is_cuti_bersama?: number }

const CURRENT_YEAR = new Date().getFullYear()

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'
const card =
  'rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800'

export default function AttendanceHolidaysScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [lists, setLists] = useState<HList[] | null>(null)
  const [listName, setListName] = useState('')
  const [dates, setDates] = useState('') // one ISO date per line
  const [saving, setSaving] = useState(false)

  // Per-list: sync year, expanded state, loaded holiday rows, sync-in-flight name.
  const [year, setYear] = useState<Record<string, number>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<string, HRow[]>>({})
  const [syncing, setSyncing] = useState<string | null>(null)
  // Add-row form (for the currently expanded list).
  const [newDate, setNewDate] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCuti, setNewCuti] = useState(false)

  const load = () => {
    resource.list<HList[]>('Attendance Holiday List', { fields: ['name', 'list_name'], limit: 0 }).then(setLists).catch(() => setLists([]))
  }
  useEffect(() => {
    load()
  }, [])

  const loadRows = async (name: string) => {
    try {
      const doc = await resource.get<{ holidays?: HRow[] }>('Attendance Holiday List', name)
      setRows((r) => ({ ...r, [name]: doc.holidays ?? [] }))
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const toggleExpand = (name: string) => {
    if (expanded === name) {
      setExpanded(null)
      return
    }
    setExpanded(name)
    setNewDate('')
    setNewDesc('')
    setNewCuti(false)
    if (!rows[name]) loadRows(name)
  }

  const sync = async (name: string) => {
    const y = year[name] ?? CURRENT_YEAR
    setSyncing(name)
    try {
      const r = await mobileApi.syncHolidays(name, y)
      toast('success', `Sync ${y}: +${r.added} baru, ${r.updated} diperbarui`)
      if (expanded === name || rows[name]) await loadRows(name)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSyncing(null)
    }
  }

  // Save the whole holidays child table (loaded rows carry their `name`, new rows don't).
  const saveRows = async (name: string, next: HRow[]) => {
    await resource.update('Attendance Holiday List', name, { holidays: next })
    setRows((r) => ({ ...r, [name]: next }))
  }

  const addRow = async (name: string) => {
    if (!newDate.trim()) return
    const next = [
      ...(rows[name] ?? []),
      { holiday_date: newDate.trim(), description: newDesc.trim(), is_cuti_bersama: newCuti ? 1 : 0 },
    ]
    try {
      await saveRows(name, next)
      setNewDate('')
      setNewDesc('')
      setNewCuti(false)
      toast('success', 'Baris ditambahkan')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const toggleRowCuti = async (name: string, idx: number) => {
    const next = (rows[name] ?? []).map((r, k) =>
      k === idx ? { ...r, is_cuti_bersama: r.is_cuti_bersama ? 0 : 1 } : r,
    )
    try {
      await saveRows(name, next)
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const createList = async () => {
    if (!listName.trim()) return
    const holidays = dates
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((d) => ({ holiday_date: d }))
    setSaving(true)
    try {
      await resource.create('Attendance Holiday List', { list_name: listName, holidays })
      setListName('')
      setDates('')
      load()
      toast('success', 'List created')
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (blocked) return null

  return (
    <DetailScreen title="Holidays">
      <div className="flex flex-col gap-5">
        <div className={card}>
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Create list</p>
          <div className="flex flex-col gap-2">
            <input
              className={field}
              placeholder="List name"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
            />
            <textarea
              className={field + ' min-h-[120px] font-mono'}
              placeholder={'2026-08-17\n2026-12-25'}
              value={dates}
              onChange={(e) => setDates(e.target.value)}
            />
            <button
              onClick={createList}
              disabled={saving || !listName.trim()}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {saving ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Create list
            </button>
          </div>

          {lists === null ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : lists.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No lists" subtitle="Create one above." />
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 text-sm dark:divide-slate-700">
              {lists.map((l) => (
                <li key={l.name} className="py-2 text-stone-700 dark:text-slate-200">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleExpand(l.name)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium active:opacity-70"
                    >
                      {expanded === l.name ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                      <span className="truncate">{l.list_name}</span>
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      aria-label="Sync year"
                      className={field + ' w-20 shrink-0'}
                      value={String(year[l.name] ?? CURRENT_YEAR)}
                      onChange={(e) =>
                        setYear((y) => ({ ...y, [l.name]: e.target.value === '' ? CURRENT_YEAR : Number(e.target.value) }))
                      }
                    />
                    <button
                      onClick={() => sync(l.name)}
                      disabled={syncing === l.name}
                      className="flex shrink-0 items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white active:scale-95 disabled:opacity-60"
                    >
                      {syncing === l.name ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Sync {year[l.name] ?? CURRENT_YEAR}
                    </button>
                  </div>

                  {expanded === l.name && (
                    <div className="mt-2 rounded-xl bg-paper-line p-2 dark:bg-slate-900/40">
                      {rows[l.name] === undefined ? (
                        <div className="flex justify-center py-4">
                          <Spinner className="h-4 w-4" />
                        </div>
                      ) : rows[l.name].length === 0 ? (
                        <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">No holidays yet.</p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {rows[l.name].map((h, i) => (
                            <li key={h.name ?? i} className="flex items-center gap-2 px-1 py-1 text-xs">
                              <span className="w-24 shrink-0 font-mono text-slate-600 dark:text-slate-300">{h.holiday_date}</span>
                              <span className="min-w-0 flex-1 truncate text-stone-700 dark:text-slate-200">{h.description}</span>
                              <button
                                onClick={() => toggleRowCuti(l.name, i)}
                                className={
                                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold active:scale-95 ' +
                                  (h.is_cuti_bersama
                                    ? 'bg-brand-100 text-brand-700 dark:bg-brand-600/20 dark:text-brand-300'
                                    : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500')
                                }
                                title="Toggle Cuti Bersama"
                              >
                                Cuti Bersama
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Add a holiday row by hand (with cuti-bersama toggle). */}
                      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-paper-edge pt-2 dark:border-slate-700">
                        <input
                          type="date"
                          className={field + ' w-36'}
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                        />
                        <input
                          className={field + ' min-w-0 flex-1'}
                          placeholder="Description"
                          value={newDesc}
                          onChange={(e) => setNewDesc(e.target.value)}
                        />
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-brand-600"
                            checked={newCuti}
                            onChange={(e) => setNewCuti(e.target.checked)}
                          />
                          Cuti Bersama
                        </label>
                        <button
                          onClick={() => addRow(l.name)}
                          disabled={!newDate.trim()}
                          className="flex shrink-0 items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white active:scale-95 disabled:opacity-60"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DetailScreen>
  )
}
