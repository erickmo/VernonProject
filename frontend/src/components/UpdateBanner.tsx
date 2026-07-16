import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X } from 'lucide-react'
import { useAppUpdate } from '@/lib/appUpdate'
import { useAppReleases } from '@/hooks/useData'

export default function UpdateBanner() {
  const navigate = useNavigate()
  const { updateAvailable, applyUpdate } = useAppUpdate()
  // Show the real user-facing version from What's New, not version.json's
  // pkg.version (which never bumps and always read "1.0.0").
  const { data: releases } = useAppReleases('Mobile')
  const shownVersion = releases?.[0]?.version
  const [dismissed, setDismissed] = useState(false)

  if (!updateAvailable || dismissed) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+4.75rem)]">
      <div className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-3 shadow-card animate-pop">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-800 dark:text-slate-50">Update available</p>
          <p className="text-xs text-stone-400 dark:text-slate-500">
            {shownVersion ? `Version ${shownVersion} is ready` : 'A newer version is ready'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => navigate('/whats-new')}
            className="rounded-full bg-paper-line px-3 py-1.5 text-xs font-semibold text-stone-500 active:scale-95 dark:bg-slate-700 dark:text-slate-200"
          >
            What's new
          </button>
          <button
            onClick={applyUpdate}
            className="rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
          >
            Update
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 active:scale-90 active:bg-paper-line dark:text-slate-500 dark:active:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
