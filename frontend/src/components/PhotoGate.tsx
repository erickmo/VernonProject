// Blocking gate: when force_photo_upload is on and the Internal/Intern caller has no real
// photo, they must upload one before using the app. Uploading + saving invalidates the gate,
// team wall, and boot so the parent unmounts it. Shared by both frontends (web imports via @).
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { PhotoUpload } from './PhotoUpload'
import { usePhotoGate, useSaveMyProfile, keys } from '../hooks/useData'

export default function PhotoGate() {
  const { data } = usePhotoGate()
  const save = useSaveMyProfile()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  if (!data?.owed) return null

  const onUploaded = (url: string) => {
    setError(null)
    save.mutate(
      { photo: url },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: keys.photoGate })
          qc.invalidateQueries({ queryKey: keys.teamWall })
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Gagal menyimpan foto'),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/60 p-4 animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-slate-900">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
          <Camera className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-extrabold text-stone-800 dark:text-slate-100">
          Unggah foto asli kamu
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-500 dark:text-slate-400">
          Foto ini dipakai untuk name tag &amp; profil tim. Wajib <b>foto asli wajahmu</b> —
          bukan avatar, kartun, atau logo. Kamu bisa lanjut memakai aplikasi setelah mengunggahnya.
        </p>
        <div className="mt-5 flex justify-center">
          <PhotoUpload value={null} onChange={onUploaded} />
        </div>
        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 dark:bg-rose-500/10">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
