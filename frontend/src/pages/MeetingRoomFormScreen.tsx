import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, Check, DoorOpen } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
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
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

export default function MeetingRoomFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useRoom(name, isEdit)
  const create = useCreateRoom()
  const update = useUpdateRoom()
  const del = useDeleteRoom()

  const [form, setForm] = useState<{ room_name: string; capacity: string; location: string; is_active: boolean }>({
    room_name: '',
    capacity: '',
    location: '',
    is_active: true,
  })

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
      <DetailScreen title="Meeting Room">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  const validate = (): string | null => {
    if (!form.room_name.trim()) return 'Room name is required'
    return null
  }

  const save = () => {
    const err = validate()
    if (err) {
      toast('error', err)
      return
    }
    const opts = {
      onSuccess: () => {
        toast('success', isEdit ? 'Room updated' : 'Room created')
        navigate('/meeting-rooms')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    const payload = {
      room_name: form.room_name.trim(),
      capacity: form.capacity ? Number(form.capacity) : undefined,
      location: form.location.trim() || undefined,
      is_active: form.is_active ? 1 : 0,
    }
    if (isEdit) {
      update.mutate({ name, payload: { capacity: payload.capacity, location: payload.location, is_active: payload.is_active } }, opts)
    } else {
      // ponytail: autoname:prompt requires name === room_name on create
      create.mutate({ name: payload.room_name, ...payload }, opts)
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
    <DetailScreen title={isEdit ? 'Edit room' : 'New room'}>
      <div className="flex flex-col gap-4">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
          <DoorOpen className="h-6 w-6" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Room name</label>
          <input
            className={field + (isEdit ? ' bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400' : '')}
            value={form.room_name}
            readOnly={isEdit}
            onChange={(e) => setForm((f) => ({ ...f, room_name: e.target.value }))}
            placeholder="e.g. Boardroom A"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Location</label>
          <input
            className={field}
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="e.g. Floor 3"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Capacity</label>
          <input
            type="number"
            min={1}
            className={field}
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            placeholder="e.g. 10"
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            id="is_active"
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 accent-brand-600"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
          <label htmlFor="is_active" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Active
          </label>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {isEdit ? 'Save changes' : 'Create room'}
        </button>

        {isEdit && (
          <button
            onClick={remove}
            disabled={del.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-sm active:bg-rose-50 disabled:opacity-60 dark:bg-slate-800 dark:active:bg-rose-500/15"
          >
            {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete room
          </button>
        )}
      </div>
    </DetailScreen>
  )
}
