import { useState } from 'react'
import { X, Copy, Check, FlaskConical } from 'lucide-react'
import type { Opt2, FoodAudience, FoodInvite } from '@/lib/types'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { useCreateFoodInvite, useFoodInvitableUsers, useProjects } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Button, IconButton } from '@web/components/ui'
import { DateTimePicker } from '@web/components/DatePicker'
import { FoodInviteModal } from '@/components/FoodInviteModal'

const TEST_INVITE: FoodInvite = {
  name: 'test', message: "Nasi Padang yuk, gw lapar banget 😋", place: 'Padang Sederhana',
  order_by: new Date(Date.now() + 3600_000).toISOString(), inviter: 'me', inviter_name: 'Kamu',
  is_inviter: false, closed: false, my_response: null, yes_count: 0, no_count: 0, yes_names: [],
}

const AUDIENCE: { value: FoodAudience; label: string }[] = [
  { value: 'Specific', label: 'Orang tertentu' },
  { value: 'Internal', label: 'Semua Internal Team' },
  { value: 'Project', label: 'Tim proyek' },
  { value: 'Link', label: 'Siapa saja (lewat link)' },
]

const FIELD =
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

function inviteLink(name: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}food/${name}`
}

export function CreateFoodInviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const create = useCreateFoodInvite()
  const projects = useProjects()
  const invitable = useFoodInvitableUsers()

  const [message, setMessage] = useState('')
  const [place, setPlace] = useState('')
  const [orderBy, setOrderBy] = useState('')
  const [audience, setAudience] = useState<FoodAudience>('Specific')
  const [users, setUsers] = useState<string[]>([])
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [testOpen, setTestOpen] = useState(false)

  if (!open) return null

  const submit = () => {
    if (!message.trim()) return toast('error', 'Tulis ajakannya dulu')
    if (!orderBy) return toast('error', 'Pilih batas waktu pesan')
    if (audience === 'Specific' && !users.length) return toast('error', 'Pilih minimal satu orang')
    if (audience === 'Project' && !projectIds.length) return toast('error', 'Pilih minimal satu tim')
    create.mutate(
      {
        message: message.trim(),
        order_by: orderBy,
        audience_type: audience,
        place: place.trim() || undefined,
        users: audience === 'Specific' ? users : undefined,
        projects: audience === 'Project' ? projectIds : undefined,
      },
      {
        onSuccess: (r) => {
          toast('success', 'Undangan terkirim! 🍜')
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

  const userOptions: Opt2[] = (invitable.data?.users ?? []).map((u) => ({ value: u.user, label: u.full_name || u.user }))
  const projectOptions: Opt2[] = (projects.data ?? [])
    .filter((p) => p.status !== 'Closed')
    .map((p) => ({ value: p.name, label: p.project_name ?? p.name }))

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 text-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">🍜 Makan Bareng</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTestOpen(true)}
              className="flex items-center gap-1 rounded-full bg-hover/[0.06] px-2.5 py-1 text-xs font-semibold text-muted"
            >
              <FlaskConical className="h-3.5 w-3.5" />Test
            </button>
            <IconButton onClick={onClose} aria-label="Tutup"><X className="h-5 w-5" /></IconButton>
          </div>
        </div>
        {testOpen && <FoodInviteModal invite={TEST_INVITE} onDone={() => setTestOpen(false)} />}

        {link ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Undangan sudah muncul di layar mereka. Bagikan link ini juga:</p>
            <div className="flex items-center gap-2">
              <input readOnly value={link} className={FIELD + ' flex-1'} onFocus={(e) => e.target.select()} />
              <Button variant="primary" onClick={copy} aria-label="Salin link">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="primary" className="w-full" onClick={onClose}>Selesai</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <textarea className={FIELD} placeholder="Ajakan, mis. 'Nasi Padang yuk!'" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
            <input className={FIELD} placeholder="Tempat (opsional), mis. Padang Sederhana" value={place} onChange={(e) => setPlace(e.target.value)} />
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Batas pesan</label>
              <DateTimePicker value={orderBy} onChange={setOrderBy} aria-label="Batas waktu pesan" />
            </div>
            <SearchableSelect value={audience} onChange={(v) => setAudience(v as FoodAudience)} options={AUDIENCE} placeholder="Undang siapa…" />
            {audience === 'Specific' && (
              <MultiSelectSearch value={users} onChange={setUsers} options={userOptions} placeholder="Pilih orang…" />
            )}
            {audience === 'Project' && (
              <MultiSelectSearch value={projectIds} onChange={setProjectIds} options={projectOptions} placeholder="Pilih tim…" />
            )}
            <Button variant="primary" className="w-full" onClick={submit} disabled={create.isPending}>Kirim ajakan</Button>
          </div>
        )}
      </div>
    </div>
  )
}
