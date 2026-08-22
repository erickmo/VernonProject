# Priority Slots — "Per hari" (day-major) view in Tim — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Per anggota / Per hari` toggle to the Plan screen's Tim view so a leader can see, for each day of the week, which team members still have an open priority slot.

**Architecture:** Pure-frontend pivot of the data already fetched by `useTeamPriorityCoverage`. A new shared helper turns the member-major coverage (`members × 7 days`) into a day-major list; the shared `TeamPriorityCoverage.tsx` component gains a view toggle and a day-major render. No backend, no new endpoint. The component is shared (`frontend/src/components`, imported by both frontends via `@`), so one change covers `/m` and `/w`.

**Tech Stack:** React 18 + TypeScript, TanStack Query v5, Tailwind (mobile Soft-Pop tokens), Vite.

## Global Constraints

- Both frontends carry every user-facing change. `TeamPriorityCoverage.tsx` is a **shared** component (`frontend/src/components/`, imported by `frontend-web/src/pages/Plan.tsx` and `frontend/src/pages/PlanScreen.tsx` via `@`) — editing it updates both `/m` and `/w` at once. No web-local copy exists; do not create one.
- No backend change: reuse `vernon_project.api.mobile.get_team_priority_coverage`, the `useTeamPriorityCoverage` hook, and the existing `onOpenDate(date)` prop contract.
- "Still has an open slot" = `slots > 0 && used < slots`; `remaining = slots − used`. Use exactly this.
- No new dependency and no new test runner (the frontends have none). Verification is `tsc --noEmit`: baseline `frontend` = 3 errors, `frontend-web` = 5 errors; a task must not raise either count.
- Reuse existing types from `frontend/src/lib/types.ts` (`TeamPriorityCoverageMember`, `TeamPriorityCoverageDay`); do not redefine them.
- Bahasa Indonesia for all user-facing copy. Keep the component's existing token palette (`paper-*`, `stone`/`slate`, `brand`, `emerald`/`amber`); introduce no new colours.

---

### Task 1: Shared day-major pivot helper

**Files:**
- Create: `frontend/src/lib/priorityCoverage.ts`

**Interfaces:**
- Consumes: `TeamPriorityCoverageMember` from `@/lib/types` (`{ user: string; full_name: string; days: { date: string; used: number; slots: number; contributed: boolean }[] }`).
- Produces:
  - `export interface DayOpenSlots { date: string; open: { user: string; full_name: string; remaining: number }[]; allFull: boolean }`
  - `export function groupOpenSlotsByDay(members: TeamPriorityCoverageMember[]): DayOpenSlots[]`

- [ ] **Step 1: Create the helper file**

Create `frontend/src/lib/priorityCoverage.ts` with exactly:

```ts
import type { TeamPriorityCoverageMember } from '@/lib/types'

export interface DayOpenSlots {
  date: string
  open: { user: string; full_name: string; remaining: number }[]
  allFull: boolean
}

/**
 * Pivot member-major coverage (members × 7 days) to day-major: for each day, the
 * members who still have an OPEN priority slot (slots > 0 && used < slots), with how
 * many remain. The day axis and its order come from the first member's `days` — the
 * endpoint returns Mon→Sun for the requested week and every member's `days` array is
 * aligned (same dates, same order). Empty `members` → []. `allFull` is true when no
 * member has capacity that day (includes days where slots === 0).
 */
export function groupOpenSlotsByDay(members: TeamPriorityCoverageMember[]): DayOpenSlots[] {
  const axis = members[0]?.days ?? []
  return axis.map((col, i) => {
    const open = members
      .filter((m) => {
        const d = m.days[i]
        return !!d && d.slots > 0 && d.used < d.slots
      })
      .map((m) => {
        const d = m.days[i]
        return { user: m.user, full_name: m.full_name, remaining: d.slots - d.used }
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
    return { date: col.date, open, allFull: open.length === 0 }
  })
}
```

- [ ] **Step 2: Typecheck (no unit-test runner exists)**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `3` (unchanged baseline — the new file adds no errors).

Sanity-trace the logic by hand against the spec's example before committing: for a day where
member A has `used:1, slots:3` and member B has `used:3, slots:3`, `open` must be
`[{ user: A, remaining: 2 }]` and `allFull` false; for a day where every member has
`used >= slots` (or `slots === 0`), `open` is `[]` and `allFull` true.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/priorityCoverage.ts
git commit -m "feat(plan): groupOpenSlotsByDay helper — day-major priority coverage pivot"
```

---

### Task 2: View toggle + day-major render in `TeamPriorityCoverage.tsx`

**Files:**
- Modify: `frontend/src/components/TeamPriorityCoverage.tsx` (shared — covers both frontends)

**Interfaces:**
- Consumes: `groupOpenSlotsByDay`, `DayOpenSlots` from Task 1 (`@/lib/priorityCoverage`); the existing `data.members` (`TeamPriorityCoverage`), `formatDate` (`@/lib/format`), `DAY_LABELS` (already defined in the file), and the existing `onOpenDate(date: string)` prop.
- Produces: nothing consumed by later tasks.

The current file (for reference) renders, after the week-nav block, a single body:
`{isLoading && !data ? <spinner> : !data?.members.length ? <empty> : <ul>…member rows…</ul>}`.
This task adds a `view` state + a toggle pill above the week nav, and turns that final
`<ul>…member rows…</ul>` branch into a switch on `view` (member list unchanged; new day list added).

- [ ] **Step 1: Import the helper**

Add to the imports at the top of `frontend/src/components/TeamPriorityCoverage.tsx` (alongside the existing `import { useTeamPriorityCoverage } from '@/hooks/useData'`):

```ts
import { groupOpenSlotsByDay } from '@/lib/priorityCoverage'
```

- [ ] **Step 2: Add the `view` state**

Immediately after the existing `const [weekStart, setWeekStart] = useState(() => weekStartOf(todayISO()))` line, add:

```ts
  const [view, setView] = useState<'member' | 'day'>('member')
```

- [ ] **Step 3: Add the toggle pill above the week nav**

Directly BEFORE the `{/* Week nav */}` comment/block (the `<div className="flex items-center gap-2 rounded-2xl border …">`), insert:

```tsx
      {/* View toggle: member-major grid vs day-major open-slot roster */}
      <div className="flex gap-1 rounded-full bg-paper-line p-1 dark:bg-slate-700">
        {([['member', 'Per anggota'], ['day', 'Per hari']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={clsx(
              'flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-95',
              view === v ? 'bg-brand-600 text-white shadow-sm' : 'text-stone-500 dark:text-slate-400',
            )}
          >
            {label}
          </button>
        ))}
      </div>
```

- [ ] **Step 4: Switch the body on `view`**

Find the final branch of the loading/empty/data conditional — the `) : (` that precedes
`<ul className="flex flex-col gap-3">` (the member rows). Replace ONLY that `) : (` opener with a
day-major branch followed by the existing member branch, i.e. change:

```tsx
      ) : (
        <ul className="flex flex-col gap-3">
```

to:

```tsx
      ) : view === 'day' ? (
        <ul className="flex flex-col gap-2.5">
          {groupOpenSlotsByDay(data.members).map((d, i) => (
            <li
              key={d.date}
              className="rounded-2xl border border-paper-edge bg-paper-card p-3.5 shadow-card dark:border-slate-700 dark:bg-slate-800"
            >
              {d.allFull ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">
                    {DAY_LABELS[i]} · {formatDate(d.date)}
                  </p>
                  <span className="shrink-0 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Semua terisi ✓
                  </span>
                </div>
              ) : (
                <button onClick={() => onOpenDate(d.date)} className="w-full text-left">
                  <p className="mb-2 text-sm font-semibold text-stone-800 dark:text-slate-100">
                    {DAY_LABELS[i]} · {formatDate(d.date)}
                  </p>
                  <div className="flex flex-col gap-1">
                    {d.open.map((o) => (
                      <span key={o.user} className="text-xs font-medium text-stone-600 dark:text-slate-300">
                        {o.full_name} — {o.remaining} slot kosong
                      </span>
                    ))}
                  </div>
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-3">
```

Leave the member-rows `<ul>` body itself (the `data.members.map((m) => …)` block) and its
closing `</ul>` exactly as they are — this step only adds the `view === 'day'` branch ahead of it
and re-labels the existing `) : (` as the `else`.

- [ ] **Step 5: Typecheck both frontends**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"` → expected `3`.
Run: `cd frontend-web && npx tsc --noEmit 2>&1 | grep -c "error TS"` → expected `5`.
(Both baselines unchanged — the shared component is compiled by both.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TeamPriorityCoverage.tsx
git commit -m "feat(plan): Per hari toggle in Tim — day-major open-slot roster (both frontends)"
```

---

### Task 3: Ship

**Files:**
- Modify: `frontend/sw-custom.js` (SW cache bump)
- Rebuild: `vernon_project/public/frontend*`, `vernon_project/www/{m,w}.html`, `vernon_project/www/vernon_sw.js` (build output)
- Regenerate: `docs/assets/data.js`
- Data: one `App Release` row on the live site (What's New)

**Interfaces:**
- Consumes: the committed Task 1–2 source.
- Produces: nothing (terminal task).

- [ ] **Step 1: Regenerate docs data (frontend-only → expect only devlog index change)**

An untracked WIP spec (`docs/superpowers/specs/2026-08-19-plan-per-project-lazy-load-design.md`)
must NOT influence `data.js`, or the deterministic staleness check fails on a clean tree. Move it
aside, regenerate, restore:

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
SC="$(git rev-parse --show-toplevel)/.tmp-wipspec.md"
mv docs/superpowers/specs/2026-08-19-plan-per-project-lazy-load-design.md "$SC" 2>/dev/null || true
python3 scripts/gen_docs.py
mv "$SC" docs/superpowers/specs/2026-08-19-plan-per-project-lazy-load-design.md 2>/dev/null || true
git add docs/assets/data.js
git commit -m "docs: regenerate data.js for priority-slots per-day-view spec/plan" || echo "no data.js change"
```

Expected: `data.js` diff (if any) touches only the docs devlog index (`.counts.*`, `.devlog[*]`),
never `.clusters`/`.doctypes`/endpoints. Verify: `grep -c plan-per-project-lazy-load docs/assets/data.js` → `0`.

- [ ] **Step 2: Bump the service-worker asset cache**

Edit `frontend/sw-custom.js`: change `const ASSET_CACHE = 'vernon-assets-v24'` → `'vernon-assets-v25'`.

- [ ] **Step 3: Build both bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build 2>&1 | tail -3
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build 2>&1 | tail -3
```

- [ ] **Step 4: Verify the feature is in the shipped bundles + SW version copied**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
grep -rl "Per hari" vernon_project/public/frontend/assets/*.js | head -1
grep -rl "Per hari" vernon_project/public/frontend_web/assets/*.js | head -1
grep -o "vernon-assets-v[0-9]*" vernon_project/www/vernon_sw.js | head -1   # expect vernon-assets-v25
```

Expected: a bundle file path printed for BOTH frontends, and `vernon-assets-v25`.

- [ ] **Step 5: Commit the built assets**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/sw-custom.js vernon_project/public/frontend vernon_project/public/frontend_web \
  vernon_project/www/m.html vernon_project/www/w.html vernon_project/www/vernon_sw.js
git commit -m "chore: rebuild bundles for Tim per-day view + SW v25"
```

- [ ] **Step 6: Deploy — clear website cache + purge Cloudflare**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id clear-website-cache
CF_TOKEN=$(cat /home/frappe/.cf_token); ZONE=bd13d791fab46ac955b9b068edefc049
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/purge_cache" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  --data '{"purge_everything":true}' | python3 -c "import sys,json;print('CF purge:',json.load(sys.stdin).get('success'))"
```

Expected: `CF purge: True`. (Frontend-only — no `bench restart`/`migrate` needed.)

- [ ] **Step 7: What's New — insert one App Release row (version bump from newest = 1.97.0 → 1.98.0)**

Write the row to a JSON file, then insert loop-free (one self-contained line, per the app's
`bench console` convention):

```bash
cat > /tmp/pd-release.json <<'JSON'
[
  {
    "version": "1.98.0",
    "release_date": "2026-08-22",
    "title": "Cek Slot Prioritas Tim Per Hari",
    "platform": "Both",
    "notes": "Di tab Tim (layar Plan), pimpinan kini bisa beralih ke tampilan Per hari\nTiap hari menampilkan daftar anggota yang masih punya slot prioritas kosong beserta sisa slotnya\nKetuk sebuah hari untuk langsung mengatur prioritas di hari itu\nHari yang sudah penuh ditandai Semua terisi"
  }
]
JSON
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/pd-release.json"))])
frappe.db.commit()
EOF
```

- [ ] **Step 8: Verify What's New through the real endpoint (one line, both platforms)**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([(p, frappe.call("vernon_project.api.app_release.get_app_releases", platform=p)[0]["version"], frappe.call("vernon_project.api.app_release.get_app_releases", platform=p)[0]["title"]) for p in ("Mobile","Web")])
EOF
```

Expected: `[('Mobile', '1.98.0', 'Cek Slot Prioritas Tim Per Hari'), ('Web', '1.98.0', 'Cek Slot Prioritas Tim Per Hari')]`.

---

## Notes for the implementer

- The Tim tab is only reachable at Plan → scope "My project" (`scope === 'project'`), where the
  `Tim` sub-tab appears (`PlanScreen.tsx` / web `Plan.tsx`). Toggle is inside that view.
- `data` may momentarily be undefined while refetching a new week; the existing
  loading/empty guards already run before either body renders — the `view` switch lives inside the
  `data?.members.length` truthy branch, so `data.members` is safe to read.
- Do not touch the member-major rows, the week nav, the project picker, or `onOpenDate` callers.
