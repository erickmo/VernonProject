import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, HelpCircle } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { ScheduleHelpSheet } from '@/components/ScheduleHelpSheet'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
type Asg = { name: string; employee: string; shift_template: string; effective_from: string; effective_to?: string } & Partial<Record<(typeof DAYS)[number], number>>

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'
const card =
  'rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800'
const primaryBtn =
  'rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60'

export default function AttendanceAssignmentsScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [help, setHelp] = useState(false)
  const [asgs, setAsgs] = useState<Asg[] | null>(null)
  const [tpls, setTpls] = useState<{ name: string; shift_name: string }[]>([])
  const [asgForm, setAsgForm] = useState<{
    employee: string
    shift_template: string
    effective_from: string
    effective_to: string
    days: Record<string, boolean>
  }>({ employee: '', shift_template: '', effective_from: '', effective_to: '', days: {} })
  const [savingAsg, setSavingAsg] = useState(false)
  const [editingAsg, setEditingAsg] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [users, setUsers] = useState<{ name: string; full_name?: string }[]>([])

  const load = () => {
    resource
      .list<Asg[]>('Shift Assignment', {
        fields: ['name', 'employee', 'shift_template', 'effective_from', 'effective_to', ...DAYS],
        limit: 0,
      })
      .then(setAsgs)
      .catch(() => setAsgs([]))
    resource
      .list<{ name: string; shift_name: string }[]>('Shift Template', { fields: ['name', 'shift_name'], limit: 0 })
      .then(setTpls)
      .catch(() => setTpls([]))
    resource
      .list<{ name: string; full_name?: string }[]>('User', { filters: { enabled: 1 }, fields: ['name', 'full_name'], limit: 0 })
      .then(setUsers)
      .catch(() => setUsers([]))
  }
  useEffect(() => {
    load()
  }, [])

  const resetAsg = () => {
    setAsgForm({ employee: '', shift_template: '', effective_from: '', effective_to: '', days: {} })
    setEditingAsg(null)
  }

  const saveAsg = async () => {
    if (!asgForm.employee || !asgForm.shift_template || !asgForm.effective_from) return
    setSavingAsg(true)
    const doc: Record<string, unknown> = {
      employee: asgForm.employee,
      shift_template: asgForm.shift_template,
      effective_from: asgForm.effective_from,
      effective_to: asgForm.effective_to || null,
    }
    for (const d of DAYS) doc[d] = asgForm.days[d] ? 1 : 0
    try {
      if (editingAsg) await resource.update('Shift Assignment', editingAsg, doc)
      else await resource.create('Shift Assignment', doc)
      resetAsg()
      toast('success', editingAsg ? 'Assignment updated' : 'Assignment added')
      load()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSavingAsg(false)
    }
  }

  const startEdit = (a: Asg) => {
    setEditingAsg(a.name)
    setAsgForm({
      employee: a.employee,
      shift_template: a.shift_template,
      effective_from: a.effective_from,
      effective_to: a.effective_to || '',
      days: Object.fromEntries(DAYS.map((d) => [d, !!a[d]])),
    })
  }

  const delAsg = async (name: string) => {
    try {
      await resource.remove('Shift Assignment', name)
      if (editingAsg === name) resetAsg()
      setConfirmDel(null)
      toast('success', 'Assignment deleted')
      load()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const employeeOptions = users.map((u) => ({ value: u.name, label: u.full_name ? `${u.full_name} (${u.name})` : u.name }))
  if (asgForm.employee && !employeeOptions.some((o) => o.value === asgForm.employee)) {
    employeeOptions.unshift({ value: asgForm.employee, label: asgForm.employee })
  }

  if (blocked) return null

  return (
    <DetailScreen
      title="Assignments"
      right={
        <button
          aria-label="Bantuan"
          onClick={() => setHelp(true)}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Shift assignments */}
        <section className={card}>
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Assignments</p>
          <div className="mb-3 flex flex-col gap-2">
            <SearchableSelect
              value={asgForm.employee}
              onChange={(v) => setAsgForm({ ...asgForm, employee: v })}
              options={employeeOptions}
              placeholder="Pick an employee…"
              allowClear
            />
            <SearchableSelect
              value={asgForm.shift_template}
              onChange={(v) => setAsgForm({ ...asgForm, shift_template: v })}
              options={(tpls ?? []).map((t) => ({ value: t.name, label: t.shift_name }))}
              placeholder="Shift template…"
              allowClear
            />
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Effective from</label>
                <input
                  type="date"
                  className={field}
                  value={asgForm.effective_from}
                  onChange={(e) => setAsgForm({ ...asgForm, effective_from: e.target.value })}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Effective to</label>
                <input
                  type="date"
                  className={field}
                  value={asgForm.effective_to}
                  onChange={(e) => setAsgForm({ ...asgForm, effective_to: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setAsgForm({ ...asgForm, days: { ...asgForm.days, [d]: !asgForm.days[d] } })}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold capitalize ${
                    asgForm.days[d]
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'
                  }`}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={saveAsg} disabled={savingAsg} className={`flex flex-1 items-center justify-center gap-1.5 ${primaryBtn}`}>
                {savingAsg ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {editingAsg ? 'Save changes' : 'Add assignment'}
              </button>
              {editingAsg && (
                <button onClick={resetAsg} className="rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Cancel
                </button>
              )}
            </div>
          </div>
          {asgs === null ? (
            <Spinner className="mx-auto h-5 w-5 text-slate-400" />
          ) : asgs.length === 0 ? (
            <EmptyState icon={Plus} title="No assignments" subtitle="Assign a shift to an employee." />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-700">
              {asgs.map((a) => (
                <li key={a.name} className="flex items-center justify-between gap-2 py-2 text-stone-700 dark:text-slate-200">
                  <span className="min-w-0 flex-1 truncate">
                    {a.employee} · {a.shift_template} · from {a.effective_from}
                    {a.effective_to ? ` to ${a.effective_to}` : ''}
                  </span>
                  {confirmDel === a.name ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs">
                      <span className="text-slate-500">Delete?</span>
                      <button onClick={() => delAsg(a.name)} className="rounded-lg bg-rose-600 px-2 py-1 font-semibold text-white">Yes</button>
                      <button onClick={() => setConfirmDel(null)} className="rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700">No</button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1">
                      <button onClick={() => startEdit(a)} aria-label="Edit" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setConfirmDel(a.name)} aria-label="Delete" className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"><Trash2 className="h-4 w-4" /></button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-slate-400">
          Editing an assignment automatically recalculates affected past days.
        </p>
      </div>
      <ScheduleHelpSheet open={help} onClose={() => setHelp(false)} />
    </DetailScreen>
  )
}
