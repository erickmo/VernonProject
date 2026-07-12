import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { safeDecode } from '@web/lib/route'
import { ArrowLeft, Trash2, Check } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState, Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { deleteErrorMessage } from '@/lib/format'
import {
  useRoom,
  useCreateRoom,
  useUpdateRoom,
  useDeleteRoom,
  useBoot,
  canManageResources,
} from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

export default function MeetingRoomForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? safeDecode(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useRoom(name, isEdit)
  const create = useCreateRoom()
  const update = useUpdateRoom()
  const del = useDeleteRoom()

  const [form, setForm] = useState<{
    room_name: string
    capacity: string
    location: string
    is_active: boolean
  }>({ room_name: '', capacity: '', location: '', is_active: true })
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isEdit && existing) {
      setForm({
        room_name: existing.room_name,
        capacity: existing.capacity != null ? String(existing.capacity) : '',
        location: existing.location ?? '',
        is_active: existing.is_active !== 0,
      })
    }
  }, [isEdit, existing])

  const blocked = !boot ? false : !canManageResources(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (blocked) return null

  if (isEdit && isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (isEdit && !isLoading && !existing) {
    return (
      <ErrorState
        title="Not found"
        subtitle="This meeting room could not be found. It may have been deleted."
        onRetry={() => navigate('/meeting-rooms')}
      />
    )
  }

  const goBack = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Leave without saving?',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
      })
      if (!ok) return
    }
    navigate('/meeting-rooms')
  }

  const validate = (): string | null => {
    if (!form.room_name.trim()) return 'Room name is required'
    return null
  }

  const save = () => {
    const err = validate()
    if (err) {
      setError(err)
      toast('error', err)
      return
    }
    setError('')
    const opts = {
      onSuccess: () => {
        toast('success', isEdit ? 'Room updated' : 'Room created')
        navigate('/meeting-rooms')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    const roomName = form.room_name.trim()
    const payload: Record<string, unknown> = {
      room_name: roomName,
      capacity: form.capacity ? Number(form.capacity) : null,
      location: form.location,
      is_active: form.is_active ? 1 : 0,
    }
    if (isEdit) {
      update.mutate({ name, payload }, opts)
    } else {
      // ponytail: autoname:prompt — name must be set explicitly on create
      create.mutate({ ...payload, name: roomName }, opts)
    }
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this room?', confirmLabel: 'Delete', destructive: true })))
      return
    del.mutate(name, {
      onSuccess: () => {
        toast('success', 'Room deleted')
        navigate('/meeting-rooms')
      },
      onError: (e) => toast('error', deleteErrorMessage(e, 'room')),
    })
  }

  const saving = create.isPending || update.isPending

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 mb-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Meeting Rooms
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {isEdit ? 'Edit room' : 'New room'}
        </h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <BentoGrid>
          <BentoTile span="lg" tone="plain" title="Room details">
            <div className="mt-1 max-w-md space-y-4">
              <Field
                label="Room name"
                required
                error={error}
                hint={isEdit ? "Can't be changed after creation" : undefined}
              >
                {(id) => (
                  <input
                    id={id}
                    className={field + (isEdit ? ' bg-canvas text-muted' : '')}
                    value={form.room_name}
                    readOnly={isEdit}
                    autoFocus={!isEdit}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, room_name: e.target.value }))
                      setDirty(true)
                      if (error) setError('')
                    }}
                    placeholder="e.g. Board Room"
                  />
                )}
              </Field>

              <Field label="Capacity">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={1}
                    className={field}
                    value={form.capacity}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, capacity: e.target.value }))
                      setDirty(true)
                    }}
                    placeholder="e.g. 10"
                  />
                )}
              </Field>

              <Field label="Location">
                {(id) => (
                  <input
                    id={id}
                    className={field}
                    value={form.location}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, location: e.target.value }))
                      setDirty(true)
                    }}
                    placeholder="e.g. Floor 3"
                  />
                )}
              </Field>

              <Field label="Active">
                {(id) => (
                  <input
                    id={id}
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, is_active: e.target.checked }))
                      setDirty(true)
                    }}
                    className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
                  />
                )}
              </Field>

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {isEdit ? 'Save changes' : 'Create room'}
              </button>
            </div>
          </BentoTile>

          <BentoTile span="sm" tone="tint" accent="brand" title="Preview">
            <div className="mt-1 space-y-2">
              <p className="text-lg font-bold text-ink truncate">
                {form.room_name || <span className="opacity-40">Untitled</span>}
              </p>
              {form.location && <p className="text-xs text-muted">{form.location}</p>}
              {form.capacity && (
                <p className="text-xs text-muted">Capacity: {form.capacity}</p>
              )}
            </div>
          </BentoTile>

          {isEdit && (
            <BentoTile span="md" tone="plain" title="Danger zone">
              <div className="mt-1">
                <button
                  type="button"
                  onClick={remove}
                  disabled={del.isPending}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-surface py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/30 dark:hover:bg-rose-500/10 transition-colors"
                >
                  {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}{' '}
                  Delete room
                </button>
              </div>
            </BentoTile>
          )}
        </BentoGrid>
      </form>
    </div>
  )
}
