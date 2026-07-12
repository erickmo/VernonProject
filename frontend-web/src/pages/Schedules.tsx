import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { SearchableSelect } from '@/components/SearchableSelect'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
type Tpl = { name: string; shift_name: string; start_time: string; end_time: string }
type Asg = { name: string; employee: string; shift_template: string; effective_from: string; effective_to?: string }

const inputCls = 'rounded-lg border border-line dark:border-slate-600 bg-surface px-3 py-2 text-sm'

export default function Schedules() {
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
  const [asgForm, setAsgForm] = useState<{ employee: string; shift_template: string; effective_from: string; effective_to: string; days: Record<string, boolean> }>(
    { employee: '', shift_template: '', effective_from: '', effective_to: '', days: {} },
  )
  const [savingTpl, setSavingTpl] = useState(false)
  const [savingAsg, setSavingAsg] = useState(false)

  const load = () => {
    resource.list<Tpl[]>('Shift Template', { fields: ['name', 'shift_name', 'start_time', 'end_time'], limit: 0 }).then(setTpls).catch(() => setTpls([]))
    resource.list<Asg[]>('Shift Assignment', { fields: ['name', 'employee', 'shift_template', 'effective_from', 'effective_to'], limit: 0 }).then(setAsgs).catch(() => setAsgs([]))
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
    const doc: Record<string, unknown> = {
      employee: asgForm.employee,
      shift_template: asgForm.shift_template,
      effective_from: asgForm.effective_from,
      effective_to: asgForm.effective_to || null,
    }
    for (const d of DAYS) doc[d] = asgForm.days[d] ? 1 : 0
    setSavingAsg(true)
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
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Schedules</h1>
      <BentoGrid>
        {/* Shift templates */}
        <BentoTile span="lg" tone="plain" title="Shift templates">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <input className={inputCls} placeholder="Name" value={tplForm.shift_name} onChange={(e) => setTplForm({ ...tplForm, shift_name: e.target.value })} />
            <input type="time" className={inputCls} value={tplForm.start_time.slice(0, 5)} onChange={(e) => setTplForm({ ...tplForm, start_time: e.target.value + ':00' })} />
            <input type="time" className={inputCls} value={tplForm.end_time.slice(0, 5)} onChange={(e) => setTplForm({ ...tplForm, end_time: e.target.value + ':00' })} />
            <button onClick={addTpl} disabled={savingTpl} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{savingTpl ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</button>
          </div>
          {tpls === null ? <Spinner /> : tpls.length === 0 ? <EmptyState icon={Plus} title="No templates" subtitle="Add a shift window." /> : (
            <ul className="divide-y divide-line dark:divide-slate-800 text-sm">
              {tpls.map((t) => <li key={t.name} className="py-2">{t.shift_name} · {t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}</li>)}
            </ul>
          )}
        </BentoTile>

        {/* Shift assignments */}
        <BentoTile span="lg" tone="plain" title="Assignments">
          <div className="mb-3 flex flex-col gap-2">
            <input className={inputCls} placeholder="Employee (user id)" value={asgForm.employee} onChange={(e) => setAsgForm({ ...asgForm, employee: e.target.value })} />
            <SearchableSelect
              value={asgForm.shift_template}
              onChange={(v) => setAsgForm({ ...asgForm, shift_template: v })}
              options={(tpls ?? []).map((t) => ({ value: t.name, label: t.shift_name }))}
              placeholder="Shift template…"
              allowClear
            />
            <div className="flex gap-2">
              <input type="date" className={inputCls} value={asgForm.effective_from} onChange={(e) => setAsgForm({ ...asgForm, effective_from: e.target.value })} />
              <input type="date" className={inputCls} value={asgForm.effective_to} onChange={(e) => setAsgForm({ ...asgForm, effective_to: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setAsgForm({ ...asgForm, days: { ...asgForm.days, [d]: !asgForm.days[d] } })}
                  className={`rounded-md border px-2 py-1 text-xs capitalize ${asgForm.days[d] ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line dark:border-slate-700 text-muted'}`}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
            <button onClick={addAsg} disabled={savingAsg} className="inline-flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{savingAsg ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Add assignment</button>
          </div>
          {asgs === null ? <Spinner /> : asgs.length === 0 ? <EmptyState icon={Plus} title="No assignments" subtitle="Assign a shift to an employee." /> : (
            <ul className="divide-y divide-line dark:divide-slate-800 text-sm">
              {asgs.map((a) => <li key={a.name} className="py-2">{a.employee} · {a.shift_template} · from {a.effective_from}{a.effective_to ? ` to ${a.effective_to}` : ''}</li>)}
            </ul>
          )}
        </BentoTile>
      </BentoGrid>
      <p className="text-xs text-muted">Editing an assignment automatically recalculates affected past days.</p>
    </div>
  )
}
