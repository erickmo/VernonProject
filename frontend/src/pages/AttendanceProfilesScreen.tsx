import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, UserCheck, UserX } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'

type Profile = { name: string; user: string; brand: string; enrolled_from: string; active: number }
type Brand = { name: string }
type User = { name: string; full_name?: string }

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'
const card =
  'rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function AttendanceProfilesScreen() {
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

  if (blocked) return null

  return (
    <DetailScreen title="Enrolled employees">
      <div className="flex flex-col gap-4">
        {/* Enrol form */}
        <div className={card}>
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Enrol an employee</p>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Employee</span>
              <select className={field} value={user} onChange={(e) => setUser(e.target.value)}>
                <option value="">Pick a user…</option>
                {users.map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.full_name ? `${u.full_name} (${u.name})` : u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Brand</span>
              <select className={field} value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">Pick a brand…</option>
                {brands.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Enrolled from</span>
              <input
                type="date"
                className={field}
                value={enrolledFrom}
                onChange={(e) => setEnrolledFrom(e.target.value)}
              />
            </label>
            <button
              onClick={enroll}
              disabled={saving || !user || !brand}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {saving ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Enrol
            </button>
          </div>
          {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
          <p className="mt-2 text-xs text-slate-400">
            Brand drives which holidays apply. One profile per employee — deactivate to un-enrol.
          </p>
        </div>

        {/* Profiles list */}
        {list === null ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={UserCheck} title="No one enrolled" subtitle="Enrol an employee to start tracking attendance." />
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((p) => (
              <div key={p.name} className={`flex items-center gap-3 ${card}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-stone-800 dark:text-slate-100">{p.user}</p>
                  <p className="truncate text-xs text-stone-400">
                    {p.brand} · from {p.enrolled_from}
                  </p>
                </div>
                <span
                  className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${
                    p.active
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}
                >
                  {p.active ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => toggleActive(p)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 active:scale-95 dark:text-slate-300"
                >
                  {p.active ? (
                    <>
                      <UserX className="h-3.5 w-3.5" /> Deactivate
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5" /> Activate
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </DetailScreen>
  )
}
