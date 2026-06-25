import { useState } from 'react'
import { LogOut, KeyRound, Smartphone, Sparkles } from 'lucide-react'
import { useBoot } from '@/hooks/useData'
import { logout } from '@/lib/api'
import { Avatar } from '@/components/ui'
import { ChangePasswordDialog } from '@web/components/ChangePasswordDialog'
import { BentoGrid, BentoTile } from '@web/components/bento'

export default function Me({ onReplayOnboarding }: { onReplayOnboarding?: () => void }) {
  const boot = useBoot()
  const [pwOpen, setPwOpen] = useState(false)
  const b = boot.data

  const doLogout = async () => {
    await logout()
    window.location.href = '/w'
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Me</h1>

      <BentoGrid>
        {/* Profile hero */}
        <BentoTile span="lg" tall tone="gradient" accent="violet" title="Profile">
          <div className="flex flex-1 items-center gap-5 pt-2">
            <Avatar name={b?.full_name ?? '?'} image={b?.image ?? undefined} size={72} />
            <div className="min-w-0">
              <div className="text-xl font-semibold">{b?.full_name}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{b?.user}</div>
              <div className="flex flex-wrap gap-1 mt-3">
                {(b?.roles ?? []).map((r) => (
                  <span
                    key={r}
                    className="text-xs px-2 py-0.5 rounded-full bg-white/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </BentoTile>

        {/* Settings & links */}
        <BentoTile span="md" tone="tint" accent="slate" title="Settings">
          <div className="divide-y divide-slate-200/60 dark:divide-slate-700/60 -mx-5 mt-1">
            <button
              onClick={() => setPwOpen(true)}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-slate-100/60 dark:hover:bg-slate-800/60"
            >
              <KeyRound className="w-4 h-4" />
              Change password
            </button>
            <a
              href="/m"
              className="w-full flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-100/60 dark:hover:bg-slate-800/60"
            >
              <Smartphone className="w-4 h-4" />
              Open mobile app
            </a>
            {onReplayOnboarding && (
              <button
                onClick={onReplayOnboarding}
                className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left hover:bg-slate-100/60 dark:hover:bg-slate-800/60"
              >
                <Sparkles className="w-4 h-4" />
                Replay onboarding
              </button>
            )}
            <button
              onClick={doLogout}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </div>
        </BentoTile>
      </BentoGrid>

      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  )
}
