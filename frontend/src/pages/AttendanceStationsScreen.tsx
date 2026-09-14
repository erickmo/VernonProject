import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Monitor, Pencil } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { useStationNetworks } from '@/hooks/useStationNetworks'
import { resource } from '@/lib/api'
import { STATION_FIELDS, type Station } from '@/lib/stations'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

/** dk0otn66u1: the network a station's kiosk must be on. Empty = any network. */
function NetworksEditor({ station }: { station: Station }) {
  const n = useStationNetworks(station)
  return (
    <div className="mt-3 border-t border-paper-edge pt-3 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Allowed networks</p>
        {n.draft === null && (
          <button
            onClick={n.edit}
            aria-label={`Edit allowed networks for ${station.station_name}`}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 active:scale-95 dark:text-brand-300"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        )}
      </div>
      {n.draft === null ? (
        <p className={`mt-1 whitespace-pre-line font-mono text-xs ${n.value ? 'text-stone-700 dark:text-slate-200' : 'text-stone-400'}`}>
          {n.value || 'Any network'}
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            autoFocus
            aria-label={`Allowed networks for ${station.station_name}`}
            className={`${field} min-h-[5rem] font-mono text-xs`}
            placeholder={'203.0.113.7\n10.0.0.0/24'}
            value={n.draft}
            onChange={(e) => n.setDraft(e.target.value)}
          />
          <p className="text-[11px] leading-relaxed text-slate-400">
            One IP or CIDR per line. Empty = any network. A blocked kiosk shows the IP to add.
          </p>
          <div className="flex gap-2">
            <button
              onClick={n.save}
              disabled={n.saving}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {n.saving && <Spinner className="h-4 w-4" />} Save
            </button>
            <button
              onClick={n.cancel}
              className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 active:scale-95 dark:bg-slate-700 dark:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

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
        fields: STATION_FIELDS,
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
                className="rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex items-center gap-3">
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
                <NetworksEditor station={s} />
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-400">
          Open the kiosk link on the screen at each station. If it is blocked, it shows the network to add under Allowed networks.
        </p>
      </div>
    </DetailScreen>
  )
}
