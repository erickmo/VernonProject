import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, HelpCircle } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { SearchableSelect } from '@/components/SearchableSelect'
import { DatePicker } from '@web/components/DatePicker'
import { ScheduleHelpDrawer } from '@web/components/ScheduleHelpDrawer'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
type Asg = { name: string; employee: string; shift_template: string; effective_from: string; effective_to?: string } & Partial<Record<(typeof DAYS)[number], number>>

const inputCls = 'rounded-xl border border-line dark:border-slate-600 bg-surface px-3 py-2 text-sm'

export default function ShiftAssignments() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [help, setHelp] = useState(false)
  const [tpls, setTpls] = useState<{ name: string; shift_name: string }[]>([])
  const [asgs, setAsgs] = useState<Asg[] | null>(null)
  // Deep-link ?user=: prefill the create-form employee + filter the list to that person.
  const seedUser = new URLSearchParams(window.location.search).get('user') ?? ''
  const shownAsgs = seedUser && asgs ? asgs.filter((a) => a.employee === seedUser) : asgs
  const [asgForm, setAsgForm] = useState<{ employee: string; shift_template: string; effective_from: string; effective_to: string; days: Record<string, boolean> }>(
    () => ({ employee: new URLSearchParams(window.location.search).get('user') ?? '', shift_template: '', effective_from: '', effective_to: '', days: {} }),
  )
  const [savingAsg, setSavingAsg] = useState(false)
  const [editingAsg, setEditingAsg] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [users, setUsers] = useState<{ name: string; full_name?: string }[]>([])

  const load = () => {
    resource.list<Asg[]>('Shift Assignment', { fields: ['name', 'employee', 'shift_template', 'effective_from', 'effective_to', ...DAYS], limit: 0 }).then(setAsgs).catch(() => setAsgs([]))
    resource.list<{ name: string; shift_name: string }[]>('Shift Template', { fields: ['name', 'shift_name'], limit: 0 }).then(setTpls).catch(() => setTpls([]))
    resource.list<{ name: string; full_name?: string }[]>('User', { filters: { enabled: 1 }, fields: ['name', 'full_name'], limit: 0 }).then(setUsers).catch(() => setUsers([]))
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
    const doc: Record<string, unknown> = {
      employee: asgForm.employee,
      shift_template: asgForm.shift_template,
      effective_from: asgForm.effective_from,
      effective_to: asgForm.effective_to || null,
    }
    for (const d of DAYS) doc[d] = asgForm.days[d] ? 1 : 0
    setSavingAsg(true)
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Penugasan shift</h1>
        <button aria-label="Bantuan" onClick={() => setHelp(true)} className="rounded-lg p-2 text-muted hover:bg-surface-2"><HelpCircle className="h-5 w-5" /></button>
      </div>
      <BentoGrid>
        {/* Shift assignments */}
        <BentoTile span="lg" tone="plain" title="Assignments">
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
                <span className="text-xs font-semibold text-muted">Effective from</span>
                <DatePicker className={inputCls} value={asgForm.effective_from} onChange={(v) => setAsgForm({ ...asgForm, effective_from: v })} placeholder="Effective from" />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs font-semibold text-muted">Effective to</span>
                <DatePicker className={inputCls} value={asgForm.effective_to} onChange={(v) => setAsgForm({ ...asgForm, effective_to: v })} placeholder="Effective to" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setAsgForm({ ...asgForm, days: { ...asgForm.days, [d]: !asgForm.days[d] } })}
                  className={`rounded-full border px-2 py-1 text-xs capitalize transition active:scale-[0.97] ${asgForm.days[d] ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line dark:border-slate-700 text-muted'}`}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={saveAsg} disabled={savingAsg} className="inline-flex items-center justify-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.97] transition disabled:opacity-60">{savingAsg ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {editingAsg ? 'Save changes' : 'Add assignment'}</button>
              {editingAsg && (
                <button onClick={resetAsg} className="rounded-xl border border-line dark:border-slate-600 px-3 py-2 text-sm font-semibold text-muted">Cancel</button>
              )}
            </div>
          </div>
          {shownAsgs === null ? <Spinner /> : shownAsgs.length === 0 ? <EmptyState icon={Plus} title="No assignments" subtitle="Assign a shift to an employee." /> : (
            <ul className="divide-y divide-line dark:divide-slate-800 text-sm">
              {shownAsgs.map((a) => (
                <li key={a.name} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate">{a.employee} · {a.shift_template} · from {a.effective_from}{a.effective_to ? ` to ${a.effective_to}` : ''}</span>
                  {confirmDel === a.name ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs">
                      <span className="text-muted">Delete?</span>
                      <button onClick={() => delAsg(a.name)} className="rounded-lg bg-rose-600 px-2 py-1 font-semibold text-white">Yes</button>
                      <button onClick={() => setConfirmDel(null)} className="rounded-lg border border-line dark:border-slate-600 px-2 py-1">No</button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1">
                      <button onClick={() => startEdit(a)} aria-label="Edit" className="rounded-lg p-1.5 text-muted hover:bg-surface-2"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setConfirmDel(a.name)} aria-label="Delete" className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"><Trash2 className="h-4 w-4" /></button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </BentoTile>
      </BentoGrid>
      <p className="text-xs text-muted">Editing an assignment automatically recalculates affected past days.</p>
      <ScheduleHelpDrawer open={help} onClose={() => setHelp(false)} />
    </div>
  )
}
