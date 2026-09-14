import { useEffect, useState } from 'react'
import { Plus, Monitor, RefreshCw, Pencil } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { useStationNetworks } from '@/hooks/useStationNetworks'
import { resource } from '@/lib/api'
import { STATION_FIELDS, type Station } from '@/lib/stations'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable, type Column } from '@web/components/DataTable'

const inputCls = 'rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink'

/** dk0otn66u1: the network a station's kiosk must be on. Empty = any network. */
function NetworksCell({ station }: { station: Station }) {
  const n = useStationNetworks(station)
  if (n.draft === null) {
    return (
      <div className="flex items-start gap-2" onClick={(e) => e.stopPropagation()}>
        <span className={`whitespace-pre-line font-mono text-xs ${n.value ? 'text-ink' : 'text-muted'}`}>
          {n.value || 'Any network'}
        </span>
        <button
          onClick={n.edit}
          aria-label={`Edit allowed networks for ${station.station_name}`}
          className="rounded-lg p-1 text-muted transition hover:bg-line/60 hover:text-ink"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }
  return (
    <div className="flex min-w-[15rem] flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      <textarea
        autoFocus
        aria-label={`Allowed networks for ${station.station_name}`}
        className={`${inputCls} min-h-[4.5rem] font-mono text-xs`}
        placeholder={'203.0.113.7\n10.0.0.0/24'}
        value={n.draft}
        onChange={(e) => n.setDraft(e.target.value)}
      />
      <p className="text-xs text-muted">One IP or CIDR per line. Empty = any network. A blocked kiosk shows the IP to add.</p>
      <div className="flex gap-2">
        <button
          onClick={n.save}
          disabled={n.saving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {n.saving && <Spinner className="h-3.5 w-3.5" />} Save
        </button>
        <button onClick={n.cancel} className="rounded-xl border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  )
}

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
    key: 'allowed_networks',
    header: 'Allowed networks',
    render: (s) => <NetworksCell station={s} />,
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
      .list<Station[]>('Attendance Station', { fields: STATION_FIELDS, limit: 0 })
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
    <Page>
      <PageHeader title="Stations" />

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="brand"><BentoStat value={list?.length ?? 0} label="stations" /></BentoTile>
        <BentoTile span="wide" tone="plain">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Name
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Location
              <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
            <button onClick={create} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.97] transition disabled:opacity-50">
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
        <RefreshCw className="h-3.5 w-3.5" /> Open the kiosk link on the screen at each station. If it is blocked, it shows the network to add under Allowed networks.
      </p>
    </Page>
  )
}
