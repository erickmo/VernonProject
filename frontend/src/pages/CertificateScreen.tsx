import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  Award, Download, Link2, ShieldCheck, ShieldX, Send, Undo2, Save, AlertTriangle, Check, Eye,
} from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { CertificateHelpSheet, InfoDot } from '@/components/CertificateHelpSheet'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import {
  useCertificate, useCertificateAccess, useIssuableInterns, usePreviewScore, useSaveCertificate,
  useSetCertificateStatus,
} from '@/hooks/useData'
import { certificateApi } from '@/lib/api'
import {
  ACTION_LABEL, STATUS_LABEL, canDownload, certSections, certificateSteps, clampScore, componentLabel,
  droppedComponents, fmtScore, gradeTone, rubricFrom, rubricProgress, rubricScore,
  type CertSection, type CertSectionKey, type CertStep, type CertStepState,
} from '@/lib/certificate'
import type { CertificateStatus, ScoreComponent } from '@/lib/types'

const card = 'rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card'
const field = 'w-full rounded-xl border border-paper-edge bg-paper-card px-3 py-2.5 text-sm text-stone-800 focus:border-brand-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
const label = 'mb-1.5 flex flex-wrap items-baseline gap-x-1.5 text-sm font-medium text-stone-700 dark:text-slate-200'
const hintText = 'text-xs font-normal text-stone-400 dark:text-slate-500'
const panel = 'rounded-xl border border-paper-edge p-3 dark:border-slate-700'

const GRADE_STYLE: Record<string, string> = {
  good: 'bg-emerald-500 text-white', ok: 'bg-brand-600 text-white',
  warn: 'bg-amber-500 text-white', bad: 'bg-rose-500 text-white',
  none: 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
}

function StepBadge({ n, state }: { n: number; state: CertStepState }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        state === 'done' && 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
        state === 'current' && 'bg-brand-600 text-white',
        state === 'todo' && 'bg-paper-line text-stone-400 dark:bg-slate-700 dark:text-slate-500',
      )}
    >
      {state === 'done' ? <Check className="h-4 w-4" /> : n}
    </span>
  )
}

/** cqf4pucpee: one form section. For issuers it carries the number of the step it covers
 *  (same numbers as the steps card), and the section holding the current step says what to do. */
function SectionCard({ section, numbered, children }: { section: CertSection; numbered: boolean; children: ReactNode }) {
  const current = numbered && section.state === 'current'
  return (
    <section
      aria-labelledby={`cert-${section.key}`}
      className={clsx(card, 'mb-3', current && '!border-brand-400 ring-1 ring-brand-200 dark:!border-brand-500/60 dark:ring-brand-500/20')}
    >
      <header className="mb-3 flex items-start gap-3">
        {numbered && <StepBadge n={section.n} state={section.state} />}
        <div className="min-w-0">
          <h2 id={`cert-${section.key}`} className="text-[15px] font-semibold leading-7 text-stone-800 dark:text-slate-100">
            {numbered ? section.title : section.plain}
          </h2>
          {current && <p className="text-xs leading-relaxed text-stone-500 dark:text-slate-400">{section.desc}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

function ScoreCard({
  title, score, grade, hint, term, onHelp,
}: {
  title: string; score: number | null; grade: string | null; hint: string
  term: string; onHelp: (t: string) => void
}) {
  return (
    <div className={clsx(panel, 'min-w-0')}>
      <p className="flex items-center gap-1 text-xs font-medium text-stone-500 dark:text-slate-400">
        {title}
        <InfoDot term={term} onOpen={onHelp} label={`Tentang ${title}`} />
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-stone-800 dark:text-slate-100">{fmtScore(score)}</span>
        {grade && (
          <span className={clsx('rounded-full px-2 py-0.5 text-xs font-bold', GRADE_STYLE[gradeTone(grade)])}>
            {grade}
          </span>
        )}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-stone-500 dark:text-slate-400">{hint}</p>
    </div>
  )
}

function Breakdown({ components, onHelp }: { components: ScoreComponent[]; onHelp: (t: string) => void }) {
  const dropped = droppedComponents({ components })
  return (
    <div className={panel}>
      <p className="mb-3 flex items-center gap-1 text-sm font-medium text-stone-700 dark:text-slate-200">
        Rincian Nilai Kinerja
        <InfoDot term="komponen-hilang" onOpen={onHelp} label="Kenapa ada komponen yang tidak muncul" />
      </p>

      {components.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-slate-400">
          Belum ada data yang bisa diukur pada periode ini.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {components.map((c) => (
            <div key={c.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                <span className="min-w-0 text-stone-700 dark:text-slate-200">{c.label}</span>
                <span className="tabular-nums text-stone-800 dark:text-slate-100">
                  {Math.round(c.value)}%
                  <span className="ml-1 text-[11px] text-stone-400 dark:text-slate-500">{c.detail}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-paper-line dark:bg-slate-700">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${c.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {dropped.length > 0 && (
        <p className="mt-3 rounded-xl bg-brand-50 p-2.5 text-[11px] leading-relaxed text-stone-600 dark:bg-brand-500/10 dark:text-slate-300">
          Tidak dinilai (tidak ada pembandingnya, bobotnya dibagi ke komponen lain):{' '}
          <span className="font-medium">{dropped.map(componentLabel).join(', ')}</span>.
        </p>
      )}
    </div>
  )
}

/** tmot7slo7q: the numbered path from "no certificate" to one you can show. Only the
 *  step you are on spells out what to do; finished steps just tick. */
function StepsCard({ steps }: { steps: CertStep[] }) {
  return (
    <ol className={clsx(card, 'mb-3 flex flex-col gap-3')} aria-label="Langkah membuat sertifikat">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-3" aria-current={s.state === 'current' ? 'step' : undefined}>
          <StepBadge n={i + 1} state={s.state} />
          <p
            className={clsx(
              'min-w-0 text-sm font-semibold',
              s.state === 'current' ? 'text-stone-800 dark:text-slate-100' : 'text-stone-400 dark:text-slate-500',
            )}
          >
            {s.label}
          </p>
        </li>
      ))}
    </ol>
  )
}

export default function CertificateScreen() {
  const { name } = useParams<{ name: string }>()
  const isNew = !name || name === 'new'
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [help, setHelp] = useState<string | null>(null)

  const detail = useCertificate(isNew ? undefined : name)
  const access = useCertificateAccess()
  const interns = useIssuableInterns(isNew)
  const save = useSaveCertificate()
  const setStatus = useSetCertificateStatus()

  const [form, setForm] = useState({
    intern: '', project: '', position: '', period_start: '', period_end: '', summary: '',
  })
  const [rubric, setRubric] = useState(rubricFrom(null))
  // Raw text per row so a half-typed "9" on the way to "90" is never clamped mid-keystroke.
  const [draftText, setDraftText] = useState<Record<string, string>>({})

  const doc = detail.data
  useEffect(() => {
    if (!doc) return
    setForm({
      intern: doc.intern, project: doc.project ?? '', position: doc.position ?? '',
      period_start: doc.period_start, period_end: doc.period_end, summary: doc.summary ?? '',
    })
    setRubric(rubricFrom(doc))
  }, [doc])

  const editable = isNew || !!doc?.can_edit
  const frozen = !!doc?.frozen

  // While a certificate is live the auto score is recomputed; once published it is a
  // snapshot and must never be recalculated.
  const preview = usePreviewScore(
    form.intern || undefined, form.period_start, form.period_end, form.project || undefined,
    !frozen && !!form.intern && !!form.period_start && !!form.period_end,
  )

  const components = frozen ? (doc?.components ?? []) : (preview.data?.components ?? [])
  const autoScore = frozen ? (doc?.auto_score ?? null) : (preview.data?.auto_score ?? null)
  const autoGrade = frozen ? (doc?.auto_grade ?? null) : (preview.data?.grade ?? null)
  const liveRubric = frozen ? (doc?.rubric_score ?? null) : rubricScore(rubric)
  const rubricGrade = frozen
    ? (doc?.rubric_grade ?? null)
    : (liveRubric === null ? null : (liveRubric >= 85 ? 'A' : liveRubric >= 70 ? 'B' : liveRubric >= 55 ? 'C' : 'D'))
  const progress = rubricProgress(rubric)

  const internOptions = useMemo(
    () => (interns.data?.interns ?? []).map((i) => ({ value: i.name, label: i.full_name || i.name, keywords: i.name })),
    [interns.data],
  )
  const projectOptions = useMemo(() => {
    const found = (interns.data?.interns ?? []).find((i) => i.name === form.intern)
    const fromPicker = (found?.projects ?? []).map((p) => ({ value: p.project, label: p.project_name }))
    if (fromPicker.length || !doc?.project) return fromPicker
    return [{ value: doc.project, label: doc.project_name || doc.project }]
  }, [interns.data, form.intern, doc])

  async function onSave() {
    if (!form.intern) return toast('error', 'Pilih peserta magang dulu.')
    if (!form.period_start || !form.period_end) return toast('error', 'Isi periode magangnya.')
    if (form.period_end < form.period_start) {
      return toast('error', 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.')
    }
    try {
      const saved = await save.mutateAsync({
        ...(isNew ? {} : { name }),
        intern: form.intern, project: form.project || null, position: form.position,
        period_start: form.period_start, period_end: form.period_end, summary: form.summary,
        rubric: rubric.map((r) => ({ key: r.key, score: r.score, comment: r.comment })),
      })
      toast('success', 'Tersimpan.')
      if (isNew) navigate(`/certificates/${saved.name}`, { replace: true })
    } catch (e: any) {
      toast('error', e?.message || 'Gagal menyimpan.')
    }
  }

  async function onTransition(target: CertificateStatus) {
    if (!name) return
    let reason: string | undefined
    if (target === 'Revoked') {
      // The reason is required by the server and is shown on the public page, so ask for
      // it in the same dialog rather than bouncing through a second prompt.
      const text = await confirm({
        title: 'Cabut sertifikat ini?',
        message: 'Sertifikat tetap tersimpan dan QR-nya tetap bisa dipindai, tapi hasilnya '
          + 'berubah menjadi "telah dicabut" beserta alasan di bawah. Tindakan ini tidak bisa dibatalkan.',
        confirmLabel: 'Cabut', destructive: true,
        input: { placeholder: 'Alasan pencabutan (tampil di halaman verifikasi)', rows: 3 },
      })
      if (!text || !text.trim()) return
      reason = text.trim()
    }
    if (target === 'Published') {
      const ok = await confirm({
        title: 'Terbitkan sertifikat?',
        message: 'Nomor sertifikat dan kode verifikasi akan dibuat, dan kedua nilainya dibekukan. '
          + 'Setelah terbit, isinya tidak bisa diubah lagi.',
        confirmLabel: 'Terbitkan',
      })
      if (!ok) return
    }
    try {
      await setStatus.mutateAsync({ name, target, reason })
      toast('success', 'Status diperbarui.')
    } catch (e: any) {
      toast('error', e?.message || 'Gagal mengubah status.')
    }
  }

  if (!isNew && detail.isLoading) {
    return <DetailScreen title="Sertifikat"><div className="flex justify-center py-12"><Spinner /></div></DetailScreen>
  }
  if (!isNew && !doc) {
    return (
      <DetailScreen title="Sertifikat">
        <EmptyState icon={AlertTriangle} title="Tidak ditemukan" subtitle="Sertifikat ini tidak ada atau bukan milikmu." />
      </DetailScreen>
    )
  }

  // Issuers see the numbered steps; an intern opening their own certificate just reads it.
  const isIssuer = !!access.data?.can_issue
  const steps = certificateSteps(doc ? { status: doc.status, rubric } : null, doc ? doc.is_hr : !!access.data?.is_hr)
  const sec = Object.fromEntries(certSections(steps).map((s) => [s.key, s])) as Record<CertSectionKey, CertSection>
  const actions = doc?.actions ?? []

  // Save lives in the section whose step it completes: step 1 until the draft exists, then step 2.
  const saveButton = editable && (
    <button
      onClick={onSave} disabled={save.isPending}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
    >
      {save.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
      Simpan draf
    </button>
  )

  return (
    <DetailScreen
      title={isNew ? 'Sertifikat Baru' : (doc?.intern_name ?? 'Sertifikat')}
      right={<InfoDot term="dua-nilai" onOpen={setHelp} label="Kenapa nilainya ada dua" />}
    >
      {doc && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-slate-400">
          <span className="rounded-full bg-paper-line px-2 py-0.5 font-semibold text-stone-600 dark:bg-slate-700 dark:text-slate-300">
            {STATUS_LABEL[doc.status]}
          </span>
          {doc.cert_no && <span className="font-mono">{doc.cert_no}</span>}
          {doc.status === 'Revoked' && doc.revoke_reason && (
            <span className="w-full rounded-xl bg-rose-50 p-2.5 text-[11px] leading-relaxed text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
              Dicabut {doc.revoked_on}: {doc.revoke_reason}
            </span>
          )}
        </p>
      )}

      {isIssuer && <StepsCard steps={steps} />}

      {/* ---------- 1 · who and when ---------- */}
      <SectionCard section={sec.intern} numbered={isIssuer}>
        <div className="flex flex-col gap-3">
          <div>
            <p className={label}>Peserta magang</p>
            {isNew ? (
              <SearchableSelect
                value={form.intern}
                onChange={(v) => setForm((f) => ({ ...f, intern: v, project: '' }))}
                options={internOptions}
                placeholder="Pilih peserta magang"
              />
            ) : (
              <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">{doc?.intern_name}</p>
            )}
          </div>

          <div>
            <p className={label}>Proyek<span className={hintText}>opsional</span></p>
            {editable ? (
              <SearchableSelect
                value={form.project}
                onChange={(v) => setForm((f) => ({ ...f, project: v }))}
                options={projectOptions}
                placeholder="Seluruh masa magang"
                allowClear
              />
            ) : (
              <p className="text-sm text-stone-700 dark:text-slate-200">{doc?.project_name || 'Seluruh masa magang'}</p>
            )}
          </div>

          <div>
            <p className={label}>Posisi</p>
            {editable ? (
              <input
                className={field} value={form.position} placeholder="mis. Frontend Developer Intern"
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            ) : (
              <p className="text-sm text-stone-700 dark:text-slate-200">{doc?.position || '—'}</p>
            )}
          </div>

          {/* Two dates side by side only while each still has room for its label and picker. */}
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
            {(['period_start', 'period_end'] as const).map((k) => (
              <div key={k} className="min-w-0">
                <p className={label}>{k === 'period_start' ? 'Mulai magang' : 'Selesai magang'}</p>
                {editable ? (
                  <input
                    type="date" className={field} value={form[k]}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm text-stone-700 dark:text-slate-200">{doc?.[k]}</p>
                )}
              </div>
            ))}
          </div>
        </div>
        {!doc && saveButton}
      </SectionCard>

      {/* ---------- 2 · the two scores (never merged), the leader's rubric and the printed note ---------- */}
      <SectionCard section={sec.rubric} numbered={isIssuer}>
        <div className="grid grid-cols-2 gap-2.5">
          <ScoreCard
            title="Nilai Kinerja" score={autoScore} grade={autoGrade} term="dua-nilai" onHelp={setHelp}
            hint="Dihitung otomatis dari catatan aplikasi."
          />
          <ScoreCard
            title="Nilai Penilaian" score={liveRubric} grade={rubricGrade} term="kriteria-kosong" onHelp={setHelp}
            hint={frozen ? 'Penilaian pembimbing.' : `${progress.done}/${progress.total} kriteria terisi.`}
          />
        </div>

        {!frozen && (
          <p className="mt-2.5 flex items-start gap-2 rounded-xl bg-brand-50 p-2.5 text-[11px] leading-relaxed text-stone-600 dark:bg-brand-500/10 dark:text-slate-300">
            <span>Nilai Kinerja masih dihitung ulang setiap kali dibuka. Angkanya dibekukan saat HR menerbitkan.</span>
            <InfoDot term="nilai-berubah" onOpen={setHelp} label="Kenapa nilainya bisa berubah" />
          </p>
        )}

        <div className="mt-3"><Breakdown components={components} onHelp={setHelp} /></div>

        {/* rubric, right under the objective numbers on purpose */}
        <div className={clsx(panel, 'mt-3')}>
          <p className="flex items-center gap-1 text-sm font-medium text-stone-700 dark:text-slate-200">
            Penilaian Pembimbing
            <InfoDot term="kriteria-kosong" onOpen={setHelp} label="Boleh mengosongkan kriteria" />
          </p>
          <p className="mb-3 text-[11px] leading-relaxed text-stone-500 dark:text-slate-400">
            Kosongkan kriteria yang tidak dinilai — yang kosong diabaikan, bukan dihitung nol.
          </p>

          <div className="flex flex-col gap-3">
            {rubric.map((r, i) => (
              <div key={r.key}>
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 pt-2 text-sm leading-snug text-stone-700 dark:text-slate-200">
                    {r.label}
                    <span className="ml-1 whitespace-nowrap text-[11px] text-stone-400 dark:text-slate-500">bobot {r.weight}</span>
                  </p>
                  {editable ? (
                    <input
                      type="number" min={0} max={100} inputMode="numeric"
                      aria-label={`Nilai ${r.label}`}
                      className={clsx(field, '!w-20 shrink-0 text-right tabular-nums')}
                      value={draftText[r.key] ?? (r.score === null ? '' : String(r.score))}
                      onChange={(e) => setDraftText((d) => ({ ...d, [r.key]: e.target.value }))}
                      onBlur={(e) => {
                        // Clamp on commit, never per keystroke: clamping while someone types
                        // turns "90" into "9" the moment it passes the cap.
                        const v = clampScore(e.target.value)
                        setRubric((rows) => rows.map((x, j) => (j === i ? { ...x, score: v } : x)))
                        setDraftText((d) => {
                          const next = { ...d }
                          delete next[r.key]
                          return next
                        })
                      }}
                    />
                  ) : (
                    <span className="w-20 shrink-0 pt-2 text-right text-sm tabular-nums text-stone-800 dark:text-slate-100">
                      {r.score === null ? '—' : r.score}
                    </span>
                  )}
                </div>
                {editable ? (
                  <input
                    className={clsx(field, 'mt-1.5 text-xs')} placeholder="Catatan (opsional)"
                    aria-label={`Catatan ${r.label}`}
                    value={r.comment}
                    onChange={(e) => setRubric((rows) => rows.map((x, j) => (j === i ? { ...x, comment: e.target.value } : x)))}
                  />
                ) : r.comment ? (
                  <p className="mt-0.5 text-[11px] text-stone-500 dark:text-slate-400">{r.comment}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <p className={label}>Catatan pembimbing<span className={hintText}>dicetak di sertifikat</span></p>
          {editable ? (
            <textarea
              className={clsx(field, 'min-h-[80px] resize-y')} value={form.summary}
              placeholder="Kalimat singkat yang akan dicetak di sertifikat."
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
            />
          ) : (
            <p className="text-sm text-stone-700 dark:text-slate-200">{doc?.summary || '—'}</p>
          )}
        </div>
        {doc && saveButton}
      </SectionCard>

      {/* ---------- 3 · send to HR / publish (and revoke, once issued) ---------- */}
      {(isIssuer || actions.length > 0) && (
        <SectionCard section={sec.status} numbered={isIssuer}>
          {doc ? (
            actions.length > 0 ? (
              <div className="flex flex-col gap-2">
                {actions.map((target) => (
                  <button
                    key={target}
                    onClick={() => onTransition(target)}
                    disabled={setStatus.isPending}
                    className={clsx(
                      'flex items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold transition active:scale-[0.98] disabled:opacity-50',
                      target === 'Published' && 'bg-emerald-600 text-white',
                      target === 'Revoked' && 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
                      target === 'Pending HR' && 'bg-amber-500 text-white',
                      target === 'Draft' && 'bg-paper-line text-stone-700 dark:bg-slate-700 dark:text-slate-200',
                    )}
                  >
                    {target === 'Published' && <ShieldCheck className="h-4 w-4" />}
                    {target === 'Revoked' && <ShieldX className="h-4 w-4" />}
                    {target === 'Pending HR' && <Send className="h-4 w-4" />}
                    {target === 'Draft' && <Undo2 className="h-4 w-4" />}
                    {ACTION_LABEL[target]}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500 dark:text-slate-400">Tidak ada tindakan untukmu saat ini.</p>
            )
          ) : (
            <p className="text-sm text-stone-500 dark:text-slate-400">
              Simpan draf dulu — tombol untuk mengajukan atau menerbitkan muncul setelah sertifikat tersimpan.
            </p>
          )}
        </SectionCard>
      )}

      {/* ---------- 4 · view and share ---------- */}
      <SectionCard section={sec.share} numbered={isIssuer}>
        {doc && canDownload(doc) ? (
          <div className="flex flex-col gap-2">
            <a
              href={certificateApi.certificatePdfUrl(doc.name, true)}
              target="_blank"
              rel="noopener"
              className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 font-semibold text-white transition active:scale-[0.98]"
            >
              <Eye className="h-4 w-4" /> Lihat sertifikat
            </a>
            <a
              href={certificateApi.certificatePdfUrl(doc.name)}
              className="flex items-center justify-center gap-2 rounded-2xl border border-paper-edge bg-paper-card px-4 py-3 font-semibold text-stone-700 transition active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Download className="h-4 w-4" /> Unduh PDF
            </a>
            {doc.verify_url && (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(doc.verify_url!)
                  toast('success', 'Tautan verifikasi disalin.')
                }}
                className="flex items-center justify-center gap-2 rounded-2xl border border-paper-edge bg-paper-card px-4 py-3 text-sm font-medium text-stone-600 transition active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <Link2 className="h-4 w-4" /> Salin tautan verifikasi
                <InfoDot term="qr" onOpen={setHelp} label="Apa yang dibuktikan QR" />
              </button>
            )}
          </div>
        ) : (
          <p className="flex items-start gap-1.5 text-sm text-stone-500 dark:text-slate-400">
            <Award className="mt-0.5 h-4 w-4 shrink-0" />
            {doc?.status === 'Revoked' ? sec.share.desc : 'PDF dan QR baru tersedia setelah HR menerbitkan sertifikat ini.'}
          </p>
        )}
      </SectionCard>

      <CertificateHelpSheet term={help} onClose={() => setHelp(null)} />
    </DetailScreen>
  )
}
