// Shared real-photo picker — used by both self-service profile screens and the PhotoGate.
// Uploads via uploadProfilePhoto and hands the saved URL back through onChange. Carries the
// "must be a real photo" guidance. Presentation is intentionally neutral so both design
// systems (mobile Soft-Pop, web bento) can drop it in.
import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { Spinner } from './ui'
import { uploadProfilePhoto } from '../lib/api'

export function PhotoUpload({
  value,
  onChange,
}: {
  value?: string | null
  onChange: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const pick = async (file?: File | null) => {
    // Reset the input so picking the SAME file again (e.g. after a failed upload) still fires change.
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    setBusy(true)
    setErr(null)
    try {
      onChange(await uploadProfilePhoto(file))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal mengunggah foto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600">
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-400">
            <Camera className="h-7 w-7" />
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Spinner className="h-5 w-5 text-white" />
          </span>
        )}
      </div>
      <div className="min-w-0">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-60"
        >
          {value ? 'Ganti Foto' : 'Unggah Foto'}
        </button>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Gunakan foto asli wajahmu — bukan avatar, kartun, atau logo.
        </p>
        {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
      </div>
    </div>
  )
}
