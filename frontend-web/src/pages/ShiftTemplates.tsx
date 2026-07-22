import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, HelpCircle } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageAttendance } from '@/hooks/useData'
import { resource } from '@/lib/api'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { ScheduleHelpDrawer } from '@web/components/ScheduleHelpDrawer'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
const MIN_KEYS = ['min_minutes_monday', 'min_minutes_tuesday', 'min_minutes_wednesday', 'min_minutes_thursday', 'min_minutes_friday', 'min_minutes_saturday', 'min_minutes_sunday'] as const
type MinKey = (typeof MIN_KEYS)[number]
type Tpl = { name: string; shift_name: string; start_time: string; end_time: string } & Partial<Record<MinKey, number>>
const tplMinSummary = (t: Tpl) =>
  MIN_KEYS.map((k, i) => (t[k] ? `${DAYS[i].slice(0, 3)} ${t[k]}` : null)).filter(Boolean).join(', ')

const inputCls = 'rounded-xl border border-line dark:border-slate-600 bg-surface px-3 py-2 text-sm'

export default function ShiftTemplates() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageAttendance(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [help, setHelp] = useState(false)
  const [tpls, setTpls] = useState<Tpl[] | null>(null)
  const [tplForm, setTplForm] = useState({ shift_name: '', start_time: '09:00:00', end_time: '17:00:00' })
  const [tplMins, setTplMins] = useState<string[]>(Array(7).fill(''))
  const [savingTpl, setSavingTpl] = useState(false)
  const [editingTpl, setEditingTpl] = useState<string | null>(null)
  const [confirmDelTpl, setConfirmDelTpl] = useState<string | null>(null)

  const load = () => {
    resource.list<Tpl[]>('Shift Template', { fields: ['name', 'shift_name', 'start_time', 'end_time', ...MIN_KEYS], limit: 0 }).then(setTpls).catch(() => setTpls([]))
  }
  useEffect(() => {
    load()
  }, [])

  const resetTpl = () => {
    setTplForm({ shift_name: '', start_time: '09:00:00', end_time: '17:00:00' })
    setTplMins(Array(7).fill(''))
    setEditingTpl(null)
  }

  const saveTpl = async () => {
    if (!tplForm.shift_name.trim()) return
    setSavingTpl(true)
    const doc: Record<string, unknown> = { ...tplForm }
    MIN_KEYS.forEach((k, i) => {
      doc[k] = Number(tplMins[i]) || 0
    })
    try {
      if (editingTpl) await resource.update('Shift Template', editingTpl, doc)
      else await resource.create('Shift Template', doc)
      resetTpl()
      toast('success', editingTpl ? 'Template updated' : 'Template added')
      load()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSavingTpl(false)
    }
  }

  const startEditTpl = (t: Tpl) => {
    setEditingTpl(t.name)
    setTplForm({ shift_name: t.shift_name, start_time: t.start_time, end_time: t.end_time })
    setTplMins(MIN_KEYS.map((k) => (t[k] ? String(t[k]) : '')))
  }

  const delTpl = async (name: string) => {
    try {
      await resource.remove('Shift Template', name)
      if (editingTpl === name) resetTpl()
      setConfirmDelTpl(null)
      toast('success', 'Template deleted')
      load()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  if (blocked) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Shift templates</h1>
        <button aria-label="Bantuan" onClick={() => setHelp(true)} className="rounded-lg p-2 text-muted hover:bg-surface-2"><HelpCircle className="h-5 w-5" /></button>
      </div>
      <BentoGrid>
        {/* Shift templates */}
        <BentoTile span="lg" tone="plain" title="Shift templates">
          <div className="mb-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <input className={`${inputCls} read-only:cursor-not-allowed read-only:opacity-60`} placeholder="Name" value={tplForm.shift_name} readOnly={!!editingTpl} onChange={(e) => setTplForm({ ...tplForm, shift_name: e.target.value })} />
              <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-muted">Start</span><input type="time" className={inputCls} value={tplForm.start_time.slice(0, 5)} onChange={(e) => setTplForm({ ...tplForm, start_time: e.target.value + ':00' })} /></label>
              <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-muted">End</span><input type="time" className={inputCls} value={tplForm.end_time.slice(0, 5)} onChange={(e) => setTplForm({ ...tplForm, end_time: e.target.value + ':00' })} /></label>
            </div>
            {editingTpl && <p className="text-xs text-muted">Editing “{editingTpl}” — name can’t be changed.</p>}
            <div>
              <p className="mb-1 text-xs font-semibold text-muted">Min minutes per weekday <span className="font-normal">(0 = brand default)</span></p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {DAYS.map((d, i) => (
                  <label key={d} className="flex flex-col gap-1">
                    <span className="text-xs font-medium capitalize text-muted">{d.slice(0, 3)}</span>
                    <input type="number" inputMode="numeric" min={0} className={inputCls} value={tplMins[i]} onChange={(e) => setTplMins((m) => m.map((v, k) => (k === i ? e.target.value : v)))} placeholder="0" />
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveTpl} disabled={savingTpl} className="inline-flex w-fit items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.97] transition disabled:opacity-60">{savingTpl ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {editingTpl ? 'Save changes' : 'Add template'}</button>
              {editingTpl && (
                <button onClick={resetTpl} className="rounded-xl border border-line dark:border-slate-600 px-3 py-2 text-sm font-semibold text-muted">Cancel</button>
              )}
            </div>
          </div>
          {tpls === null ? <Spinner /> : tpls.length === 0 ? <EmptyState icon={Plus} title="No templates" subtitle="Add a shift window." /> : (
            <ul className="divide-y divide-line dark:divide-slate-800 text-sm">
              {tpls.map((t) => (
                <li key={t.name} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate">{t.shift_name} · {t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}{tplMinSummary(t) ? ` · min ${tplMinSummary(t)}` : ''}</span>
                  {confirmDelTpl === t.name ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs">
                      <span className="text-muted">Delete?</span>
                      <button onClick={() => delTpl(t.name)} className="rounded-lg bg-rose-600 px-2 py-1 font-semibold text-white">Yes</button>
                      <button onClick={() => setConfirmDelTpl(null)} className="rounded-lg border border-line dark:border-slate-600 px-2 py-1">No</button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1">
                      <button onClick={() => startEditTpl(t)} aria-label="Edit" className="rounded-lg p-1.5 text-muted hover:bg-surface-2"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setConfirmDelTpl(t.name)} aria-label="Delete" className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"><Trash2 className="h-4 w-4" /></button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </BentoTile>
      </BentoGrid>
      <ScheduleHelpDrawer open={help} onClose={() => setHelp(false)} />
    </div>
  )
}
