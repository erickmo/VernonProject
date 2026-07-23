import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, MessageCircle, FileText, Mail, Ban, CalendarClock } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useBoot, canManageRecruitment } from '@/hooks/useData'
import { recruitmentApi, APPLICATION_STATUSES } from '@/lib/api'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

const waLink = (wa: string, msg: string) =>
  `https://wa.me/${wa.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`

const WA_TEMPLATES = {
  invite: (name: string, job: string) =>
    `Halo ${name}, kami dari VernonCorp. Kami tertarik dengan lamaran Anda untuk posisi ${job} dan ingin mengundang Anda untuk wawancara. Kapan Anda tersedia?`,
  accept: (name: string, job: string) =>
    `Halo ${name}, selamat! Anda kami terima untuk posisi ${job} di VernonCorp. Kami akan menghubungi Anda untuk langkah berikutnya.`,
  reject: (name: string, job: string) =>
    `Halo ${name}, terima kasih sudah melamar posisi ${job} di VernonCorp. Untuk saat ini kami belum bisa melanjutkan lamaran Anda. Semoga sukses selalu.`,
}

export default function RecruitmentApplicationScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const { data: boot } = useBoot()
  const blocked = !!boot && !canManageRecruitment(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const { data: app, isLoading, refetch } = useQuery({
    queryKey: ['recruitmentApplication', name],
    queryFn: () => recruitmentApi.getApplication(name),
    enabled: !!name && canManageRecruitment(boot),
  })

  const [grades, setGrades] = useState<Record<string, string>>({})
  const [interviewAt, setInterviewAt] = useState('')
  const [interviewNotes, setInterviewNotes] = useState('')
  const [showBlacklist, setShowBlacklist] = useState(false)
  const [blacklistReason, setBlacklistReason] = useState('')
  const [busy, setBusy] = useState(false)

  // Seed local form state whenever the record (re)loads.
  useEffect(() => {
    if (!app) return
    const seeded: Record<string, string> = {}
    for (const a of app.answers) {
      if (a.qtype === 'Free Text' && a.points_awarded != null) seeded[String(a.idx)] = String(a.points_awarded)
    }
    setGrades(seeded)
    setInterviewAt(app.interview_at ? app.interview_at.replace(' ', 'T').slice(0, 16) : '')
    setInterviewNotes(app.interview_notes ?? '')
  }, [app])

  if (blocked) return null
  if (isLoading) {
    return (
      <DetailScreen title="Lamaran">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }
  if (!app) {
    return (
      <DetailScreen title="Lamaran">
        <EmptyState icon={Ban} title="Lamaran tidak ditemukan" />
      </DetailScreen>
    )
  }

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      toast('success', okMsg)
      await refetch()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveGrades = () => {
    const payload: Record<string, number> = {}
    for (const a of app.answers) {
      if (a.qtype !== 'Free Text') continue
      const raw = grades[String(a.idx)]
      if (raw === undefined || raw === '') continue
      payload[String(a.idx)] = Number(raw) || 0
    }
    run(() => recruitmentApi.gradeApplication(name, payload), 'Nilai tersimpan')
  }

  const changeStatus = (status: string) => run(() => recruitmentApi.setApplicationStatus(name, status), 'Status diperbarui')

  const saveInterview = () => {
    if (!interviewAt) return toast('error', 'Pilih tanggal & jam wawancara')
    run(() => recruitmentApi.scheduleInterview(name, interviewAt.replace('T', ' '), interviewNotes || undefined), 'Jadwal tersimpan')
  }

  const addBlacklist = () => {
    if (!blacklistReason.trim()) return toast('error', 'Alasan wajib diisi')
    run(async () => {
      await recruitmentApi.addBlacklist(app.nik_ktp, app.full_name, blacklistReason.trim())
      setShowBlacklist(false)
      setBlacklistReason('')
    }, 'Ditambahkan ke blacklist')
  }

  const removeBlacklist = async () => {
    if (!(await confirm({ title: 'Hapus dari blacklist?', confirmLabel: 'Hapus', destructive: true }))) return
    run(() => recruitmentApi.removeBlacklist(app.nik_ktp), 'Dihapus dari blacklist')
  }

  const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800'
  const label = 'mb-1 block text-xs font-semibold text-slate-500'

  return (
    <DetailScreen title="Lamaran">
      <div className="flex flex-col gap-4">
        {app.blacklist_flag ? (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">KTP masuk blacklist</p>
              {app.blacklist_reason && <p className="text-xs">{app.blacklist_reason}</p>}
            </div>
          </div>
        ) : null}

        {/* Identity */}
        <div className={card}>
          <p className="text-base font-bold text-stone-900 dark:text-slate-50">{app.full_name}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{app.job_title || app.job_opening}</p>
          <div className="mt-3 flex flex-col gap-1.5 text-sm">
            {app.email && (
              <a href={`mailto:${app.email}`} className="flex items-center gap-2 text-brand-600 dark:text-brand-300">
                <Mail className="h-4 w-4" /> {app.email}
              </a>
            )}
            {app.nik_ktp && <p className="text-slate-600 dark:text-slate-300">NIK: {app.nik_ktp}</p>}
            {app.cv && (
              <a href={app.cv} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-brand-600 dark:text-brand-300">
                <FileText className="h-4 w-4" /> Lihat CV
              </a>
            )}
          </div>
          {app.wa && (
            <div className="mt-3">
              <p className={label}>WhatsApp ({app.phone})</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['Undang', 'invite'],
                  ['Terima', 'accept'],
                  ['Tolak', 'reject'],
                ] as const).map(([txt, key]) => (
                  <a
                    key={key}
                    href={waLink(app.wa, WA_TEMPLATES[key](app.full_name, app.job_title || ''))}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white active:scale-95"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> {txt}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {app.cover_letter && (
          <div className={card}>
            <p className={label}>Surat lamaran</p>
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{app.cover_letter}</p>
          </div>
        )}

        {/* Assessment */}
        {(app.psych_result || app.logical_max) && (
          <div className="flex flex-col gap-3">
            {app.overall_fit != null && (
              <div className="rounded-2xl bg-brand-600 p-4 text-white shadow-sm">
                <p className="text-xs opacity-80">Kecocokan keseluruhan</p>
                <p className="text-2xl font-bold">{app.overall_fit}%</p>
              </div>
            )}
            {app.psych_result?.disc && (
              <Bars title={`DISC — dominan ${app.disc_type}`} scores={app.psych_result.disc.scores}
                order={['D', 'I', 'S', 'C']} fit={app.disc_fit} />
            )}
            {app.psych_result?.personality && (
              <Bars title="Kepribadian (Big Five)" scores={app.psych_result.personality.scores}
                order={['O', 'C', 'E', 'A', 'N']} fit={app.personality_fit} />
            )}
            {!!app.logical_max && (
              <div className={card}>
                <span className="text-sm font-bold text-stone-800 dark:text-slate-100">Logika</span>
                <span className="ml-2 text-sm text-slate-600 dark:text-slate-300">{app.logical_score} / {app.logical_max}</span>
              </div>
            )}
          </div>
        )}

        {/* Answers */}
        {app.answers.length > 0 && (
          <div className={card}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-stone-800 dark:text-slate-100">Jawaban tes</p>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {app.score}/{app.max_score}
                {app.grading_status === 'Needs Grading' ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    Perlu dinilai
                  </span>
                ) : null}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {app.answers.map((a) => (
                <div key={a.idx} className="rounded-xl border border-slate-100 p-3 dark:border-slate-700">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{a.question_text}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500 dark:text-slate-400">{a.answer || '—'}</p>
                  {a.qtype === 'Free Text' ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={a.max_points}
                        className={field + ' w-24'}
                        value={grades[String(a.idx)] ?? ''}
                        onChange={(e) => setGrades((g) => ({ ...g, [String(a.idx)]: e.target.value }))}
                        placeholder="0"
                      />
                      <span className="text-xs text-slate-400">/ {a.max_points} poin</span>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs font-semibold">
                      {a.is_correct ? (
                        <span className="text-emerald-600 dark:text-emerald-400">✓ Benar</span>
                      ) : (
                        <span className="text-rose-500">✗ Salah</span>
                      )}
                      <span className="ml-2 text-slate-400">
                        {a.points_awarded ?? 0}/{a.max_points} poin
                      </span>
                    </p>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={saveGrades}
              disabled={busy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Simpan nilai
            </button>
          </div>
        )}

        {/* Status */}
        <div className={card}>
          <p className={label}>Status lamaran</p>
          <SearchableSelect
            value={app.status}
            onChange={changeStatus}
            options={APPLICATION_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </div>

        {/* Interview */}
        <div className={card}>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-stone-800 dark:text-slate-100">
            <CalendarClock className="h-4 w-4" /> Jadwal wawancara
          </p>
          <input
            type="datetime-local"
            className={field}
            value={interviewAt}
            onChange={(e) => setInterviewAt(e.target.value)}
          />
          <textarea
            className={field + ' mt-2 min-h-[60px] resize-y'}
            value={interviewNotes}
            onChange={(e) => setInterviewNotes(e.target.value)}
            placeholder="Catatan (opsional)"
          />
          <button
            onClick={saveInterview}
            disabled={busy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
          >
            {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Simpan jadwal
          </button>
        </div>

        {/* Blacklist */}
        {app.blacklist_flag ? (
          <button
            onClick={removeBlacklist}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-stone-600 active:scale-95 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
          >
            <Ban className="h-4 w-4" /> Hapus dari blacklist
          </button>
        ) : showBlacklist ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
            <p className="mb-2 text-sm font-semibold text-rose-600">Blacklist KTP {app.nik_ktp}</p>
            <textarea
              className={field}
              rows={2}
              value={blacklistReason}
              onChange={(e) => setBlacklistReason(e.target.value)}
              placeholder="Alasan"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setShowBlacklist(false)}
                className="flex-1 rounded-xl bg-white py-2.5 text-sm font-semibold text-stone-600 shadow-sm dark:bg-slate-700 dark:text-slate-200"
              >
                Batal
              </button>
              <button
                onClick={addBlacklist}
                disabled={busy}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Blacklist
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowBlacklist(true)}
            disabled={!app.nik_ktp}
            className="flex items-center justify-center gap-2 rounded-xl border border-rose-200 py-2.5 text-sm font-semibold text-rose-600 active:scale-95 disabled:opacity-40 dark:border-rose-500/30"
          >
            <Ban className="h-4 w-4" /> Blacklist KTP
          </button>
        )}
      </div>
    </DetailScreen>
  )
}

function Bars({ title, scores, order, fit }: {
  title: string; scores: Record<string, number>; order: string[]; fit: number | null
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-stone-800 dark:text-slate-100">{title}</span>
        {fit != null && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">Fit {fit}%</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        {order.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-8 text-xs font-bold text-slate-500">{k}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${scores[k] ?? 0}%` }} />
            </div>
            <span className="w-8 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">{scores[k] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
