# Weekly Recap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand, shareable "your week" recap card to the mobile Today tab, backed by one read-only whitelisted endpoint.

**Architecture:** One new whitelisted Python method `get_weekly_recap(week_offset=0)` aggregates the caller's completed todos, points, streak, best day, top project and kudos for a Monday–Sunday week (read-only, no new doctype, no scheduler). The frontend adds a `useWeeklyRecap` react-query hook, a dismissible `RecapCard` mounted on `Today.tsx` that auto-surfaces during the first 3 days of a new week, and a `RecapShareImage` that renders a branded card and exports it to PNG via the already-installed `html-to-image`.

**Tech Stack:** React 18, TypeScript, Tailwind 3, @tanstack/react-query, react-router-dom; Frappe (Python) backend.

## Global Constraints
- Aesthetic = Soft-Pop paper system. Tokens ONLY: bg-paper / bg-paper-card / bg-paper-line / border-paper-edge, brand-* (indigo), shadow-card, font-display (Familjen Grotesk), body Figtree. Muted text = text-stone-*. Keep all dark: variants. Keep semantic status colors (rose/amber/emerald/sky/violet/orange).
- Icons = lucide-react ONLY. NEVER emoji. Playful motion = animate-float / animate-wiggle / animate-pop (already defined; a prefers-reduced-motion guard already disables them).
- App column is pinned to max-w-[448px]; root font-size is 14px (do not reintroduce max-w-md or rem-based page widths). Inputs must stay text-[16px] (iOS no-zoom).
- Frontend API: src/lib/api.ts exposes `api.get/post(dotted, params)` and `mobileApi.*`; the request() helper injects window.csrf_token and throws ApiError. Data hooks live in src/hooks/useData.ts (react-query; mutations invalidate keys via useQueryClient in onSettled). Feedback via useToast() from components/Toast.tsx. Routes declared in src/App.tsx. NEVER use native alert/confirm/prompt — use a dialog/sheet.
- Backend: Frappe. Whitelisted methods go in vernon_project/api/mobile.py with @frappe.whitelist(). Notifications via _notify(recipient, type, title, body, reference_doctype=None, reference_name=None, actor=None) at mobile.py:171. New doctypes under vernon_project/vernon_project/doctype/<snake_name>/ (JSON + .py).
- Deploy steps (LIVE site project.vernon.id, NO test DB): schema change -> `bench --site project.vernon.id migrate`; Python change -> `bench restart`; frontend change -> `cd frontend && npm run build` (emits /m bundle + www/m.html).
- TESTING OVERRIDE (project convention, overrides skill TDD): there is NO test DB, so do NOT write per-task pytest/jest. Instead END EACH TASK with (a) a concrete MANUAL SMOKE CHECK — exact steps to click in /m + expected result — and (b) a commit. Automated tests are deferred to a final optional task per plan.
- Git: user edits in parallel. `git add` ONLY the files this plan's task touches; never `git checkout` other branches. End every commit message body with:
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na

---

## File Structure

| File | Create/Modify | Single responsibility |
|------|---------------|-----------------------|
| `vernon_project/api/mobile.py` | Modify (insert one function between `get_wallet` end ~L2027 and `get_wallet_log` ~L2030) | New whitelisted read-only `get_weekly_recap(week_offset)` aggregator. |
| `frontend/src/lib/api.ts` | Modify (`mobileApi` object, after `getWalletLog` ~L192) | Add `getWeeklyRecap(weekOffset)` client method. |
| `frontend/src/hooks/useData.ts` | Modify (after `useWalletLog` ~L705) | Export `WeeklyRecap` interface + `useWeeklyRecap(weekOffset)` query hook. |
| `frontend/src/components/RecapShareImage.tsx` | Create | Branded full recap card + PNG export (html-to-image) with Web Share / download fallback. |
| `frontend/src/components/RecapCard.tsx` | Create | Dismissible, per-week-gated compact card on Today; expands to `RecapShareImage`; empty-week encouraging copy. |
| `frontend/src/pages/Today.tsx` | Modify (import L31–33 area; mount after Points card ~L349) | Mount `<RecapCard />`. |

**Product decision (documented):** The auto-surfacing card shows **last week's** wrap-up (`useWeeklyRecap(-1)`) during the first 3 days (Mon–Wed) of a new week — that is the only reading of "shows first ~3 days of a new week" where the content is meaningful and shareable rather than a near-empty just-started week. The backend `streak` is always "up to today" regardless of offset, and the dismissal localStorage key is derived from the returned `week_start`, so it is inherently per-week. The hook accepts any offset, so a future "this week so far" view reuses the same API.

---

### Task 1: Backend `get_weekly_recap`

**Files:**
- Modify `vernon_project/api/mobile.py` (insert one function between the end of `get_wallet` (~L2027) and `@frappe.whitelist()\ndef get_wallet_log():` (~L2030)).

**Interfaces:**
- Produces: `get_weekly_recap(week_offset=0) -> dict` with keys `week_offset:int, week_label:str, week_start:str, week_end:str, completed:int, minutes:int, points:float, best_day:{label:str,count:int}|None, streak:int, top_project:{name:str,count:int}|None, kudos_received:int`.
- Consumes (existing, already in file): module constant `STATUS_COMPLETED` (mobile.py:32); imports `getdate, nowdate` (mobile.py:13). Reads `tabProject Todo` (`assigned_to`, `status`, `completed_at`, `estimated`, `project`), `tabProject.project_name`, `tabPoint Ledger` (`user`, `points_earned`, `credited_on`, `source`), and `tabTodo Reaction` only if that DocType exists.

- [ ] Open `vernon_project/api/mobile.py`. Find the end of `get_wallet` immediately followed by the `get_wallet_log` declaration:

```python
	return {
		"earned": earned, "redeemed": redeemed, "balance": balance,
		"today_earned": _earned_on(today), "yesterday_earned": _earned_on(yesterday),
	}


@frappe.whitelist()
def get_wallet_log():
```

- [ ] Replace that block with the same block plus the new function inserted between `get_wallet` and `get_wallet_log` (tabs for indentation — match the file; do NOT use spaces):

```python
	return {
		"earned": earned, "redeemed": redeemed, "balance": balance,
		"today_earned": _earned_on(today), "yesterday_earned": _earned_on(yesterday),
	}


# Weekday index (Mon=0 .. Sun=6, matching datetime.date.weekday()) -> label.
WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@frappe.whitelist()
def get_weekly_recap(week_offset=0):
	"""Read-only weekly summary for the logged-in user. Week = Monday–Sunday;
	week_offset 0 = current week, -1 = last week, etc. Nothing is materialized
	and there is no scheduler — everything is computed live from existing data."""
	from datetime import timedelta

	user = frappe.session.user
	week_offset = int(week_offset or 0)

	today = getdate(nowdate())  # datetime.date
	monday = today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)
	sunday = monday + timedelta(days=6)
	week_end_excl = sunday + timedelta(days=1)  # exclusive upper bound for datetimes

	# Completed todos assigned to me, completed within the week.
	completed_rows = frappe.db.sql(
		"""
		SELECT t.estimated, t.completed_at, t.project, p.project_name
		FROM `tabProject Todo` t
		LEFT JOIN `tabProject` p ON t.project = p.name
		WHERE t.assigned_to = %(user)s
		  AND t.status = %(completed)s
		  AND t.completed_at >= %(start)s
		  AND t.completed_at < %(end)s
		""",
		{"user": user, "completed": STATUS_COMPLETED, "start": str(monday), "end": str(week_end_excl)},
		as_dict=True,
	)

	completed = len(completed_rows)
	minutes = sum(int(r["estimated"] or 0) for r in completed_rows)

	# Best day (most completions) + top project (most completions), in one pass.
	per_day = {}
	per_project = {}
	for r in completed_rows:
		wd = getdate(r["completed_at"]).weekday()
		per_day[wd] = per_day.get(wd, 0) + 1
		pname = r.get("project_name") or r.get("project")
		if pname:
			per_project[pname] = per_project.get(pname, 0) + 1

	best_day = None
	if per_day:
		wd, cnt = max(per_day.items(), key=lambda kv: kv[1])
		best_day = {"label": WEEKDAY_LABELS[wd], "count": cnt}

	top_project = None
	if per_project:
		pname, cnt = max(per_project.items(), key=lambda kv: kv[1])
		top_project = {"name": pname, "count": cnt}

	# Points credited this week from real work only (Todo + Meeting; never Grant/Gift).
	points = float(frappe.db.sql(
		"""
		SELECT COALESCE(SUM(points_earned), 0)
		FROM `tabPoint Ledger`
		WHERE user = %(user)s
		  AND credited_on >= %(start)s AND credited_on < %(end)s
		  AND source IN ('Todo', 'Meeting')
		""",
		{"user": user, "start": str(monday), "end": str(week_end_excl)},
	)[0][0])

	# Streak = consecutive days up to *today* with >=1 completion (independent of
	# the viewed week). ponytail: 60-day lookback cap is plenty for a streak
	# badge; widen the `since` bound if anyone ever needs a longer streak.
	streak_rows = frappe.db.sql(
		"""
		SELECT DISTINCT DATE(completed_at) AS d
		FROM `tabProject Todo`
		WHERE assigned_to = %(user)s
		  AND status = %(completed)s
		  AND completed_at >= %(since)s
		""",
		{"user": user, "completed": STATUS_COMPLETED, "since": str(today - timedelta(days=60))},
	)
	done_days = {str(r[0]) for r in streak_rows}
	streak = 0
	cur = today
	while str(cur) in done_days:
		streak += 1
		cur = cur - timedelta(days=1)

	# Kudos received = Todo Reaction rows on my todos created this week. Feature 3
	# (the Todo Reaction doctype) may not be shipped yet — return 0 safely.
	kudos_received = 0
	if frappe.db.exists("DocType", "Todo Reaction"):
		kudos_received = int(frappe.db.sql(
			"""
			SELECT COUNT(*)
			FROM `tabTodo Reaction` r
			JOIN `tabProject Todo` t ON r.todo = t.name
			WHERE t.assigned_to = %(user)s
			  AND r.creation >= %(start)s AND r.creation < %(end)s
			""",
			{"user": user, "start": str(monday), "end": str(week_end_excl)},
		)[0][0])

	# Week label, e.g. "Jun 23–29" (same month) or "Jun 30–Jul 6" (spans months).
	if monday.month == sunday.month:
		week_label = f"{monday.strftime('%b')} {monday.day}–{sunday.day}"
	else:
		week_label = f"{monday.strftime('%b')} {monday.day}–{sunday.strftime('%b')} {sunday.day}"

	return {
		"week_offset": week_offset,
		"week_label": week_label,
		"week_start": str(monday),
		"week_end": str(sunday),
		"completed": completed,
		"minutes": minutes,
		"points": round(points, 1),
		"best_day": best_day,
		"streak": streak,
		"top_project": top_project,
		"kudos_received": kudos_received,
	}


@frappe.whitelist()
def get_wallet_log():
```

- [ ] Apply the Python change to the live site: run `bench restart`.

- [ ] **MANUAL SMOKE CHECK (backend):** Run `bench --site project.vernon.id console`, then:
  ```python
  frappe.set_user("mo@intinusa.id")
  from vernon_project.api.mobile import get_weekly_recap
  get_weekly_recap(0)
  get_weekly_recap(-1)
  ```
  Expected: each call returns a dict with all 11 keys; `completed`/`minutes`/`points`/`streak`/`kudos_received` are numbers (no exception), `best_day`/`top_project` are either `None` or `{label/name, count}`, `week_label` looks like `"Jun 22–28"`, and `kudos_received` is `0` (Todo Reaction doctype not shipped). No traceback.

- [ ] **COMMIT:**
  ```
  git add vernon_project/api/mobile.py
  git commit -m "$(cat <<'EOF'
  feat(recap): read-only get_weekly_recap(week_offset) aggregator

  Monday–Sunday week: completed count, estimated minutes, Point Ledger
  points (Todo+Meeting), best day, current streak, top project, and kudos
  received (0 when Todo Reaction doctype absent). No new doctype, no scheduler.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
  EOF
  )"
  ```

---

### Task 2: Frontend API method + `useWeeklyRecap` hook

**Files:**
- Modify `frontend/src/lib/api.ts` (add one method to the `mobileApi` object, after `getWalletLog` ~L192).
- Modify `frontend/src/hooks/useData.ts` (add interface + hook after `useWalletLog` ~L705).

**Interfaces:**
- Produces (api.ts): `mobileApi.getWeeklyRecap(weekOffset?: number) => Promise<unknown>` → GET `vernon_project.api.mobile.get_weekly_recap?week_offset=<n>`.
- Produces (useData.ts): exported `interface WeeklyRecap { week_offset:number; week_label:string; week_start:string; week_end:string; completed:number; minutes:number; points:number; best_day:{label:string;count:number}|null; streak:number; top_project:{name:string;count:number}|null; kudos_received:number }` and `useWeeklyRecap(weekOffset?: number)` returning a react-query result of `WeeklyRecap`.
- Consumes: existing `M` prefix const + `api.get` in api.ts; `useQuery` + `mobileApi` in useData.ts.

- [ ] In `frontend/src/lib/api.ts`, find the `getWalletLog` line inside the `mobileApi` object:

```ts
  getWalletLog: () => api.get(M + 'get_wallet_log'),
```

- [ ] Replace it with both lines (adds `getWeeklyRecap` right after):

```ts
  getWalletLog: () => api.get(M + 'get_wallet_log'),
  getWeeklyRecap: (weekOffset = 0) => api.get(M + 'get_weekly_recap', { week_offset: weekOffset }),
```

- [ ] In `frontend/src/hooks/useData.ts`, find the `useWalletLog` export:

```ts
export const useWalletLog = () =>
  useQuery({ queryKey: keys.walletLog, queryFn: () => mobileApi.getWalletLog() as Promise<WalletLogEntry[]> })
```

- [ ] Insert immediately after it the interface and hook:

```ts
export const useWalletLog = () =>
  useQuery({ queryKey: keys.walletLog, queryFn: () => mobileApi.getWalletLog() as Promise<WalletLogEntry[]> })

export interface WeeklyRecap {
  week_offset: number
  week_label: string
  week_start: string
  week_end: string
  completed: number
  minutes: number
  points: number
  best_day: { label: string; count: number } | null
  streak: number
  top_project: { name: string; count: number } | null
  kudos_received: number
}

// Read-only weekly summary. weekOffset 0 = current week, -1 = last week.
export const useWeeklyRecap = (weekOffset = 0) =>
  useQuery({
    queryKey: ['weekly-recap', weekOffset] as const,
    queryFn: () => mobileApi.getWeeklyRecap(weekOffset) as Promise<WeeklyRecap>,
    staleTime: 1000 * 60 * 5,
  })
```

- [ ] Type-check only (no build yet — RecapCard not created until Task 4): run `cd frontend && npx tsc --noEmit`. Expected: no new errors referencing `api.ts` or `useData.ts` (a missing-module error for `./RecapShareImage`/`@/components/RecapCard` will NOT appear because nothing imports them yet).

- [ ] **MANUAL SMOKE CHECK:** In a browser devtools console on `/m` (already logged in), run:
  ```js
  fetch('/api/method/vernon_project.api.mobile.get_weekly_recap?week_offset=0', { credentials: 'same-origin' }).then(r => r.json()).then(console.log)
  ```
  Expected: `{ message: { week_label, completed, minutes, points, streak, ... } }` printed, HTTP 200.

- [ ] **COMMIT:**
  ```
  git add frontend/src/lib/api.ts frontend/src/hooks/useData.ts
  git commit -m "$(cat <<'EOF'
  feat(recap): mobileApi.getWeeklyRecap + useWeeklyRecap hook

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
  EOF
  )"
  ```

---

### Task 3: `RecapShareImage` component (branded card + PNG export)

**Files:**
- Create `frontend/src/components/RecapShareImage.tsx`.

**Interfaces:**
- Produces: `export function RecapShareImage({ recap }: { recap: WeeklyRecap })` — renders a branded gradient card (captured node) + a "Share my week" button that exports a PNG via `toPng` and uses Web Share (`navigator.share({ files })`) with a download fallback.
- Consumes: `WeeklyRecap` from `@/hooks/useData` (Task 2); `toPng` from `html-to-image` (installed dep, package.json:17); `useToast` from `@/components/Toast`; `formatEstimate` from `@/lib/format`.

- [ ] Create `frontend/src/components/RecapShareImage.tsx` with the complete content:

```tsx
import { useRef } from 'react'
import { toPng } from 'html-to-image'
import { Flame, Trophy, FolderKanban, Heart, Share2, Sparkles } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { formatEstimate } from '@/lib/format'
import type { WeeklyRecap } from '@/hooks/useData'

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-white/15 px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-white/90" />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-white/70">{label}</p>
        <p className="truncate text-sm font-semibold leading-tight">{value}</p>
      </div>
    </div>
  )
}

export function RecapShareImage({ recap }: { recap: WeeklyRecap }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const toast = useToast()

  const share = async () => {
    const node = cardRef.current
    if (!node) return
    try {
      // pixelRatio 2 = crisp retina export; cacheBust avoids stale data: URLs.
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true })
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], `vernon-recap-${recap.week_start}.png`, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
      if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: 'My week on Vernon' })
      } else {
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = file.name
        a.click()
      }
    } catch (e) {
      // User dismissing the native share sheet throws AbortError — not an error.
      if ((e as Error)?.name === 'AbortError') return
      toast('error', 'Could not create the image. Try again.')
    }
  }

  return (
    <div className="mt-3">
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-brand-600 via-[#7A5AF8] to-[#E879C7] p-5 text-white"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.16) 1px, transparent 1.4px)',
            backgroundSize: '15px 15px',
          }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-200" />
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
              Week of {recap.week_label}
            </p>
          </div>
          <p className="mt-1 font-display text-3xl font-semibold leading-none">{recap.completed} done</p>
          <p className="mt-1 text-sm font-semibold text-white/85">
            {formatEstimate(recap.minutes)} focused ·{' '}
            {recap.points.toLocaleString(undefined, { maximumFractionDigits: 1 })} pts
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {recap.streak > 0 && (
              <Stat icon={Flame} label="Streak" value={`${recap.streak} day${recap.streak > 1 ? 's' : ''}`} />
            )}
            {recap.best_day && (
              <Stat icon={Trophy} label="Best day" value={`${recap.best_day.label} (${recap.best_day.count})`} />
            )}
            {recap.top_project && (
              <Stat icon={FolderKanban} label="Top project" value={recap.top_project.name} />
            )}
            {recap.kudos_received > 0 && (
              <Stat icon={Heart} label="Kudos" value={`${recap.kudos_received} received`} />
            )}
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">Vernon</p>
        </div>
      </div>
      <button
        onClick={share}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-card transition active:scale-[0.98]"
      >
        <Share2 className="h-4 w-4" /> Share my week
      </button>
    </div>
  )
}
```

- [ ] Type-check: `cd frontend && npx tsc --noEmit`. Expected: no errors in `RecapShareImage.tsx` (the component is not yet imported anywhere, which is fine for tsc).

- [ ] **MANUAL SMOKE CHECK:** Deferred to Task 4 (component renders only once `RecapCard` mounts it). For now confirm tsc passes and the file imports resolve (`@/hooks/useData`, `html-to-image`, `@/components/Toast`, `@/lib/format`).

- [ ] **COMMIT:**
  ```
  git add frontend/src/components/RecapShareImage.tsx
  git commit -m "$(cat <<'EOF'
  feat(recap): RecapShareImage — branded PNG export via html-to-image

  Web Share API with download fallback; AbortError (user-cancelled sheet)
  is swallowed. Text + lucide SVG only, so the canvas is never CORS-tainted.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
  EOF
  )"
  ```

---

### Task 4: `RecapCard` component + mount on Today + build

**Files:**
- Create `frontend/src/components/RecapCard.tsx`.
- Modify `frontend/src/pages/Today.tsx` (add import after `NotesButton` import ~L32; mount `<RecapCard />` after the Points card IIFE ~L349).

**Interfaces:**
- Produces: `export function RecapCard()` — self-contained; calls `useWeeklyRecap(-1)`, gates to Mon–Wed window, reads/writes localStorage dismissal keyed on `recap.week_start`, renders a compact Soft-Pop card that expands into `RecapShareImage`. Empty week (`recap.completed === 0`) shows encouraging copy and NO expand/share.
- Consumes: `useWeeklyRecap` from `@/hooks/useData` (Task 2); `RecapShareImage` from `./RecapShareImage` (Task 3); `formatEstimate` from `@/lib/format`; lucide icons.

- [ ] Create `frontend/src/components/RecapCard.tsx` with the complete content:

```tsx
import { useState } from 'react'
import clsx from 'clsx'
import { Sparkles, CheckCircle2, Clock, Flame, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useWeeklyRecap } from '@/hooks/useData'
import { formatEstimate } from '@/lib/format'
import { RecapShareImage } from './RecapShareImage'

const DISMISS_PREFIX = 'vernon.recap.dismissed.'

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function MiniStat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: string
  label: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-tight text-slate-900 dark:text-slate-50">{value}</p>
        <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400 dark:text-slate-500">{label}</p>
      </div>
    </div>
  )
}

export function RecapCard() {
  // Last week's wrap-up, surfaced at the start of a new week.
  const { data: recap } = useWeeklyRecap(-1)
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Only surface during the first 3 days of a new week (Mon–Wed).
  // Date.getDay(): Sun=0, Mon=1 ... Sat=6.
  const day = new Date().getDay()
  const inWindow = day >= 1 && day <= 3

  if (!recap || !inWindow) return null

  const dismissKey = DISMISS_PREFIX + recap.week_start
  if (dismissed || readDismissed(dismissKey)) return null

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey, '1')
    } catch {
      /* ignore quota/private-mode */
    }
    setDismissed(true)
  }

  const empty = recap.completed === 0

  return (
    <div className="mt-3 rounded-3xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-[#E879C7] text-white">
          <Sparkles className="h-5 w-5 animate-float" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400 dark:text-slate-500">
            Last week · {recap.week_label}
          </p>
          {empty ? (
            <p className="mt-0.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Quiet week — a fresh one just started. Let's make this one count.
            </p>
          ) : (
            <p className="mt-0.5 font-display text-lg font-semibold leading-tight text-slate-900 dark:text-slate-50">
              You wrapped up {recap.completed} task{recap.completed > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss recap"
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 transition active:scale-90 active:bg-paper-line dark:text-slate-500 dark:active:bg-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!empty && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat icon={CheckCircle2} value={String(recap.completed)} label="Done" />
            <MiniStat icon={Clock} value={formatEstimate(recap.minutes)} label="Focused" />
            <MiniStat icon={Flame} value={recap.streak > 0 ? `${recap.streak}d` : '—'} label="Streak" />
          </div>

          <button
            onClick={() => setExpanded((v) => !v)}
            className={clsx(
              'mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-paper-edge dark:border-slate-700 py-2.5 text-sm font-semibold text-brand-700 dark:text-brand-300 transition active:scale-[0.98]',
            )}
          >
            {expanded ? (
              <>
                Hide <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                See your week <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>

          {expanded && <RecapShareImage recap={recap} />}
        </>
      )}
    </div>
  )
}
```

- [ ] In `frontend/src/pages/Today.tsx`, add the import. Find:

```tsx
import { NotesButton } from '@/components/NotesButton'
import { NotificationBell } from '@/components/NotificationBell'
```

- [ ] Replace with (adds the RecapCard import):

```tsx
import { NotesButton } from '@/components/NotesButton'
import { NotificationBell } from '@/components/NotificationBell'
import { RecapCard } from '@/components/RecapCard'
```

- [ ] In `frontend/src/pages/Today.tsx`, mount the card after the Points card. Find the end of the Points-card IIFE immediately before the Lens switcher:

```tsx
                )
              })()}

              {/* Lens switcher */}
```

- [ ] Replace with (inserts `<RecapCard />` between the Points card and the Lens switcher):

```tsx
                )
              })()}

              {/* Weekly recap — auto-surfaces Mon–Wed, dismissible per week */}
              <RecapCard />

              {/* Lens switcher */}
```

- [ ] Build the frontend: `cd frontend && npm run build`. Expected: build succeeds, emits the `/m` bundle + `vernon_project/www/m.html`. No TypeScript errors.

- [ ] **MANUAL SMOKE CHECK (full feature):**
  1. Open `/m` on project.vernon.id and sign in. If today is Mon/Tue/Wed: the recap card appears below the Points card showing "Last week · <label>".
     - If today is Thu–Sun (outside the window), force-show by temporarily editing `RecapCard.tsx` to `const inWindow = true`, rebuild, verify, then revert + rebuild before committing.
  2. With a non-empty last week: card shows "You wrapped up N tasks" + three mini-stats (Done / Focused / Streak). Tap **See your week** → the branded gradient card expands with stat tiles + a **Share my week** button.
  3. Tap **Share my week** → on a phone the native share sheet opens with a PNG of the card; on desktop a `vernon-recap-<date>.png` downloads. Cancelling the share sheet shows no error toast.
  4. Tap the **X** → card disappears; reload `/m` → it stays gone (per-week localStorage key `vernon.recap.dismissed.<monday>`). Clearing that key in devtools and reloading brings it back.
  5. Empty last week (a user with no completions): card shows the encouraging copy and NO stats / expand / share button.

- [ ] **COMMIT:**
  ```
  git add frontend/src/components/RecapCard.tsx frontend/src/pages/Today.tsx vernon_project/public/frontend/assets vernon_project/www/m.html
  git commit -m "$(cat <<'EOF'
  feat(recap): dismissible weekly RecapCard on Today + build

  Auto-surfaces Mon–Wed with last week's wrap-up; per-week localStorage
  dismissal; expands to the branded shareable card. Empty week shows
  encouraging copy and no share. Rebuilt /m bundle.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SRymVPEGn6Umcnjj7gt5Na
  EOF
  )"
  ```
  Note: `git status` first — only add the recap files + the freshly built bundle hashes this task produced. Do NOT add other staged/modified files the user may be editing in parallel; match the exact emitted asset filenames from your `npm run build` output.

---

### Task 5 (optional, deferred): Automated tests

Per project convention (no test DB), automated tests are deferred. When a test pass is scheduled:
- [ ] Backend: a unit test for `get_weekly_recap` covering (a) empty week → all zeros / `None`s, (b) a week with completions across days → correct `completed`, `minutes`, `best_day`, `top_project`, (c) `points` excludes Grant/Gift, includes Todo+Meeting, (d) `streak` counts consecutive days up to today, (e) `kudos_received` returns 0 when the Todo Reaction doctype is absent and a real count once Feature 3 ships, (f) `week_offset=-1` selects the prior Monday–Sunday and `week_label` formats single-month vs month-spanning weeks.
- [ ] Frontend: a render test for `RecapCard` covering the Mon–Wed window gate, per-week dismissal persistence, and the empty-week branch (no share button).
