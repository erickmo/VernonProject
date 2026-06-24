import { useState } from 'react'
import { LogOut, KeyRound, Smartphone, Sparkles } from 'lucide-react'
import { useBoot } from '@/hooks/useData'
import { logout } from '@/lib/api'
import { Avatar } from '@/components/ui'
import { ChangePasswordDialog } from '@web/components/ChangePasswordDialog'

export default function Me({ onReplayOnboarding }: { onReplayOnboarding?: () => void }) {
  const boot = useBoot()
  const [pwOpen, setPwOpen] = useState(false)
  const b = boot.data

  const doLogout = async () => {
    await logout()
    window.location.href = '/w'
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Me</h1>

      <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-card p-6 flex items-center gap-4">
        <Avatar name={b?.full_name ?? '?'} image={b?.image ?? undefined} size={56} />
        <div>
          <div className="text-lg font-semibold">{b?.full_name}</div>
          <div className="text-sm text-slate-500">{b?.user}</div>
          <div className="flex flex-wrap gap-1 mt-2">
            {(b?.roles ?? []).map((r) => (
              <span
                key={r}
                className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-card divide-y divide-slate-100 dark:divide-slate-800">
        <button
          onClick={() => setPwOpen(true)}
          className="w-full flex items-center gap-3 px-5 py-4 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <KeyRound className="w-4 h-4" />
          Change password
        </button>
        <a
          href="/m"
          className="w-full flex items-center gap-3 px-5 py-4 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Smartphone className="w-4 h-4" />
          Open mobile app
        </a>
        {onReplayOnboarding && (
          <button
            onClick={onReplayOnboarding}
            className="w-full flex items-center gap-3 px-5 py-4 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Sparkles className="w-4 h-4" />
            Replay onboarding
          </button>
        )}
        <button
          onClick={doLogout}
          className="w-full flex items-center gap-3 px-5 py-4 text-sm text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>

      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  )
}
