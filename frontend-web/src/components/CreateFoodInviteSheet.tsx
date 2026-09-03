import { useState } from 'react'
import { X, Copy, Check } from 'lucide-react'
import type { Opt2, FoodAudience } from '@/lib/types'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MultiSelectSearch } from '@/components/MultiSelectSearch'
import { useCreateFoodInvite, useFoodInvitableUsers, useProjects } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Button, IconButton } from '@web/components/ui'
import { DateTimePicker } from '@web/components/DatePicker'

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
  const [project, setProject] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const submit = () => {
    if (!message.trim()) return toast('error', 'Tulis ajakannya dulu')
    if (!orderBy) return toast('error', 'Pilih batas waktu pesan')
    if (audience === 'Specific' && !users.length) return toast('error', 'Pilih minimal satu orang')
    if (audience === 'Project' && !project) return toast('error', 'Pilih proyek')
    create.mutate(
      {
        message: message.trim(),
        order_by: orderBy,
        audience_type: audience,
        place: place.trim() || undefined,
        users: audience === 'Specific' ? users : undefined,
        project: audience === 'Project' ? project : undefined,
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
          <IconButton onClick={onClose} aria-label="Tutup"><X className="h-5 w-5" /></IconButton>
        </div>

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
              <SearchableSelect value={project} onChange={setProject} options={projectOptions} placeholder="Pilih proyek…" />
            )}
            <Button variant="primary" className="w-full" onClick={submit} disabled={create.isPending}>Kirim ajakan</Button>
          </div>
        )}
      </div>
    </div>
  )
}
