import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCw, ChevronDown } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource, mobileApi } from '@/lib/api'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { DatePicker } from '@web/components/DatePicker'

type HList = { name: string; list_name: string }
type HolidayRow = { name?: string; holiday_date: string; description?: string; is_cuti_bersama?: number }
type HListDoc = { name: string; list_name: string; holidays: HolidayRow[] }

const inputCls = 'rounded-xl border border-line dark:border-slate-600 bg-surface px-3 py-2 text-sm'
const btnCls = 'inline-flex items-center justify-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.97] transition disabled:opacity-60'

export default function HolidayLists() {
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

  const curYear = new Date().getFullYear()
  const [years, setYears] = useState<Record<string, number>>({})
  const yearOf = (n: string) => years[n] ?? curYear
  const [syncing, setSyncing] = useState<string | null>(null)

  // Row viewer for one expanded list.
  const [expanded, setExpanded] = useState<string | null>(null)
  const [rows, setRows] = useState<HolidayRow[] | null>(null)
  const [newDate, setNewDate] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCuti, setNewCuti] = useState(false)

  const load = () => {
    resource.list<HList[]>('Attendance Holiday List', { fields: ['name', 'list_name'], limit: 0 }).then(setLists).catch(() => setLists([]))
  }
  useEffect(() => {
    load()
  }, [])

  const loadRows = (name: string) => {
    setRows(null)
    resource.get<HListDoc>('Attendance Holiday List', name).then((d) => setRows(d.holidays || [])).catch(() => setRows([]))
  }
  const toggleExpand = (name: string) => {
    if (expanded === name) {
      setExpanded(null)
      setRows(null)
    } else {
      setExpanded(name)
      setNewDate(''); setNewDesc(''); setNewCuti(false)
      loadRows(name)
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

  const sync = async (name: string) => {
    const year = yearOf(name)
    setSyncing(name)
    try {
      const r = await mobileApi.syncHolidays(name, year)
      toast('success', `Sync ${year}: +${r.added} added, ${r.updated} updated`)
      if (expanded === name) loadRows(name)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSyncing(null)
    }
  }

  const setRowCuti = async (listName_: string, rowName: string, val: boolean) => {
    if (!rows) return
    const next = rows.map((r) => (r.name === rowName ? { ...r, is_cuti_bersama: val ? 1 : 0 } : r))
    setRows(next) // optimistic
    try {
      await resource.update('Attendance Holiday List', listName_, { holidays: next })
    } catch (e) {
      toast('error', (e as Error).message)
      loadRows(listName_) // revert to server truth
    }
  }

  const addRow = async (listName_: string) => {
    if (!newDate || !rows) return
    const next = [...rows, { holiday_date: newDate, description: newDesc || undefined, is_cuti_bersama: newCuti ? 1 : 0 }]
    try {
      await resource.update('Attendance Holiday List', listName_, { holidays: next })
      setNewDate(''); setNewDesc(''); setNewCuti(false)
      loadRows(listName_)
      toast('success', 'Row added')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  if (blocked) return null

  const badge = 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Holiday Lists</h1>
      <BentoGrid>
        <BentoTile span="lg" tone="plain" title="Create list">
          <div className="flex flex-col gap-2">
            <input className={inputCls} placeholder="List name" value={listName} onChange={(e) => setListName(e.target.value)} />
            <textarea className={inputCls + ' min-h-[120px] font-mono'} placeholder={'2026-08-17\n2026-12-25'} value={dates} onChange={(e) => setDates(e.target.value)} />
            <button onClick={createList} disabled={saving || !listName.trim()} className={btnCls}>{saving ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Create list</button>
          </div>
        </BentoTile>

        <BentoTile span="full" tone="plain" title="Holiday lists" subtitle="Sync from calendar, view rows & mark cuti bersama">
          {lists === null ? <Spinner /> : lists.length === 0 ? <EmptyState icon={Plus} title="No lists" subtitle="Create one above." /> : (
            <ul className="divide-y divide-line dark:divide-slate-800 text-sm">
              {lists.map((l) => (
                <li key={l.name} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button onClick={() => toggleExpand(l.name)} className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
                      <ChevronDown className={'h-4 w-4 shrink-0 transition ' + (expanded === l.name ? 'rotate-180' : '')} />
                      <span className="truncate">{l.list_name}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <input
                        type="number"
                        value={yearOf(l.name)}
                        onChange={(e) => setYears((y) => ({ ...y, [l.name]: Number(e.target.value) || curYear }))}
                        className={inputCls + ' w-24'}
                      />
                      <button onClick={() => sync(l.name)} disabled={syncing === l.name} className={btnCls}>
                        {syncing === l.name ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />} Sync {yearOf(l.name)}
                      </button>
                    </div>
                  </div>

                  {expanded === l.name && (
                    <div className="mt-3 rounded-xl border border-line dark:border-slate-700 p-3">
                      {rows === null ? <div className="flex justify-center py-4"><Spinner /></div> : (
                        <>
                          {rows.length === 0 ? (
                            <p className="py-2 text-xs text-muted">No holidays yet. Sync a year or add one below.</p>
                          ) : (
                            <ul className="divide-y divide-line dark:divide-slate-800">
                              {rows.map((r, i) => (
                                <li key={r.name || i} className="flex items-center justify-between gap-2 py-1.5">
                                  <div className="min-w-0">
                                    <span className="font-mono text-xs text-muted">{r.holiday_date}</span>
                                    {r.description && <span className="ml-2 text-ink">{r.description}</span>}
                                    {!!r.is_cuti_bersama && <span className={badge + ' ml-2'}>Cuti Bersama</span>}
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={!!r.is_cuti_bersama}
                                    disabled={!r.name}
                                    aria-label="Mark as cuti bersama"
                                    onChange={(e) => r.name && setRowCuti(l.name, r.name, e.target.checked)}
                                    className="h-4 w-4 shrink-0 accent-brand-600"
                                  />
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line dark:border-slate-800 pt-3">
                            <DatePicker value={newDate} onChange={setNewDate} placeholder="Date" className={inputCls + ' w-40'} />
                            <input className={inputCls + ' flex-1 min-w-[8rem]'} placeholder="Description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink">
                              <input type="checkbox" checked={newCuti} onChange={(e) => setNewCuti(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                              Cuti bersama
                            </label>
                            <button onClick={() => addRow(l.name)} disabled={!newDate} className={btnCls}><Plus className="h-4 w-4" /> Add</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
