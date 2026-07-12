import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, UserCheck, UserX } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable, type Column } from '@web/components/DataTable'
import { EntityChip } from '@web/components/EntityChip'
import { SearchableSelect } from '@/components/SearchableSelect'

type Profile = { name: string; user: string; brand: string; enrolled_from: string; active: number }
type Brand = { name: string }
type User = { name: string; full_name?: string }

const inputCls = 'rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function AttendanceProfiles() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [list, setList] = useState<Profile[] | null>(null)
  const [brands, setBrands] = useState<Brand[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [user, setUser] = useState('')
  const [brand, setBrand] = useState('')
  const [enrolledFrom, setEnrolledFrom] = useState(today())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = () =>
    resource
      .list<Profile[]>('Attendance Profile', {
        fields: ['name', 'user', 'brand', 'enrolled_from', 'active'],
        limit: 0,
      })
      .then(setList)
      .catch(() => setList([]))

  useEffect(() => {
    load()
    resource.list<Brand[]>('Brand', { fields: ['name'], limit: 0 }).then(setBrands).catch(() => {})
    resource
      .list<User[]>('User', { filters: { enabled: 1 }, fields: ['name', 'full_name'], limit: 0 })
      .then(setUsers)
      .catch(() => {})
  }, [])

  const enroll = async () => {
    if (!user || !brand || !enrolledFrom) return
    setSaving(true)
    setErr(null)
    try {
      await resource.create('Attendance Profile', { user, brand, enrolled_from: enrolledFrom, active: 1 })
      setUser('')
      setBrand('')
      setEnrolledFrom(today())
      await load()
    } catch (e) {
      setErr(String((e as Error)?.message || 'Could not enrol — is this user already enrolled?'))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (p: Profile) => {
    try {
      await resource.update('Attendance Profile', p.name, { active: p.active ? 0 : 1 })
      await load()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const columns: Column<Profile>[] = [
    {
      key: 'user',
      header: 'Employee',
      sortValue: (p) => p.user,
      render: (p) => <EntityChip avatarName={p.user} label={p.user} />,
    },
    {
      key: 'brand',
      header: 'Brand',
      sortValue: (p) => p.brand,
      render: (p) => p.brand,
    },
    {
      key: 'enrolled_from',
      header: 'Enrolled from',
      sortValue: (p) => p.enrolled_from,
      render: (p) => p.enrolled_from,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <span
          className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${
            p.active
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
              : 'bg-surface text-muted'
          }`}
        >
          {p.active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <button
          onClick={(e) => { e.stopPropagation(); toggleActive(p) }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
        >
          {p.active ? (
            <><UserX className="h-3.5 w-3.5" /> Deactivate</>
          ) : (
            <><UserCheck className="h-3.5 w-3.5" /> Activate</>
          )}
        </button>
      ),
    },
  ]

  if (blocked) return null

  return (
    <Page>
      <PageHeader title="Enrolled Employees" />

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="amber">
          <BentoStat value={list?.length ?? 0} label="enrolled" />
        </BentoTile>

        <BentoTile span="wide" tone="plain" title="Enrol an employee">
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Employee
              <SearchableSelect
                value={user}
                onChange={setUser}
                options={users.map((u) => ({ value: u.name, label: u.full_name ? `${u.full_name} (${u.name})` : u.name }))}
                placeholder="Pick a user…"
                allowClear
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Brand
              <SearchableSelect
                value={brand}
                onChange={setBrand}
                options={brands.map((b) => ({ value: b.name, label: b.name }))}
                placeholder="Pick a brand…"
                allowClear
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Enrolled from
              <input type="date" className={inputCls} value={enrolledFrom} onChange={(e) => setEnrolledFrom(e.target.value)} />
            </label>
            <button
              onClick={enroll}
              disabled={saving || !user || !brand}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Enrol
            </button>
          </div>
          {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
          <p className="mt-2 text-xs text-muted">
            Brand drives which holidays apply. One profile per employee — deactivate to un-enrol.
          </p>
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {list === null ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            <DataTable
              rows={list}
              columns={columns}
              getKey={(p) => p.name}
              empty={<EmptyState icon={UserCheck} title="No one enrolled" subtitle="Enrol an employee to start tracking attendance." />}
            />
          )}
        </BentoTile>
      </BentoGrid>
    </Page>
  )
}
