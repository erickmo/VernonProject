import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, UserCheck, UserX } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'

type Profile = { name: string; user: string; brand: string; enrolled_from: string; active: number }
type Brand = { name: string }
type User = { name: string; full_name?: string }

const inputCls = 'rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function AttendanceProfiles() {
  const navigate = useNavigate()
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
    await resource.update('Attendance Profile', p.name, { active: p.active ? 0 : 1 })
    load()
  }

  if (blocked) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Enrolled Employees</h1>
      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent="slate">
          <BentoStat value={list?.length ?? 0} label="enrolled" />
        </BentoTile>

        <BentoTile span="wide" tone="plain" title="Enrol an employee">
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              Employee
              <select className={inputCls} value={user} onChange={(e) => setUser(e.target.value)}>
                <option value="">Pick a user…</option>
                {users.map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.full_name ? `${u.full_name} (${u.name})` : u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
              Brand
              <select className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">Pick a brand…</option>
                {brands.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
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
          <p className="mt-2 text-xs text-slate-400">
            Brand drives which holidays apply. One profile per employee — deactivate to un-enrol.
          </p>
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {list === null ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : list.length === 0 ? (
            <EmptyState icon={UserCheck} title="No one enrolled" subtitle="Enrol an employee to start tracking attendance." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Employee</th>
                    <th className="px-4 py-2.5">Brand</th>
                    <th className="px-4 py-2.5">Enrolled from</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.map((p) => (
                    <tr key={p.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{p.user}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.brand}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.enrolled_from}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${
                            p.active
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                          }`}
                        >
                          {p.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => toggleActive(p)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
