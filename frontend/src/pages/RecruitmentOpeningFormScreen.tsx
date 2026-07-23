import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Plus, Trash2 } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'
import { useBoot, canManageRecruitment } from '@/hooks/useData'
import { recruitmentApi } from '@/lib/api'
import type { JobTestQuestion } from '@/lib/api'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'].map((v) => ({ value: v, label: v }))
const STATUSES = ['Draft', 'Open', 'Closed'].map((v) => ({ value: v, label: v }))
const QTYPES = ['Multiple Choice', 'True/False', 'Free Text'].map((v) => ({ value: v, label: v }))

const blankQuestion = (): JobTestQuestion => ({
  question_text: '',
  qtype: 'Multiple Choice',
  options: '',
  correct_answer: '',
  points: 1,
})

export default function RecruitmentOpeningFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageRecruitment(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const [loading, setLoading] = useState(!!name)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [location, setLocation] = useState('')
  const [employmentType, setEmploymentType] = useState('Full-time')
  const [status, setStatus] = useState('Draft')
  const [closesOn, setClosesOn] = useState('')
  const [description, setDescription] = useState('')
  const [requirements, setRequirements] = useState('')
  const [questions, setQuestions] = useState<JobTestQuestion[]>([])
  const [testDisc, setTestDisc] = useState(false)
  const [testPersonality, setTestPersonality] = useState(false)
  const [testLogical, setTestLogical] = useState(false)
  const [targets, setTargets] = useState<Record<string, number>>({
    target_d: 50, target_i: 50, target_s: 50, target_c: 50,
    target_o: 50, target_c_big: 50, target_e: 50, target_a: 50, target_n: 50,
  })

  useEffect(() => {
    if (!name) return
    let alive = true
    recruitmentApi
      .getOpening(name)
      .then((o) => {
        if (!alive) return
        setTitle(o.title ?? '')
        setSlug(o.slug ?? '')
        setLocation(o.location ?? '')
        setEmploymentType(o.employment_type ?? 'Full-time')
        setStatus(o.status ?? 'Draft')
        setClosesOn(o.closes_on ?? '')
        setDescription(o.description ?? '')
        setRequirements(o.requirements ?? '')
        setQuestions(o.questions ?? [])
        setTestDisc(!!o.test_disc)
        setTestPersonality(!!o.test_personality)
        setTestLogical(!!o.test_logical)
        setTargets({
          target_d: o.target_d ?? 50, target_i: o.target_i ?? 50, target_s: o.target_s ?? 50, target_c: o.target_c ?? 50,
          target_o: o.target_o ?? 50, target_c_big: o.target_c_big ?? 50, target_e: o.target_e ?? 50,
          target_a: o.target_a ?? 50, target_n: o.target_n ?? 50,
        })
      })
      .catch((e) => toast('error', (e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [name])

  if (blocked) return null

  const updateQ = (i: number, patch: Partial<JobTestQuestion>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  const removeQ = (i: number) => setQuestions((qs) => qs.filter((_, idx) => idx !== i))

  const save = async () => {
    if (saving) return
    if (!title.trim()) return toast('error', 'Judul wajib diisi')
    setSaving(true)
    try {
      await recruitmentApi.saveOpening({
        ...(name ? { name } : {}),
        title: title.trim(),
        slug: slug.trim(),
        location,
        employment_type: employmentType,
        status,
        closes_on: closesOn,
        description,
        requirements,
        questions,
        test_disc: testDisc ? 1 : 0,
        test_personality: testPersonality ? 1 : 0,
        test_logical: testLogical ? 1 : 0,
        targets,
      })
      toast('success', 'Lowongan tersimpan')
      navigate('/recruitment/openings')
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <DetailScreen title="Lowongan">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  return (
    <DetailScreen title={name ? 'Edit lowongan' : 'Lowongan baru'}>
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Judul</label>
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Frontend Developer" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Slug (opsional)</label>
              <input className={field} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Otomatis dari judul jika kosong" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Lokasi</label>
              <input className={field} value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Tipe kerja</label>
              <SearchableSelect value={employmentType} onChange={setEmploymentType} options={EMPLOYMENT_TYPES} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Status</label>
              <SearchableSelect value={status} onChange={setStatus} options={STATUSES} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Tutup pada</label>
              <input type="date" className={field} value={closesOn} onChange={(e) => setClosesOn(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Deskripsi</label>
              <textarea className={field + ' min-h-[100px] resize-y'} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Persyaratan</label>
              <textarea className={field + ' min-h-[100px] resize-y'} value={requirements} onChange={(e) => setRequirements(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-3 text-sm font-bold text-stone-800 dark:text-slate-100">Tes standar</p>
          {([
            ['DISC', testDisc, setTestDisc],
            ['Kepribadian (Big Five)', testPersonality, setTestPersonality],
            ['Logika & pemecahan masalah', testLogical, setTestLogical],
          ] as const).map(([lbl, val, set]) => (
            <label key={lbl} className="flex items-center gap-2 py-1.5 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-brand-600" />
              {lbl}
            </label>
          ))}
          {testDisc && (
            <TargetGrid label="Target DISC" keys={['target_d', 'target_i', 'target_s', 'target_c']} labels={['D', 'I', 'S', 'C']} targets={targets} setTargets={setTargets} />
          )}
          {testPersonality && (
            <TargetGrid label="Target Kepribadian" keys={['target_o', 'target_c_big', 'target_e', 'target_a', 'target_n']} labels={['O', 'C', 'E', 'A', 'N']} targets={targets} setTargets={setTargets} />
          )}
        </div>

        <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-stone-800 dark:text-slate-100">Soal tes</p>
            <button
              onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}
              className="flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" /> Soal
            </button>
          </div>
          {!questions.length ? (
            <p className="text-xs text-slate-400">Belum ada soal.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {questions.map((q, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Soal {i + 1}</span>
                    <button onClick={() => removeQ(i)} className="text-rose-500 active:scale-90" aria-label="Hapus soal">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <textarea
                      className={field + ' min-h-[56px] resize-y'}
                      value={q.question_text}
                      onChange={(e) => updateQ(i, { question_text: e.target.value })}
                      placeholder="Pertanyaan"
                    />
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <SearchableSelect value={q.qtype} onChange={(v) => updateQ(i, { qtype: v })} options={QTYPES} />
                      </div>
                      <input
                        className={field + ' w-20'}
                        type="number"
                        inputMode="numeric"
                        value={q.points}
                        onChange={(e) => updateQ(i, { points: Number(e.target.value) || 0 })}
                        placeholder="Poin"
                        aria-label="Poin"
                      />
                    </div>
                    {q.qtype !== 'Free Text' && (
                      <>
                        <textarea
                          className={field + ' min-h-[56px] resize-y'}
                          value={q.options}
                          onChange={(e) => updateQ(i, { options: e.target.value })}
                          placeholder="Pilihan (satu per baris)"
                        />
                        <input
                          className={field}
                          value={q.correct_answer}
                          onChange={(e) => updateQ(i, { correct_answer: e.target.value })}
                          placeholder="Jawaban benar"
                        />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Simpan lowongan
        </button>
      </div>
    </DetailScreen>
  )
}

function TargetGrid({ label, keys, labels, targets, setTargets }: {
  label: string; keys: string[]; labels: string[]
  targets: Record<string, number>; setTargets: (u: (t: Record<string, number>) => Record<string, number>) => void
}) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold text-slate-500">{label} (0–100)</p>
      <div className="grid grid-cols-5 gap-2">
        {keys.map((k, i) => (
          <label key={k} className="text-center">
            <span className="block text-xs font-bold text-slate-600 dark:text-slate-300">{labels[i]}</span>
            <input
              type="number"
              min={0}
              max={100}
              defaultValue={targets[k] ?? 50}
              onBlur={(e) => {
                const n = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                setTargets((t) => ({ ...t, [k]: n }))
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-1 py-1 text-center text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
            />
          </label>
        ))}
      </div>
    </div>
  )
}
