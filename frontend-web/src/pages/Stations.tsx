import { useEffect, useState } from 'react'
import { Plus, Monitor, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable, type Column } from '@web/components/DataTable'

type Station = { name: string; station_name: string; location?: string; active: number; display_key: string }

const inputCls = 'rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink'

// ponytail: columns defined outside component — no closure deps
const COLUMNS: Column<Station>[] = [
  {
    key: 'station_name',
    header: 'Station',
    sortValue: (s) => s.station_name,
    render: (s) => <span className="font-medium text-ink">{s.station_name}</span>,
  },
  {
    key: 'location',
    header: 'Location',
    render: (s) => s.location || '—',
  },
  {
    key: 'active',
    header: 'Active',
    sortValue: (s) => s.active,
    render: (s) => s.active ? 'Yes' : 'No',
  },
  {
    key: 'kiosk',
    header: 'Kiosk',
    render: (s) => (
      <a
        href={`/w/kiosk/${encodeURIComponent(s.name)}?key=${encodeURIComponent(s.display_key)}`}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 text-brand-700 dark:text-brand-300 hover:underline"
      >
        <Monitor className="h-4 w-4" /> Open
      </a>
    ),
  },
]

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
    <Page>
      <PageHeader title="Stations" />

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="slate"><BentoStat value={list?.length ?? 0} label="stations" /></BentoTile>
        <BentoTile span="wide" tone="plain">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Name
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Location
              <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
            <button onClick={create} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              <Plus className="h-4 w-4" /> Add station
            </button>
          </div>
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {list === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            <DataTable
              rows={list}
              columns={COLUMNS}
              getKey={(s) => s.name}
              empty={<EmptyState icon={Monitor} title="No stations" subtitle="Add a station to display its QR." />}
            />
          )}
        </BentoTile>
      </BentoGrid>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
        <RefreshCw className="h-3.5 w-3.5" /> Open the kiosk link on the screen at each station.
      </p>
    </Page>
  )
}
