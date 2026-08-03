import type { Boot } from './types'

// New-user setup checklist, shared by /m and /w. Completion derives entirely
// from the boot payload — there is no server flag and nothing to persist per
// step. See getStarted.selfcheck.ts.

export type GetStartedStep = {
  key: 'profile' | 'superpower' | 'avatar'
  label: string
  desc: string
  href: string
  done: boolean
}

export function getStartedSteps(b: Boot): GetStartedStep[] {
  const e = b.employee
  return [
    {
      key: 'profile',
      label: 'Complete your profile',
      desc: 'Add your bio and phone so your team knows who you are.',
      // ponytail: low bar on purpose (bio OR phone) — this nudges into My Info,
      // it does not gate. Tighten here if "complete" should mean more fields.
      href: '/me/info',
      done: !!(e?.bio?.trim() || e?.phone?.trim()),
    },
    {
      key: 'superpower',
      label: 'Pick your superpower',
      desc: 'Choose the strength that best describes you.',
      href: '/superpowers',
      done: b.settings?.has_superpower === 1,
    },
    {
      key: 'avatar',
      label: 'Set up your avatar',
      desc: 'Make your gamified avatar your own.',
      href: '/avatar',
      // avatar_config is nulled server-side once a real photo is uploaded, so a
      // photo counts as "set up" here too.
      done: !!b.avatar_config,
    },
  ]
}

export function getStartedProgress(b: Boot): { done: number; total: number } {
  const steps = getStartedSteps(b)
  return { done: steps.filter((s) => s.done).length, total: steps.length }
}

export function getStartedComplete(b: Boot): boolean {
  const { done, total } = getStartedProgress(b)
  return done === total
}

// Auto-show is a one-time thing per user: on the first landing after the intro
// tour, if setup is unfinished. Skipping or completing (or just being shown
// once) flips this off forever via the localStorage flag. Mirrors the intro
// tour's own `vernon-onboarded-v1` pattern.
export const GETSTARTED_SEEN_KEY = 'vernon-getstarted-seen-v1'

export function shouldAutoShowGetStarted(b: Boot | undefined | null): boolean {
  if (!b || getStartedComplete(b)) return false
  return !localStorage.getItem(GETSTARTED_SEEN_KEY)
}

export function markGetStartedSeen(): void {
  localStorage.setItem(GETSTARTED_SEEN_KEY, '1')
}
