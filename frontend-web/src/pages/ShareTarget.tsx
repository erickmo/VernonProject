import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@web/components/ui'
import { CreateProjectItemDialog } from '@web/components/CreateProjectItemDialog'
import { parseSharedPayload, sharedTodoInitial } from '@/lib/shareTarget'

/**
 * The web half of the share target (/w/share?title&text&url), same contract as
 * /m/share. The OS share sheet itself can only reach an installed PWA, which on
 * this app is /m — but the link it produces is an ordinary URL, so opening it on
 * the desktop has to land somewhere too, and a /w user pasting or bookmarking it
 * gets the same prefilled form rather than a 404.
 *
 * Nothing is created here either: the dialog is the ordinary create form, and on
 * web it already carries its own project → detail picker (pickMode), so this page
 * is just "parse the share, hand it the prefill".
 */
export default function ShareTarget() {
  const nav = useNavigate()
  const { search } = useLocation()
  const shared = useMemo(() => parseSharedPayload(search), [search])
  const [open, setOpen] = useState(true)

  if (!shared) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Konten ini belum bisa dipakai</h1>
        <p className="mt-2 text-sm text-muted">
          Yang dibagikan tidak berisi teks atau tautan yang bisa dibaca. Coba bagikan ulang, atau buat
          tugas dari daftar proyek.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="ghost" onClick={() => nav(-1)}>
            Kembali
          </Button>
          <Button variant="primary" onClick={() => nav('/projects', { replace: true })}>
            Buka Proyek
          </Button>
        </div>
      </div>
    )
  }

  const initial = sharedTodoInitial(shared)

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Bagikan ke Vernon</h1>
      <p className="mt-2 break-words text-sm text-muted">{initial.toDo}</p>
      {!open && (
        <Button className="mt-6" variant="primary" onClick={() => setOpen(true)}>
          Buka form tugas
        </Button>
      )}
      <CreateProjectItemDialog
        open={open}
        onClose={() => setOpen(false)}
        initial={initial}
        // replace: the share URL must not sit in history behind the new todo, or
        // Back re-opens the same prefilled form.
        onCreated={(name) => nav(`/project-item/${name}`, { replace: true })}
      />
    </div>
  )
}
