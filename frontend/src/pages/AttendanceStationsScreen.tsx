import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Monitor } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'

type Station = { name: string; station_name: string; location?: string; active: number; display_key: string }

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

export default function AttendanceStationsScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [list, setList] = useState<Station[] | null>(null)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () =>
    resource
      .list<Station[]>('Attendance Station', {
        fields: ['name', 'station_name', 'location', 'active', 'display_key'],
        limit: 0,
      })
      .then(setList)
      .catch(() => setList([]))
  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await resource.create('Attendance Station', { station_name: name, location })
      setName('')
      setLocation('')
      await load()
      toast('success', 'Station added')
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (blocked) return null

  return (
    <DetailScreen title="Stations">
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">New station</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Name</label>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Location</label>
              <input className={field} value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <button
              onClick={create}
              disabled={saving}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {saving ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              Add station
            </button>
          </div>
        </div>

        {list === null ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={Monitor} title="No stations" subtitle="Add a station to display its QR." />
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((s) => (
              <div
                key={s.name}
                className="flex items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-stone-800 dark:text-slate-100">{s.station_name}</p>
                  <p className="truncate text-xs text-stone-400">
                    {s.location || '—'} · {s.active ? 'Active' : 'Inactive'}
                  </p>
                </div>
                <button
                  onClick={() =>
                    (window.location.href =
                      '/w/kiosk/' + encodeURIComponent(s.name) + '?key=' + encodeURIComponent(s.display_key))
                  }
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-brand-700 active:scale-95 dark:bg-slate-700 dark:text-brand-300"
                >
                  <Monitor className="h-4 w-4" /> Open kiosk
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-400">Open the kiosk link on the screen at each station.</p>
      </div>
    </DetailScreen>
  )
}
