import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, Check, ImagePlus, Users } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { uploadRewardImage } from '@/lib/api'
import { deleteErrorMessage } from '@/lib/format'
import { useSaveEvent, useDeleteEvent, useManagedEvent, useManagedEvents } from '@/hooks/useData'
import type { EventFormPayload } from '@/lib/types'
import { EVENT_CATEGORIES } from '@/lib/events'
import { SearchableSelect } from '@/components/SearchableSelect'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

// Frappe stores 'YYYY-MM-DD HH:MM:SS'; <input type=datetime-local> wants 'YYYY-MM-DDTHH:MM'.
const toInput = (v?: string | null) => (v ? v.slice(0, 16).replace(' ', 'T') : '')
const toFrappe = (v: string) => (v ? v.replace('T', ' ') + (v.length === 16 ? ':00' : '') : '')

const empty: EventFormPayload = {
  title: '', description: '', cover_image: null, start_datetime: '', end_datetime: '',
  location: '', capacity: 0, pricing: 'Free', points_cost: 0, price: 0, status: 'Draft',
  category: '', is_featured: false, parent_event: '',
}

export default function EventFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const save = useSaveEvent()
  const del = useDeleteEvent()
  const { data: existing, isLoading: loading } = useManagedEvent(name, isEdit)
  const managedEvents = useManagedEvents()

  const [form, setForm] = useState<EventFormPayload>(empty)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Seed the edit form from get_managed_event (gated by _can_manage server-side,
  // so a non-SM organizer can load their own Draft — Vernon Event is SM-only-read
  // via /api/resource, which is why we use the admin endpoint instead).
  useEffect(() => {
    if (!isEdit || !existing) return
    const d = existing as Record<string, unknown>
    setForm({
      title: (d.title as string) ?? '',
      description: (d.description as string) ?? '',
      cover_image: (d.cover_image as string) ?? null,
      start_datetime: toInput(d.start_datetime as string),
      end_datetime: toInput(d.end_datetime as string),
      location: (d.location as string) ?? '',
      capacity: (d.capacity as number) ?? 0,
      pricing: (d.pricing as EventFormPayload['pricing']) ?? 'Free',
      points_cost: (d.points_cost as number) ?? 0,
      price: (d.price as number) ?? 0,
      status: (d.status as string) ?? 'Draft',
      category: (d.category as string) ?? '',
      is_featured: !!d.is_featured,
      parent_event: (d.parent_event as string) ?? '',
    })
  }, [isEdit, existing])

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    try {
      const url = await uploadRewardImage(f)
      setForm((s) => ({ ...s, cover_image: url }))
      toast('success', 'Image uploaded')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onSave = () => {
    if (!form.title.trim()) return toast('error', 'Title is required')
    if (!form.start_datetime) return toast('error', 'Start is required')
    const payload: EventFormPayload = {
      ...form,
      title: form.title.trim(),
      start_datetime: toFrappe(form.start_datetime),
      end_datetime: form.end_datetime ? toFrappe(form.end_datetime) : null,
      capacity: Number(form.capacity) || 0,
      points_cost: Number(form.points_cost) || 0,
      price: Number(form.price) || 0,
    }
    save.mutate(
      { payload, name: isEdit ? name : undefined },
      {
        onSuccess: () => { toast('success', isEdit ? 'Event saved' : 'Event created'); navigate('/events?tab=manage') },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this event?', confirmLabel: 'Delete', destructive: true }))) return
    del.mutate(name, {
      onSuccess: () => { toast('success', 'Event deleted'); navigate('/events?tab=manage') },
      onError: (e) => toast('error', deleteErrorMessage(e, 'event')),
    })
  }

  if (isEdit && loading) {
    return <DetailScreen title="Event"><Spinner className="mx-auto h-5 w-5 text-slate-400" /></DetailScreen>
  }

  return (
    <DetailScreen title={isEdit ? 'Edit event' : 'New event'}>
      <div className="flex flex-col gap-4">
        {/* cover image */}
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex h-36 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-800">
          {uploading ? <Spinner className="h-5 w-5" /> : form.cover_image
            ? <img src={form.cover_image} alt="" className="h-full w-full object-cover" />
            : <span className="flex flex-col items-center gap-1 text-xs"><ImagePlus className="h-6 w-6" /> Cover image</span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />

        <input className={field} placeholder="Title" value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        <textarea className={field} rows={3} placeholder="Description" value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        <input className={field} placeholder="Location (address or URL)" value={form.location ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
        <div className="flex gap-3">
          <label className="flex-1 text-xs font-semibold text-slate-500">Start
            <input type="datetime-local" className={field} value={form.start_datetime}
              onChange={(e) => setForm((f) => ({ ...f, start_datetime: e.target.value }))} /></label>
          <label className="flex-1 text-xs font-semibold text-slate-500">End
            <input type="datetime-local" className={field} value={form.end_datetime ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, end_datetime: e.target.value }))} /></label>
        </div>
        <div className="flex gap-3">
          <label className="flex-1 text-xs font-semibold text-slate-500">Capacity (0=∞)
            <input type="text" inputMode="numeric" className={field} value={String(form.capacity)}
              onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value.replace(/[^\d]/g, '')) }))} /></label>
          <label className="flex-1 text-xs font-semibold text-slate-500">Pricing
            <select className={field} value={form.pricing}
              onChange={(e) => setForm((f) => ({ ...f, pricing: e.target.value as EventFormPayload['pricing'] }))}>
              <option>Free</option><option>Points</option><option>Rupiah</option>
            </select></label>
        </div>
        {form.pricing === 'Points' && (
          <label className="text-xs font-semibold text-slate-500">Points cost
            <input type="text" inputMode="numeric" className={field} value={String(form.points_cost)}
              onChange={(e) => setForm((f) => ({ ...f, points_cost: Number(e.target.value.replace(/[^\d]/g, '')) }))} /></label>
        )}
        {form.pricing === 'Rupiah' && (
          <label className="text-xs font-semibold text-slate-500">Price (Rp)
            <input type="text" inputMode="numeric" className={field} value={String(form.price)}
              onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value.replace(/[^\d]/g, '')) }))} /></label>
        )}
        <label className="text-xs font-semibold text-slate-500">Status
          <select className={field} value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            <option>Draft</option><option>Published</option><option>Cancelled</option><option>Completed</option>
          </select></label>

        <label className="text-xs font-semibold text-slate-500">Category
          <select className={field} value={form.category ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            <option value="">— Uncategorized —</option>
            {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>

        <label className="text-xs font-semibold text-slate-500">Parent event (leave empty for a top-level event)
          <SearchableSelect
            value={form.parent_event ?? ''}
            onChange={(v) => setForm((f) => ({ ...f, parent_event: v }))}
            options={(managedEvents.data ?? []).filter((m) => m.name !== name).map((m) => ({ value: m.name, label: m.title }))}
            placeholder="— None (top-level) —"
            allowClear
          /></label>

        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={!!form.is_featured}
            onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          Featured (show in hero)
        </label>

        <button onClick={onSave} disabled={save.isPending || uploading}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
          {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} {isEdit ? 'Save changes' : 'Create event'}
        </button>

        {isEdit && (
          <>
            <button onClick={() => navigate(`/events/manage/${encodeURIComponent(name)}/roster`)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-brand-600 shadow-sm active:scale-95 dark:bg-slate-800">
              <Users className="h-4 w-4" /> Registrations
            </button>
            <button onClick={remove} disabled={del.isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-sm active:bg-rose-50 disabled:opacity-60 dark:bg-slate-800">
              {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete event
            </button>
          </>
        )}
      </div>
    </DetailScreen>
  )
}
