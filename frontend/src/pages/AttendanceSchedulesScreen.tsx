import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
type Tpl = { name: string; shift_name: string; start_time: string; end_time: string }
type Asg = { name: string; employee: string; shift_template: string; effective_from: string; effective_to?: string }

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'
const card =
  'rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800'
const primaryBtn =
  'rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60'

export default function AttendanceSchedulesScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [tpls, setTpls] = useState<Tpl[] | null>(null)
  const [asgs, setAsgs] = useState<Asg[] | null>(null)
  const [tplForm, setTplForm] = useState({ shift_name: '', start_time: '09:00:00', end_time: '17:00:00' })
  const [asgForm, setAsgForm] = useState<{
    employee: string
    shift_template: string
    effective_from: string
    effective_to: string
    days: Record<string, boolean>
  }>({ employee: '', shift_template: '', effective_from: '', effective_to: '', days: {} })
  const [savingTpl, setSavingTpl] = useState(false)
  const [savingAsg, setSavingAsg] = useState(false)

  const load = () => {
    resource
      .list<Tpl[]>('Shift Template', { fields: ['name', 'shift_name', 'start_time', 'end_time'], limit: 0 })
      .then(setTpls)
      .catch(() => setTpls([]))
    resource
      .list<Asg[]>('Shift Assignment', {
        fields: ['name', 'employee', 'shift_template', 'effective_from', 'effective_to'],
        limit: 0,
      })
      .then(setAsgs)
      .catch(() => setAsgs([]))
  }
  useEffect(() => {
    load()
  }, [])

  const addTpl = async () => {
    if (!tplForm.shift_name.trim()) return
    setSavingTpl(true)
    try {
      await resource.create('Shift Template', tplForm)
      setTplForm({ shift_name: '', start_time: '09:00:00', end_time: '17:00:00' })
      toast('success', 'Template added')
      load()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSavingTpl(false)
    }
  }

  const addAsg = async () => {
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
      await resource.create('Shift Assignment', doc)
      setAsgForm({ employee: '', shift_template: '', effective_from: '', effective_to: '', days: {} })
      toast('success', 'Assignment added')
      load()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSavingAsg(false)
    }
  }

  if (blocked) return null

  return (
    <DetailScreen title="Schedules">
      <div className="flex flex-col gap-5">
        {/* Shift templates */}
        <section className={card}>
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Shift templates</p>
          <div className="mb-3 flex flex-col gap-2">
            <input
              className={field}
              placeholder="Name"
              value={tplForm.shift_name}
              onChange={(e) => setTplForm({ ...tplForm, shift_name: e.target.value })}
            />
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Start</label>
                <input
                  type="time"
                  className={field}
                  value={tplForm.start_time.slice(0, 5)}
                  onChange={(e) => setTplForm({ ...tplForm, start_time: e.target.value + ':00' })}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">End</label>
                <input
                  type="time"
                  className={field}
                  value={tplForm.end_time.slice(0, 5)}
                  onChange={(e) => setTplForm({ ...tplForm, end_time: e.target.value + ':00' })}
                />
              </div>
            </div>
            <button onClick={addTpl} disabled={savingTpl} className={`flex items-center justify-center gap-1.5 ${primaryBtn}`}>
              {savingTpl ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Add template
            </button>
          </div>
          {tpls === null ? (
            <Spinner className="mx-auto h-5 w-5 text-slate-400" />
          ) : tpls.length === 0 ? (
            <EmptyState icon={Plus} title="No templates" subtitle="Add a shift window." />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-700">
              {tpls.map((t) => (
                <li key={t.name} className="py-2 text-stone-700 dark:text-slate-200">
                  {t.shift_name} · {t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Shift assignments */}
        <section className={card}>
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Assignments</p>
          <div className="mb-3 flex flex-col gap-2">
            <input
              className={field}
              placeholder="Employee (user id)"
              value={asgForm.employee}
              onChange={(e) => setAsgForm({ ...asgForm, employee: e.target.value })}
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
            <button onClick={addAsg} disabled={savingAsg} className={`flex items-center justify-center gap-1.5 ${primaryBtn}`}>
              {savingAsg ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Add assignment
            </button>
          </div>
          {asgs === null ? (
            <Spinner className="mx-auto h-5 w-5 text-slate-400" />
          ) : asgs.length === 0 ? (
            <EmptyState icon={Plus} title="No assignments" subtitle="Assign a shift to an employee." />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-700">
              {asgs.map((a) => (
                <li key={a.name} className="py-2 text-stone-700 dark:text-slate-200">
                  {a.employee} · {a.shift_template} · from {a.effective_from}
                  {a.effective_to ? ` to ${a.effective_to}` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-slate-400">
          Editing an assignment automatically recalculates affected past days.
        </p>
      </div>
    </DetailScreen>
  )
}
