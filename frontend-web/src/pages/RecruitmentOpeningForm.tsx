import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Check, Plus, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'
import { DatePicker } from '@web/components/DatePicker'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'
import { recruitmentApi } from '@/lib/api'
import type { JobTestQuestion } from '@/lib/api'

const field = 'w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none'
const area = 'min-h-[90px] w-full resize-y rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none'

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance']
const STATUSES = ['Draft', 'Open', 'Closed']
const QTYPES = ['Multiple Choice', 'True/False', 'Free Text']

// Points kept as a string in local state so the input can be cleared; coerced on save.
type QRow = { question_text: string; qtype: string; options: string; correct_answer: string; points: string }
const emptyQ = (): QRow => ({ question_text: '', qtype: 'Multiple Choice', options: '', correct_answer: '', points: '1' })

export default function RecruitmentOpeningForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const { name } = useParams()
  const isEdit = !!name

  const q = useQuery({
    queryKey: ['recruitment', 'opening', name],
    queryFn: () => recruitmentApi.getOpening(name!),
    enabled: isEdit,
  })

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [location, setLocation] = useState('')
  const [employmentType, setEmploymentType] = useState('Full-time')
  const [status, setStatus] = useState('Draft')
  const [closesOn, setClosesOn] = useState('')
  const [description, setDescription] = useState('')
  const [requirements, setRequirements] = useState('')
  const [questions, setQuestions] = useState<QRow[]>([])
  const [saving, setSaving] = useState(false)
  const [testDisc, setTestDisc] = useState(false)
  const [testPersonality, setTestPersonality] = useState(false)
  const [testLogical, setTestLogical] = useState(false)
  const [targets, setTargets] = useState<Record<string, number>>({
    target_d: 50, target_i: 50, target_s: 50, target_c: 50,
    target_o: 50, target_c_big: 50, target_e: 50, target_a: 50, target_n: 50,
  })

  useEffect(() => {
    const d = q.data
    if (!d) return
    setTitle(d.title ?? '')
    setSlug(d.slug ?? '')
    setLocation(d.location ?? '')
    setEmploymentType(d.employment_type || 'Full-time')
    setStatus(d.status || 'Draft')
    setClosesOn(d.closes_on ?? '')
    setDescription(d.description ?? '')
    setRequirements(d.requirements ?? '')
    setQuestions((d.questions ?? []).map((x) => ({
      question_text: x.question_text ?? '',
      qtype: x.qtype || 'Multiple Choice',
      options: x.options ?? '',
      correct_answer: x.correct_answer ?? '',
      points: String(x.points ?? 1),
    })))
    setTestDisc(!!d.test_disc)
    setTestPersonality(!!d.test_personality)
    setTestLogical(!!d.test_logical)
    setTargets({
      target_d: d.target_d ?? 50, target_i: d.target_i ?? 50, target_s: d.target_s ?? 50, target_c: d.target_c ?? 50,
      target_o: d.target_o ?? 50, target_c_big: d.target_c_big ?? 50, target_e: d.target_e ?? 50,
      target_a: d.target_a ?? 50, target_n: d.target_n ?? 50,
    })
  }, [q.data])

  const setQ = (i: number, patch: Partial<QRow>) =>
    setQuestions((qs) => qs.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  const removeQ = (i: number) => setQuestions((qs) => qs.filter((_, j) => j !== i))

  const save = async () => {
    if (!title.trim()) return toast('error', 'Title wajib diisi')
    setSaving(true)
    try {
      const payloadQuestions: JobTestQuestion[] = questions.map((row) => ({
        question_text: row.question_text.trim(),
        qtype: row.qtype,
        options: row.qtype === 'Free Text' ? '' : row.options,
        correct_answer: row.qtype === 'Free Text' ? '' : row.correct_answer,
        points: Number(row.points) || 0,
      }))
      await recruitmentApi.saveOpening({
        ...(name ? { name } : {}),
        title: title.trim(),
        slug: slug.trim(),
        location: location.trim(),
        employment_type: employmentType,
        status,
        closes_on: closesOn,
        description,
        requirements,
        questions: payloadQuestions,
        test_disc: testDisc ? 1 : 0,
        test_personality: testPersonality ? 1 : 0,
        test_logical: testLogical ? 1 : 0,
        targets,
      })
      toast('success', isEdit ? 'Opening tersimpan' : 'Opening dibuat')
      navigate('/recruitment/openings')
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (isEdit && q.isLoading) {
    return <div className="flex justify-center py-20"><Spinner /></div>
  }

  return (
    <Page>
      <PageHeader icon={Briefcase} title={isEdit ? 'Edit Opening' : 'New Opening'} />

      <form onSubmit={(e) => { e.preventDefault(); save() }}>
        <BentoGrid>
          <BentoTile span="full" tone="plain" title="Details">
            <div className="mt-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Title" required className="sm:col-span-2">
                {(id) => <input id={id} className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Frontend Engineer" />}
              </Field>
              <Field label="Slug" hint="auto from title if blank">
                {(id) => <input id={id} className={field} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="frontend-engineer" />}
              </Field>
              <Field label="Location">
                {(id) => <input id={id} className={field} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Jakarta / Remote" />}
              </Field>
              <Field label="Employment type">
                {(id) => <SearchableSelect id={id} value={employmentType} onChange={setEmploymentType} options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: t }))} />}
              </Field>
              <Field label="Status">
                {(id) => <SearchableSelect id={id} value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: s }))} />}
              </Field>
              <Field label="Closes on">
                {(id) => <DatePicker id={id} value={closesOn} onChange={setClosesOn} className={field} placeholder="No close date" />}
              </Field>
              <Field label="Description" className="sm:col-span-2">
                {(id) => <textarea id={id} className={area} value={description} onChange={(e) => setDescription(e.target.value)} />}
              </Field>
              <Field label="Requirements" className="sm:col-span-2">
                {(id) => <textarea id={id} className={area} value={requirements} onChange={(e) => setRequirements(e.target.value)} />}
              </Field>
            </div>
          </BentoTile>

          <BentoTile span="full" tone="plain" title="Standard Tests">
            <div className="mt-1 flex flex-col gap-1">
              {([
                ['DISC', testDisc, setTestDisc],
                ['Personality (Big Five)', testPersonality, setTestPersonality],
                ['Logical reasoning', testLogical, setTestLogical],
              ] as const).map(([lbl, val, set]) => (
                <label key={lbl} className="flex items-center gap-2 py-1 text-sm text-ink">
                  <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                  {lbl}
                </label>
              ))}
            </div>
            {testDisc && (
              <TargetGrid label="Target DISC" keys={['target_d', 'target_i', 'target_s', 'target_c']} labels={['D', 'I', 'S', 'C']} targets={targets} setTargets={setTargets} />
            )}
            {testPersonality && (
              <TargetGrid label="Target Personality" keys={['target_o', 'target_c_big', 'target_e', 'target_a', 'target_n']} labels={['O', 'C', 'E', 'A', 'N']} targets={targets} setTargets={setTargets} />
            )}
          </BentoTile>

          <BentoTile span="full" tone="plain" title="Test Questions">
            <p className="mb-2 text-xs text-muted">Soal tes untuk pelamar. Untuk Multiple Choice / True/False, isi opsi (satu per baris) dan jawaban benar yang persis sama dengan salah satu opsi. Free Text dinilai manual.</p>
            <div className="mt-1 space-y-3">
              {questions.map((row, i) => (
                <div key={i} className="rounded-xl bg-hover/[0.04] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted">Question {i + 1}</span>
                    <button type="button" aria-label="Remove question" onClick={() => removeQ(i)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-line text-rose-500 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-500/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Question" className="sm:col-span-2">
                      {(id) => <input id={id} className={field} value={row.question_text} onChange={(e) => setQ(i, { question_text: e.target.value })} placeholder="What is …?" />}
                    </Field>
                    <Field label="Type">
                      {(id) => <SearchableSelect id={id} value={row.qtype} onChange={(v) => setQ(i, { qtype: v })} options={QTYPES.map((t) => ({ value: t, label: t }))} />}
                    </Field>
                    <Field label="Points">
                      {(id) => <input id={id} type="number" className={field} value={row.points} onChange={(e) => setQ(i, { points: e.target.value })} placeholder="1" />}
                    </Field>
                    {row.qtype !== 'Free Text' && (
                      <>
                        <Field label="Options (one per line)" className="sm:col-span-2">
                          {(id) => <textarea id={id} className={area} value={row.options} onChange={(e) => setQ(i, { options: e.target.value })} placeholder={'Option A\nOption B'} />}
                        </Field>
                        <Field label="Correct answer" className="sm:col-span-2">
                          {(id) => <input id={id} className={field} value={row.correct_answer} onChange={(e) => setQ(i, { correct_answer: e.target.value })} placeholder="Exact option text" />}
                        </Field>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setQuestions((qs) => [...qs, emptyQ()])}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-line py-3 px-4 text-sm font-semibold text-muted hover:border-muted dark:border-slate-600 dark:hover:border-slate-500">
                <Plus className="h-4 w-4" /> Add question
              </button>
            </div>
          </BentoTile>

          <BentoTile span="sm" tone="plain" title="Save">
            <div className="mt-1">
              <button type="submit" disabled={saving}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors">
                {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {isEdit ? 'Save changes' : 'Create opening'}
              </button>
            </div>
          </BentoTile>
        </BentoGrid>
      </form>
    </Page>
  )
}

function TargetGrid({ label, keys, labels, targets, setTargets }: {
  label: string; keys: string[]; labels: string[]
  targets: Record<string, number>; setTargets: (u: (t: Record<string, number>) => Record<string, number>) => void
}) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold text-muted">{label} (0–100)</p>
      <div className="grid grid-cols-5 gap-2 sm:w-1/2">
        {keys.map((k, i) => (
          <label key={k} className="text-center">
            <span className="block text-xs font-bold text-ink">{labels[i]}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={targets[k] ?? 50}
              onChange={(e) => setTargets((t) => ({ ...t, [k]: Number(e.target.value) || 0 }))}
              onBlur={(e) => {
                const n = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                setTargets((t) => ({ ...t, [k]: n }))
              }}
              className={field + ' mt-1 px-1 text-center'}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
