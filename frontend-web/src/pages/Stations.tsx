import { useEffect, useState } from 'react'
import { Plus, Monitor, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'

type Station = { name: string; station_name: string; location?: string; active: number; display_key: string }

export default function Stations() {
  const navigate = useNavigate()
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
      .list<Station[]>('Attendance Station', { fields: ['name', 'station_name', 'location', 'active', 'display_key'], limit: 0 })
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
    } finally {
      setSaving(false)
    }
  }

  if (blocked) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Stations</h1>
      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="slate"><BentoStat value={list?.length ?? 0} label="stations" /></BentoTile>
        <BentoTile span="wide" tone="plain">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">Name
              <input className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">Location
              <input className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
            <button onClick={create} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              <Plus className="h-4 w-4" /> Add station
            </button>
          </div>
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {list === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : list.length === 0 ? (
            <EmptyState icon={Monitor} title="No stations" subtitle="Add a station to display its QR." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-2.5">Station</th><th className="px-4 py-2.5">Location</th><th className="px-4 py-2.5">Active</th><th className="px-4 py-2.5">Kiosk</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.map((s) => (
                    <tr key={s.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{s.station_name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{s.location || '—'}</td>
                      <td className="px-4 py-2.5">{s.active ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-2.5">
                        <a
                          href={`/w/kiosk/${encodeURIComponent(s.name)}?key=${encodeURIComponent(s.display_key)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-brand-700 dark:text-brand-300 hover:underline"
                        >
                          <Monitor className="h-4 w-4" /> Open
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </BentoTile>
      </BentoGrid>
      <p className="flex items-center gap-1.5 text-xs text-slate-400"><RefreshCw className="h-3.5 w-3.5" /> Open the kiosk link on the screen at each station.</p>
    </div>
  )
}
