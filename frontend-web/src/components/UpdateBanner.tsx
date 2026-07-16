import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X } from 'lucide-react'
import { useAppUpdate } from '@/lib/appUpdate'
import { useAppReleases } from '@/hooks/useData'
import { Button, IconButton } from '@web/components/ui'

// Global toast shown when a newer build is live. Renders null unless an update
// is pending, so it's safe to mount once in the shell.
export default function UpdateBanner() {
  const { updateAvailable, applyUpdate } = useAppUpdate()
  // Real user-facing version from What's New, not version.json's pkg.version
  // (frozen at "0.0.0").
  const { data: releases } = useAppReleases('Web')
  const shownVersion = releases?.[0]?.version
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)

  if (!updateAvailable || dismissed) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-line bg-surface p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            Update available{shownVersion ? ` (${shownVersion})` : ''}
          </p>
          <p className="mt-0.5 text-xs text-muted">A newer version is ready to load.</p>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => applyUpdate()}>
              Update
            </Button>
            <button
              onClick={() => navigate('/whats-new')}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              What's new
            </button>
          </div>
        </div>
        <IconButton size="sm" aria-label="Dismiss" onClick={() => setDismissed(true)}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  )
}
