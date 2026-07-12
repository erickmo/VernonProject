import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { safeDecode } from '@web/lib/route'
import { ArrowLeft, Trash2, Check, ImagePlus, Users } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { ErrorState, Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { uploadRewardImage } from '@/lib/api'
import { deleteErrorMessage } from '@/lib/format'
import { useSaveEvent, useDeleteEvent, useManagedEvent, useManagedEvents } from '@/hooks/useData'
import type { EventFormPayload } from '@/lib/types'
import { EVENT_CATEGORIES } from '@/lib/events'

const field =
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

// Frappe stores 'YYYY-MM-DD HH:MM:SS'; <input type=datetime-local> wants 'YYYY-MM-DDTHH:MM'.
const toInput = (v?: string | null) => (v ? v.slice(0, 16).replace(' ', 'T') : '')
const toFrappe = (v: string) => (v ? v.replace('T', ' ') + (v.length === 16 ? ':00' : '') : '')

const empty: EventFormPayload = {
  title: '', description: '', cover_image: null, start_datetime: '', end_datetime: '',
  location: '', capacity: 0, pricing: 'Free', points_cost: 0, price: 0, status: 'Draft',
  category: '', is_featured: false, parent_event: '',
}

export default function EventForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? safeDecode(rawName) : ''
  const isEdit = !!name
  const save = useSaveEvent()
  const del = useDeleteEvent()
  const managedEvents = useManagedEvents()
  const { data: existing, isLoading: loading } = useManagedEvent(name, isEdit)

  const [form, setForm] = useState<EventFormPayload>(empty)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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
    return <div className="flex justify-center py-20"><Spinner /></div>
  }

  if (isEdit && !loading && !existing) {
    return (
      <ErrorState
        title="Not found"
        subtitle="This event could not be found. It may have been deleted."
        onRetry={() => navigate('/events?tab=manage')}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate('/events?tab=manage')}
          className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 mb-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Events
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {isEdit ? 'Edit event' : 'New event'}
        </h1>
      </div>

      <BentoGrid>
        <BentoTile span="wide" tone="plain">
          <form
            onSubmit={(e) => { e.preventDefault(); onSave() }}
            className="flex flex-col gap-4"
          >
            {/* Cover image */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-hover/[0.04] text-muted hover:bg-hover/[0.08] transition-colors"
            >
              {uploading ? (
                <Spinner className="h-5 w-5" />
              ) : form.cover_image ? (
                <img src={form.cover_image} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1 text-xs">
                  <ImagePlus className="h-6 w-6" /> Cover image
                </span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Title" required className="sm:col-span-2">
                {(id) => (
                  <input
                    id={id}
                    className={field}
                    placeholder="Event title"
                    value={form.title}
                    autoFocus={!isEdit}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                )}
              </Field>

              <Field label="Description" className="sm:col-span-2">
                {(id) => (
                  <textarea
                    id={id}
                    className={field}
                    rows={3}
                    placeholder="What's this event about?"
                    value={form.description ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                )}
              </Field>

              <Field label="Location">
                {(id) => (
                  <input
                    id={id}
                    className={field}
                    placeholder="Address or URL"
                    value={form.location ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  />
                )}
              </Field>

              <Field label="Status">
                {(id) => (
                  <SearchableSelect
                    id={id}
                    value={form.status}
                    onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                    options={[{ value: 'Draft', label: 'Draft' }, { value: 'Published', label: 'Published' }, { value: 'Cancelled', label: 'Cancelled' }, { value: 'Completed', label: 'Completed' }]}
                  />
                )}
              </Field>

              <Field label="Start" required>
                {(id) => (
                  <input
                    id={id}
                    type="datetime-local"
                    className={field}
                    value={form.start_datetime}
                    onChange={(e) => setForm((f) => ({ ...f, start_datetime: e.target.value }))}
                  />
                )}
              </Field>

              <Field label="End">
                {(id) => (
                  <input
                    id={id}
                    type="datetime-local"
                    className={field}
                    value={form.end_datetime ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, end_datetime: e.target.value }))}
                  />
                )}
              </Field>

              <Field label="Capacity (0 = unlimited)">
                {(id) => (
                  <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    className={field}
                    value={String(form.capacity)}
                    onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value.replace(/[^\d]/g, '')) }))}
                  />
                )}
              </Field>

              <Field label="Pricing">
                {(id) => (
                  <SearchableSelect
                    id={id}
                    value={form.pricing}
                    onChange={(v) => setForm((f) => ({ ...f, pricing: v as EventFormPayload['pricing'] }))}
                    options={[{ value: 'Free', label: 'Free' }, { value: 'Points', label: 'Points' }, { value: 'Rupiah', label: 'Rupiah' }]}
                  />
                )}
              </Field>

              <Field label="Category">
                {(id) => (
                  <SearchableSelect
                    id={id}
                    value={form.category ?? ''}
                    onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                    options={EVENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
                    placeholder="— Uncategorized —"
                  />
                )}
              </Field>

              <Field label="Parent event (empty = top-level)">
                {(id) => (
                  <SearchableSelect
                    id={id}
                    value={form.parent_event ?? ''}
                    onChange={(v) => setForm((f) => ({ ...f, parent_event: v }))}
                    options={(managedEvents.data ?? []).filter((m) => m.name !== name).map((m) => ({ value: m.name, label: m.title }))}
                    placeholder="— None (top-level) —"
                    allowClear
                  />
                )}
              </Field>

              <Field label="Featured" className="sm:col-span-2">
                {(id) => (
                  <label htmlFor={id} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      id={id}
                      type="checkbox"
                      checked={!!form.is_featured}
                      onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
                      className="h-4 w-4 rounded border-line accent-brand-600"
                    />
                    Show in the Browse hero
                  </label>
                )}
              </Field>

              {form.pricing === 'Points' && (
                <Field label="Points cost">
                  {(id) => (
                    <input
                      id={id}
                      type="text"
                      inputMode="numeric"
                      className={field}
                      value={String(form.points_cost)}
                      onChange={(e) => setForm((f) => ({ ...f, points_cost: Number(e.target.value.replace(/[^\d]/g, '')) }))}
                    />
                  )}
                </Field>
              )}

              {form.pricing === 'Rupiah' && (
                <Field label="Price (Rp)">
                  {(id) => (
                    <input
                      id={id}
                      type="text"
                      inputMode="numeric"
                      className={field}
                      value={String(form.price)}
                      onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value.replace(/[^\d]/g, '')) }))}
                    />
                  )}
                </Field>
              )}
            </div>

            <button
              type="submit"
              disabled={save.isPending || uploading}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {isEdit ? 'Save changes' : 'Create event'}
            </button>
          </form>
        </BentoTile>

        {isEdit && (
          <BentoTile span="md" tone="plain">
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => navigate(`/events/manage/${encodeURIComponent(name)}/roster`)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line py-3 text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-600/10 transition-colors"
              >
                <Users className="h-4 w-4" /> Registrations
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={del.isPending}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-50 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-60 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 transition-colors"
              >
                {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                Delete event
              </button>
            </div>
          </BentoTile>
        )}
      </BentoGrid>
    </div>
  )
}
