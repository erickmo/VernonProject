import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, CalendarDays } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'

type HList = { name: string; list_name: string }
type Brand = { name: string; holiday_list?: string }

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
  const [brands, setBrands] = useState<Brand[] | null>(null)
  const [listName, setListName] = useState('')
  const [dates, setDates] = useState('') // one ISO date per line
  const [saving, setSaving] = useState(false)

  const load = () => {
    resource.list<HList[]>('Attendance Holiday List', { fields: ['name', 'list_name'], limit: 0 }).then(setLists).catch(() => setLists([]))
    resource.list<Brand[]>('Brand', { fields: ['name', 'holiday_list'], limit: 0 }).then(setBrands).catch(() => setBrands([]))
  }
  useEffect(() => {
    load()
  }, [])

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

  const assign = async (brand: string, holiday_list: string) => {
    try {
      await resource.update('Brand', brand, { holiday_list: holiday_list || null })
      load()
      toast('success', 'Saved')
    } catch (e) {
      toast('error', (e as Error).message)
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
                  {l.list_name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={card}>
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Assign to brands</p>
          {brands === null ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : brands.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No brands" subtitle="" />
          ) : (
            <ul className="flex flex-col gap-3 text-sm">
              {brands.map((b) => (
                <li key={b.name} className="flex flex-col gap-1.5">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{b.name}</span>
                  <select
                    className={field}
                    value={b.holiday_list || ''}
                    onChange={(e) => assign(b.name, e.target.value)}
                  >
                    <option value="">No holidays</option>
                    {(lists ?? []).map((l) => (
                      <option key={l.name} value={l.name}>
                        {l.list_name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DetailScreen>
  )
}
