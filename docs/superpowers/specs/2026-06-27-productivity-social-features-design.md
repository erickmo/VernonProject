# Productivity + Social Features — Design Spec

**Date:** 2026-06-27
**App:** vernon_project (Frappe backend + React mobile frontend `/m`)
**Aesthetic:** Soft-Pop paper system (see memory `vernon-mobile-softpop-design`): `paper-*` tokens, indigo `brand`, Figtree/Familjen Grotesk fonts, lucide icons (never emoji), `animate-float/wiggle/pop`, `prefers-reduced-motion` guard.

## Goal

Add four features to the mobile app, each shippable independently, all styled in the Soft-Pop system:

1. **Quick-add FAB** — fast task/note capture from a floating button.
2. **Productivity UX rebuild** — new on-brand focus timer + Today planner, reusing the existing engines.
3. **Kudos / reactions** — react to teammates' completed work via a new team activity feed (new doctype).
4. **Weekly recap** — an on-demand, shareable weekly summary card on the Today tab.

**Build order** (independent; simplest → hardest): FAB → Productivity UX → Kudos → Recap.

## What already exists (reuse, do not rebuild)

- **Create todo:** `mobileApi.createTask(fields)` → `frappe.client.insert` Project Todo, status `⚪️ Planned` (`frontend/src/lib/api.ts:134`). UI: `CreateProjectItemSheet` (`frontend/src/components/CreateProjectItemSheet.tsx`).
- **Allocations / today planning:** `mobileApi.setTodoAllocations(todoId, allocations)` → `set_todo_allocations` (`api.ts:129`); `today_allocation` already drives the Today ring. Field source = `Project Todo Allocation` child rows where `allocation_date == today`.
- **Focus timer engine:** `useFocusTimer()` (`frontend/src/hooks/useFocusTimer.ts`) — wall-clock based, localStorage-persisted (`vernon.focusTimer`), survives backgrounding. Current UI `FocusOverlay.tsx` (to be replaced). Keep the hook.
- **Notifications:** `_notify(recipient, type, title, body, reference_doctype=None, reference_name=None, actor=None)` (`vernon_project/api/mobile.py:171`); doctype `Vernon Notification`, `type` is a Select. `get_notifications` / `mark_*_read` already wired to `NotificationBell` + `NotificationSheet`.
- **Points history:** `Point Ledger` doctype — `user`, `points_earned`, `credited_on` (Datetime), `source` (Todo/Grant/Gift/Meeting), `todo`, `project`. Leaderboard/recap exclude Grant/Gift.
- **Completions:** `Project Todo.completed_at` (Datetime) + `status == ✅ Completed`. `get_dashboard` already counts `completed_today`/`completed_minutes_today`.
- **Personal capture:** `Personal Note` doctype (existing) for the long-press quick-capture.
- **Sheet/Toast/Dialog patterns:** `NotificationSheet` (drag-to-close), `RedeemSheet` (confirm), `Toast` (`useToast()`), `AdvanceProvider` (modal). Routes in `frontend/src/App.tsx`.

---

## Feature 1 — Quick-add FAB

**Frontend only. No backend change.**

- **Component `Fab`**: fixed bottom-right, above the bottom nav (`bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4`), `z-30`, brand-600 circle, Plus icon, `active:scale` + subtle `animate-float` idle. Rendered on **Today** and **Projects** tabs.
- **Tap → full todo (project-first):** opens `QuickAddSheet` in "task" mode → step 1 pick project + project-detail (reuse the projects list from `useProjects`), step 2 hands off to existing `CreateProjectItemSheet` pre-filled with `projectDetail` + team. Creates a real Project Todo. No duplication of create logic.
- **Long-press (~450ms) → personal note:** `QuickAddSheet` in "note" mode → single text field → `frappe.client.insert` a `Personal Note` (title/body per that doctype's schema). Toast on success.
- **Discoverability:** first-session tooltip "Hold for a quick note" (dismiss persisted in localStorage).
- **Edge cases:** long-press must cancel the tap (pointer events, not click); no project membership → tap mode shows empty-state "join a project first"; offline → Toast error from `ApiError`.

**New files:** `components/Fab.tsx`, `components/QuickAddSheet.tsx`. Mount in `Today.tsx` + `Projects.tsx`.

---

## Feature 2 — Productivity UX rebuild

**Frontend only. Reuse `useFocusTimer` + `setTodoAllocations`. No backend change.**

### 2a. Focus timer
- **One-tap Focus** on every `TodoCard`: a small Play/Timer icon button → `focus.start(todo.name, todo.to_do, todo.estimated)` and open the new overlay.
- **New `FocusOverlay`** (replaces the existing one's styling): full-screen Soft-Pop — warm gradient backdrop, large progress ring (reuse the `Ring` idea), countdown that goes negative/rose when over estimate, pause/resume/stop, lucide controls. Keeps ambient-sound controls if present in the current overlay (carry over, don't remove).
- **Persistent mini-bar `FocusMiniBar`**: when a timer runs, a slim pill docked above the bottom nav (all tabs) showing task + elapsed/remaining, tap to reopen overlay, with a stop affordance. Reads `useFocusTimer` state.
- **No backend time-logging** (decided). Timer is a focus aid; `actual_*` fields keep coming from phase timestamps. Logging is a future add.

### 2b. Today planner ("Plan my day")
- **Entry:** a "Plan my day" button/section on the Today tab (near the deadline-bucket tabs).
- **`PlanDaySheet`:** lists today's candidate todos (due today + overdue + upcoming the user opts in), each with a minutes stepper (+/- and quick chips like 15/30/60). Running total vs a soft daily target. Save → for each touched todo, write/merge a today-dated allocation row via `setTodoAllocations` (preserve that todo's other-day allocation rows; only replace today's).
- **Feeds** the existing Today ring (`today_allocation` / `plannedTodayMin`). Reuses the validated allocation API; replaces the buried `AllocationCard` as the primary entry (the detail-screen card may stay or link here).
- **Edge cases:** sum can exceed estimate (allowed — it's a plan); editing must not clobber future-day allocations; empty → friendly empty state.

**New files:** `components/FocusOverlay.tsx` (rewrite), `components/FocusMiniBar.tsx`, `components/PlanDaySheet.tsx`. Edit `TodoCard.tsx` (focus button), `Today.tsx` (planner entry + mini-bar mount), app shell for the mini-bar.

---

## Feature 3 — Kudos / reactions (new doctype + team feed)

**Backend + frontend. One migration.**

### Data model
- **New doctype `Todo Reaction`:**
  - `todo` (Link → Project Todo, reqd, search_index)
  - `user` (Link → User, reqd, search_index) — the reactor
  - `reaction` (Select: `clap` | `celebrate` | `fire` | `heart`, reqd)
  - Naming: hash; **app-level uniqueness** enforced on (todo, user) — one reaction per user per todo (toggle/replace).
- **`Vernon Notification.type`**: add Select option **`Kudos`**.

### API (`vernon_project/api/mobile.py`, whitelisted)
- `get_team_activity(days=14, limit=50)` → recent **Completed** todos in projects the caller is on (owner/leader/member via project ownership + `Project Team`), `completed_at >= now - days`, newest first. Each item: todo id, title, project, assignee (name+image), `completed_at`, `point`, reaction summary `{clap,celebrate,fire,heart}` counts, `my_reaction` (or null), small list of recent reactor names.
- `toggle_reaction(todo, reaction)` → if same reaction exists for (todo, caller) remove it; else upsert to the new reaction. **Cannot react to a todo assigned to yourself.** On add, `_notify(assignee, "Kudos", "<Actor> cheered your work", <reaction label>, "Project Todo", todo, actor=caller)`. Returns updated counts + `my_reaction`.

### Frontend
- **Route `/activity`** (new screen `pages/ActivityScreen.tsx`) — Soft-Pop list of completion cards; each shows who did what + a reaction bar (lucide: Hand=clap, PartyPopper=celebrate, Flame=fire, Heart=heart) with counts; tapping toggles via `toggle_reaction`. React-query hook `useTeamActivity` + `useToggleReaction` (optimistic update).
- **Entry:** header icon on Today (next to `NotificationBell`) — a Users/Sparkles icon → `/activity`.
- **Notification:** Kudos notifications render in the existing bell/sheet (extend the type → icon/label map).
- **Edge cases:** own todos show counts but reaction bar disabled; deleted/reverted todo drops from feed; empty feed friendly state; optimistic toggle rolls back on `ApiError`.

**New files:** doctype `Todo Reaction`, `pages/ActivityScreen.tsx`, hooks. Edit `mobile.py` (3 methods + Kudos type), `Vernon Notification.json` (add option), `App.tsx` (route), `Today.tsx` (header icon), notification type→icon map.

---

## Feature 4 — Weekly recap (on-demand card)

**Backend (read-only API) + frontend. No new doctype, no scheduler.**

### API (`vernon_project/api/mobile.py`, whitelisted)
- `get_weekly_recap(week_offset=0)` → for the caller, week = Monday–Sunday (offset 0 = current):
  - `completed` — count of Project Todo `completed_at` in week, `status == Completed`, `assigned_to == caller`.
  - `minutes` — sum `estimated` of those.
  - `points` — sum `Point Ledger.points_earned` where `user==caller`, `credited_on` in week, `source in (Todo, Meeting)`.
  - `best_day` — weekday with most completions (label + count).
  - `streak` — consecutive days up to today with ≥1 completion (from `completed_at`).
  - `top_project` — project with most completions in week (name + count).
  - `kudos_received` — count of `Todo Reaction` on the caller's todos in week (depends on Feature 3; if 3 not yet shipped, return 0).
  - `week_label` — e.g. "Jun 23–29".

### Frontend
- **`RecapCard`** on the Today tab: shows for the first ~3 days of a new week, **dismissible** (dismissal persisted per-week in localStorage). Compact stats (lucide icons) → tap to expand a full card.
- **Full recap** → **share as image** via `html-to-image` (already a dependency) — render an off-screen branded card, export PNG, use Web Share / download.
- Hook `useWeeklyRecap(weekOffset)`.
- **Edge cases:** empty week → encouraging copy, no share; share unsupported → download fallback; recompute weekly (offset lets a future "last week" view reuse the same API).

**New files:** `components/RecapCard.tsx`, `components/RecapShareImage.tsx`, hook. Edit `mobile.py` (1 method), `Today.tsx` (mount card).

---

## Cross-cutting / deploy

- **Migration:** new `Todo Reaction` doctype + `Vernon Notification` Select option → `bench migrate` (schema). Live site.
- **Python changes** (mobile.py) → `bench restart`.
- **Frontend** → `npm run build` (regenerates `/m` bundle + `www/m.html`).
- **Routes added:** `/activity`.
- **Permissions:** Todo Reaction — any logged-in team member can create/delete own; read scoped to team. Recap + activity APIs operate on the session user.
- **Testing:** live site, no test DB — defer automated tests to a final pass per project convention; each feature gets a manual smoke check (create reaction, see notification; plan day, see ring update; FAB both modes; recap renders + shares).

## Out of scope (explicit)

- Backend logging of focus-timer actual minutes (future).
- Weekly push notification / scheduler for recap (future).
- Points awarded for kudos (kudos is social-only).
- Reactions on anything other than completed todos.
- Web `/w` app — mobile `/m` only.
