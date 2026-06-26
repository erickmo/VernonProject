import { useNavigate } from 'react-router-dom'
import { StickyNote } from 'lucide-react'

export function NotesButton() {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate('/notes')}
      aria-label="Notes"
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 transition active:scale-90 active:bg-slate-200/60 dark:active:bg-slate-700"
    >
      <StickyNote className="h-6 w-6" />
    </button>
  )
}
