import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Ban, Check, FileText, Mail, MessageCircle } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { Page, PageHeader } from '@web/components/Page'
import { DateTimePicker } from '@web/components/DatePicker'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Dialog } from '@web/components/overlays/Dialog'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { recruitmentApi, APPLICATION_STATUSES } from '@/lib/api'

const field = 'w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none'
const area = 'min-h-[80px] w-full resize-y rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none'

// Bahasa WhatsApp templates. {name}=full_name, {job}=job_title.
const waMsg = {
  invite: (name: string, job: string) => `Halo ${name}, kami dari VernonCorp. Kami tertarik dengan lamaran Anda untuk posisi ${job} dan ingin mengundang Anda untuk wawancara. Kapan Anda tersedia?`,
  accept: (name: string, job: string) => `Halo ${name}, selamat! Anda kami terima untuk posisi ${job} di VernonCorp. Kami akan menghubungi Anda untuk langkah berikutnya.`,
  reject: (name: string, job: string) => `Halo ${name}, terima kasih sudah melamar posisi ${job} di VernonCorp. Untuk saat ini kami belum bisa melanjutkan lamaran Anda. Semoga sukses selalu.`,
}
const waHref = (wa: string, msg: string) => `https://wa.me/${wa.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`

const waBtn = 'inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition active:scale-[0.97]'

export default function RecruitmentApplication() {
  const { name } = useParams()
  const toast = useToast()
  const confirm = useConfirm()

  const q = useQuery({
    queryKey: ['recruitment', 'application', name],
    queryFn: () => recruitmentApi.getApplication(name!),
    enabled: !!name,
  })
  const d = q.data

  const [grades, setGrades] = useState<Record<string, string>>({})
  const [interviewAt, setInterviewAt] = useState('')
  const [interviewNotes, setInterviewNotes] = useState('')
  const [savingGrades, setSavingGrades] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingInterview, setSavingInterview] = useState(false)
  const [blacklistOpen, setBlacklistOpen] = useState(false)
  const [blacklistReason, setBlacklistReason] = useState('')

  useEffect(() => {
    if (!d) return
    const g: Record<string, string> = {}
    d.answers.forEach((a) => {
      if (a.qtype === 'Free Text') g[String(a.idx)] = a.points_awarded != null ? String(a.points_awarded) : ''
    })
    setGrades(g)
    setInterviewAt(d.interview_at ? d.interview_at.slice(0, 16).replace(' ', 'T') : '')
    setInterviewNotes(d.interview_notes ?? '')
  }, [d])

  if (q.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (q.isError || !d) return <div className="py-10"><ErrorState onRetry={() => q.refetch()} /></div>

  const saveGrades = async () => {
    const payload: Record<string, number> = {}
    d.answers.forEach((a) => {
      if (a.qtype !== 'Free Text') return
      const v = grades[String(a.idx)]
      if (v != null && v !== '') payload[String(a.idx)] = Number(v)
    })
    setSavingGrades(true)
    try {
      await recruitmentApi.gradeApplication(d.name, payload)
      toast('success', 'Nilai tersimpan')
      q.refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSavingGrades(false)
    }
  }

  const changeStatus = async (status: string) => {
    setSavingStatus(true)
    try {
      await recruitmentApi.setApplicationStatus(d.name, status)
      toast('success', 'Status diperbarui')
      q.refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSavingStatus(false)
    }
  }

  const saveInterview = async () => {
    if (!interviewAt) return toast('error', 'Pilih tanggal & jam wawancara')
    setSavingInterview(true)
    try {
      await recruitmentApi.scheduleInterview(d.name, interviewAt, interviewNotes.trim() || undefined)
      toast('success', 'Jadwal wawancara tersimpan')
      q.refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSavingInterview(false)
    }
  }

  const addBlacklist = async () => {
    try {
      await recruitmentApi.addBlacklist(d.nik_ktp, d.full_name, blacklistReason.trim())
      toast('success', 'Ditambahkan ke blacklist')
      setBlacklistOpen(false)
      setBlacklistReason('')
      q.refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const removeBlacklist = async () => {
    const ok = await confirm({ title: 'Hapus dari blacklist?', message: `KTP ${d.nik_ktp} akan bisa melamar lagi.`, confirmLabel: 'Hapus' })
    if (!ok) return
    try {
      await recruitmentApi.removeBlacklist(d.nik_ktp)
      toast('success', 'Dihapus dari blacklist')
      q.refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <Page>
      <PageHeader icon={FileText} title={d.full_name} subtitle={d.job_title} />

      {d.blacklist_flag ? (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">KTP masuk blacklist.</span>{' '}
            {d.blacklist_reason || 'Tidak ada alasan tercatat.'}
          </div>
        </div>
      ) : null}

      <BentoGrid>
        <BentoTile span="wide" tone="plain" title="Applicant">
          <div className="mt-1 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <a href={`mailto:${d.email}`} className="inline-flex items-center gap-1.5 text-brand-600 hover:underline">
                <Mail className="h-4 w-4" /> {d.email}
              </a>
              <span className="text-muted">{d.phone}</span>
              {d.nik_ktp ? <span className="text-muted">KTP: {d.nik_ktp}</span> : null}
            </div>
            {d.cv ? (
              <a href={d.cv} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand-600 hover:underline">
                <FileText className="h-4 w-4" /> Lihat CV
              </a>
            ) : null}
            {d.wa ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <a className={waBtn} href={waHref(d.wa, waMsg.invite(d.full_name, d.job_title))} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-3.5 w-3.5" /> Undang wawancara
                </a>
                <a className={waBtn} href={waHref(d.wa, waMsg.accept(d.full_name, d.job_title))} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-3.5 w-3.5" /> Terima
                </a>
                <a className={waBtn} href={waHref(d.wa, waMsg.reject(d.full_name, d.job_title))} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-3.5 w-3.5" /> Tolak
                </a>
              </div>
            ) : null}
            <div className="pt-1">
              {d.blacklist_flag ? (
                <button onClick={removeBlacklist}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink hover:bg-hover/[0.04]">
                  <Ban className="h-3.5 w-3.5" /> Remove from blacklist
                </button>
              ) : (
                <button onClick={() => setBlacklistOpen(true)} disabled={!d.nik_ktp}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10">
                  <Ban className="h-3.5 w-3.5" /> Blacklist KTP
                </button>
              )}
            </div>
          </div>
        </BentoTile>

        <BentoTile span="md" tone="tint" accent="brand" title="Status">
          <div className="mt-1 space-y-3">
            <SearchableSelect
              value={d.status}
              onChange={changeStatus}
              options={APPLICATION_STATUSES.map((s) => ({ value: s, label: s }))}
            />
            {savingStatus && <div className="text-xs text-muted"><Spinner className="mr-1 inline h-3 w-3" /> Menyimpan…</div>}
            <div className="text-sm text-muted">
              Score: <span className="font-semibold text-ink tabular-nums">{d.score}/{d.max_score}</span>
              {' · '}<span className={d.grading_status === 'Needs Grading' ? 'font-semibold text-amber-600 dark:text-amber-400' : ''}>{d.grading_status}</span>
            </div>
          </div>
        </BentoTile>

        {d.cover_letter ? (
          <BentoTile span="full" tone="plain" title="Cover letter">
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{d.cover_letter}</p>
          </BentoTile>
        ) : null}

        {(d.psych_result || d.logical_max) ? (
          <BentoTile span="full" tone="plain" title="Assessment">
            <div className="mt-1 flex flex-col gap-3">
              {d.overall_fit != null && (
                <div className="rounded-xl bg-brand-600 px-4 py-3 text-white">
                  <p className="text-xs opacity-80">Kecocokan keseluruhan</p>
                  <p className="text-2xl font-bold">{d.overall_fit}%</p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {d.psych_result?.disc && (
                  <Bars title={`DISC — dominan ${d.disc_type}`} scores={d.psych_result.disc.scores}
                    order={['D', 'I', 'S', 'C']} fit={d.disc_fit} />
                )}
                {d.psych_result?.personality && (
                  <Bars title="Kepribadian (Big Five)" scores={d.psych_result.personality.scores}
                    order={['O', 'C', 'E', 'A', 'N']} fit={d.personality_fit} />
                )}
              </div>
              {!!d.logical_max && (
                <div className="rounded-xl bg-hover/[0.04] px-4 py-3 text-sm">
                  <span className="font-semibold text-ink">Logika</span>
                  <span className="ml-2 text-muted">{d.logical_score} / {d.logical_max}</span>
                </div>
              )}
            </div>
          </BentoTile>
        ) : null}

        <BentoTile span="full" tone="plain" title="Test answers">
          {d.answers.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Tidak ada soal tes.</p>
          ) : (
            <div className="mt-1 space-y-3">
              {d.answers.map((a) => (
                <div key={a.idx} className="rounded-xl bg-hover/[0.04] p-4">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <span className="text-sm font-semibold text-ink">{a.question_text}</span>
                    <span className="shrink-0 text-xs text-muted">{a.qtype}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted">{a.answer || '—'}</p>
                  <div className="mt-2 flex items-center gap-3 text-sm">
                    {a.qtype === 'Free Text' ? (
                      <label className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted">Points</span>
                        <input
                          type="number"
                          min={0}
                          max={a.max_points}
                          className="w-20 rounded-xl border border-line bg-canvas px-2 py-1 text-sm text-ink focus:border-brand-600 focus:outline-none"
                          value={grades[String(a.idx)] ?? ''}
                          onChange={(e) => setGrades((g) => ({ ...g, [String(a.idx)]: e.target.value }))}
                        />
                        <span className="text-xs text-muted">/ {a.max_points}</span>
                      </label>
                    ) : (
                      <span className={a.is_correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                        {a.is_correct ? '✓' : '✗'} {a.points_awarded ?? 0}/{a.max_points}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={saveGrades} disabled={savingGrades}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition">
                {savingGrades ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Save grades
              </button>
            </div>
          )}
        </BentoTile>

        <BentoTile span="full" tone="plain" title="Schedule interview">
          <div className="mt-1 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Tanggal & jam</label>
              <DateTimePicker value={interviewAt} onChange={setInterviewAt} className={field} />
              {d.interview_at ? <p className="mt-1 text-xs text-muted">Terjadwal: {d.interview_at}</p> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Catatan</label>
              <textarea className={area} value={interviewNotes} onChange={(e) => setInterviewNotes(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <button onClick={saveInterview} disabled={savingInterview}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition">
                {savingInterview ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Simpan jadwal
              </button>
            </div>
          </div>
        </BentoTile>
      </BentoGrid>

      <Dialog
        open={blacklistOpen}
        onClose={() => setBlacklistOpen(false)}
        title="Blacklist KTP"
        onSubmit={addBlacklist}
        footer={
          <>
            <button type="button" onClick={() => setBlacklistOpen(false)}
              className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-hover/[0.04]">Batal</button>
            <button type="submit"
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Blacklist</button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">KTP <span className="font-semibold text-ink">{d.nik_ktp}</span> ({d.full_name}) tidak akan bisa melamar lagi.</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Alasan</label>
            <textarea className={area} value={blacklistReason} onChange={(e) => setBlacklistReason(e.target.value)} />
          </div>
        </div>
      </Dialog>
    </Page>
  )
}

function Bars({ title, scores, order, fit }: {
  title: string; scores: Record<string, number>; order: string[]; fit: number | null
}) {
  return (
    <div className="rounded-xl bg-hover/[0.04] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">{title}</span>
        {fit != null && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">Fit {fit}%</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        {order.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-8 text-xs font-semibold text-muted">{k}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-hover/[0.08]">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${scores[k] ?? 0}%` }} />
            </div>
            <span className="w-8 text-right text-xs tabular-nums text-muted">{scores[k] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
