import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  Award, Download, Link2, ShieldCheck, ShieldX, Send, Undo2, Save, AlertTriangle, Check, Eye,
} from 'lucide-react'
import { Page, PageHeader } from '@web/components/Page'
import { InfoDot } from '@web/components/InfoDot'
import { DatePicker } from '@web/components/DatePicker'
// Button is web's own primitive; Spinner/EmptyState are shared from the mobile tree.
import { Button } from '@web/components/ui'
import { Spinner, EmptyState } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import {
  useCertificate, useCertificateAccess, useIssuableInterns, usePreviewScore, useSaveCertificate,
  useSetCertificateStatus,
} from '@/hooks/useData'
import { certificateApi } from '@/lib/api'
import {
  ACTION_LABEL, STATUS_LABEL, canDownload, certHelp, certSections, certificateSteps, clampScore, componentLabel,
  droppedComponents, fmtScore, gradeFor, gradeTone, rubricFrom, rubricProgress, rubricScore,
  type CertSection, type CertSectionKey, type CertStep, type CertStepState,
} from '@/lib/certificate'
import type { CertificateStatus, ScoreComponent } from '@/lib/types'

const field = 'w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink focus:border-brand-600 focus:outline-none'
// cqf4pucpee: grids wrap to a new row before a cell gets narrower than its label needs,
// instead of squeezing every cell into equal columns until labels break every few letters.
const FIELDS = 'grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]'
const PANELS = 'grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]'

const GRADE_STYLE: Record<string, string> = {
  good: 'bg-emerald-500 text-white', ok: 'bg-brand-600 text-white',
  warn: 'bg-amber-500 text-white', bad: 'bg-rose-500 text-white', none: 'bg-line text-muted',
}

function StepBadge({ n, state }: { n: number; state: CertStepState }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        state === 'done' && 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
        state === 'current' && 'bg-brand-600 text-white',
        state === 'todo' && 'bg-line text-muted',
      )}
    >
      {state === 'done' ? <Check className="h-4 w-4" /> : n}
    </span>
  )
}

/** One form section. For issuers it carries the number of the step it covers, and the
 *  section holding the current step is highlighted and says what to do. */
function SectionCard({ section, numbered, children }: { section: CertSection; numbered: boolean; children: ReactNode }) {
  const current = numbered && section.state === 'current'
  return (
    <section
      aria-labelledby={`cert-${section.key}`}
      className={clsx(
        'rounded-2xl border bg-surface p-5 transition',
        current ? 'border-brand-600/50 ring-1 ring-brand-600/20' : 'border-line',
      )}
    >
      <header className="mb-4 flex items-start gap-3">
        {numbered && <StepBadge n={section.n} state={section.state} />}
        <div className="min-w-0">
          <h2 id={`cert-${section.key}`} className="text-base font-semibold leading-7 text-ink">
            {numbered ? section.title : section.plain}
          </h2>
          {current && <p className="text-sm leading-relaxed text-muted">{section.desc}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={clsx('min-w-0', className)}>
      <span className="mb-1.5 flex flex-wrap items-baseline gap-x-1.5 text-sm font-medium text-ink">
        {label}
        {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </span>
      {children}
    </div>
  )
}

function ScoreTile({
  title, score, grade, hint, term,
}: { title: string; score: number | null; grade: string | null; hint: string; term: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas p-4">
      <p className="flex items-center text-sm font-medium text-muted">
        {title}<InfoDot term={term} lookup={certHelp} />
      </p>
      <p className="mt-1 flex items-baseline gap-2.5">
        <span className="text-4xl font-bold tabular-nums text-ink">{fmtScore(score)}</span>
        {grade && (
          <span className={clsx('rounded-full px-2.5 py-0.5 text-sm font-bold', GRADE_STYLE[gradeTone(grade)])}>
            {grade}
          </span>
        )}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{hint}</p>
    </div>
  )
}

function Breakdown({ components }: { components: ScoreComponent[] }) {
  const dropped = droppedComponents({ components })
  return (
    <div>
      {components.length === 0 ? (
        <p className="text-sm text-muted">Belum ada data yang bisa diukur pada periode ini.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {components.map((c) => (
            <div key={c.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="min-w-0 text-ink">{c.label}</span>
                <span className="tabular-nums text-ink">
                  {Math.round(c.value)}%
                  <span className="ml-1.5 text-xs text-muted">{c.detail}</span>
                  <span className="ml-3 text-xs text-muted">bobot {c.weight}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${c.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {dropped.length > 0 && (
        <p className="mt-4 rounded-xl bg-line/50 p-3 text-xs leading-relaxed text-muted">
          Tidak dinilai (tidak ada pembandingnya, bobotnya dibagi ke komponen lain):{' '}
          <span className="font-medium text-ink">{dropped.map(componentLabel).join(', ')}</span>.
          <InfoDot term="komponen-hilang" lookup={certHelp} />
        </p>
      )}
    </div>
  )
}

/** tmot7slo7q: the numbered path from "no certificate" to one you can show. Whole steps wrap
 *  to the next line rather than being squeezed into equal columns (cqf4pucpee). */
function StepsTile({ steps }: { steps: CertStep[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line bg-surface px-5 py-4" aria-label="Langkah membuat sertifikat">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2.5 whitespace-nowrap" aria-current={s.state === 'current' ? 'step' : undefined}>
          <StepBadge n={i + 1} state={s.state} />
          <span className={clsx('text-sm font-medium', s.state === 'current' ? 'text-ink' : 'text-muted')}>{s.label}</span>
        </li>
      ))}
    </ol>
  )
}

export default function Certificate() {
  const { name } = useParams<{ name: string }>()
  const isNew = !name || name === 'new'
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const detail = useCertificate(isNew ? undefined : name)
  const access = useCertificateAccess()
  const interns = useIssuableInterns(isNew)
  const save = useSaveCertificate()
  const setStatus = useSetCertificateStatus()

  const [form, setForm] = useState({
    intern: '', project: '', position: '', period_start: '', period_end: '', summary: '',
  })
  const [rubric, setRubric] = useState(rubricFrom(null))
  // Raw text per row so a half-typed "9" en route to "90" is never clamped mid-keystroke.
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

  const preview = usePreviewScore(
    form.intern || undefined, form.period_start, form.period_end, form.project || undefined,
    !frozen && !!form.intern && !!form.period_start && !!form.period_end,
  )

  const components = frozen ? (doc?.components ?? []) : (preview.data?.components ?? [])
  const autoScore = frozen ? (doc?.auto_score ?? null) : (preview.data?.auto_score ?? null)
  const autoGrade = frozen ? (doc?.auto_grade ?? null) : (preview.data?.grade ?? null)
  const liveRubric = frozen ? (doc?.rubric_score ?? null) : rubricScore(rubric)
  const rubricGrade = frozen ? (doc?.rubric_grade ?? null) : gradeFor(liveRubric)
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
      const text = await confirm({
        title: 'Cabut sertifikat ini?',
        message: 'Sertifikat tetap tersimpan dan QR-nya tetap bisa dipindai, tapi hasilnya berubah '
          + 'menjadi "telah dicabut" beserta alasan di bawah. Tindakan ini tidak bisa dibatalkan.',
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
    return <Page><div className="flex justify-center py-16"><Spinner /></div></Page>
  }
  if (!isNew && !doc) {
    return (
      <Page>
        <EmptyState icon={AlertTriangle} title="Tidak ditemukan" subtitle="Sertifikat ini tidak ada atau bukan milikmu." />
      </Page>
    )
  }

  // Issuers see the numbered steps; an intern opening their own certificate just reads it.
  const isIssuer = !!access.data?.can_issue
  const steps = certificateSteps(doc ? { status: doc.status, rubric } : null, doc ? doc.is_hr : !!access.data?.is_hr)
  const sec = Object.fromEntries(certSections(steps).map((s) => [s.key, s])) as Record<CertSectionKey, CertSection>
  const actions = doc?.actions ?? []

  // Save lives in the section whose step it completes: step 1 until the draft exists, then step 2.
  const saveButton = editable && (
    <div className="mt-5 flex justify-end border-t border-line pt-4">
      <Button onClick={onSave} disabled={save.isPending}>
        {save.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Simpan draf
      </Button>
    </div>
  )

  return (
    <Page>
      <PageHeader
        icon={Award}
        title={isNew ? 'Sertifikat Baru' : (doc?.intern_name ?? 'Sertifikat')}
        subtitle={doc ? `${STATUS_LABEL[doc.status]}${doc.cert_no ? ` · ${doc.cert_no}` : ''}` : undefined}
      />

      <div className="flex flex-col gap-5">
        {doc?.status === 'Revoked' && doc.revoke_reason && (
          <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
            Dicabut {doc.revoked_on}: {doc.revoke_reason}
          </p>
        )}

        {isIssuer && <StepsTile steps={steps} />}

        {/* ---------- 1 · who and when ---------- */}
        <SectionCard section={sec.intern} numbered={isIssuer}>
          <div className={FIELDS}>
            <Field label="Peserta magang" className="col-span-full">
              {isNew ? (
                <SearchableSelect
                  value={form.intern}
                  onChange={(v) => setForm((f) => ({ ...f, intern: v, project: '' }))}
                  options={internOptions}
                  placeholder="Pilih peserta magang"
                />
              ) : (
                <p className="text-sm font-medium text-ink">{doc?.intern_name}</p>
              )}
            </Field>

            <Field label="Proyek" hint="opsional">
              {editable ? (
                <SearchableSelect
                  value={form.project}
                  onChange={(v) => setForm((f) => ({ ...f, project: v }))}
                  options={projectOptions}
                  placeholder="Seluruh masa magang"
                  allowClear
                />
              ) : (
                <p className="text-sm text-ink">{doc?.project_name || 'Seluruh masa magang'}</p>
              )}
            </Field>

            <Field label="Posisi">
              {editable ? (
                <input
                  className={field} value={form.position} placeholder="mis. Frontend Developer Intern"
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                />
              ) : (
                <p className="text-sm text-ink">{doc?.position || '—'}</p>
              )}
            </Field>

            {(['period_start', 'period_end'] as const).map((k) => (
              <Field key={k} label={k === 'period_start' ? 'Mulai magang' : 'Selesai magang'}>
                {editable ? (
                  <DatePicker value={form[k]} onChange={(v: string) => setForm((f) => ({ ...f, [k]: v }))} />
                ) : (
                  <p className="text-sm text-ink">{doc?.[k]}</p>
                )}
              </Field>
            ))}
          </div>
          {!doc && saveButton}
        </SectionCard>

        {/* ---------- 2 · the two scores (never merged), the leader's rubric and the printed note ---------- */}
        <SectionCard section={sec.rubric} numbered={isIssuer}>
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
            <ScoreTile
              title="Nilai Kinerja" score={autoScore} grade={autoGrade} term="dua-nilai"
              hint="Dihitung otomatis dari tugas, ketepatan waktu, kehadiran, poin dan pembelajaran."
            />
            <ScoreTile
              title="Nilai Penilaian" score={liveRubric} grade={rubricGrade} term="kriteria-kosong"
              hint={frozen ? 'Penilaian pembimbing.' : `${progress.done}/${progress.total} kriteria terisi.`}
            />
          </div>

          {!frozen && (
            <p className="mt-3 flex items-center rounded-xl bg-line/50 p-3 text-xs leading-relaxed text-muted">
              Nilai Kinerja masih dihitung ulang setiap kali halaman ini dibuka. Angkanya dibekukan saat HR menerbitkan.
              <InfoDot term="nilai-berubah" lookup={certHelp} />
            </p>
          )}

          <div className={clsx(PANELS, 'mt-5')}>
            {/* the objective numbers, with the leader's judgement entered beside them on purpose */}
            <div className="rounded-xl border border-line p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink">Rincian Nilai Kinerja</h3>
              <Breakdown components={components} />
            </div>

            <div className="rounded-xl border border-line p-4">
              <h3 className="flex items-center text-sm font-semibold text-ink">
                Penilaian Pembimbing<InfoDot term="kriteria-kosong" lookup={certHelp} />
              </h3>
              <p className="mb-3 mt-0.5 text-xs text-muted">
                Kosongkan kriteria yang tidak dinilai — yang kosong diabaikan, bukan dihitung nol.
              </p>
              <div className="flex flex-col gap-3">
                {rubric.map((r, i) => (
                  <div key={r.key} className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">
                        {r.label}<span className="ml-1.5 whitespace-nowrap text-xs text-muted">bobot {r.weight}</span>
                      </p>
                      {editable ? (
                        <input
                          className={clsx(field, 'mt-1.5 text-xs')} placeholder="Catatan (opsional)"
                          aria-label={`Catatan ${r.label}`}
                          value={r.comment}
                          onChange={(e) => setRubric((rows) => rows.map((x, j) => (j === i ? { ...x, comment: e.target.value } : x)))}
                        />
                      ) : r.comment ? (
                        <p className="mt-0.5 text-xs text-muted">{r.comment}</p>
                      ) : null}
                    </div>
                    {editable ? (
                      <input
                        type="number" min={0} max={100} inputMode="numeric"
                        aria-label={`Nilai ${r.label}`}
                        className={clsx(field, 'w-20 shrink-0 text-right tabular-nums')}
                        value={draftText[r.key] ?? (r.score === null ? '' : String(r.score))}
                        onChange={(e) => setDraftText((d) => ({ ...d, [r.key]: e.target.value }))}
                        onBlur={(e) => {
                          // Clamp on commit, never per keystroke.
                          const v = clampScore(e.target.value)
                          setRubric((rows) => rows.map((x, j) => (j === i ? { ...x, score: v } : x)))
                          setDraftText((d) => { const n = { ...d }; delete n[r.key]; return n })
                        }}
                      />
                    ) : (
                      <span className="w-20 shrink-0 text-right text-sm tabular-nums text-ink">
                        {r.score === null ? '—' : r.score}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Field label="Catatan pembimbing" hint="dicetak di sertifikat" className="mt-5">
            {editable ? (
              <textarea
                className={clsx(field, 'min-h-[90px] resize-y')} value={form.summary}
                placeholder="Kalimat singkat yang akan dicetak di sertifikat."
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              />
            ) : (
              <p className="text-sm text-ink">{doc?.summary || '—'}</p>
            )}
          </Field>
          {doc && saveButton}
        </SectionCard>

        {/* ---------- 3 · send to HR / publish (and revoke, once issued) ---------- */}
        {(isIssuer || actions.length > 0) && (
          <SectionCard section={sec.status} numbered={isIssuer}>
            {doc ? (
              <>
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-line px-2.5 py-0.5 font-medium text-ink">{STATUS_LABEL[doc.status]}</span>
                  {doc.cert_no && <span className="font-mono text-muted">{doc.cert_no}</span>}
                </p>
                {actions.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {actions.map((target) => (
                      <Button
                        key={target}
                        variant={target === 'Published' ? 'primary' : 'secondary'}
                        onClick={() => onTransition(target)}
                        disabled={setStatus.isPending}
                      >
                        {target === 'Published' && <ShieldCheck className="h-4 w-4" />}
                        {target === 'Revoked' && <ShieldX className="h-4 w-4" />}
                        {target === 'Pending HR' && <Send className="h-4 w-4" />}
                        {target === 'Draft' && <Undo2 className="h-4 w-4" />}
                        {ACTION_LABEL[target]}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted">Tidak ada tindakan untukmu saat ini.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">
                Simpan draf dulu — tombol untuk mengajukan atau menerbitkan muncul setelah sertifikat tersimpan.
              </p>
            )}
          </SectionCard>
        )}

        {/* ---------- 4 · view and share ---------- */}
        <SectionCard section={sec.share} numbered={isIssuer}>
          {doc && canDownload(doc) ? (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                <a href={certificateApi.certificatePdfUrl(doc.name, true)} target="_blank" rel="noopener"
                   className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700">
                  <Eye className="h-4 w-4" /> Lihat sertifikat
                </a>
                <a href={certificateApi.certificatePdfUrl(doc.name)}
                   className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-line/50">
                  <Download className="h-4 w-4" /> Unduh PDF
                </a>
                {doc.verify_url && (
                  <button
                    onClick={() => { navigator.clipboard?.writeText(doc.verify_url!); toast('success', 'Tautan verifikasi disalin.') }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-medium text-muted transition hover:text-ink"
                  >
                    <Link2 className="h-4 w-4" /> Salin tautan verifikasi
                    <InfoDot term="qr" lookup={certHelp} />
                  </button>
                )}
              </div>
              <iframe
                src={certificateApi.certificatePdfUrl(doc.name, true)}
                title="Sertifikat"
                className="aspect-[297/210] w-full rounded-xl border border-line bg-white"
              />
            </>
          ) : (
            <p className="text-sm text-muted">
              {doc?.status === 'Revoked' ? sec.share.desc : 'PDF dan QR baru tersedia setelah HR menerbitkan sertifikat ini.'}
            </p>
          )}
        </SectionCard>
      </div>
    </Page>
  )
}
