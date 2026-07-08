import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile } from '@web/components/bento'

type HList = { name: string; list_name: string }
type Brand = { name: string; holiday_list?: string }
const inputCls = 'rounded-lg border border-slate-300 dark:border-slate-600 bg-surface px-3 py-2 text-sm'

export default function HolidayLists() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [lists, setLists] = useState<HList[] | null>(null)
  const [brands, setBrands] = useState<Brand[] | null>(null)
  const [listName, setListName] = useState('')
  const [dates, setDates] = useState('') // one ISO date per line

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
    await resource.create('Attendance Holiday List', { list_name: listName, holidays })
    setListName('')
    setDates('')
    load()
  }

  const assign = async (brand: string, holiday_list: string) => {
    await resource.update('Brand', brand, { holiday_list: holiday_list || null })
    load()
  }

  if (blocked) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Holiday Lists</h1>
      <BentoGrid>
        <BentoTile span="lg" tone="plain" title="Create list">
          <div className="flex flex-col gap-2">
            <input className={inputCls} placeholder="List name" value={listName} onChange={(e) => setListName(e.target.value)} />
            <textarea className={inputCls + ' min-h-[120px] font-mono'} placeholder={'2026-08-17\n2026-12-25'} value={dates} onChange={(e) => setDates(e.target.value)} />
            <button onClick={createList} className="inline-flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> Create list</button>
          </div>
          {lists === null ? <Spinner /> : lists.length === 0 ? <EmptyState icon={Plus} title="No lists" subtitle="Create one above." /> : (
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {lists.map((l) => <li key={l.name} className="py-2">{l.list_name}</li>)}
            </ul>
          )}
        </BentoTile>

        <BentoTile span="lg" tone="plain" title="Assign to brands">
          {brands === null ? <Spinner /> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {brands.map((b) => (
                <li key={b.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="font-medium text-ink">{b.name}</span>
                  <SearchableSelect
                    value={b.holiday_list || ''}
                    onChange={(v) => assign(b.name, v)}
                    options={(lists ?? []).map((l) => ({ value: l.name, label: l.list_name }))}
                    placeholder="No holidays"
                    allowClear
                  />
                </li>
              ))}
            </ul>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
