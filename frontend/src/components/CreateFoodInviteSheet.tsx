import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Copy, Check, FlaskConical, Users } from 'lucide-react'
import type { Opt2, FoodAudience, FoodInvite } from '@/lib/types'
import { MultiSelectSearch } from './MultiSelectSearch'
import { SearchableSelect } from './SearchableSelect'
import { useCreateFoodInvite, useFoodInvitableUsers, useProjects } from '@/hooks/useData'
import { useToast } from './Toast'
import { FoodInviteModal } from './FoodInviteModal'

const TEST_INVITE: FoodInvite = {
  name: 'test', message: "Nasi Padang yuk, gw lapar banget 😋", place: 'Padang Sederhana',
  order_by: new Date(Date.now() + 3600_000).toISOString(), inviter: 'me', inviter_name: 'Kamu',
  is_inviter: false, closed: false, my_response: null,
  yes_count: 0, no_count: 0, pending_count: 0, yes_names: [], no_names: [], pending_names: [],
}

const AUDIENCE: { value: FoodAudience; label: string }[] = [
  { value: 'Specific', label: 'Orang tertentu' },
  { value: 'Internal', label: 'Semua Internal Team' },
  { value: 'Project', label: 'Tim proyek' },
  { value: 'Link', label: 'Siapa saja (lewat link)' },
]

function inviteLink(name: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}food/${name}`
}

export function CreateFoodInviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const navigate = useNavigate()
  const create = useCreateFoodInvite()
  const projects = useProjects()
  const invitable = useFoodInvitableUsers()

  const [message, setMessage] = useState('')
  const [place, setPlace] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [audience, setAudience] = useState<FoodAudience>('Specific')
  const [users, setUsers] = useState<string[]>([])
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [invite, setInvite] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [testOpen, setTestOpen] = useState(false)

  const reset = () => {
    setMessage(''); setPlace(''); setDate(''); setTime('')
    setAudience('Specific'); setUsers([]); setProjectIds([]); setInvite(null); setLink(null); setCopied(false)
  }
  const close = () => { reset(); onClose() }

  const submit = () => {
    if (!message.trim()) return toast('error', 'Tulis ajakannya dulu')
    if (!date) return toast('error', 'Pilih tanggal batas pesan')
    if (audience === 'Specific' && !users.length) return toast('error', 'Pilih minimal satu orang')
    if (audience === 'Project' && !projectIds.length) return toast('error', 'Pilih minimal satu tim')
    const order_by = `${date}T${time || '12:00'}`
    create.mutate(
      {
        message: message.trim(),
        order_by,
        audience_type: audience,
        place: place.trim() || undefined,
        users: audience === 'Specific' ? users : undefined,
        projects: audience === 'Project' ? projectIds : undefined,
      },
      {
        onSuccess: (r) => {
          toast('success', 'Undangan terkirim! 🍜')
          setInvite(r.invite ?? null)
          setLink(r.invite ? inviteLink(r.invite) : null)
        },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  const copy = async () => {
    if (!link) return
    try { await navigator.clipboard.writeText(link); setCopied(true); toast('success', 'Link disalin') }
    catch { toast('error', 'Gagal menyalin') }
  }

  if (!open) return null

  const field =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100'

  const userOptions: Opt2[] = (invitable.data?.users ?? []).map((u) => ({ value: u.user, label: u.full_name || u.user }))
  const projectOptions: Opt2[] = (projects.data ?? [])
    .filter((p) => p.status !== 'Closed')
    .map((p) => ({ value: p.name, label: p.project_name ?? p.name }))

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={close}>
      <div className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-5 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">🍜 Makan Bareng</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTestOpen(true)}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300"
            >
              <FlaskConical className="h-3.5 w-3.5" />Test
            </button>
            <button onClick={close} className="rounded-full p-1 text-slate-400"><X className="h-5 w-5" /></button>
          </div>
        </div>
        {testOpen && <FoodInviteModal invite={TEST_INVITE} onDone={() => setTestOpen(false)} />}

        {link ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">Undangan sudah dikirim ke layar mereka. Bagikan link ini juga:</p>
            <div className="flex items-center gap-2">
              <input readOnly value={link} className={field + ' flex-1'} onFocus={(e) => e.target.select()} />
              <button onClick={copy} className="rounded-xl bg-brand-600 p-2.5 text-white" aria-label="Salin link">
                {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
            {invite && (
              <button
                onClick={() => { reset(); navigate(`/food/${invite}`) }}
                className="mt-1 flex items-center justify-center gap-1.5 rounded-xl border border-brand-600 py-2.5 text-sm font-semibold text-brand-600 dark:border-brand-300 dark:text-brand-300"
              >
                <Users className="h-4 w-4" />Lihat siapa yang ikut
              </button>
            )}
            <button onClick={close} className="rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white">Selesai</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <textarea className={field} placeholder="Ajakan, mis. 'Nasi Padang yuk!'" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
            <input className={field} placeholder="Tempat (opsional), mis. Padang Sederhana" value={place} onChange={(e) => setPlace(e.target.value)} />
            <div className="flex gap-3">
              <input className={field + ' flex-1'} type="date" aria-label="Tanggal batas pesan" value={date} onChange={(e) => setDate(e.target.value)} />
              <input className={field + ' flex-1'} type="time" aria-label="Jam batas pesan" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <SearchableSelect value={audience} onChange={(v) => setAudience(v as FoodAudience)} options={AUDIENCE} placeholder="Undang siapa…" />
            {audience === 'Specific' && (
              <MultiSelectSearch value={users} onChange={setUsers} options={userOptions} placeholder="Pilih orang…" />
            )}
            {audience === 'Project' && (
              <MultiSelectSearch value={projectIds} onChange={setProjectIds} options={projectOptions} placeholder="Pilih tim…" />
            )}
            <button onClick={submit} disabled={create.isPending} className="mt-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              Kirim ajakan
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
