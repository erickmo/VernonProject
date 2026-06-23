# Six Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six Vernon PWA features — comment ordering, reward detail drawer, Review relationship filter, points badges, notifications (in-app feed + Web Push), and comment image upload + @mention.

**Architecture:** Frappe backend (`vernon_project/api/mobile.py` + doctypes) with a React/react-query PWA (`frontend/src`, basename `/m`). Notifications use a poll-feed (react-query 30s) + Web Push (pywebpush + VAPID) design — no socketio. Built in dependency order so notifications land before comment @mention (which fires a mention notification).

**Tech Stack:** Frappe / Python, React + TypeScript + react-query + Tailwind, service-worker Web Push (pywebpush, VAPID).

**Spec:** `docs/superpowers/specs/2026-06-23-six-features-design.md`

## Global Constraints

- **LIVE site, no test DB.** Site is `project.vernon.id`. There is NO test database — automated tests are deferred to **Phase 7**. Per-task verification is a manual check against the live PWA (`https://project.vernon.id/m/...`). This overrides the writing-plans skill's default pytest-per-task TDD cycle.
- **Deploy mechanics:** schema (new doctypes/fields) → `bench --site project.vernon.id migrate`; Python (endpoints/controllers) → `bench --site project.vernon.id restart`; frontend → `cd frontend && npm run build` (dist served from `vernon_project/public/frontend/`).
- **Backend idioms:** identity is `frappe.session.user`; every new mutation calls `frappe.db.commit()` inside the whitelisted fn and writes with `ignore_permissions=True`; resolve user emails → display names server-side via `_user_name_map` (`mobile.py:108`); new mobile endpoints use the typed-dict + throw-on-error style.
- **Frontend idioms:** feedback via `useToast`, confirmations via `useConfirm` — NEVER native `alert`/`confirm`/`prompt`. Role gating via boot predicates in `hooks/useData.ts`.
- **Locked decisions:** notification arch = poll + Web Push; notification events = assignment, approval, comment/@mention, points; badge metric = lifetime **Todo-source** points only (exclude Grant/Gift); mention scope = project participants only; badge display = Profile + leaderboard + comment author.
- **Web Push prerequisite (Phase 5, USER-RUN):** install `pywebpush` in the bench env and write `vapid_public_key` / `vapid_private_key` / `vapid_subject` into the site's `site_config.json`.

**Build order:** Phase 1 (#5) → 2 (#3) → 3 (#6) → 4 (#2) → 5 (#1) → 6 (#4) → 7 (deferred tests + full deploy verification).

---

## Phase 1 — Comments newest-first

### Task 1: Order comments newest-first in `get_comments`

**Files:**
- Modify: `vernon_project/api/mobile.py:708` (the `order_by="creation asc"` line inside `get_comments`, defined at `mobile.py:696`)
- Reference: `frontend/src/components/CommentThread.tsx:31` (renders `(comments ?? []).map(...)` in raw API order — no client sort, no change needed)

**Interfaces:**
- Consumes: none
- Produces: none (the `get_comments` return shape — a list of `_shape_comment` dicts — is unchanged; only the element order flips. No later task depends on this.)

- [ ] **Step 1: Flip the sort order in `get_comments`** — In `vernon_project/api/mobile.py`, inside `get_comments` (the `frappe.get_all("Comment", ...)` call), change the `order_by` from ascending to descending so newest comments come first.

  Before (`mobile.py:700-710`):
  ```python
  	rows = frappe.get_all(
  		"Comment",
  		filters={
  			"comment_type": "Comment",
  			"reference_doctype": reference_doctype,
  			"reference_name": reference_name,
  		},
  		fields=["name", "content", "comment_email", "comment_by", "creation"],
  		order_by="creation asc",
  		limit_page_length=0,
  	)
  ```

  After:
  ```python
  	rows = frappe.get_all(
  		"Comment",
  		filters={
  			"comment_type": "Comment",
  			"reference_doctype": reference_doctype,
  			"reference_name": reference_name,
  		},
  		fields=["name", "content", "comment_email", "comment_by", "creation"],
  		order_by="creation desc",
  		limit_page_length=0,
  	)
  ```

  (Note: this endpoint is a read-only query — no `frappe.db.commit()` is required, as no mutation occurs. The `_shape_comment` mapping at `mobile.py:712` and the `CommentThread.tsx` render path are untouched.)

- [ ] **Step 2: Deploy — restart Python** — This is a backend-only Python change (no schema, no new field, no frontend asset), so only a process restart is needed:
  ```bash
  cd /home/frappe/frappe-bench && bench --site project.vernon.id restart
  ```
  (No `bench migrate` — no doctype/field change. No `npm run build` — `CommentThread.tsx` is unchanged, so the served dist under `vernon_project/public/frontend/` needs no rebuild.)

- [ ] **Step 3: Verify on live PWA** — Open `https://project.vernon.id/m/item/<id>` for a Project Todo that already has **≥2 comments** added at different times (if none exists, open any item, post comment "first" then comment "second" via the composer at the bottom). Hard-refresh the page. **Expected:** the most recently created comment ("second" / the newest `at_human` timestamp) appears at the **top** of the Comments list, and the oldest appears at the bottom — newest-first. The composer textarea stays at the bottom. Cross-check on a Project Detail (`https://project.vernon.id/m/...` ProjectDetailScreen) and a Project (ProjectScreen) item with multiple comments to confirm all three `COMMENTABLE` reference types order identically.

- [ ] **Step 4: Commit**
  ```bash
  git add vernon_project/api/mobile.py && git commit -m "feat(comments): order comments newest-first in get_comments"
  ```

## Phase 2 — Reward detail drawer (Feature #3)

### Task 1: Create `RewardDetailSheet` component

**Files:**
- Create: `frontend/src/components/RewardDetailSheet.tsx`
- Reference: `frontend/src/components/RedeemSheet.tsx` (container idiom mirrored)
- Reference: `frontend/src/components/CreateProjectItemSheet.tsx:97-102` (header + `X` close affordance)
- Reference: `frontend/src/lib/types.ts:360-367` (`MarketplaceReward` shape)
- Reference: `frontend/src/pages/MarketplaceScreen.tsx:80-110` (image fallback + disabled-rule idioms reused)

**Interfaces:**
- Consumes: `MarketplaceReward` (`types.ts:360`); `formatNumber` (`lib/format.ts`); `Store`, `X` icons (`lucide-react`).
- Produces: `RewardDetailSheet` — `function RewardDetailSheet(props: { reward: MarketplaceReward | null; balance: number; onRedeem: () => void; onClose: () => void }): JSX.Element | null`. Task 2 imports this.

- [ ] **Step 1: Create the file with the full component.** Mirrors `RedeemSheet`'s container exactly (`fixed inset-0 z-50 flex items-end justify-center`, backdrop-click closes via outer `onClick={onClose}`, `absolute inset-0 bg-black/40` scrim, panel `relative mx-auto w-full max-w-md rounded-t-3xl bg-white dark:bg-slate-800 ... pb-[calc(env(safe-area-inset-bottom)+1.25rem)]` with `onClick={(e) => e.stopPropagation()}`, grab-handle pill). Adds the `X` close button from `CreateProjectItemSheet.tsx:99-101`, a large image with the `Store`-icon fallback (mirroring `MarketplaceScreen.tsx:87-93`), the full `description` (no `line-clamp`), cost, a stock pill, and a primary Redeem button whose disabled rule and label exactly match the card (`MarketplaceScreen.tsx:81-83,109`: `soldOut = stock_quantity <= 0`, `tooPricey = point_cost > balance`).

  Create `frontend/src/components/RewardDetailSheet.tsx` with this complete content:

```tsx
import { Store, X } from 'lucide-react'
import { formatNumber } from '@/lib/format'
import type { MarketplaceReward } from '@/lib/types'

export function RewardDetailSheet({
  reward,
  balance,
  onRedeem,
  onClose,
}: {
  reward: MarketplaceReward | null
  balance: number
  onRedeem: () => void
  onClose: () => void
}) {
  if (!reward) return null
  const soldOut = reward.stock_quantity <= 0
  const tooPricey = reward.point_cost > balance
  const disabled = soldOut || tooPricey
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative mx-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{reward.reward_name}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="aspect-square w-full overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-700">
          {reward.image ? (
            <img src={reward.image} alt={reward.reward_name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
              <Store className="h-10 w-10" />
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xl font-bold text-brand-700 dark:text-brand-300">{formatNumber(reward.point_cost)} pts</span>
          <span
            className={
              soldOut
                ? 'rounded-full bg-rose-100 dark:bg-rose-900/40 px-3 py-1 text-xs font-semibold text-rose-600 dark:text-rose-300'
                : 'rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300'
            }
          >
            {soldOut ? 'Sold out' : `${formatNumber(reward.stock_quantity)} in stock`}
          </span>
        </div>

        {reward.description && (
          <p className="mt-3 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{reward.description}</p>
        )}

        <button
          onClick={onRedeem}
          disabled={disabled}
          className="mt-5 w-full rounded-2xl bg-brand-600 py-3 font-semibold text-white disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400"
        >
          {soldOut ? 'Sold out' : tooPricey ? 'Not enough points' : 'Redeem'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build.** `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build` (dist is emitted to `vernon_project/public/frontend/`, which is what the live PWA serves). Confirm the build completes with no TypeScript errors. The component is unwired at this point, so there is no live behavior to verify yet — verification happens in Task 2 after it is mounted.

- [ ] **Step 3: Commit.** `git add frontend/src/components/RewardDetailSheet.tsx vernon_project/public/frontend && git commit -m "feat(marketplace): add RewardDetailSheet component"`

---

### Task 2: Wire `MarketplaceScreen` to open the detail drawer before confirm

**Files:**
- Modify: `frontend/src/pages/MarketplaceScreen.tsx:6` (add import), `:18` (add `detail` state), `:104-110` (card button opens detail), `:117-124` (mount `RewardDetailSheet` alongside existing `RedeemSheet`)
- Reference: `frontend/src/components/RewardDetailSheet.tsx` (Task 1)

**Interfaces:**
- Consumes: `RewardDetailSheet` (Task 1); existing `useRedeemReward`, `RedeemSheet`, `selected`/`confirm` (unchanged).
- Produces: none.

- [ ] **Step 1: Import `RewardDetailSheet`.** In `frontend/src/pages/MarketplaceScreen.tsx`, the current import line (`MarketplaceScreen.tsx:6`) is:

```tsx
import { RedeemSheet } from '@/components/RedeemSheet'
```

Change it to:

```tsx
import { RedeemSheet } from '@/components/RedeemSheet'
import { RewardDetailSheet } from '@/components/RewardDetailSheet'
```

- [ ] **Step 2: Add the `detail` state.** The current state declaration (`MarketplaceScreen.tsx:18`) is:

```tsx
  const [selected, setSelected] = useState<MarketplaceReward | null>(null)
```

Change it to:

```tsx
  const [detail, setDetail] = useState<MarketplaceReward | null>(null)
  const [selected, setSelected] = useState<MarketplaceReward | null>(null)
```

- [ ] **Step 3: Card tap opens the detail drawer instead of the confirm sheet.** The current card button (`MarketplaceScreen.tsx:104-110`) is:

```tsx
                  <button
                    onClick={() => setSelected(r)}
                    disabled={disabled}
                    className="mt-2 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {soldOut ? 'Sold out' : tooPricey ? 'Not enough' : 'Redeem'}
                  </button>
```

Change the `onClick` to open the detail drawer (and drop `disabled` so a sold-out/too-pricey reward can still be inspected; the Redeem button inside the drawer enforces the same disabled rules). Replace those lines with:

```tsx
                  <button
                    onClick={() => setDetail(r)}
                    className="mt-2 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white"
                  >
                    View
                  </button>
```

- [ ] **Step 4: Mount `RewardDetailSheet` alongside the existing `RedeemSheet`.** The current sheet mount (`MarketplaceScreen.tsx:117-124`) is:

```tsx
      <RedeemSheet
        reward={selected}
        balance={balance}
        pending={redeem.isPending}
        onConfirm={confirm}
        onClose={() => !redeem.isPending && setSelected(null)}
      />
```

The detail drawer's Redeem hands off to the existing confirm flow: it closes the detail (`setDetail(null)`) and sets `selected`, which is exactly what `RedeemSheet` already keys off — so `confirm()` (`MarketplaceScreen.tsx:22-31`) runs unchanged. Replace those lines with:

```tsx
      <RewardDetailSheet
        reward={detail}
        balance={balance}
        onRedeem={() => {
          if (!detail) return
          setSelected(detail)
          setDetail(null)
        }}
        onClose={() => setDetail(null)}
      />

      <RedeemSheet
        reward={selected}
        balance={balance}
        pending={redeem.isPending}
        onConfirm={confirm}
        onClose={() => !redeem.isPending && setSelected(null)}
      />
```

- [ ] **Step 5: Build.** `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build` (dist emitted to `vernon_project/public/frontend/`, served by the live PWA). Confirm no TypeScript errors.

- [ ] **Step 6: Verify on live PWA.** Open `https://project.vernon.id/m/marketplace`. Tap any reward card's "View" button → a bottom drawer slides up showing the large image, full untruncated description, cost in pts, a stock pill, and a Redeem button. For an affordable in-stock reward, the button reads "Redeem" and is enabled; for a sold-out one it reads "Sold out" and is disabled; for one above your balance it reads "Not enough points" and is disabled. Tap "Redeem" → the detail drawer closes and the existing confirm sheet ("Redeem <name>?") appears → tap "Redeem" there → expect the success toast ("Redeemed — balance …") and the spendable-balance card at the top decreasing. Also tap the backdrop and the `X` to confirm the detail drawer closes without redeeming.

- [ ] **Step 7: Commit.** `git add frontend/src/pages/MarketplaceScreen.tsx vernon_project/public/frontend && git commit -m "feat(marketplace): open reward detail drawer before redeem confirm"`

## Phase 3 — Review filter "I led / I own" (Feature #6)

### Task 1: Backend — add `is_owner`/`is_leader` to every shaped todo (drives dashboard review rows)

**Files:**
- Modify: `vernon_project/api/mobile.py:284` (inside `_shape_todo`, the `out` dict, next to `is_mine`)
- Reference: `vernon_project/api/mobile.py:131-156` (`_fetch_todos` — already SELECTs `p.project_owner, p.project_leader` onto every row)
- Reference: `vernon_project/api/mobile.py:497-501` (`get_projects` flag idiom we mirror)
- Reference: `vernon_project/api/mobile.py:400-406` (review rows are built by `_shape_todo`, so they inherit these flags)

**Interfaces:**
- Consumes: none
- Produces: each `get_dashboard` review row (and every `_shape_todo` output) now carries `is_owner: bool` and `is_leader: bool` — consumed by Task 2 (types) and Task 3 (Review.tsx predicate).

**Why here (no N+1):** `_fetch_todos` already joins `Project` and returns `project_owner`/`project_leader` on each row, so the comparison is a pure in-memory dict read — no extra query and no separate project-roles map is needed. Adding the flags inside `_shape_todo` (rather than only in the `get_dashboard` review loop) keeps the flag logic in one place and mirrors the existing `is_mine` line directly below the owner/leader fields it already computes.

- [ ] **Step 1: Add the two flags next to `is_mine`.** The current `out` dict (mobile.py:278-290) reads:

```python
		"brand": row.get("brand"),
		"project_owner": row.get("project_owner"),
		"project_owner_name": (name_map.get(row.get("project_owner")) or {}).get("full_name")
		or row.get("project_owner"),
		"project_leader": row.get("project_leader"),
		"project_leader_name": (name_map.get(row.get("project_leader")) or {}).get("full_name")
		or row.get("project_leader"),
		"is_mine": row["assigned_to"] == user,
		"group": row.get("group"),
```

Change the `is_mine` line to add the two flags immediately after it (mirrors `get_projects` mobile.py:500-501 `p["is_owner"] = p["project_owner"] == user` / `p["is_leader"] = p["project_leader"] == user`):

```python
		"brand": row.get("brand"),
		"project_owner": row.get("project_owner"),
		"project_owner_name": (name_map.get(row.get("project_owner")) or {}).get("full_name")
		or row.get("project_owner"),
		"project_leader": row.get("project_leader"),
		"project_leader_name": (name_map.get(row.get("project_leader")) or {}).get("full_name")
		or row.get("project_leader"),
		"is_mine": row["assigned_to"] == user,
		# Relationship of the current user to this todo's project (drives the
		# Review tab "I own / I led" lens). Mirrors get_projects (is_owner/is_leader).
		"is_owner": row.get("project_owner") == user,
		"is_leader": row.get("project_leader") == user,
		"group": row.get("group"),
```

- [ ] **Step 2: Deploy (Python only — no schema change).**

```bash
bench --site project.vernon.id restart
```

- [ ] **Step 3: Verify the flags ship in the API.** From the bench host, with a logged-in session cookie (or via the live PWA network tab):

Open `https://project.vernon.id/m/` in the browser, log in, open DevTools → Network, navigate to the Review tab, and inspect the `get_dashboard` response. Expected: each object in the `review[]` array now contains `is_owner` and `is_leader` boolean keys; for a project you own, its review rows show `is_owner: true`; for a project you lead, `is_leader: true`.

- [ ] **Step 4: Commit.**

```bash
git add vernon_project/api/mobile.py && git commit -m "feat(review): tag shaped todos with is_owner/is_leader for the Review lens"
```

---

### Task 2: Types — add `is_owner`/`is_leader` to the review-row type (`ProjectItem`)

**Files:**
- Modify: `frontend/src/lib/types.ts:45` (`ProjectItem`, after `is_mine`)
- Reference: `frontend/src/pages/Review.tsx:17` (review rows are typed `ProjectItem` via `data.review`)

**Interfaces:**
- Consumes: `is_owner`/`is_leader` produced by Task 1.
- Produces: `ProjectItem.is_owner: boolean` and `ProjectItem.is_leader: boolean` — consumed by Task 3's client predicate.

**Why `ProjectItem`:** `data.review` is `ProjectItem[]` (Review.tsx:17 / hooks return `Dashboard`), and `_shape_todo` (Task 1) now sets these on every shaped todo, so the fields belong on the shared `ProjectItem` interface, not a Review-only subtype.

- [ ] **Step 1: Add the two booleans after `is_mine`.** Current `ProjectItem` tail (types.ts:41-46):

```typescript
  project_owner: string | null
  project_owner_name: string | null
  project_leader: string | null
  project_leader_name: string | null
  is_mine: boolean
}
```

Change to:

```typescript
  project_owner: string | null
  project_owner_name: string | null
  project_leader: string | null
  project_leader_name: string | null
  is_mine: boolean
  is_owner: boolean
  is_leader: boolean
}
```

- [ ] **Step 2: Commit (build happens in Task 3 alongside the consuming UI).**

```bash
git add frontend/src/lib/types.ts && git commit -m "feat(review): add is_owner/is_leader to ProjectItem type"
```

---

### Task 3: Review.tsx — segmented `[ All | I own | I led ]` control + client predicate

**Files:**
- Modify: `frontend/src/pages/Review.tsx` (add `rel` state, segmented control, filter predicate)
- Reference: `frontend/src/components/MemberWorkloadSheet.tsx:56-70` (segmented-control idiom we mirror)

**Interfaces:**
- Consumes: `ProjectItem.is_owner` / `ProjectItem.is_leader` (Task 2).
- Produces: none.

- [ ] **Step 1: Add the `rel` lens state.** Current top of the component (Review.tsx:12-17):

```tsx
export default function Review() {
  const { data, isLoading, refetch } = useDashboard()
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sheet, setSheet] = useState(false)

  const review = (data?.review ?? []).slice().sort(byDeadlineAsc)
```

Change to (add `rel` state):

```tsx
export default function Review() {
  const { data, isLoading, refetch } = useDashboard()
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [rel, setRel] = useState<'all' | 'owned' | 'led'>('all')
  const [sheet, setSheet] = useState(false)

  const review = (data?.review ?? []).slice().sort(byDeadlineAsc)
```

- [ ] **Step 2: Fold the relationship lens into the existing `filtered` predicate.** Current predicate (Review.tsx:32-37):

```tsx
  const filtered = review.filter(
    (t) =>
      (!filters.project || t.project === filters.project) &&
      (!filters.brand || t.brand === filters.brand) &&
      (!filters.assignee || t.assigned_to === filters.assignee),
  )
```

Change to (add the `rel` clause — `rel === 'all' || (rel === 'owned' ? t.is_owner : t.is_leader)`):

```tsx
  const filtered = review.filter(
    (t) =>
      (rel === 'all' || (rel === 'owned' ? t.is_owner : t.is_leader)) &&
      (!filters.project || t.project === filters.project) &&
      (!filters.brand || t.brand === filters.brand) &&
      (!filters.assignee || t.assigned_to === filters.assignee),
  )
```

- [ ] **Step 3: Render the segmented control above the filter button.** Current block inside `PullToRefresh` (Review.tsx:57-62):

```tsx
        <PullToRefresh onRefresh={refetch}>
          {review.length > 0 && (
            <div className="mb-2">
              <FilterButton count={advCount} onClick={() => setSheet(true)} />
            </div>
          )}
```

Change to (insert the `[ All | I own | I led ]` segmented control before the filter button, mirroring MemberWorkloadSheet's `inline-flex rounded-xl bg-slate-100 …` idiom):

```tsx
        <PullToRefresh onRefresh={refetch}>
          {review.length > 0 && (
            <div className="mb-2 flex flex-col gap-2">
              <div className="inline-flex self-start rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-sm font-semibold">
                <button
                  onClick={() => setRel('all')}
                  className={`rounded-lg px-4 py-1.5 ${rel === 'all' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  All
                </button>
                <button
                  onClick={() => setRel('owned')}
                  className={`rounded-lg px-4 py-1.5 ${rel === 'owned' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  I own
                </button>
                <button
                  onClick={() => setRel('led')}
                  className={`rounded-lg px-4 py-1.5 ${rel === 'led' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  I led
                </button>
              </div>
              <FilterButton count={advCount} onClick={() => setSheet(true)} />
            </div>
          )}
```

- [ ] **Step 4: Build the frontend.**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```

The Vite build writes hashed assets into `vernon_project/public/frontend/assets/` and rewrites `vernon_project/public/frontend/index.html`; that dist is what the live PWA serves at `/m`.

- [ ] **Step 5: Verify on the live PWA.** As a user who **owns project A** and **leads project B**, each with at least one item sitting in the Review queue (status Done/Checked awaiting your action):

1. Open `https://project.vernon.id/m/review` (hard-refresh to pull the new bundle).
2. Default lens = **All** → both A's and B's review items are visible.
3. Tap **I own** → queue narrows to project A's items only (B's disappear).
4. Tap **I led** → queue narrows to project B's items only (A's disappear).
5. Tap **All** → full queue returns. The header count (`{filtered.length} waiting for your approval`) and per-project group counts update with each toggle.

- [ ] **Step 6: Commit (include the rebuilt dist).**

```bash
git add frontend/src/pages/Review.tsx vernon_project/public/frontend && git commit -m "feat(review): add I own / I led lens to the Review queue"
```

## Phase 4 — Badge by points earned (System Manager configurable)

This phase adds a System-Manager-configurable badge system: a `Badge Settings` single doctype with a `Badge Tier` child table, a server-side `_user_badge(user)` resolver keyed on lifetime Todo-source points, exposure through `bootstrap` / `get_leaderboard` / `_shape_comment`, and an admin screen at `/badge-settings`. Tasks are ordered so each task's deliverable depends only on earlier tasks.

---

### Task 1: Create the `Badge Tier` child doctype

**Files:**
- Create: `vernon_project/vernon_project/doctype/badge_tier/__init__.py`
- Create: `vernon_project/vernon_project/doctype/badge_tier/badge_tier.json`
- Create: `vernon_project/vernon_project/doctype/badge_tier/badge_tier.py`

**Interfaces:**
- Consumes: none
- Produces: child doctype `Badge Tier` (`istable: 1`) with fields `tier_name` (Data, reqd), `min_points` (Float, reqd), `color` (Data), `icon` (Data). Referenced by `Badge Settings.tiers` (Task 2) and read by `_user_badge` (Task 3).

- [ ] **Step 1: Create the package marker** — create empty file `vernon_project/vernon_project/doctype/badge_tier/__init__.py` with no content (mirrors `group_level/__init__.py`, which is 0 bytes).

- [ ] **Step 2: Create the child doctype JSON** — this mirrors `group_level.json` (an `istable: 1` editable grid) but with the badge fields. Create `vernon_project/vernon_project/doctype/badge_tier/badge_tier.json`:

```json
{
 "actions": [],
 "allow_rename": 1,
 "creation": "2026-06-23 00:00:00.000000",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "field_order": ["tier_name", "min_points", "color", "icon"],
 "fields": [
  {
   "fieldname": "tier_name",
   "fieldtype": "Data",
   "in_list_view": 1,
   "label": "Tier Name",
   "reqd": 1,
   "columns": 3
  },
  {
   "fieldname": "min_points",
   "fieldtype": "Float",
   "in_list_view": 1,
   "label": "Min Points",
   "non_negative": 1,
   "reqd": 1,
   "columns": 3
  },
  {
   "fieldname": "color",
   "fieldtype": "Data",
   "in_list_view": 1,
   "label": "Color",
   "columns": 3
  },
  {
   "fieldname": "icon",
   "fieldtype": "Data",
   "in_list_view": 1,
   "label": "Icon",
   "columns": 2
  }
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "istable": 1,
 "links": [],
 "modified": "2026-06-23 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Badge Tier",
 "owner": "Administrator",
 "permissions": [],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 3: Create the controller** — mirrors `group_level.py` exactly. Create `vernon_project/vernon_project/doctype/badge_tier/badge_tier.py`:

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class BadgeTier(Document):
	pass
```

- [ ] **Step 4: Build/deploy** — (deferred to Task 2; both new doctypes migrate together). No standalone command for this task.

- [ ] **Step 5: Commit** — `git add vernon_project/vernon_project/doctype/badge_tier && git commit -m "feat(badge): add Badge Tier child doctype"`

---

### Task 2: Create the `Badge Settings` single doctype and migrate

**Files:**
- Create: `vernon_project/vernon_project/doctype/badge_settings/__init__.py`
- Create: `vernon_project/vernon_project/doctype/badge_settings/badge_settings.json`
- Create: `vernon_project/vernon_project/doctype/badge_settings/badge_settings.py`
- Reference: `vernon_project/vernon_project/doctype/badge_tier/badge_tier.json` (Task 1)
- Reference: `vernon_project/patches.txt` (no change — see Step 4)

**Interfaces:**
- Consumes: `Badge Tier` child doctype (Task 1).
- Produces: single doctype `Badge Settings` (`issingle: 1`) with child-table field `tiers` (Table → `Badge Tier`). Read/written by `_user_badge`, `get_badge_settings`, `save_badge_settings` (Task 3, Task 4).

- [ ] **Step 1: Create the package marker** — create empty file `vernon_project/vernon_project/doctype/badge_settings/__init__.py` with no content.

- [ ] **Step 2: Create the single doctype JSON** — mirrors `group.json`'s parent shape (`title_field`/`Table` field), but `issingle: 1` and System-Manager-only perms (matches the spec's "System Manager perms only"). Create `vernon_project/vernon_project/doctype/badge_settings/badge_settings.json`:

```json
{
 "actions": [],
 "creation": "2026-06-23 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["intro", "tiers"],
 "fields": [
  {"fieldname": "intro", "fieldtype": "HTML", "label": "Intro", "options": "<p>Define point-earned tiers. A user's badge is the highest tier whose Min Points is ≤ their lifetime Todo-source points earned.</p>"},
  {"fieldname": "tiers", "fieldtype": "Table", "label": "Tiers", "options": "Badge Tier"}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "issingle": 1,
 "links": [],
 "modified": "2026-06-23 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Badge Settings",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 3: Create the controller** — mirrors `group.py`. Create `vernon_project/vernon_project/doctype/badge_settings/badge_settings.py`:

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class BadgeSettings(Document):
	pass
```

- [ ] **Step 4: Confirm no patch needed** — `patches.txt` (read: it lists only data migrations like `rename_customer_to_brand`, `setup_groups_and_points` under `[post_model_sync]`). New doctypes auto-create from their JSON during `bench migrate`; the repo does NOT register doctype creation in `patches.txt`. So make NO change to `patches.txt` for either new doctype.

- [ ] **Step 5: Build/deploy (migrate both new doctypes)** — run:

```bash
bench --site project.vernon.id migrate
```

(Run from `/home/frappe/frappe-bench`.) This creates the `tabBadge Tier` and `tabBadge Settings` tables.

- [ ] **Step 6: Verify on live (desk)** — open `https://project.vernon.id/app/badge-settings`. Expect the single-doctype form to load with an empty "Tiers" child grid (no error). Add a throwaway tier (e.g. `Test` / `0`), Save, confirm it persists, then clear it and Save again. This proves the schema migrated and the child table writes.

- [ ] **Step 7: Commit** — `git add vernon_project/vernon_project/doctype/badge_settings && git commit -m "feat(badge): add Badge Settings single doctype with tiers table"`

---

### Task 3: Backend `_user_badge(user)` resolver in mobile.py

**Files:**
- Modify: `vernon_project/api/mobile.py` (insert a new helper block just above `_user_balance`, currently `mobile.py:1385`)

**Interfaces:**
- Consumes: `Badge Settings.tiers` (Task 2), `Point Ledger.points_earned` + `source` (existing).
- Produces: `_badge_tiers()` (cached per-request list of tier dicts, sorted by `min_points` desc) and `_user_badge(user)` → `{"tier_name", "color", "icon"}` or `None`. Consumed by `bootstrap` (Task 5), `get_leaderboard` (Task 6), `_shape_comment` (Task 7).

- [ ] **Step 1: Insert the badge helpers above `_user_balance`** — the current code at `mobile.py:1378-1396` is:

```python
# --------------------------------------------------------------------------------
# Points wallet — balance, transaction log
# Balance is computed live: sum(Point Ledger credits) - sum(Reward Redemption debits).
# Nothing is materialized, so there is no balance to drift out of sync.
# --------------------------------------------------------------------------------


def _user_balance(user):
	"""Return (earned, redeemed, balance) for a user as floats."""
	earned = frappe.db.sql(
		"select coalesce(sum(points_earned), 0) from `tabPoint Ledger` where user = %s",
		user,
	)[0][0]
	redeemed = frappe.db.sql(
		"select coalesce(sum(point_cost), 0) from `tabReward Redemption` where user = %s",
		user,
	)[0][0]
	earned, redeemed = float(earned), float(redeemed)
	return earned, redeemed, earned - redeemed
```

Replace it with (adds the badge block before the wallet block — the wallet code is unchanged below it):

```python
# --------------------------------------------------------------------------------
# Badge — highest Badge Settings tier the user's lifetime Todo-source points clear.
# Metric matches the leaderboard: sum(Point Ledger.points_earned WHERE source='Todo').
# Grant/Gift credits never affect the badge.
# --------------------------------------------------------------------------------


def _badge_tiers():
	"""Configured tiers sorted by min_points desc. Cached for the request so the
	bootstrap/leaderboard/comment calls don't re-read the single each time."""
	cached = getattr(frappe.local, "_vernon_badge_tiers", None)
	if cached is not None:
		return cached
	tiers = []
	try:
		settings = frappe.get_cached_doc("Badge Settings")
		for t in settings.get("tiers") or []:
			tiers.append({
				"tier_name": t.tier_name,
				"min_points": float(t.min_points or 0),
				"color": t.color or None,
				"icon": t.icon or None,
			})
	except Exception:
		tiers = []
	tiers.sort(key=lambda t: t["min_points"], reverse=True)
	frappe.local._vernon_badge_tiers = tiers
	return tiers


def _user_badge(user):
	"""Return {tier_name, color, icon} for the highest tier the user clears, or None.
	earned = lifetime Todo-source points (Grant/Gift excluded, matching the leaderboard)."""
	tiers = _badge_tiers()
	if not tiers:
		return None
	earned = float(frappe.db.sql(
		"select coalesce(sum(points_earned), 0) from `tabPoint Ledger` "
		"where user = %s and coalesce(source, 'Todo') not in ('Grant', 'Gift')",
		user,
	)[0][0])
	for t in tiers:  # already sorted desc by min_points
		if earned >= t["min_points"]:
			return {"tier_name": t["tier_name"], "color": t["color"], "icon": t["icon"]}
	return None


# --------------------------------------------------------------------------------
# Points wallet — balance, transaction log
# Balance is computed live: sum(Point Ledger credits) - sum(Reward Redemption debits).
# Nothing is materialized, so there is no balance to drift out of sync.
# --------------------------------------------------------------------------------


def _user_balance(user):
	"""Return (earned, redeemed, balance) for a user as floats."""
	earned = frappe.db.sql(
		"select coalesce(sum(points_earned), 0) from `tabPoint Ledger` where user = %s",
		user,
	)[0][0]
	redeemed = frappe.db.sql(
		"select coalesce(sum(point_cost), 0) from `tabReward Redemption` where user = %s",
		user,
	)[0][0]
	earned, redeemed = float(earned), float(redeemed)
	return earned, redeemed, earned - redeemed
```

- [ ] **Step 2: Build/deploy** — (deferred to Task 4; `bench restart` once after the endpoints land). No standalone command here.

- [ ] **Step 3: Commit** — `git add vernon_project/api/mobile.py && git commit -m "feat(badge): _user_badge resolver over Todo-source points"`

---

### Task 4: `get_badge_settings` / `save_badge_settings` endpoints (System Manager)

**Files:**
- Modify: `vernon_project/api/mobile.py` (add two whitelisted endpoints; place them immediately after `_user_badge` from Task 3, before the wallet block)
- Reference: `_require_system_manager` (`mobile.py:24`), `list_users`/`update_user` save idiom (`mobile.py:1217-1303`)

**Interfaces:**
- Consumes: `_require_system_manager` (`mobile.py:24`), `Badge Settings` single (Task 2).
- Produces: `get_badge_settings()` → `{"tiers": [{tier_name, min_points, color, icon}, ...]}` (sorted by `min_points` asc for editing), `save_badge_settings(tiers)` → `{"ok": True}`. Consumed by the FE hooks (Task 8) and `BadgeSettingsScreen` (Task 9).

- [ ] **Step 1: Add the two endpoints after `_user_badge`** — after the `_user_badge` function you added in Task 3 (and before the `# Points wallet` comment block), insert:

```python
@frappe.whitelist()
def get_badge_settings():
	"""All configured badge tiers for the admin editor (System Manager only).
	Returned ascending by min_points — the order they read naturally in the form."""
	_require_system_manager()
	settings = frappe.get_single("Badge Settings")
	tiers = [
		{
			"tier_name": t.tier_name,
			"min_points": float(t.min_points or 0),
			"color": t.color or "",
			"icon": t.icon or "",
		}
		for t in (settings.get("tiers") or [])
	]
	tiers.sort(key=lambda t: t["min_points"])
	return {"tiers": tiers}


@frappe.whitelist()
def save_badge_settings(tiers):
	"""Replace the badge tier table (System Manager only). `tiers` is a JSON list
	of {tier_name, min_points, color?, icon?}."""
	_require_system_manager()
	if isinstance(tiers, str):
		tiers = frappe.parse_json(tiers) if tiers else []
	rows = []
	for t in tiers or []:
		name = (t.get("tier_name") or "").strip()
		if not name:
			frappe.throw("Each tier needs a name")
		rows.append({
			"tier_name": name,
			"min_points": float(t.get("min_points") or 0),
			"color": (t.get("color") or "").strip(),
			"icon": (t.get("icon") or "").strip(),
		})
	settings = frappe.get_single("Badge Settings")
	settings.set("tiers", rows)
	settings.save(ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}
```

- [ ] **Step 2: Build/deploy (restart Python; covers Task 3 + Task 4)** — run:

```bash
bench --site project.vernon.id restart
```

(Run from `/home/frappe/frappe-bench`. If `restart` is unavailable in this dev setup, `bench --site project.vernon.id clear-cache` then restart the running web worker.)

- [ ] **Step 3: Verify on live (API)** — as a System-Manager-logged-in browser session on `https://project.vernon.id`, open the browser console on any `/m/...` page and run:

```js
fetch('/api/method/vernon_project.api.mobile.save_badge_settings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': window.csrf_token },
  credentials: 'same-origin',
  body: JSON.stringify({ tiers: [
    { tier_name: 'Bronze', min_points: 0, color: '#cd7f32', icon: '🥉' },
    { tier_name: 'Silver', min_points: 500, color: '#9ca3af', icon: '🥈' },
    { tier_name: 'Gold',   min_points: 2000, color: '#eab308', icon: '🥇' }
  ] })
}).then(r => r.json()).then(console.log)
```

Expect `{message: {ok: true}}`. Then run `fetch('/api/method/vernon_project.api.mobile.get_badge_settings', {credentials:'same-origin'}).then(r=>r.json()).then(console.log)` and expect the three tiers returned ascending by `min_points`. Keep these three tiers seeded — later tasks verify against them.

- [ ] **Step 4: Commit** — `git add vernon_project/api/mobile.py && git commit -m "feat(badge): get/save_badge_settings endpoints (System Manager)"`

---

### Task 5: `bootstrap()` returns the caller's `badge`

**Files:**
- Modify: `vernon_project/api/mobile.py` (`bootstrap`, `mobile.py:358-379`)

**Interfaces:**
- Consumes: `_user_badge(user)` (Task 3).
- Produces: `bootstrap()` response gains `"badge": {tier_name, color, icon} | None`. Consumed by FE `Boot.badge` (Task 8) and Profile chip (Task 8).

- [ ] **Step 1: Add `badge` to the bootstrap return** — current `bootstrap` return block (`mobile.py:373-379`) is:

```python
	return {
		"user": user,
		"full_name": u.get("full_name") or user,
		"image": u.get("user_image"),
		"roles": vernon_roles,
		"is_leader": any(r in roles for r in ("Project Owner", "Project Leader", "System Manager")),
	}
```

Replace it with:

```python
	return {
		"user": user,
		"full_name": u.get("full_name") or user,
		"image": u.get("user_image"),
		"roles": vernon_roles,
		"is_leader": any(r in roles for r in ("Project Owner", "Project Leader", "System Manager")),
		"badge": _user_badge(user),
	}
```

- [ ] **Step 2: Build/deploy** — run from `/home/frappe/frappe-bench`:

```bash
bench --site project.vernon.id restart
```

- [ ] **Step 3: Verify on live (API)** — in a logged-in browser session, console-run `fetch('/api/method/vernon_project.api.mobile.bootstrap', {credentials:'same-origin'}).then(r=>r.json()).then(d=>console.log(d.message.badge))`. For a user with ~1200 Todo-source points (and the Bronze/Silver/Gold tiers seeded in Task 4), expect `{tier_name: 'Silver', color: '#9ca3af', icon: '🥈'}`.

- [ ] **Step 4: Commit** — `git add vernon_project/api/mobile.py && git commit -m "feat(badge): bootstrap returns caller badge"`

---

### Task 6: `get_leaderboard` entries + me carry `badge`

**Files:**
- Modify: `vernon_project/api/mobile.py` (`get_leaderboard`, the `shape` closure at `mobile.py:1565-1573`)

**Interfaces:**
- Consumes: `_user_badge(user)` (Task 3).
- Produces: every leaderboard entry (and `me`) gains `"badge": {tier_name, color, icon} | None`. Consumed by FE `LeaderboardEntry.badge` (Task 8) and the leaderboard row (Task 8).

- [ ] **Step 1: Add `badge` to the `shape` closure** — current `shape` (`mobile.py:1565-1573`) is:

```python
	def shape(row, rank):
		info = name_map.get(row["user"], {})
		return {
			"user": row["user"],
			"full_name": info.get("full_name") or row["user"],
			"image": info.get("user_image"),
			"points": float(row["points"]),
			"rank": rank,
		}
```

Replace it with:

```python
	def shape(row, rank):
		info = name_map.get(row["user"], {})
		return {
			"user": row["user"],
			"full_name": info.get("full_name") or row["user"],
			"image": info.get("user_image"),
			"points": float(row["points"]),
			"rank": rank,
			"badge": _user_badge(row["user"]),
		}
```

(Note: `_user_badge` reuses the per-request cached tier list from `_badge_tiers`, so this adds only one small `points_earned` SUM query per ranked user — acceptable for a top-50 board.)

- [ ] **Step 2: Build/deploy** — run from `/home/frappe/frappe-bench`:

```bash
bench --site project.vernon.id restart
```

- [ ] **Step 3: Verify on live (API)** — console-run `fetch('/api/method/vernon_project.api.mobile.get_leaderboard?period=all', {credentials:'same-origin'}).then(r=>r.json()).then(d=>console.log(d.message.entries.map(e=>[e.full_name,e.badge?.tier_name])))`. Expect each entry to carry a `badge` (or `null`); the ~1200-point user shows `Silver`.

- [ ] **Step 4: Commit** — `git add vernon_project/api/mobile.py && git commit -m "feat(badge): leaderboard entries carry badge"`

---

### Task 7: `_shape_comment` adds `by_badge`

**Files:**
- Modify: `vernon_project/api/mobile.py` (`_shape_comment`, `mobile.py:682-693`)

**Interfaces:**
- Consumes: `_user_badge(user)` (Task 3).
- Produces: every comment dict gains `"by_badge": {tier_name, color, icon} | None`. Consumed by FE `Comment.by_badge` (Task 8) and `CommentThread` author badge (Task 8). Used by both `get_comments` and `add_comment` (they both call `_shape_comment`, so no further changes there).

- [ ] **Step 1: Add `by_badge` to `_shape_comment`** — current function (`mobile.py:682-693`) is:

```python
def _shape_comment(row, name_map):
	by = row.get("comment_email") or row.get("comment_by")
	person = name_map.get(by, {})
	return {
		"name": row["name"],
		"content": row.get("content") or "",
		"by": by,
		"by_name": person.get("full_name") or by,
		"by_image": person.get("user_image"),
		"at": str(row["creation"]),
		"at_human": _humanize_datetime(row["creation"]),
	}
```

Replace it with:

```python
def _shape_comment(row, name_map):
	by = row.get("comment_email") or row.get("comment_by")
	person = name_map.get(by, {})
	return {
		"name": row["name"],
		"content": row.get("content") or "",
		"by": by,
		"by_name": person.get("full_name") or by,
		"by_image": person.get("user_image"),
		"by_badge": _user_badge(by) if by else None,
		"at": str(row["creation"]),
		"at_human": _humanize_datetime(row["creation"]),
	}
```

- [ ] **Step 2: Build/deploy** — run from `/home/frappe/frappe-bench`:

```bash
bench --site project.vernon.id restart
```

- [ ] **Step 3: Verify on live (API)** — open any commentable item, then console-run (substitute a real Project Todo name) `fetch('/api/method/vernon_project.api.mobile.get_comments?reference_doctype=Project Todo&reference_name=<TODO_NAME>'.replace(/ /g,'%20'), {credentials:'same-origin'}).then(r=>r.json()).then(d=>console.log(d.message.map(c=>[c.by_name,c.by_badge?.tier_name])))`. Expect each comment to carry `by_badge` (the ~1200-point author shows `Silver`, others `null` or their tier).

- [ ] **Step 4: Commit** — `git add vernon_project/api/mobile.py && git commit -m "feat(badge): comments carry author badge"`

---

### Task 8: Frontend types, `canManageBadges`, and badge display (Profile / Leaderboard / Comments)

**Files:**
- Modify: `frontend/src/lib/types.ts` (`Boot` `types.ts:3-9`; `Comment` `types.ts:252-260`; `LeaderboardEntry` `types.ts:342-348`; add `Badge` type)
- Modify: `frontend/src/hooks/useData.ts` (add `canManageBadges` near `canManageUsers` `useData.ts:484-486`)
- Modify: `frontend/src/pages/Profile.tsx` (role-chip block `Profile.tsx:80-90`)
- Modify: `frontend/src/pages/LeaderboardScreen.tsx` (`Row` `LeaderboardScreen.tsx:17-36`)
- Modify: `frontend/src/components/CommentThread.tsx` (author line `CommentThread.tsx:33-36`)

**Interfaces:**
- Consumes: `bootstrap().badge` (Task 5), `LeaderboardEntry.badge` (Task 6), `Comment.by_badge` (Task 7).
- Produces: `Badge` type; `Boot.badge`, `LeaderboardEntry.badge`, `Comment.by_badge` typed fields; `canManageBadges(boot)` predicate (consumed by Task 9 route + nav).

- [ ] **Step 1: Add the `Badge` type and wire it into `Boot`** — current `types.ts:1-9`:

```typescript
export type StatusKey = 'planned' | 'done' | 'checked' | 'completed'

export interface Boot {
  user: string
  full_name: string
  image: string | null
  roles: string[]
  is_leader: boolean
}
```

Replace it with:

```typescript
export type StatusKey = 'planned' | 'done' | 'checked' | 'completed'

export interface Badge {
  tier_name: string
  color: string | null
  icon: string | null
}

export interface Boot {
  user: string
  full_name: string
  image: string | null
  roles: string[]
  is_leader: boolean
  badge?: Badge | null
}
```

- [ ] **Step 2: Add `by_badge` to `Comment`** — current `types.ts:252-260`:

```typescript
export interface Comment {
  name: string
  content: string
  by: string
  by_name: string
  by_image: string | null
  at: string
  at_human: string
}
```

Replace it with:

```typescript
export interface Comment {
  name: string
  content: string
  by: string
  by_name: string
  by_image: string | null
  by_badge?: Badge | null
  at: string
  at_human: string
}
```

- [ ] **Step 3: Add `badge` to `LeaderboardEntry`** — current `types.ts:342-348`:

```typescript
export interface LeaderboardEntry {
  user: string
  full_name: string
  image: string | null
  points: number
  rank: number
}
```

Replace it with:

```typescript
export interface LeaderboardEntry {
  user: string
  full_name: string
  image: string | null
  points: number
  rank: number
  badge?: Badge | null
}
```

- [ ] **Step 4: Add `canManageBadges` predicate** — current `useData.ts:484-486`:

```typescript
export function canManageUsers(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}
```

Replace it with:

```typescript
export function canManageUsers(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}

export function canManageBadges(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}
```

- [ ] **Step 5: Render the badge chip on Profile** — current role-chip block `Profile.tsx:80-90`:

```tsx
            <div className="flex flex-wrap justify-center gap-1.5">
              {boot.roles.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-500/15 px-2.5 py-1 text-xs font-medium text-brand-700 dark:text-brand-300"
                >
                  <ShieldCheck className="h-3 w-3" />
                  {r}
                </span>
              ))}
            </div>
```

Replace it with (adds a badge chip above the role chips; the chip tints from the tier `color` via inline style, falling back to the brand pill when no color):

```tsx
            {boot.badge && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                style={
                  boot.badge.color
                    ? { backgroundColor: `${boot.badge.color}22`, color: boot.badge.color }
                    : undefined
                }
              >
                {boot.badge.icon && <span>{boot.badge.icon}</span>}
                {boot.badge.tier_name}
              </span>
            )}
            <div className="flex flex-wrap justify-center gap-1.5">
              {boot.roles.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-500/15 px-2.5 py-1 text-xs font-medium text-brand-700 dark:text-brand-300"
                >
                  <ShieldCheck className="h-3 w-3" />
                  {r}
                </span>
              ))}
            </div>
```

- [ ] **Step 6: Render the badge on each leaderboard row** — current `Row` in `LeaderboardScreen.tsx:17-36`:

```tsx
function Row({ e, isMe }: { e: LeaderboardEntry; isMe: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${
        isMe ? 'bg-brand-50 dark:bg-brand-500/10' : ''
      }`}
    >
      <div className="w-7 shrink-0 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
        {medal(e.rank) ?? e.rank}
      </div>
      <Avatar name={e.full_name} image={e.image} size={36} />
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
        {e.full_name} {isMe && <span className="text-brand-600 dark:text-brand-300">· you</span>}
      </p>
      <p className="text-sm font-bold text-slate-900 dark:text-slate-50">
        {e.points.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      </p>
    </li>
  )
}
```

Replace it with (adds a small badge pill after the name; uses the tier `icon` if present, else a colored dot + tier name):

```tsx
function Row({ e, isMe }: { e: LeaderboardEntry; isMe: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${
        isMe ? 'bg-brand-50 dark:bg-brand-500/10' : ''
      }`}
    >
      <div className="w-7 shrink-0 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
        {medal(e.rank) ?? e.rank}
      </div>
      <Avatar name={e.full_name} image={e.image} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {e.full_name} {isMe && <span className="text-brand-600 dark:text-brand-300">· you</span>}
        </p>
        {e.badge && (
          <span
            className="mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={
              e.badge.color
                ? { backgroundColor: `${e.badge.color}22`, color: e.badge.color }
                : undefined
            }
          >
            {e.badge.icon && <span>{e.badge.icon}</span>}
            {e.badge.tier_name}
          </span>
        )}
      </div>
      <p className="text-sm font-bold text-slate-900 dark:text-slate-50">
        {e.points.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      </p>
    </li>
  )
}
```

- [ ] **Step 7: Render the badge next to the comment author** — current author line `CommentThread.tsx:33-36`:

```tsx
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">{c.by_name}</span>
                <span className="text-xs text-gray-400">{c.at_human}</span>
              </div>
```

Replace it with:

```tsx
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                  {c.by_name}
                  {c.by_badge && (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      style={
                        c.by_badge.color
                          ? { backgroundColor: `${c.by_badge.color}22`, color: c.by_badge.color }
                          : undefined
                      }
                    >
                      {c.by_badge.icon && <span>{c.by_badge.icon}</span>}
                      {c.by_badge.tier_name}
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-400">{c.at_human}</span>
              </div>
```

- [ ] **Step 8: Build/deploy (frontend)** — run:

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```

The dist is emitted into `vernon_project/public/frontend/` (served by Frappe at `/m`). (No `bench` step needed — the static assets are picked up directly.)

- [ ] **Step 9: Verify on live PWA** — with the Bronze/Silver/Gold tiers seeded (Task 4) and a user with ~1200 Todo-source points logged in:
  - Open `https://project.vernon.id/m/me` → expect a `🥈 Silver` chip above the role chips.
  - Open `https://project.vernon.id/m/leaderboard` (All-time) → expect that user's row to show the `Silver` pill; other users show their own tier or none.
  - Open a Project Todo with a comment by that user at `https://project.vernon.id/m/project-item/<TODO_NAME>` → expect `Silver` next to their name in the comment thread.

- [ ] **Step 10: Commit** — `git add frontend/src/lib/types.ts frontend/src/hooks/useData.ts frontend/src/pages/Profile.tsx frontend/src/pages/LeaderboardScreen.tsx frontend/src/components/CommentThread.tsx vernon_project/public/frontend && git commit -m "feat(badge): show badge on profile, leaderboard, comments"`

---

### Task 9: `BadgeSettingsScreen` + gated `/badge-settings` route + Profile admin link

**Files:**
- Modify: `frontend/src/lib/api.ts` (add `getBadgeSettings`/`saveBadgeSettings` to `mobileApi`, `api.ts:79-189`)
- Modify: `frontend/src/lib/types.ts` (add `BadgeTierInput` type)
- Modify: `frontend/src/hooks/useData.ts` (add `useBadgeSettings`/`useSaveBadgeSettings`; imports `api.ts:6`)
- Create: `frontend/src/pages/BadgeSettingsScreen.tsx`
- Modify: `frontend/src/App.tsx` (route block, after the `canManageUsers` block `App.tsx:101-107`; import `App.tsx:23-31`)
- Modify: `frontend/src/pages/Profile.tsx` (admin nav rows `Profile.tsx:121-123`; imports `Profile.tsx:2,7`)

**Interfaces:**
- Consumes: `get_badge_settings()` / `save_badge_settings(tiers)` (Task 4), `canManageBadges` (Task 8), `Badge` (Task 8).
- Produces: `/badge-settings` admin route; nothing later depends on it.

- [ ] **Step 1: Add the `BadgeTierInput` type to types.ts** — append at the end of `frontend/src/lib/types.ts` (after the `RewardFormPayload` interface that ends at `types.ts:403`):

```typescript

export interface BadgeTierInput {
  tier_name: string
  min_points: number
  color: string
  icon: string
}
```

- [ ] **Step 2: Add the API methods to `mobileApi`** — current tail of the `mobileApi` object `api.ts:187-189`:

```typescript
  listGiftRecipients: () =>
    api.get<{ users: import('./types').GiftUser[] }>(M + 'list_gift_recipients'),
}
```

Replace it with:

```typescript
  listGiftRecipients: () =>
    api.get<{ users: import('./types').GiftUser[] }>(M + 'list_gift_recipients'),
  getBadgeSettings: () =>
    api.get<{ tiers: import('./types').BadgeTierInput[] }>(M + 'get_badge_settings'),
  saveBadgeSettings: (tiers: import('./types').BadgeTierInput[]) =>
    api.post<{ ok: boolean }>(M + 'save_badge_settings', { tiers: JSON.stringify(tiers) }),
}
```

- [ ] **Step 3: Add the react-query hooks** — append to `frontend/src/hooks/useData.ts` (at end of file, after `useFulfillRedemption` which ends at `useData.ts:731`):

```typescript

export function useBadgeSettings() {
  return useQuery({
    queryKey: ['badge-settings'],
    queryFn: async () => (await mobileApi.getBadgeSettings()).tiers,
  })
}

export function useSaveBadgeSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tiers: BadgeTierInput[]) => mobileApi.saveBadgeSettings(tiers),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['badge-settings'] })
      qc.invalidateQueries({ queryKey: keys.boot })
      qc.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
}
```

Then add `BadgeTierInput` to the type import block. Current `useData.ts:7-33`:

```typescript
import type {
  Boot,
  Brand,
  Comment,
  Dashboard,
  FormOptions,
  Group,
  ManagedUser,
  MemberTodo,
  ProjectCard,
  ProjectDetail,
  ProjectDetailInput,
  ProjectFull,
  ProjectInput,
  ProjectItemDetail,
  GroupTodo,
  ScoringGroup,
  ScoringGroupPayload,
  UserFormPayload,
  Wallet,
  WalletLogEntry,
  Leaderboard,
  MarketplaceData,
  AdminReward,
  AdminRedemption,
  RewardFormPayload,
} from '@/lib/types'
```

Replace it with (adds `BadgeTierInput`):

```typescript
import type {
  Boot,
  Brand,
  Comment,
  Dashboard,
  FormOptions,
  Group,
  ManagedUser,
  MemberTodo,
  ProjectCard,
  ProjectDetail,
  ProjectDetailInput,
  ProjectFull,
  ProjectInput,
  ProjectItemDetail,
  GroupTodo,
  ScoringGroup,
  ScoringGroupPayload,
  UserFormPayload,
  Wallet,
  WalletLogEntry,
  Leaderboard,
  MarketplaceData,
  AdminReward,
  AdminRedemption,
  RewardFormPayload,
  BadgeTierInput,
} from '@/lib/types'
```

- [ ] **Step 4: Create `BadgeSettingsScreen.tsx`** — mirrors the `GroupFormScreen` admin-form idiom (`DetailScreen` wrapper, `useToast`, `useConfirm`, redirect-when-blocked `useEffect`, editable rows with add/remove). Create `frontend/src/pages/BadgeSettingsScreen.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, Trash2 } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageBadges, useBadgeSettings, useSaveBadgeSettings } from '@/hooks/useData'
import type { BadgeTierInput } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

const emptyTier = (): BadgeTierInput => ({ tier_name: '', min_points: 0, color: '', icon: '' })

export default function BadgeSettingsScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const { data: loaded, isLoading } = useBadgeSettings()
  const save = useSaveBadgeSettings()

  const [tiers, setTiers] = useState<BadgeTierInput[]>([])

  useEffect(() => {
    if (loaded) setTiers(loaded.length ? loaded : [emptyTier()])
  }, [loaded])

  // Access gate: redirect outside render (matches GroupFormScreen).
  const blocked = !boot ? false : !canManageBadges(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (blocked) return null

  if (isLoading && !loaded) {
    return (
      <DetailScreen title="Badges">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  const setTier = (i: number, patch: Partial<BadgeTierInput>) =>
    setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)))

  const addTier = () => setTiers((ts) => [...ts, emptyTier()])
  const removeTier = (i: number) => setTiers((ts) => ts.filter((_, j) => j !== i))

  const doSave = () => {
    for (const t of tiers) {
      if (!t.tier_name.trim()) {
        toast('error', 'Every tier needs a name')
        return
      }
      if (isNaN(t.min_points) || t.min_points < 0) {
        toast('error', 'Min points must be a non-negative number')
        return
      }
    }
    const payload = tiers.map((t) => ({
      tier_name: t.tier_name.trim(),
      min_points: Number(t.min_points),
      color: t.color.trim(),
      icon: t.icon.trim(),
    }))
    save.mutate(payload, {
      onSuccess: () => toast('success', 'Badges saved'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <DetailScreen title="Badges">
      <div className="flex flex-col gap-4">
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          A user's badge is the highest tier whose <b>Min Points</b> is ≤ their lifetime
          Todo-source points earned. Grants and gifts never change the badge.
        </p>

        <div className="flex flex-col gap-3">
          {tiers.map((t, i) => (
            <div key={i} className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Tier {i + 1}
                </span>
                <button
                  type="button"
                  aria-label="Remove tier"
                  onClick={() => removeTier(i)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-rose-500 active:scale-95 dark:border-slate-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <input
                  className={field}
                  value={t.tier_name}
                  onChange={(e) => setTier(i, { tier_name: e.target.value })}
                  placeholder="Tier name (e.g. Silver)"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  className={field}
                  value={String(t.min_points)}
                  onChange={(e) => setTier(i, { min_points: e.target.value === '' ? 0 : Number(e.target.value) })}
                  placeholder="Min points (e.g. 500)"
                />
                <div className="flex gap-2">
                  <input
                    className={field}
                    value={t.color}
                    onChange={(e) => setTier(i, { color: e.target.value })}
                    placeholder="Color (e.g. #9ca3af)"
                  />
                  <input
                    className={field}
                    value={t.icon}
                    onChange={(e) => setTier(i, { icon: e.target.value })}
                    placeholder="Icon (emoji)"
                  />
                </div>
                {(t.color || t.icon) && (
                  <span
                    className="inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={t.color ? { backgroundColor: `${t.color}22`, color: t.color } : undefined}
                  >
                    {t.icon && <span>{t.icon}</span>}
                    {t.tier_name || 'Preview'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addTier}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 active:scale-95 dark:border-slate-600 dark:text-slate-400"
        >
          <Plus className="h-4 w-4" /> Add tier
        </button>

        <button
          onClick={doSave}
          disabled={save.isPending}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          Save badges
        </button>
      </div>
    </DetailScreen>
  )
}
```

- [ ] **Step 5: Register the gated route in App.tsx** — current import block `App.tsx:22-31`:

```tsx
import UsersScreen from './pages/UsersScreen'
import UserFormScreen from './pages/UserFormScreen'
import WalletLogScreen from './pages/WalletLogScreen'
import LeaderboardScreen from './pages/LeaderboardScreen'
import MarketplaceScreen from './pages/MarketplaceScreen'
import RewardFormScreen from './pages/RewardFormScreen'
import MarketplaceAdminScreen from './pages/MarketplaceAdminScreen'
import GrantPointsScreen from './pages/GrantPointsScreen'
import GiftPointsScreen from './pages/GiftPointsScreen'
import { canManageGroups, canManageBrands, canManageUsers, canManageMarketplace, canGrantPoints } from './hooks/useData'
```

Replace it with (adds the screen import and `canManageBadges`):

```tsx
import UsersScreen from './pages/UsersScreen'
import UserFormScreen from './pages/UserFormScreen'
import WalletLogScreen from './pages/WalletLogScreen'
import LeaderboardScreen from './pages/LeaderboardScreen'
import MarketplaceScreen from './pages/MarketplaceScreen'
import RewardFormScreen from './pages/RewardFormScreen'
import MarketplaceAdminScreen from './pages/MarketplaceAdminScreen'
import GrantPointsScreen from './pages/GrantPointsScreen'
import GiftPointsScreen from './pages/GiftPointsScreen'
import BadgeSettingsScreen from './pages/BadgeSettingsScreen'
import { canManageGroups, canManageBrands, canManageUsers, canManageMarketplace, canGrantPoints, canManageBadges } from './hooks/useData'
```

Then current route block `App.tsx:101-107`:

```tsx
        {canManageUsers(boot) && (
          <>
            <Route path="/users" element={<UsersScreen />} />
            <Route path="/users/new" element={<UserFormScreen />} />
            <Route path="/users/:name" element={<UserFormScreen />} />
          </>
        )}
```

Replace it with (adds the `/badge-settings` gated route right after):

```tsx
        {canManageUsers(boot) && (
          <>
            <Route path="/users" element={<UsersScreen />} />
            <Route path="/users/new" element={<UserFormScreen />} />
            <Route path="/users/:name" element={<UserFormScreen />} />
          </>
        )}
        {canManageBadges(boot) && (
          <Route path="/badge-settings" element={<BadgeSettingsScreen />} />
        )}
```

- [ ] **Step 6: Add the Profile admin nav link** — current Profile import lines `Profile.tsx:2` and `Profile.tsx:7`:

```tsx
import { LogOut, Wifi, WifiOff, BookOpen, ShieldCheck, RefreshCw, ChevronRight, Trophy, Store, Users, KeyRound, Settings, Gift, Send } from 'lucide-react'
```

```tsx
import { useBoot, canManageGroups, canManageBrands, canManageUsers, canManageMarketplace, canGrantPoints } from '@/hooks/useData'
```

Replace the first (`Profile.tsx:2`) with (adds the `Award` icon):

```tsx
import { LogOut, Wifi, WifiOff, BookOpen, ShieldCheck, RefreshCw, ChevronRight, Trophy, Store, Users, KeyRound, Settings, Gift, Send, Award } from 'lucide-react'
```

Replace the second (`Profile.tsx:7`) with (adds `canManageBadges`):

```tsx
import { useBoot, canManageGroups, canManageBrands, canManageUsers, canManageMarketplace, canGrantPoints, canManageBadges } from '@/hooks/useData'
```

Then current admin-nav block `Profile.tsx:121-123`:

```tsx
            {canManageUsers(boot) && (
              <Row icon={Users} label="Manage Users" onClick={() => navigate('/users')} />
            )}
```

Replace it with (adds the Badges row right after Manage Users):

```tsx
            {canManageUsers(boot) && (
              <Row icon={Users} label="Manage Users" onClick={() => navigate('/users')} />
            )}
            {canManageBadges(boot) && (
              <Row icon={Award} label="Manage Badges" onClick={() => navigate('/badge-settings')} />
            )}
```

- [ ] **Step 7: Build/deploy (frontend)** — run:

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```

Dist is emitted into `vernon_project/public/frontend/` (served at `/m`).

- [ ] **Step 8: Verify on live PWA** — as a System Manager, open `https://project.vernon.id/m/me` → expect a "Manage Badges" row. Tap it → lands on `https://project.vernon.id/m/badge-settings` with the three seeded tiers (Bronze 0 / Silver 500 / Gold 2000) loaded. Edit Silver's `min_points` to `400`, Save → expect a "Badges saved" toast. Reopen `/m/me` (boot was invalidated) and confirm the ~1200-point user still shows Silver. Set Silver back to `500` and Save. Confirm a non-System-Manager account, visiting `https://project.vernon.id/m/badge-settings` directly, is redirected to `/m/` and never sees the data.

- [ ] **Step 9: Verify badge is Todo-only (grants/gifts don't change it)** — for the ~1200-Todo-point Silver user, grant or gift them +2000 points (via `/m/grant-points` or `/m/gift-points`, from a granter account), then reopen `https://project.vernon.id/m/me`. Expect the badge to STILL read `Silver` (not Gold) — confirming `_user_badge` excludes Grant/Gift sources.

- [ ] **Step 10: Commit** — `git add frontend/src/lib/api.ts frontend/src/lib/types.ts frontend/src/hooks/useData.ts frontend/src/pages/BadgeSettingsScreen.tsx frontend/src/App.tsx frontend/src/pages/Profile.tsx vernon_project/public/frontend && git commit -m "feat(badge): BadgeSettings admin screen + gated /badge-settings route"`

---

Key files referenced: backend `/home/frappe/frappe-bench/apps/vernon_project/vernon_project/api/mobile.py`; new doctypes under `/home/frappe/frappe-bench/apps/vernon_project/vernon_project/vernon_project/doctype/badge_tier/` and `/badge_settings/`; frontend `/home/frappe/frappe-bench/apps/vernon_project/frontend/src/{lib/types.ts,lib/api.ts,hooks/useData.ts,App.tsx,pages/Profile.tsx,pages/LeaderboardScreen.tsx,pages/BadgeSettingsScreen.tsx,components/CommentThread.tsx}`. No `patches.txt` change is required — new doctypes auto-create on `bench migrate`.

## Phase 5 — Notifications (in-app feed + Web Push)

This phase delivers the largest feature: a `Vernon Notification` feed (polled every 30s), Web Push for background delivery, an internal `_notify(...)` helper called from every mutation site, a header bell + sheet, a push-permission flow, and a Profile toggle. The `_notify` signature produced here is consumed by Phase 4 (mention notifications).

### Task 1: Deploy prerequisite — install pywebpush + generate VAPID keys (USER-RUN)

**This task is USER-RUN** (needs the production server shell on project.vernon.id; writes secrets into `site_config.json`). The agent does not run these; the user runs them once before Task 3's `_notify` can send push.

**Files:**
- Reference: site `site_config.json` (e.g. `/home/frappe/frappe-bench/sites/project.vernon.id/site_config.json`)

**Interfaces:**
- Consumes: none
- Produces: `frappe.conf.vapid_public_key`, `frappe.conf.vapid_private_key`, `frappe.conf.vapid_subject` (read by Task 3 `_notify` and Task 5 `bootstrap`)

- [ ] **Step 1: Install pywebpush in the bench env** — run from the bench root (`/home/frappe/frappe-bench`):
  ```bash
  ./env/bin/pip install pywebpush
  ```
- [ ] **Step 2: Generate a VAPID keypair** — run this one-off Python snippet in the bench env; it prints the two base64url keys the browser Push API needs (uncompressed P-256 public point, base64url, no padding):
  ```bash
  ./env/bin/python - <<'PY'
  import base64
  from cryptography.hazmat.primitives.asymmetric import ec
  from cryptography.hazmat.primitives import serialization

  pk = ec.generate_private_key(ec.SECP256R1())

  # private key -> raw 32-byte scalar, base64url (what pywebpush vapid_private_key expects)
  priv_int = pk.private_numbers().private_value
  priv_raw = priv_int.to_bytes(32, "big")
  priv_b64 = base64.urlsafe_b64encode(priv_raw).rstrip(b"=").decode()

  # public key -> uncompressed point (65 bytes, 0x04 prefix), base64url (applicationServerKey)
  pub_raw = pk.public_key().public_bytes(
      serialization.Encoding.X962,
      serialization.PublicFormat.UncompressedPoint,
  )
  pub_b64 = base64.urlsafe_b64encode(pub_raw).rstrip(b"=").decode()

  print("vapid_public_key  =", pub_b64)
  print("vapid_private_key =", priv_b64)
  PY
  ```
- [ ] **Step 3: Write the three keys into the site config** — open the site's `site_config.json` and add (replace the printed values; `vapid_subject` must be a real `mailto:`):
  ```json
  {
    "vapid_public_key": "<pub_b64 from step 2>",
    "vapid_private_key": "<priv_b64 from step 2>",
    "vapid_subject": "mailto:mo@intinusa.id"
  }
  ```
- [ ] **Step 4: Restart so the new conf + library are live** — from `/home/frappe/frappe-bench`:
  ```bash
  bench restart
  ```
- [ ] **Step 5: Verify the conf is readable** — confirm Frappe sees the keys:
  ```bash
  bench --site project.vernon.id console <<'PY'
  import frappe
  print(bool(frappe.conf.get("vapid_public_key")), bool(frappe.conf.get("vapid_private_key")), frappe.conf.get("vapid_subject"))
  PY
  ```
  Expect: `True True mailto:...`. No commit (secrets live only in `site_config.json`, which is not in the app repo).

---

### Task 2: New doctypes `Vernon Notification` and `Push Subscription`

**Files:**
- Create: `vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.json`
- Create: `vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.py`
- Create: `vernon_project/vernon_project/doctype/vernon_notification/__init__.py`
- Create: `vernon_project/vernon_project/doctype/push_subscription/push_subscription.json`
- Create: `vernon_project/vernon_project/doctype/push_subscription/push_subscription.py`
- Create: `vernon_project/vernon_project/doctype/push_subscription/__init__.py`

**Interfaces:**
- Consumes: none
- Produces: doctypes `Vernon Notification` (fields: `recipient`, `type`, `title`, `body`, `reference_doctype`, `reference_name`, `actor`, `is_read`) and `Push Subscription` (fields: `user`, `endpoint`, `p256dh`, `auth`, `user_agent`)

- [ ] **Step 1: Create the `Vernon Notification` JSON** — mirrors the `group.json` template structure (hash autoname, System Manager full perms). Write `vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.json`:
  ```json
  {
   "actions": [],
   "allow_rename": 0,
   "autoname": "hash",
   "creation": "2026-06-23 00:00:00.000000",
   "doctype": "DocType",
   "engine": "InnoDB",
   "field_order": [
    "recipient",
    "type",
    "title",
    "body",
    "reference_doctype",
    "reference_name",
    "actor",
    "is_read"
   ],
   "fields": [
    {"fieldname": "recipient", "fieldtype": "Link", "label": "Recipient", "options": "User", "reqd": 1, "in_list_view": 1},
    {"fieldname": "type", "fieldtype": "Select", "label": "Type", "options": "Assignment\nApproval\nComment\nMention\nPoints\nRedemption", "in_list_view": 1},
    {"fieldname": "title", "fieldtype": "Data", "label": "Title", "in_list_view": 1},
    {"fieldname": "body", "fieldtype": "Small Text", "label": "Body"},
    {"fieldname": "reference_doctype", "fieldtype": "Data", "label": "Reference Doctype"},
    {"fieldname": "reference_name", "fieldtype": "Data", "label": "Reference Name"},
    {"fieldname": "actor", "fieldtype": "Link", "label": "Actor", "options": "User"},
    {"fieldname": "is_read", "fieldtype": "Check", "label": "Is Read", "default": "0"}
   ],
   "grid_page_length": 50,
   "index_web_pages_for_search": 0,
   "links": [],
   "modified": "2026-06-23 00:00:00.000000",
   "modified_by": "Administrator",
   "module": "Vernon Project",
   "name": "Vernon Notification",
   "naming_rule": "Random",
   "owner": "Administrator",
   "permissions": [
    {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
   ],
   "row_format": "Dynamic",
   "sort_field": "creation",
   "sort_order": "DESC",
   "states": [],
   "track_changes": 0
  }
  ```
- [ ] **Step 2: Create the `Vernon Notification` controller** — write `vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.py`:
  ```python
  # Copyright (c) 2026, Vernon and contributors
  # For license information, please see license.txt

  from frappe.model.document import Document


  class VernonNotification(Document):
  	pass
  ```
- [ ] **Step 3: Create the package init** — write `vernon_project/vernon_project/doctype/vernon_notification/__init__.py` as an empty file:
  ```python
  ```
- [ ] **Step 4: Create the `Push Subscription` JSON** — `endpoint` is the unique key for upsert. Write `vernon_project/vernon_project/doctype/push_subscription/push_subscription.json`:
  ```json
  {
   "actions": [],
   "allow_rename": 0,
   "autoname": "hash",
   "creation": "2026-06-23 00:00:00.000000",
   "doctype": "DocType",
   "engine": "InnoDB",
   "field_order": [
    "user",
    "endpoint",
    "p256dh",
    "auth",
    "user_agent"
   ],
   "fields": [
    {"fieldname": "user", "fieldtype": "Link", "label": "User", "options": "User", "in_list_view": 1},
    {"fieldname": "endpoint", "fieldtype": "Data", "label": "Endpoint", "reqd": 1, "unique": 1, "length": 1000},
    {"fieldname": "p256dh", "fieldtype": "Data", "label": "p256dh", "length": 255},
    {"fieldname": "auth", "fieldtype": "Data", "label": "auth", "length": 255},
    {"fieldname": "user_agent", "fieldtype": "Data", "label": "User Agent", "length": 500}
   ],
   "grid_page_length": 50,
   "index_web_pages_for_search": 0,
   "links": [],
   "modified": "2026-06-23 00:00:00.000000",
   "modified_by": "Administrator",
   "module": "Vernon Project",
   "name": "Push Subscription",
   "naming_rule": "Random",
   "owner": "Administrator",
   "permissions": [
    {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
   ],
   "row_format": "Dynamic",
   "sort_field": "modified",
   "sort_order": "DESC",
   "states": [],
   "track_changes": 0
  }
  ```
- [ ] **Step 5: Create the `Push Subscription` controller** — write `vernon_project/vernon_project/doctype/push_subscription/push_subscription.py`:
  ```python
  # Copyright (c) 2026, Vernon and contributors
  # For license information, please see license.txt

  from frappe.model.document import Document


  class PushSubscription(Document):
  	pass
  ```
- [ ] **Step 6: Create the package init** — write `vernon_project/vernon_project/doctype/push_subscription/__init__.py` as an empty file:
  ```python
  ```
- [ ] **Step 7: Migrate the new doctypes onto the live DB** — from `/home/frappe/frappe-bench`:
  ```bash
  bench --site project.vernon.id migrate
  ```
- [ ] **Step 8: Verify the tables exist** — confirm both doctypes registered:
  ```bash
  bench --site project.vernon.id console <<'PY'
  import frappe
  print(frappe.db.exists("DocType", "Vernon Notification"), frappe.db.exists("DocType", "Push Subscription"))
  PY
  ```
  Expect: `Vernon Notification Push Subscription` (both truthy).
- [ ] **Step 9: Commit** — `git add vernon_project/vernon_project/doctype/vernon_notification vernon_project/vernon_project/doctype/push_subscription && git commit -m "feat(notifications): Vernon Notification + Push Subscription doctypes"`

---

### Task 3: `_notify()` internal helper + Web Push delivery

**Files:**
- Modify: `vernon_project/api/mobile.py` (add helper block after `_user_name_map`, which ends at `mobile.py:120`)

**Interfaces:**
- Consumes: `frappe.conf.vapid_public_key`/`vapid_private_key`/`vapid_subject` (Task 1); doctypes from Task 2
- Produces: `_notify(recipient, type, title, body, reference_doctype=None, reference_name=None, actor=None)` — consumed by Tasks 4 hook sites, Task 11 redemption, and Phase 4 (mentions)

- [ ] **Step 1: Add the `_notify` helper after `_user_name_map`** — insert directly after line 120 (the closing `return {r["name"]: r for r in rows}` of `_user_name_map`) and before `_visible_projects` at line 123. The helper inserts a `Vernon Notification` then best-effort web-pushes to each of the recipient's `Push Subscription` rows; it never raises into the caller, and skips self-notification.

  Current code (mobile.py:118-123):
  ```python
  		fields=["name", "full_name", "user_image"],
  	)
  	return {r["name"]: r for r in rows}


  def _visible_projects(status=None):
  ```

  After (insert the new block between them):
  ```python
  		fields=["name", "full_name", "user_image"],
  	)
  	return {r["name"]: r for r in rows}


  def _push_to_subscriptions(recipient, payload):
  	"""Best-effort Web Push to every Push Subscription of `recipient`.
  	Dead endpoints (404/410) are deleted. Never raises."""
  	public_key = frappe.conf.get("vapid_public_key")
  	private_key = frappe.conf.get("vapid_private_key")
  	subject = frappe.conf.get("vapid_subject")
  	if not (public_key and private_key and subject):
  		return  # VAPID not configured yet (see deploy prerequisite)

  	try:
  		from pywebpush import webpush, WebPushException
  	except Exception:
  		return  # pywebpush not installed yet

  	subs = frappe.get_all(
  		"Push Subscription",
  		filters={"user": recipient},
  		fields=["name", "endpoint", "p256dh", "auth"],
  		limit_page_length=0,
  	)
  	for sub in subs:
  		try:
  			webpush(
  				subscription_info={
  					"endpoint": sub["endpoint"],
  					"keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
  				},
  				data=json.dumps(payload),
  				vapid_private_key=private_key,
  				vapid_claims={"sub": subject},
  			)
  		except WebPushException as e:
  			status = getattr(getattr(e, "response", None), "status_code", None)
  			if status in (404, 410):
  				frappe.delete_doc(
  					"Push Subscription", sub["name"], ignore_permissions=True, force=True
  				)
  		except Exception:
  			pass  # network / encoding error — drop this push, keep the loop alive


  def _notify(recipient, type, title, body, reference_doctype=None, reference_name=None, actor=None):
  	"""Insert an in-app Vernon Notification and send Web Push. Best-effort:
  	any failure is swallowed so the triggering mutation never breaks. Skips
  	self-notification (recipient == actor)."""
  	try:
  		if not recipient or recipient in PROTECTED_USERS:
  			return
  		if actor and recipient == actor:
  			return
  		frappe.get_doc({
  			"doctype": "Vernon Notification",
  			"recipient": recipient,
  			"type": type,
  			"title": title,
  			"body": body,
  			"reference_doctype": reference_doctype,
  			"reference_name": reference_name,
  			"actor": actor,
  			"is_read": 0,
  		}).insert(ignore_permissions=True)
  		frappe.db.commit()
  		_push_to_subscriptions(
  			recipient,
  			{
  				"title": title,
  				"body": body,
  				"reference_doctype": reference_doctype,
  				"reference_name": reference_name,
  			},
  		)
  	except Exception:
  		frappe.log_error(title="_notify failed")


  def _visible_projects(status=None):
  ```
- [ ] **Step 2: Restart Python so the helper loads** — from `/home/frappe/frappe-bench`:
  ```bash
  bench restart
  ```
- [ ] **Step 3: Verify `_notify` inserts a row** — exercise the helper directly (no push yet, just the in-app row):
  ```bash
  bench --site project.vernon.id console <<'PY'
  import frappe
  from vernon_project.api.mobile import _notify
  frappe.set_user("Administrator")
  _notify("mo@intinusa.id", "Points", "Test", "hello from _notify")
  print(frappe.db.count("Vernon Notification", {"recipient": "mo@intinusa.id", "title": "Test"}))
  PY
  ```
  Expect: a count `>= 1`. (Push silently no-ops if Task 1 was skipped; the row insert is the assertion.)
- [ ] **Step 4: Commit** — `git add vernon_project/api/mobile.py && git commit -m "feat(notifications): _notify helper with best-effort Web Push"`

---

### Task 4: Notification feed + subscription endpoints

**Files:**
- Modify: `vernon_project/api/mobile.py` (add endpoints; place them right after `_notify` / before `_visible_projects`, or at end of file — here we append after the `_notify` block from Task 3)

**Interfaces:**
- Consumes: `_notify` and doctypes (Tasks 2–3)
- Produces: whitelisted endpoints `get_notifications(limit=30)`, `mark_notification_read(name)`, `mark_all_read()`, `register_push_subscription(subscription)`, `unregister_push_subscription(endpoint)`

- [ ] **Step 1: Add the five endpoints** — insert immediately after the `_notify(...)` function body and before `def _visible_projects(status=None):` (i.e. before the `_visible_projects` line you re-emitted in Task 3). These follow the typed-dict + throw-on-error idiom; all reads/writes scope to `frappe.session.user` and use `ignore_permissions=True`; mutations `commit`:
  ```python
  @frappe.whitelist()
  def get_notifications(limit=30):
  	"""Newest-first notifications for the session user + unread count."""
  	user = frappe.session.user
  	if user == "Guest":
  		frappe.throw("Not logged in", frappe.AuthenticationError)
  	limit = frappe.utils.cint(limit) or 30
  	rows = frappe.get_all(
  		"Vernon Notification",
  		filters={"recipient": user},
  		fields=[
  			"name", "type", "title", "body", "reference_doctype",
  			"reference_name", "actor", "is_read", "creation",
  		],
  		order_by="creation desc",
  		limit_page_length=limit,
  	)
  	actor_map = _user_name_map({r["actor"] for r in rows})
  	items = [
  		{
  			"name": r["name"],
  			"type": r["type"],
  			"title": r["title"],
  			"body": r["body"],
  			"reference_doctype": r["reference_doctype"],
  			"reference_name": r["reference_name"],
  			"actor": r["actor"],
  			"actor_name": (actor_map.get(r["actor"]) or {}).get("full_name") or r["actor"],
  			"is_read": bool(r["is_read"]),
  			"at": str(r["creation"]),
  			"at_human": _humanize_datetime(r["creation"]),
  		}
  		for r in rows
  	]
  	unread = frappe.db.count("Vernon Notification", {"recipient": user, "is_read": 0})
  	return {"items": items, "unread": unread}


  @frappe.whitelist()
  def mark_notification_read(name):
  	"""Mark one of the session user's notifications read."""
  	user = frappe.session.user
  	owner = frappe.db.get_value("Vernon Notification", name, "recipient")
  	if owner != user:
  		frappe.throw("Not permitted", frappe.PermissionError)
  	frappe.db.set_value("Vernon Notification", name, "is_read", 1, update_modified=False)
  	frappe.db.commit()
  	return {"ok": True}


  @frappe.whitelist()
  def mark_all_read():
  	"""Mark every unread notification of the session user as read."""
  	user = frappe.session.user
  	names = frappe.get_all(
  		"Vernon Notification",
  		filters={"recipient": user, "is_read": 0},
  		pluck="name",
  		limit_page_length=0,
  	)
  	for n in names:
  		frappe.db.set_value("Vernon Notification", n, "is_read", 1, update_modified=False)
  	frappe.db.commit()
  	return {"ok": True, "marked": len(names)}


  @frappe.whitelist()
  def register_push_subscription(subscription):
  	"""Upsert a Push Subscription (by endpoint) for the session user."""
  	user = frappe.session.user
  	if user == "Guest":
  		frappe.throw("Not logged in", frappe.AuthenticationError)
  	sub = frappe.parse_json(subscription) if isinstance(subscription, str) else subscription
  	endpoint = (sub or {}).get("endpoint")
  	keys = (sub or {}).get("keys") or {}
  	p256dh = keys.get("p256dh")
  	auth = keys.get("auth")
  	if not endpoint or not p256dh or not auth:
  		frappe.throw("Invalid subscription")
  	ua = frappe.local.request.headers.get("User-Agent") if frappe.local.request else None
  	existing = frappe.db.get_value("Push Subscription", {"endpoint": endpoint}, "name")
  	if existing:
  		doc = frappe.get_doc("Push Subscription", existing)
  		doc.user = user
  		doc.p256dh = p256dh
  		doc.auth = auth
  		doc.user_agent = (ua or "")[:500]
  		doc.save(ignore_permissions=True)
  	else:
  		frappe.get_doc({
  			"doctype": "Push Subscription",
  			"user": user,
  			"endpoint": endpoint,
  			"p256dh": p256dh,
  			"auth": auth,
  			"user_agent": (ua or "")[:500],
  		}).insert(ignore_permissions=True)
  	frappe.db.commit()
  	return {"ok": True}


  @frappe.whitelist()
  def unregister_push_subscription(endpoint):
  	"""Delete the session user's Push Subscription by endpoint."""
  	user = frappe.session.user
  	name = frappe.db.get_value(
  		"Push Subscription", {"endpoint": endpoint, "user": user}, "name"
  	)
  	if name:
  		frappe.delete_doc("Push Subscription", name, ignore_permissions=True, force=True)
  		frappe.db.commit()
  	return {"ok": True}
  ```
- [ ] **Step 2: Restart Python** — from `/home/frappe/frappe-bench`:
  ```bash
  bench restart
  ```
- [ ] **Step 3: Verify the feed endpoint responds** — hit it with the live session over curl-from-console is awkward, so test in console as the seeded user:
  ```bash
  bench --site project.vernon.id console <<'PY'
  import frappe
  frappe.set_user("mo@intinusa.id")
  from vernon_project.api.mobile import get_notifications, mark_all_read
  print(get_notifications())
  print(mark_all_read())
  print(get_notifications()["unread"])
  PY
  ```
  Expect: an `{'items': [...], 'unread': N}` dict, then `{'ok': True, 'marked': ...}`, then `0`.
- [ ] **Step 4: Commit** — `git add vernon_project/api/mobile.py && git commit -m "feat(notifications): feed + push-subscription endpoints"`

---

### Task 5: Expose `vapid_public_key` in `bootstrap()`

**Files:**
- Modify: `vernon_project/api/mobile.py` (`bootstrap` return, `mobile.py:375-381`)

**Interfaces:**
- Consumes: `frappe.conf.vapid_public_key` (Task 1)
- Produces: `bootstrap()["vapid_public_key"]` — consumed by Task 10 push flow + Task 12 Profile toggle

- [ ] **Step 1: Add `vapid_public_key` to the bootstrap return** — current code (mobile.py:375-381):
  ```python
  	return {
  		"user": user,
  		"full_name": u.get("full_name") or user,
  		"image": u.get("user_image"),
  		"roles": vernon_roles,
  		"is_leader": any(r in roles for r in ("Project Owner", "Project Leader", "System Manager")),
  	}
  ```
  After:
  ```python
  	return {
  		"user": user,
  		"full_name": u.get("full_name") or user,
  		"image": u.get("user_image"),
  		"roles": vernon_roles,
  		"is_leader": any(r in roles for r in ("Project Owner", "Project Leader", "System Manager")),
  		"vapid_public_key": frappe.conf.get("vapid_public_key") or None,
  	}
  ```
- [ ] **Step 2: Restart Python** — from `/home/frappe/frappe-bench`:
  ```bash
  bench restart
  ```
- [ ] **Step 3: Verify boot carries the key** — open `https://project.vernon.id/m/me` in the browser, open DevTools console and run `fetch('/api/method/vernon_project.api.mobile.bootstrap').then(r=>r.json()).then(d=>console.log(d.message.vapid_public_key))`. Expect the base64url public key string (or `null` if Task 1 deferred).
- [ ] **Step 4: Commit** — `git add vernon_project/api/mobile.py && git commit -m "feat(notifications): expose vapid_public_key in bootstrap"`

---

### Task 6: Assignment notification in `update_todo`

**Files:**
- Modify: `vernon_project/api/mobile.py` (`update_todo`, assignment write at `mobile.py:995-996`; save at `mobile.py:1036`)

**Interfaces:**
- Consumes: `_notify` (Task 3); `_user_name_map` (mobile.py:108)
- Produces: none

- [ ] **Step 1: Capture the previous assignee before mutating** — `update_todo` loads `row = frappe.get_doc("Project Todo", project_item)` at line 975. We need the old assignee to detect a change. Current code (mobile.py:993-996):
  ```python
  		if estimated is not None and estimated != "":
  			row.estimated = int(estimated)
  		if assigned_to is not None and assigned_to:
  			row.assigned_to = assigned_to
  ```
  After (record the prior value, then set):
  ```python
  		if estimated is not None and estimated != "":
  			row.estimated = int(estimated)
  		_prev_assignee = row.assigned_to
  		if assigned_to is not None and assigned_to:
  			row.assigned_to = assigned_to
  ```
- [ ] **Step 2: Fire the notification after a successful save** — current code (mobile.py:1036-1037):
  ```python
  		row.save(ignore_permissions=True)
  		return {"status": "ok", "message": "Task updated."}
  ```
  After (notify the new assignee when it actually changed; deep-link to the Project Todo):
  ```python
  		row.save(ignore_permissions=True)

  		if row.assigned_to and row.assigned_to != _prev_assignee:
  			actor_name = (_user_name_map({user}).get(user) or {}).get("full_name") or user
  			_notify(
  				recipient=row.assigned_to,
  				type="Assignment",
  				title="New task assigned",
  				body=f"{actor_name} assigned you: {row.to_do}",
  				reference_doctype="Project Todo",
  				reference_name=row.name,
  				actor=user,
  			)

  		return {"status": "ok", "message": "Task updated."}
  ```
- [ ] **Step 3: Restart Python** — from `/home/frappe/frappe-bench`: `bench restart`
- [ ] **Step 4: Verify on live PWA** — open a task you lead at `https://project.vernon.id/m/project-item/<id>`, reassign it to another user, then log in as that user (or check that user's feed via Task 9 bell). Expect a new "New task assigned" notification (bell badge +1). Reassigning to the same person again produces no duplicate.
- [ ] **Step 5: Commit** — `git add vernon_project/api/mobile.py && git commit -m "feat(notifications): assignment notify on reassign"`

---

### Task 7: Approval-queue notifications in `project_todo.py` `on_change`

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py` (`on_change`, `project_todo.py:297-307`)

**Interfaces:**
- Consumes: `_notify` (Task 3); status constants
- Produces: none

When a todo advances: `planned → done` puts it in the **Leader's** approval queue (notify `project_leader`); `done → checked` puts it in the **Owner's** queue (notify `project_owner`); reaching `✅ Completed` notifies the **assignee** their work was approved. Recipients are resolved from the todo's `project` (the controller already syncs `self.project`).

- [ ] **Step 1: Add a notify helper method + call it from `on_change`** — current code (project_todo.py:297-310):
  ```python
  	def on_change(self):
  		old = self.get_doc_before_save()
  		prev_state = old.status if old else None
  		if prev_state != self.status:
  			self._recompute_parent()
  			if self.status == "✅ Completed":
  				self.sync_point_ledger()
  				if self.is_recurring:
  					self.create_next_occurrence()
  			elif prev_state == "✅ Completed":
  				self._remove_ledger()

  	def on_update(self):
  		self.sync_block_links()
  ```
  After (add the `_notify_status_change` call inside the transition branch, and define the method below `on_change`):
  ```python
  	def on_change(self):
  		old = self.get_doc_before_save()
  		prev_state = old.status if old else None
  		if prev_state != self.status:
  			self._recompute_parent()
  			if self.status == "✅ Completed":
  				self.sync_point_ledger()
  				if self.is_recurring:
  					self.create_next_occurrence()
  			elif prev_state == "✅ Completed":
  				self._remove_ledger()
  			self._notify_status_change(prev_state)

  	def _notify_status_change(self, prev_state):
  		"""Best-effort approval-queue notifications. Never raises into the save.
  		done   -> Leader approval queue (notify project_leader)
  		checked-> Owner approval queue  (notify project_owner)
  		Completed -> notify the assignee their work was approved."""
  		try:
  			from vernon_project.api.mobile import _notify

  			actor = frappe.session.user
  			project = frappe.get_value(
  				"Project", self.project, ["project_owner", "project_leader"], as_dict=True
  			) or {}

  			# Done By PL? -> awaiting Leader. Checked By PL -> awaiting Owner.
  			DONE = "\U0001f7e0 Done"
  			CHECKED = "\U0001f537 Checked By PL"
  			COMPLETED = "✅ Completed"

  			if self.status == DONE:
  				_notify(
  					recipient=project.get("project_leader"),
  					type="Approval",
  					title="Task awaiting your approval",
  					body=f"\u201c{self.to_do}\u201d is ready for Leader approval.",
  					reference_doctype="Project Todo",
  					reference_name=self.name,
  					actor=actor,
  				)
  			elif self.status == CHECKED:
  				_notify(
  					recipient=project.get("project_owner"),
  					type="Approval",
  					title="Task awaiting your approval",
  					body=f"\u201c{self.to_do}\u201d is ready for Owner approval.",
  					reference_doctype="Project Todo",
  					reference_name=self.name,
  					actor=actor,
  				)
  			elif self.status == COMPLETED:
  				_notify(
  					recipient=self.assigned_to,
  					type="Approval",
  					title="Your task was approved",
  					body=f"\u201c{self.to_do}\u201d is now Completed.",
  					reference_doctype="Project Todo",
  					reference_name=self.name,
  					actor=actor,
  				)
  		except Exception:
  			frappe.log_error(title="_notify_status_change failed")

  	def on_update(self):
  		self.sync_block_links()
  ```
- [ ] **Step 2: Restart Python** — from `/home/frappe/frappe-bench`: `bench restart`
- [ ] **Step 3: Verify on live PWA** — as an assignee, open your Planned task at `https://project.vernon.id/m/project-item/<id>` and tap "Mark Done". The project Leader should receive a "Task awaiting your approval" notification. Then as Leader approve it (→ Checked) — the Owner gets one; as Owner approve (→ Completed) — the original assignee gets "Your task was approved". (Self-actions where you are also the recipient are suppressed by `_notify`'s self-skip.)
- [ ] **Step 4: Commit** — `git add vernon_project/vernon_project/doctype/project_todo/project_todo.py && git commit -m "feat(notifications): approval-queue notify on status advance"`

---

### Task 8: Comment + points + redemption notifications

**Files:**
- Modify: `vernon_project/api/mobile.py` (`add_comment`, `mobile.py:717-736`; `grant_points`, `mobile.py:1811-1815`; `gift_points`, `mobile.py:1880-1884`)
- Modify: `vernon_project/vernon_project/doctype/reward_redemption/reward_redemption.py` (add `on_update`)

**Interfaces:**
- Consumes: `_notify` (Task 3); `_comment_project` (mobile.py:664); `_user_name_map`
- Produces: none

- [ ] **Step 1: Notify comment participants in `add_comment`** — current code (mobile.py:724-736):
  ```python
  		doc = frappe.get_doc(reference_doctype, reference_name)
  		c = doc.add_comment("Comment", content)
  		name_map = _user_name_map({c.comment_email, c.comment_by})
  		return _shape_comment(
  			{
  				"name": c.name,
  				"content": c.content,
  				"comment_email": c.comment_email,
  				"comment_by": c.comment_by,
  				"creation": c.creation,
  			},
  			name_map,
  		)
  ```
  After (resolve the owning project + its owner/leader and the todo assignee, then notify each — Phase 4 will add `@mention` parsing here later):
  ```python
  		doc = frappe.get_doc(reference_doctype, reference_name)
  		c = doc.add_comment("Comment", content)

  		# Notify item participants (project owner/leader + the todo's assignee).
  		actor = frappe.session.user
  		project = _comment_project(reference_doctype, reference_name)
  		participants = set()
  		if project:
  			owner, leader = frappe.get_value(
  				"Project", project, ["project_owner", "project_leader"]
  			) or (None, None)
  			participants.update([owner, leader])
  		if reference_doctype == "Project Todo":
  			assignee = frappe.get_value("Project Todo", reference_name, "assigned_to")
  			participants.add(assignee)
  		actor_name = (_user_name_map({actor}).get(actor) or {}).get("full_name") or actor
  		snippet = frappe.utils.strip_html(content)[:80]
  		for p in participants:
  			_notify(
  				recipient=p,
  				type="Comment",
  				title="New comment",
  				body=f"{actor_name}: {snippet}",
  				reference_doctype=reference_doctype,
  				reference_name=reference_name,
  				actor=actor,
  			)

  		name_map = _user_name_map({c.comment_email, c.comment_by})
  		return _shape_comment(
  			{
  				"name": c.name,
  				"content": c.content,
  				"comment_email": c.comment_email,
  				"comment_by": c.comment_by,
  				"creation": c.creation,
  			},
  			name_map,
  		)
  ```
- [ ] **Step 2: Notify the recipient in `grant_points`** — current code (mobile.py:1811-1815):
  ```python
  	}).insert(ignore_permissions=True)
  	frappe.db.commit()

  	_, _, balance = _user_balance(user)
  	return {"balance": balance, "granted": amount}
  ```
  After (notify the credited user; deep-link to their wallet):
  ```python
  	}).insert(ignore_permissions=True)
  	frappe.db.commit()

  	_notify(
  		recipient=user,
  		type="Points",
  		title="You received points",
  		body=f"You were granted {int(amount)} points.",
  		reference_doctype="Wallet",
  		reference_name=user,
  		actor=frappe.session.user,
  	)

  	_, _, balance = _user_balance(user)
  	return {"balance": balance, "granted": amount}
  ```
- [ ] **Step 3: Notify the recipient in `gift_points`** — current code (mobile.py:1880-1884):
  ```python
  	}).insert(ignore_permissions=True)
  	frappe.db.commit()

  	_, _, new_balance = _user_balance(sender)
  	return {"balance": new_balance, "gifted": amount, "to": to_user}
  ```
  After (notify the recipient of the gift, attributing the sender's name):
  ```python
  	}).insert(ignore_permissions=True)
  	frappe.db.commit()

  	sender_name = (_user_name_map({sender}).get(sender) or {}).get("full_name") or sender
  	_notify(
  		recipient=to_user,
  		type="Points",
  		title="You received a gift",
  		body=f"{sender_name} gifted you {amount} points.",
  		reference_doctype="Wallet",
  		reference_name=to_user,
  		actor=sender,
  	)

  	_, _, new_balance = _user_balance(sender)
  	return {"balance": new_balance, "gifted": amount, "to": to_user}
  ```
- [ ] **Step 4: Add the redemption `on_update` hook** — fulfillment is a generic `/api/resource` update, so the controller must fire the notification. Current code (reward_redemption.py:10-15):
  ```python
  class RewardRedemption(Document):
  	def before_save(self):
  		# Stamp the fulfilment time when an admin flips status to Fulfilled.
  		if self.status == "Fulfilled" and not self.fulfilled_on:
  			self.fulfilled_on = now_datetime()
  ```
  After (notify `user` when status transitions to `Fulfilled`; best-effort):
  ```python
  class RewardRedemption(Document):
  	def before_save(self):
  		# Stamp the fulfilment time when an admin flips status to Fulfilled.
  		if self.status == "Fulfilled" and not self.fulfilled_on:
  			self.fulfilled_on = now_datetime()

  	def on_update(self):
  		old = self.get_doc_before_save()
  		prev_status = old.status if old else None
  		if self.status == "Fulfilled" and prev_status != "Fulfilled":
  			try:
  				from vernon_project.api.mobile import _notify

  				_notify(
  					recipient=self.user,
  					type="Redemption",
  					title="Reward fulfilled",
  					body=f"Your redemption of \u201c{self.reward_name}\u201d was fulfilled.",
  					reference_doctype="Reward Redemption",
  					reference_name=self.name,
  					actor=frappe.session.user,
  				)
  			except Exception:
  				frappe.log_error(title="redemption notify failed")
  ```
- [ ] **Step 5: Restart Python** — from `/home/frappe/frappe-bench`: `bench restart`
- [ ] **Step 6: Verify on live PWA** — (a) Comment: open any Project Todo item, post a comment as the assignee; the project owner/leader gets a "New comment" notification. (b) Points: grant points to a user at `https://project.vernon.id/m/grant-points` — that user gets "You received points". (c) Gift: gift points at `/m/gift-points` — recipient gets "You received a gift". (d) Redemption: in the marketplace admin flip a redemption to Fulfilled — the redeeming user gets "Reward fulfilled". Each increments the recipient's bell.
- [ ] **Step 7: Commit** — `git add vernon_project/api/mobile.py vernon_project/vernon_project/doctype/reward_redemption/reward_redemption.py && git commit -m "feat(notifications): comment, points, gift, redemption notify hooks"`

---

### Task 9: Service-worker push + notificationclick handlers (both files)

**Files:**
- Modify: `vernon_project/www/vernon_sw.js` (bump cache `vernon_sw.js:6`; append handlers)
- Modify: `frontend/sw-custom.js` (must stay byte-identical — same two edits)

**Interfaces:**
- Consumes: push payload shape from `_notify` (`{title, body, reference_doctype, reference_name}`)
- Produces: none (browser-side delivery)

- [ ] **Step 1: Bump `ASSET_CACHE` in `vernon_sw.js`** — current (vernon_sw.js:6):
  ```javascript
  const ASSET_CACHE = 'vernon-assets-v5'
  ```
  After:
  ```javascript
  const ASSET_CACHE = 'vernon-assets-v6'
  ```
- [ ] **Step 2: Append push + notificationclick handlers to `vernon_sw.js`** — add at the end of the file, after the `navigationHandler` function (after vernon_sw.js:75). The deep link maps `reference_doctype`/`reference_name` to the PWA route (Project Todo → `/m/project-item/...`, Wallet → `/m/wallet`, Reward Redemption → `/m/marketplace`, else `/m`):
  ```javascript

  // --- Web Push -------------------------------------------------------------
  function deepLinkFor(data) {
    const d = (data && data.reference_doctype) || ''
    const n = (data && data.reference_name) || ''
    if (d === 'Project Todo' && n) return '/m/project-item/' + encodeURIComponent(n)
    if (d === 'Project Detail' && n) return '/m/project-detail/' + encodeURIComponent(n)
    if (d === 'Project' && n) return '/m/project/' + encodeURIComponent(n)
    if (d === 'Wallet') return '/m/wallet'
    if (d === 'Reward Redemption') return '/m/marketplace'
    return '/m'
  }

  self.addEventListener('push', (event) => {
    let payload = {}
    try {
      payload = event.data ? event.data.json() : {}
    } catch (e) {
      payload = { title: 'Vernon', body: event.data ? event.data.text() : '' }
    }
    const title = payload.title || 'Vernon'
    const url = deepLinkFor(payload)
    event.waitUntil(
      self.registration.showNotification(title, {
        body: payload.body || '',
        icon: ASSET_PREFIX + 'icon-192.png',
        badge: ASSET_PREFIX + 'icon-192.png',
        data: { url },
      }),
    )
  })

  self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = (event.notification.data && event.notification.data.url) || '/m'
    event.waitUntil(
      (async () => {
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const client of all) {
          if (client.url.includes('/m') && 'focus' in client) {
            await client.focus()
            if ('navigate' in client) {
              try {
                await client.navigate(url)
              } catch (e) {
                /* cross-scope navigate may fail; focus is enough */
              }
            }
            return
          }
        }
        if (self.clients.openWindow) await self.clients.openWindow(url)
      })(),
    )
  })
  ```
- [ ] **Step 3: Apply the exact same two edits to `frontend/sw-custom.js`** — change `vernon-assets-v5` → `vernon-assets-v6` and append the identical push/notificationclick block. After both edits, confirm byte-identity:
  ```bash
  diff /home/frappe/frappe-bench/apps/vernon_project/vernon_project/www/vernon_sw.js /home/frappe/frappe-bench/apps/vernon_project/frontend/sw-custom.js && echo IDENTICAL
  ```
  Expect: `IDENTICAL`.
- [ ] **Step 4: Deploy the served SW** — `vernon_sw.js` is served from `vernon_project/www/` directly (no build needed for it); the frontend copy is used by the dev build. No `bench` step required for the www file. (Frontend rebuild happens in Task 13.) Verify the live file shows v6:
  ```bash
  curl -s https://project.vernon.id/vernon_sw.js | grep ASSET_CACHE
  ```
  Expect: `const ASSET_CACHE = 'vernon-assets-v6'`.
- [ ] **Step 5: Commit** — `git add vernon_project/www/vernon_sw.js frontend/sw-custom.js && git commit -m "feat(notifications): SW push + notificationclick handlers, bump cache v6"`

---

### Task 10: Frontend api.ts + types.ts + useData hooks

**Files:**
- Modify: `frontend/src/lib/api.ts` (`mobileApi` block ends `api.ts:188-189`)
- Modify: `frontend/src/lib/types.ts` (`Boot` interface `types.ts:3-9`; append new types)
- Modify: `frontend/src/hooks/useData.ts` (`keys` `useData.ts:36-61`; append hooks)

**Interfaces:**
- Consumes: endpoints from Tasks 4–5; `Boot.vapid_public_key`
- Produces: `mobileApi.getNotifications/markNotificationRead/markAllRead/registerPushSubscription/unregisterPushSubscription`; types `AppNotification`, `NotificationsResponse`; hooks `useNotifications`, `useMarkRead`, `useMarkAllRead`

- [ ] **Step 1: Add the API methods** — current end of the `mobileApi` object (api.ts:187-189):
  ```typescript
    listGiftRecipients: () =>
      api.get<{ users: import('./types').GiftUser[] }>(M + 'list_gift_recipients'),
  }
  ```
  After:
  ```typescript
    listGiftRecipients: () =>
      api.get<{ users: import('./types').GiftUser[] }>(M + 'list_gift_recipients'),
    getNotifications: (limit = 30) =>
      api.get<import('./types').NotificationsResponse>(M + 'get_notifications', { limit }),
    markNotificationRead: (name: string) =>
      api.post<{ ok: boolean }>(M + 'mark_notification_read', { name }),
    markAllRead: () => api.post<{ ok: boolean; marked: number }>(M + 'mark_all_read'),
    registerPushSubscription: (subscription: unknown) =>
      api.post<{ ok: boolean }>(M + 'register_push_subscription', {
        subscription: JSON.stringify(subscription),
      }),
    unregisterPushSubscription: (endpoint: string) =>
      api.post<{ ok: boolean }>(M + 'unregister_push_subscription', { endpoint }),
  }
  ```
- [ ] **Step 2: Extend `Boot` and add notification types in types.ts** — current `Boot` (types.ts:3-9):
  ```typescript
  export interface Boot {
    user: string
    full_name: string
    image: string | null
    roles: string[]
    is_leader: boolean
  }
  ```
  After (add `vapid_public_key`, then append the new types right below the interface):
  ```typescript
  export interface Boot {
    user: string
    full_name: string
    image: string | null
    roles: string[]
    is_leader: boolean
    vapid_public_key?: string | null
  }

  export type NotificationType =
    | 'Assignment'
    | 'Approval'
    | 'Comment'
    | 'Mention'
    | 'Points'
    | 'Redemption'

  export interface AppNotification {
    name: string
    type: NotificationType
    title: string
    body: string | null
    reference_doctype: string | null
    reference_name: string | null
    actor: string | null
    actor_name: string | null
    is_read: boolean
    at: string
    at_human: string | null
  }

  export interface NotificationsResponse {
    items: AppNotification[]
    unread: number
  }
  ```
- [ ] **Step 3: Add the query key + hooks in useData.ts** — current end of the `keys` object (useData.ts:60-61):
  ```typescript
    giftRecipients: ['gift-recipients'] as const,
  }
  ```
  After:
  ```typescript
    giftRecipients: ['gift-recipients'] as const,
    notifications: ['notifications'] as const,
  }
  ```
- [ ] **Step 4: Append the notification hooks** — add at the end of `useData.ts` (after the last export). They poll every 30s and the mutations invalidate the feed:
  ```typescript

  export function useNotifications() {
    return useQuery({
      queryKey: keys.notifications,
      queryFn: () => mobileApi.getNotifications(30),
      refetchInterval: 30_000,
      refetchIntervalInBackground: true,
    })
  }

  export function useMarkRead() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: (name: string) => mobileApi.markNotificationRead(name),
      onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
    })
  }

  export function useMarkAllRead() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: () => mobileApi.markAllRead(),
      onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
    })
  }
  ```
- [ ] **Step 5: Build the frontend** — from `/home/frappe/frappe-bench/apps/vernon_project/frontend`:
  ```bash
  cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
  ```
  The dist is served from `vernon_project/public/frontend/`.
- [ ] **Step 6: Verify it compiles + endpoint wired** — after build (Step 5 fails the task if TypeScript errors), open `https://project.vernon.id/m/` in DevTools and run `fetch('/api/method/vernon_project.api.mobile.get_notifications').then(r=>r.json()).then(console.log)`. Expect `{message:{items:[...],unread:N}}`.
- [ ] **Step 7: Commit** — `git add frontend/src/lib/api.ts frontend/src/lib/types.ts frontend/src/hooks/useData.ts vernon_project/public/frontend && git commit -m "feat(notifications): FE api + types + react-query hooks"`

---

### Task 11: Bell in tab header + NotificationSheet

**Files:**
- Create: `frontend/src/components/NotificationSheet.tsx`
- Create: `frontend/src/components/NotificationBell.tsx`
- Modify: `frontend/src/pages/Today.tsx`, `frontend/src/pages/Projects.tsx`, `frontend/src/pages/Review.tsx`, `frontend/src/pages/Reports.tsx` (pass `<NotificationBell />` as `TabScreen`'s `right` prop)

**Interfaces:**
- Consumes: `useNotifications`, `useMarkRead`, `useMarkAllRead`, `AppNotification` (Task 10); `TabScreen` `right` prop (Layout.tsx:8-18)
- Produces: `<NotificationBell />`

- [ ] **Step 1: Create `NotificationSheet.tsx`** — a bottom sheet mirroring the `RedeemSheet` container idiom (backdrop click closes, `stopPropagation` on panel, grab handle, `max-w-md`, safe-area bottom padding). Each item taps → mark read + navigate to its deep link. Write `frontend/src/components/NotificationSheet.tsx`:
  ```tsx
  import { useNavigate } from 'react-router-dom'
  import { Bell, CheckCheck } from 'lucide-react'
  import { Spinner } from '@/components/ui'
  import { useNotifications, useMarkRead, useMarkAllRead } from '@/hooks/useData'
  import type { AppNotification } from '@/lib/types'

  function deepLink(n: AppNotification): string {
    const d = n.reference_doctype || ''
    const name = n.reference_name || ''
    if (d === 'Project Todo' && name) return `/project-item/${encodeURIComponent(name)}`
    if (d === 'Project Detail' && name) return `/project-detail/${encodeURIComponent(name)}`
    if (d === 'Project' && name) return `/project/${encodeURIComponent(name)}`
    if (d === 'Wallet') return '/wallet'
    if (d === 'Reward Redemption') return '/marketplace'
    return '/'
  }

  export function NotificationSheet({ onClose }: { onClose: () => void }) {
    const navigate = useNavigate()
    const { data, isLoading } = useNotifications()
    const markRead = useMarkRead()
    const markAll = useMarkAllRead()
    const items = data?.items ?? []

    const open = (n: AppNotification) => {
      if (!n.is_read) markRead.mutate(n.name)
      onClose()
      navigate(deepLink(n))
    }

    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40" />
        <div
          className="relative mx-auto flex max-h-[80vh] w-full max-w-md flex-col rounded-t-3xl bg-white dark:bg-slate-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Notifications</h2>
            <button
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending || (data?.unread ?? 0) === 0}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-200 disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <div className="-mx-1 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Spinner className="h-6 w-6 text-slate-400" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-slate-400 dark:text-slate-500">
                <Bell className="h-8 w-8" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {items.map((n) => (
                  <li key={n.name}>
                    <button
                      onClick={() => open(n)}
                      className="flex w-full items-start gap-3 px-1 py-3 text-left active:bg-slate-50 dark:active:bg-slate-700/50"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          n.is_read ? 'bg-transparent' : 'bg-brand-500'
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block truncate text-sm text-slate-500 dark:text-slate-400">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">
                          {n.at_human}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    )
  }
  ```
- [ ] **Step 2: Create `NotificationBell.tsx`** — header button with unread badge, opens the sheet. Write `frontend/src/components/NotificationBell.tsx`:
  ```tsx
  import { useState } from 'react'
  import { Bell } from 'lucide-react'
  import { useNotifications } from '@/hooks/useData'
  import { NotificationSheet } from './NotificationSheet'

  export function NotificationBell() {
    const [open, setOpen] = useState(false)
    const { data } = useNotifications()
    const unread = data?.unread ?? 0
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          aria-label="Notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 transition active:scale-90 active:bg-slate-200/60 dark:active:bg-slate-700"
        >
          <Bell className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        {open && <NotificationSheet onClose={() => setOpen(false)} />}
      </>
    )
  }
  ```
- [ ] **Step 3: Mount the bell in each tab header** — `TabScreen` accepts a `right` ReactNode (Layout.tsx:16, rendered at Layout.tsx:27). In each of `Today.tsx`, `Projects.tsx`, `Review.tsx`, `Reports.tsx`, add the import `import { NotificationBell } from '@/components/NotificationBell'` and set the `right` prop on their `<TabScreen ...>`. Where a screen already passes a `right` element, wrap both in a flex row, e.g.:
  ```tsx
  <TabScreen title="Today" right={<NotificationBell />}>
  ```
  For a screen that already has a `right` (e.g. an existing action), use:
  ```tsx
  <TabScreen
    title="Projects"
    right={
      <div className="flex items-center gap-1">
        <NotificationBell />
        {/* existing right content here */}
      </div>
    }
  >
  ```
  (Inspect each file's current `<TabScreen>` opening tag and merge accordingly — `Today` and `Review` have no existing `right`; `Projects`/`Reports` may.)
- [ ] **Step 4: Build the frontend** — from `/home/frappe/frappe-bench/apps/vernon_project/frontend`:
  ```bash
  cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
  ```
  Dist served from `vernon_project/public/frontend/`.
- [ ] **Step 5: Verify on live PWA** — open `https://project.vernon.id/m/` (hard-refresh to drop the old SW). A bell appears top-right with an unread count. Have someone trigger a notification (or use the Task 3 console snippet against your user), wait ≤30s (or reopen the tab), and the badge increments. Tap the bell → sheet lists items; tap one → it marks read and navigates to the referenced screen; "Mark all read" zeroes the badge.
- [ ] **Step 6: Commit** — `git add frontend/src/components/NotificationBell.tsx frontend/src/components/NotificationSheet.tsx frontend/src/pages/Today.tsx frontend/src/pages/Projects.tsx frontend/src/pages/Review.tsx frontend/src/pages/Reports.tsx vernon_project/public/frontend && git commit -m "feat(notifications): header bell + notification sheet"`

---

### Task 12: Push permission soft-prompt + subscribe helper

**Files:**
- Create: `frontend/src/lib/push.ts`
- Modify: `frontend/src/App.tsx` (after boot, `App.tsx:55-57`)

**Interfaces:**
- Consumes: `Boot.vapid_public_key` (Task 10 types); `mobileApi.registerPushSubscription` (Task 10); `useConfirm` (Confirm.tsx:16)
- Produces: `urlBase64ToUint8Array`, `subscribeToPush(vapidPublicKey)`, `getPushSubscription()` in `lib/push.ts`

- [ ] **Step 1: Create the push helper module** — write `frontend/src/lib/push.ts`:
  ```ts
  import { mobileApi } from './api'

  // Convert a base64url VAPID public key into the Uint8Array the Push API wants.
  export function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = window.atob(base64)
    const out = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
    return out
  }

  export function pushSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  }

  export async function getPushSubscription(): Promise<PushSubscription | null> {
    if (!pushSupported()) return null
    const reg = await navigator.serviceWorker.ready
    return reg.pushManager.getSubscription()
  }

  // Request permission (if needed), subscribe, and register with the backend.
  // Returns true when a subscription is active afterwards.
  export async function subscribeToPush(vapidPublicKey: string): Promise<boolean> {
    if (!pushSupported() || !vapidPublicKey) return false
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return false
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
    }
    await mobileApi.registerPushSubscription(sub.toJSON())
    return true
  }

  export async function unsubscribeFromPush(): Promise<void> {
    const sub = await getPushSubscription()
    if (!sub) return
    const endpoint = sub.endpoint
    try {
      await sub.unsubscribe()
    } finally {
      await mobileApi.unregisterPushSubscription(endpoint)
    }
  }
  ```
- [ ] **Step 2: Add the soft-prompt in App.tsx after boot** — App.tsx already gates a one-time onboarding off `boot` (App.tsx:55-57). Add a sibling effect that, once per browser, offers push via `useConfirm`. Current imports/top of `App()` (App.tsx:1-6, 51-57):
  ```tsx
  import { useEffect, useState } from 'react'
  import { Navigate, Route, Routes, useParams } from 'react-router-dom'
  import { FolderKanban } from 'lucide-react'
  import { useBoot } from './hooks/useData'
  import { ApiError } from './lib/api'
  import { Spinner } from './components/ui'
  ```
  After (add the confirm + push imports):
  ```tsx
  import { useEffect, useState } from 'react'
  import { Navigate, Route, Routes, useParams } from 'react-router-dom'
  import { FolderKanban } from 'lucide-react'
  import { useBoot } from './hooks/useData'
  import { ApiError } from './lib/api'
  import { Spinner } from './components/ui'
  import { useConfirm } from './components/Confirm'
  import { pushSupported, subscribeToPush } from './lib/push'
  ```
  Then current effect (App.tsx:51-57):
  ```tsx
  export default function App() {
    const { data: boot, isLoading, error } = useBoot()
    const [showOnboarding, setShowOnboarding] = useState(false)

    useEffect(() => {
      if (boot && !localStorage.getItem(ONBOARDED_KEY)) setShowOnboarding(true)
    }, [boot])
  ```
  After (add the push soft-prompt effect; `PUSH_ASKED_KEY` guards against re-asking):
  ```tsx
  const PUSH_ASKED_KEY = 'vernon-push-asked-v1'

  export default function App() {
    const { data: boot, isLoading, error } = useBoot()
    const [showOnboarding, setShowOnboarding] = useState(false)
    const confirm = useConfirm()

    useEffect(() => {
      if (boot && !localStorage.getItem(ONBOARDED_KEY)) setShowOnboarding(true)
    }, [boot])

    useEffect(() => {
      if (!boot || !boot.vapid_public_key) return
      if (!pushSupported() || Notification.permission !== 'default') return
      if (localStorage.getItem(PUSH_ASKED_KEY)) return
      localStorage.setItem(PUSH_ASKED_KEY, '1')
      ;(async () => {
        const ok = await confirm({
          title: 'Enable notifications?',
          message:
            'Get notified about task assignments, approvals, comments, and points — even when the app is closed.',
          confirmLabel: 'Enable',
          cancelLabel: 'Not now',
        })
        if (ok) {
          try {
            await subscribeToPush(boot.vapid_public_key!)
          } catch {
            /* user can retry from Profile */
          }
        }
      })()
    }, [boot, confirm])
  ```
  (Move the `const PUSH_ASKED_KEY = ...` line to module scope alongside `ONBOARDED_KEY` at App.tsx:33 if preferred; shown inline here for locality.)
- [ ] **Step 3: Build the frontend** — from `/home/frappe/frappe-bench/apps/vernon_project/frontend`:
  ```bash
  cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
  ```
  Dist served from `vernon_project/public/frontend/`.
- [ ] **Step 4: Verify on live PWA** — in a browser that has never been asked (or after clearing `localStorage` key `vernon-push-asked-v1` and resetting site notification permission to "Ask"), open `https://project.vernon.id/m/`. A dialog "Enable notifications?" appears. Tap Enable → the browser permission prompt appears → grant it. Confirm a `Push Subscription` row was created:
  ```bash
  bench --site project.vernon.id console <<'PY'
  import frappe
  print(frappe.db.count("Push Subscription", {"user": "mo@intinusa.id"}))
  PY
  ```
  Expect `>= 1`. Then trigger any notification (e.g. grant points to yourself from another account) with the tab backgrounded → an OS notification appears and clicking it deep-links into `/m`.
- [ ] **Step 5: Commit** — `git add frontend/src/lib/push.ts frontend/src/App.tsx vernon_project/public/frontend && git commit -m "feat(notifications): push permission soft-prompt + subscribe helper"`

---

### Task 13: Profile push toggle

**Files:**
- Modify: `frontend/src/pages/Profile.tsx` (imports `Profile.tsx:1-11`; admin/nav rows `Profile.tsx:112-132`)

**Interfaces:**
- Consumes: `Boot.vapid_public_key`; `subscribeToPush`/`unsubscribeFromPush`/`getPushSubscription`/`pushSupported` (Task 12); `useToast` (Profile.tsx:8)
- Produces: none

- [ ] **Step 1: Add imports** — current (Profile.tsx:1-2):
  ```tsx
  import { useEffect, useState } from 'react'
  import { LogOut, Wifi, WifiOff, BookOpen, ShieldCheck, RefreshCw, ChevronRight, Trophy, Store, Users, KeyRound, Settings, Gift, Send } from 'lucide-react'
  ```
  After (add a `Bell`/`BellOff` icon import and the push helpers):
  ```tsx
  import { useEffect, useState } from 'react'
  import { LogOut, Wifi, WifiOff, BookOpen, ShieldCheck, RefreshCw, ChevronRight, Trophy, Store, Users, KeyRound, Settings, Gift, Send, Bell, BellOff } from 'lucide-react'
  ```
  And after the existing `import { type Theme, ... } from '@/lib/theme'` line (Profile.tsx:11), add:
  ```tsx
  import { pushSupported, subscribeToPush, unsubscribeFromPush, getPushSubscription } from '@/lib/push'
  ```
- [ ] **Step 2: Add push state + handlers in the component** — after `const [theme, setThemeState] = useState<Theme>(getStoredTheme)` (Profile.tsx:42), add:
  ```tsx
    const [pushOn, setPushOn] = useState(false)
    const [pushBusy, setPushBusy] = useState(false)

    useEffect(() => {
      getPushSubscription().then((s) => setPushOn(!!s))
    }, [])

    const togglePush = async () => {
      if (pushBusy) return
      setPushBusy(true)
      try {
        if (pushOn) {
          await unsubscribeFromPush()
          setPushOn(false)
          toast('success', 'Notifications disabled')
        } else {
          const key = boot?.vapid_public_key
          if (!key) {
            toast('error', 'Push not configured')
            return
          }
          const ok = await subscribeToPush(key)
          setPushOn(ok)
          toast(ok ? 'success' : 'error', ok ? 'Notifications enabled' : 'Permission denied')
        }
      } catch {
        toast('error', 'Could not change notifications')
      } finally {
        setPushBusy(false)
      }
    }
  ```
- [ ] **Step 3: Add the toggle row to the nav list** — current first rows of the nav card (Profile.tsx:112-114):
  ```tsx
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-card">
              <Row icon={KeyRound} label="Change password" onClick={() => setShowChangePw(true)} />
              <Row icon={Send} label="Gift Points" onClick={() => navigate('/gift-points')} />
  ```
  After (insert a push toggle row at the top of the card, only when push is supported):
  ```tsx
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-card">
              {pushSupported() && (
                <Row
                  icon={pushOn ? Bell : BellOff}
                  label={pushBusy ? 'Working…' : pushOn ? 'Notifications: On' : 'Enable notifications'}
                  onClick={togglePush}
                />
              )}
              <Row icon={KeyRound} label="Change password" onClick={() => setShowChangePw(true)} />
              <Row icon={Send} label="Gift Points" onClick={() => navigate('/gift-points')} />
  ```
- [ ] **Step 4: Build the frontend** — from `/home/frappe/frappe-bench/apps/vernon_project/frontend`:
  ```bash
  cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
  ```
  Dist served from `vernon_project/public/frontend/`.
- [ ] **Step 5: Verify on live PWA** — open `https://project.vernon.id/m/me`. A "Notifications: On / Enable notifications" row reflects current subscription state. Tap to disable → toast "Notifications disabled" and the `Push Subscription` row count for your user drops; tap to enable → permission prompt (if needed) then "Notifications enabled" and a row reappears. Confirm via:
  ```bash
  bench --site project.vernon.id console <<'PY'
  import frappe
  print(frappe.db.count("Push Subscription", {"user": "mo@intinusa.id"}))
  PY
  ```
- [ ] **Step 6: Commit** — `git add frontend/src/pages/Profile.tsx vernon_project/public/frontend && git commit -m "feat(notifications): Profile push enable/disable toggle"`

## Phase 6 — Comment image upload + @mention

### Task 1: Backend `upload_comment_image()` endpoint

**Files:**
- Modify: `vernon_project/api/mobile.py` (add after `upload_reward_image`, mobile.py:1801)

**Interfaces:**
- Consumes: module constants `ALLOWED_IMAGE_EXT`, `ALLOWED_IMAGE_MIME`, `MAX_IMAGE_BYTES` (mobile.py:1769-1771); `_assert_comment_visible(reference_doctype, reference_name)` (mobile.py:676).
- Produces: `upload_comment_image()` whitelisted endpoint returning `{"file_url": str}`.

- [ ] **Step 1: Add the endpoint after `upload_reward_image`.** The function `upload_reward_image` ends at mobile.py:1801 with `return {"file_url": saved.file_url}` followed by a blank line and the `# ---- Grant Points ----` comment block at mobile.py:1804. Insert the new function in that gap. Current code at mobile.py:1800-1804:

```python
	saved = save_file(f.filename, content, None, None, is_private=0)
	return {"file_url": saved.file_url}


# --------------------------------------------------------------------------------
# Grant Points — manual wallet credit by an authorized grantor.
```

After (insert a new function between the two):

```python
	saved = save_file(f.filename, content, None, None, is_private=0)
	return {"file_url": saved.file_url}


@frappe.whitelist()
def upload_comment_image(reference_doctype=None, reference_name=None):
	"""Save an uploaded comment image as a public File and return its URL. The
	caller (CommentThread) then inlines the URL as an <img src="/files/..."> in
	the comment HTML content.

	Access is gated by comment visibility on the target record. Only raster image
	types are accepted: the file is served public, so SVG/HTML (stored-XSS
	vectors) and other content are rejected by extension and MIME, mirroring
	upload_reward_image."""
	if reference_doctype and reference_name:
		_assert_comment_visible(reference_doctype, reference_name)
	import os
	from frappe.utils.file_manager import save_file

	f = frappe.request.files.get("file")
	if not f:
		frappe.throw("No file uploaded")

	ext = os.path.splitext(f.filename or "")[1].lower()
	if ext not in ALLOWED_IMAGE_EXT:
		frappe.throw("Unsupported image type. Use PNG, JPG, WEBP, or GIF.")
	mimetype = (getattr(f, "mimetype", "") or "").lower()
	if mimetype and mimetype not in ALLOWED_IMAGE_MIME:
		frappe.throw("Unsupported image type. Use PNG, JPG, WEBP, or GIF.")

	content = f.stream.read()
	if len(content) > MAX_IMAGE_BYTES:
		frappe.throw("Image too large (max 5 MB).")

	saved = save_file(f.filename, content, None, None, is_private=0)
	frappe.db.commit()
	return {"file_url": saved.file_url}


# --------------------------------------------------------------------------------
# Grant Points — manual wallet credit by an authorized grantor.
```

- [ ] **Step 2: Restart Python.** `bench --site project.vernon.id restart` (or `bench restart` from the bench dir).
- [ ] **Step 3: Verify endpoint responds.** From the server shell:
  `curl -s -X POST "https://project.vernon.id/api/method/vernon_project.api.mobile.upload_comment_image" -b "<session-cookie>" | head` — expect a JSON error `{"exception": ... "No file uploaded"}` (proves the whitelisted method is reachable and not a 404). Full image verification happens in Task 11.
- [ ] **Step 4: Commit.** `git add vernon_project/api/mobile.py && git commit -m "feat(comments): upload_comment_image endpoint (public File, raster whitelist, 5MB)"`

---

### Task 2: Frontend `uploadCommentImage(file)` multipart helper

**Files:**
- Modify: `frontend/src/lib/api.ts` (add after `uploadRewardImage`, api.ts:214)

**Interfaces:**
- Consumes: `upload_comment_image` endpoint (Task 1); `METHOD`, `csrf`, `ApiError` (api.ts:4,14,6).
- Produces: `uploadCommentImage(file, refDoctype?, refName?) => Promise<string>`.

- [ ] **Step 1: Add the helper after `uploadRewardImage`.** Current code at api.ts:212-216:

```typescript
  const out = data?.message ?? data
  return out.file_url as string
}

export const renameDoc = (doctype: string, oldName: string, newName: string, merge: boolean) =>
```

After:

```typescript
  const out = data?.message ?? data
  return out.file_url as string
}

// Multipart upload of a comment image to a whitelisted method. Access is gated
// server-side by comment visibility on the referenced record. Returns the saved
// public file URL (served from /files/...).
export async function uploadCommentImage(
  file: File,
  refDoctype?: string,
  refName?: string,
): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  if (refDoctype) fd.append('reference_doctype', refDoctype)
  if (refName) fd.append('reference_name', refName)
  const res = await fetch(METHOD + 'vernon_project.api.mobile.upload_comment_image', {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Frappe-CSRF-Token': csrf() },
    body: fd,
    credentials: 'same-origin',
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg =
      (data && (data._server_messages || data.exception || data.message)) || `Upload failed (${res.status})`
    throw new ApiError(typeof msg === 'string' ? msg : 'Upload failed', res.status)
  }
  const out = data?.message ?? data
  return out.file_url as string
}

export const renameDoc = (doctype: string, oldName: string, newName: string, merge: boolean) =>
```

- [ ] **Step 2: Commit.** (Build is deferred to Task 7 which lands the consumer.) `git add frontend/src/lib/api.ts && git commit -m "feat(comments): uploadCommentImage multipart api helper"`

---

### Task 3: Backend `get_mentionable_users(reference_doctype, reference_name)` endpoint

**Files:**
- Modify: `vernon_project/api/mobile.py` (add after `add_comment`, mobile.py:737, before `get_project_detail` at mobile.py:739)

**Interfaces:**
- Consumes: `_comment_project` (mobile.py:664); `_assert_comment_visible` (mobile.py:676); `_user_name_map` (mobile.py:110). `Project` fields `project_owner`/`project_leader`/`project_admin`; `Project Team` child (`parent`,`user`); `Project Todo` field `assigned_to` (project link `project`).
- Produces: `get_mentionable_users(reference_doctype, reference_name)` returning `list[{user, full_name, image}]`.

- [ ] **Step 1: Add the endpoint between `add_comment` and `get_project_detail`.** Current code at mobile.py:736-741:

```python
		name_map,
	)


@frappe.whitelist()
def get_project_detail(project_detail, include_cancelled=0):
```

After:

```python
		name_map,
	)


@frappe.whitelist()
def get_mentionable_users(reference_doctype, reference_name):
	"""Project participants who can be @mentioned in a comment on this record:
	the project's owner, leader, admin, team members, and the assignees of the
	project's todos. Returns [{user, full_name, image}], de-duplicated, sorted by
	full name. Access is gated by comment visibility on the target."""
	_assert_comment_visible(reference_doctype, reference_name)
	project = _comment_project(reference_doctype, reference_name)
	if not project:
		return []

	owner, leader, admin = frappe.get_value(
		"Project", project, ["project_owner", "project_leader", "project_admin"]
	)
	emails = {e for e in (owner, leader, admin) if e}
	emails |= set(
		frappe.get_all(
			"Project Team",
			filters={"parent": project},
			pluck="user",
			limit_page_length=0,
		)
	)
	emails |= set(
		frappe.get_all(
			"Project Todo",
			filters={"project": project, "assigned_to": ["is", "set"]},
			pluck="assigned_to",
			limit_page_length=0,
		)
	)
	emails = {e for e in emails if e}
	name_map = _user_name_map(emails)
	out = [
		{
			"user": e,
			"full_name": (name_map.get(e) or {}).get("full_name") or e,
			"image": (name_map.get(e) or {}).get("user_image"),
		}
		for e in emails
	]
	out.sort(key=lambda r: (r["full_name"] or "").lower())
	return out


@frappe.whitelist()
def get_project_detail(project_detail, include_cancelled=0):
```

- [ ] **Step 2: Restart Python.** `bench restart`.
- [ ] **Step 3: Verify on live PWA.** Open `https://project.vernon.id/api/method/vernon_project.api.mobile.get_mentionable_users?reference_doctype=Project&reference_name=<a-project-you-can-see>` while logged into the PWA in the same browser. Expect a JSON `message` array of `{user, full_name, image}` including the project owner/leader and any assignees. With a project you cannot see, expect a 403/PermissionError.
- [ ] **Step 4: Commit.** `git add vernon_project/api/mobile.py && git commit -m "feat(comments): get_mentionable_users endpoint (project participants + assignees)"`

---

### Task 4: Frontend `getMentionableUsers` api helper + `MentionUser` type

**Files:**
- Modify: `frontend/src/lib/types.ts` (after `Comment`, types.ts:260)
- Modify: `frontend/src/lib/api.ts` (inside `mobileApi`, after `addComment`, api.ts:163)

**Interfaces:**
- Consumes: `get_mentionable_users` (Task 3).
- Produces: type `MentionUser`; `mobileApi.getMentionableUsers(refDoctype, refName)`.

- [ ] **Step 1: Add the `MentionUser` type after `Comment`.** Current code at types.ts:252-261:

```typescript
export interface Comment {
  name: string
  content: string
  by: string
  by_name: string
  by_image: string | null
  at: string
  at_human: string
}
```

After:

```typescript
export interface Comment {
  name: string
  content: string
  by: string
  by_name: string
  by_image: string | null
  at: string
  at_human: string
}

export interface MentionUser {
  user: string
  full_name: string
  image: string | null
}
```

- [ ] **Step 2: Add the api helper after `addComment` in `mobileApi`.** Current code at api.ts:158-164:

```typescript
  addComment: (refDoctype: string, refName: string, content: string) =>
    api.post(M + 'add_comment', {
      reference_doctype: refDoctype,
      reference_name: refName,
      content,
    }),
  runReport: (report: string, filters: Record<string, unknown>) =>
```

After:

```typescript
  addComment: (refDoctype: string, refName: string, content: string) =>
    api.post(M + 'add_comment', {
      reference_doctype: refDoctype,
      reference_name: refName,
      content,
    }),
  getMentionableUsers: (refDoctype: string, refName: string) =>
    api.get<import('./types').MentionUser[]>(M + 'get_mentionable_users', {
      reference_doctype: refDoctype,
      reference_name: refName,
    }),
  runReport: (report: string, filters: Record<string, unknown>) =>
```

- [ ] **Step 3: Commit.** (Build deferred to Task 7.) `git add frontend/src/lib/types.ts frontend/src/lib/api.ts && git commit -m "feat(comments): MentionUser type + getMentionableUsers api helper"`

---

### Task 5: Sanitizer — allow inline `<img src="/files/…">` and `<span data-mention>`

**Files:**
- Modify: `frontend/src/lib/format.ts` (`sanitizeHtml`, format.ts:88-108)

**Interfaces:**
- Consumes: none.
- Produces: updated `sanitizeHtml` that keeps `<img>` only for `/files/`-or-same-origin sources and `<span data-mention="…">`; strips everything else as before.

- [ ] **Step 1: Replace the `sanitizeHtml` body to whitelist images and mention spans.** Current code at format.ts:88-108:

```typescript
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  const root = document.createElement('div')
  root.innerHTML = html
  root.querySelectorAll('script,style,iframe,object,embed,form,link,meta,base').forEach((n) => n.remove())
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) el.removeAttribute(attr.name)
      else if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
    // Strip any author-supplied target so links don't force a new tab/window.
    if (el.tagName === 'A') {
      el.removeAttribute('target')
      if (el.getAttribute('href')) el.setAttribute('rel', 'noopener noreferrer')
    }
  })
  return root.innerHTML
}
```

After:

```typescript
// True when an <img src> is a safe inline comment image: an app-served file
// (/files/...) or any same-origin URL. Cross-origin/remote and data: URLs are
// dropped to avoid tracking pixels and external content in user HTML.
function isAllowedImgSrc(src: string): boolean {
  const s = (src || '').trim()
  if (s.startsWith('/files/')) return true
  try {
    const u = new URL(s, window.location.origin)
    return u.origin === window.location.origin && u.pathname.startsWith('/files/')
  } catch {
    return false
  }
}

export function sanitizeHtml(html: string): string {
  if (!html) return ''
  const root = document.createElement('div')
  root.innerHTML = html
  root.querySelectorAll('script,style,iframe,object,embed,form,link,meta,base').forEach((n) => n.remove())
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) el.removeAttribute(attr.name)
      else if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
    // Inline comment images: keep only safe /files/ (or same-origin) sources;
    // unwrap any other <img> entirely so remote/data: pixels never render.
    if (el.tagName === 'IMG') {
      if (!isAllowedImgSrc(el.getAttribute('src') || '')) {
        el.remove()
        return
      }
    }
    // Mention chips: keep <span data-mention="email"> but strip every other
    // attribute so only the marker + text survive.
    if (el.tagName === 'SPAN' && el.hasAttribute('data-mention')) {
      const mention = el.getAttribute('data-mention') || ''
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.toLowerCase() !== 'data-mention') el.removeAttribute(attr.name)
      }
      el.setAttribute('data-mention', mention)
    }
    // Strip any author-supplied target so links don't force a new tab/window.
    if (el.tagName === 'A') {
      el.removeAttribute('target')
      if (el.getAttribute('href')) el.setAttribute('rel', 'noopener noreferrer')
    }
  })
  return root.innerHTML
}
```

- [ ] **Step 2: Commit.** (Build deferred to Task 7.) `git add frontend/src/lib/format.ts && git commit -m "feat(comments): sanitizeHtml allows inline /files/ images + data-mention spans"`

---

### Task 6: Backend `add_comment` — notify participants + parse mentions

**Files:**
- Modify: `vernon_project/api/mobile.py` (`add_comment`, mobile.py:717-736)

**Interfaces:**
- Consumes: `_notify(recipient, type, title, body, reference_doctype=None, reference_name=None, actor=None)` from Phase 5 (mobile.py); `_comment_project` (mobile.py:664); `_user_name_map` (mobile.py:110); `Project Todo.assigned_to`.
- Produces: `add_comment` now fires `Comment` notifications to participants and `Mention` notifications to mentioned users. Return shape unchanged.

- [ ] **Step 1: Add a helper to extract `data-mention` emails just before `add_comment`.** Current code at mobile.py:715-718:

```python
	)


@frappe.whitelist()
def add_comment(reference_doctype, reference_name, content):
```

After:

```python
	)


import re

_MENTION_RE = re.compile(r'data-mention\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)


def _parse_mentions(content):
	"""Extract the set of user emails marked up as
	<span data-mention="user@email">@Name</span> in comment HTML."""
	if not content:
		return set()
	return {m.strip() for m in _MENTION_RE.findall(content) if m.strip()}


def _comment_participants(reference_doctype, reference_name):
	"""Users to notify of a new comment on this record: project owner/leader/admin
	and (for a Project Todo target) the todo's assignee."""
	project = _comment_project(reference_doctype, reference_name)
	people = set()
	if project:
		owner, leader, admin = frappe.get_value(
			"Project", project, ["project_owner", "project_leader", "project_admin"]
		)
		people |= {e for e in (owner, leader, admin) if e}
	if reference_doctype == "Project Todo":
		assignee = frappe.get_value("Project Todo", reference_name, "assigned_to")
		if assignee:
			people.add(assignee)
	return {p for p in people if p}


@frappe.whitelist()
def add_comment(reference_doctype, reference_name, content):
```

- [ ] **Step 2: Append the notify logic to the end of `add_comment` before its `return`.** Current code at mobile.py:724-736 (the body after the empty-content check):

```python
	doc = frappe.get_doc(reference_doctype, reference_name)
	c = doc.add_comment("Comment", content)
	name_map = _user_name_map({c.comment_email, c.comment_by})
	return _shape_comment(
		{
			"name": c.name,
			"content": c.content,
			"comment_email": c.comment_email,
			"comment_by": c.comment_by,
			"creation": c.creation,
		},
		name_map,
	)
```

After:

```python
	doc = frappe.get_doc(reference_doctype, reference_name)
	c = doc.add_comment("Comment", content)
	frappe.db.commit()

	actor = frappe.session.user
	actor_name = (_user_name_map({actor}).get(actor) or {}).get("full_name") or actor
	mentioned = _parse_mentions(content)
	# Mention notifications take precedence over the generic comment ping for the
	# same person (don't double-notify a mentioned participant).
	for u in mentioned:
		_notify(
			recipient=u,
			type="Mention",
			title=f"{actor_name} mentioned you",
			body=f"{actor_name} mentioned you in a comment.",
			reference_doctype=reference_doctype,
			reference_name=reference_name,
			actor=actor,
		)
	for u in _comment_participants(reference_doctype, reference_name) - mentioned:
		_notify(
			recipient=u,
			type="Comment",
			title=f"New comment from {actor_name}",
			body=f"{actor_name} commented on an item you follow.",
			reference_doctype=reference_doctype,
			reference_name=reference_name,
			actor=actor,
		)

	name_map = _user_name_map({c.comment_email, c.comment_by})
	return _shape_comment(
		{
			"name": c.name,
			"content": c.content,
			"comment_email": c.comment_email,
			"comment_by": c.comment_by,
			"creation": c.creation,
		},
		name_map,
	)
```

Note: `_notify` already skips self-notification (`recipient == actor`) per Phase 5, so the actor commenting on their own item won't notify themselves.

- [ ] **Step 3: Restart Python.** `bench restart`.
- [ ] **Step 4: Verify on live PWA.** Open an item you share with a teammate at `https://project.vernon.id/m/...`, post a plain comment, then (logged in as that teammate in another browser) open the bell/notification feed — expect a `Comment` notification. Mention verification is exercised end-to-end in Task 11.
- [ ] **Step 5: Commit.** `git add vernon_project/api/mobile.py && git commit -m "feat(comments): add_comment notifies participants + parses @mentions"`

---

### Task 7: CommentThread — image picker, @mention autocomplete, rich composer

**Files:**
- Modify: `frontend/src/components/CommentThread.tsx` (whole file)

**Interfaces:**
- Consumes: `uploadCommentImage` (Task 2); `mobileApi.getMentionableUsers` (Task 4); `MentionUser` (Task 4); `sanitizeHtml` (Task 5); `useAddComment` (useData.ts:394); `useToast`.
- Produces: composer now sends HTML `content` containing inline `<img src="/files/…">` and `<span data-mention="email">@Name</span>`.

- [ ] **Step 1: Replace the whole component.** It currently uses a plain `<textarea>` (CommentThread.tsx:49-55) and submits `text.trim()` (CommentThread.tsx:18-22). Replace the entire file `frontend/src/components/CommentThread.tsx` with the contentEditable composer below. It keeps the existing render loop (CommentThread.tsx:30-47) and `dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.content) }}` (CommentThread.tsx:39), adds an image button and an `@`-autocomplete, and highlights mention spans via the `.comment-mention` class:

```tsx
import { useRef, useState } from 'react'
import { Send, ImagePlus } from 'lucide-react'
import { useComments, useAddComment } from '../hooks/useData'
import { Spinner } from './ui'
import { sanitizeHtml } from '../lib/format'
import { uploadCommentImage, mobileApi } from '../lib/api'
import type { MentionUser } from '../lib/types'
import { useToast } from './Toast'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"')

export default function CommentThread({
  referenceDoctype,
  referenceName,
}: {
  referenceDoctype: string
  referenceName: string
}) {
  const { data: comments, isLoading } = useComments(referenceDoctype, referenceName)
  const addComment = useAddComment(referenceDoctype, referenceName)
  const toast = useToast()
  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [people, setPeople] = useState<MentionUser[]>([])
  const [pending, setPending] = useState(false)

  // Insert an HTML fragment at the current caret inside the editor.
  const insertHtml = (html: string) => {
    const ed = editorRef.current
    if (!ed) return
    ed.focus()
    const sel = window.getSelection()
    const frag = document.createRange().createContextualFragment(html)
    if (sel && sel.rangeCount && ed.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(frag)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      ed.appendChild(frag)
    }
  }

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image too large (max 5 MB).')
      return
    }
    setUploading(true)
    try {
      const url = await uploadCommentImage(file, referenceDoctype, referenceName)
      insertHtml(
        `<img src="${escapeHtml(url)}" alt="" style="max-width:100%;border-radius:0.5rem;" />`,
      )
    } catch (err) {
      toast.error((err as Error).message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // Detect a trailing "@token" right before the caret to drive autocomplete.
  const onInput = async () => {
    const sel = window.getSelection()
    const node = sel?.anchorNode
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      setMentionOpen(false)
      return
    }
    const before = (node.textContent || '').slice(0, sel!.anchorOffset)
    const m = before.match(/@([\w.\-]*)$/)
    if (!m) {
      setMentionOpen(false)
      return
    }
    setMentionQuery(m[1].toLowerCase())
    setMentionOpen(true)
    if (!people.length) {
      try {
        const list = await mobileApi.getMentionableUsers(referenceDoctype, referenceName)
        setPeople(list)
      } catch {
        /* leave empty; autocomplete simply shows nothing */
      }
    }
  }

  // Replace the trailing "@query" text with a mention span for the chosen user.
  const pickMention = (u: MentionUser) => {
    const sel = window.getSelection()
    const node = sel?.anchorNode
    if (sel && node && node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      const upto = text.slice(0, sel.anchorOffset)
      const at = upto.lastIndexOf('@')
      if (at >= 0) {
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, sel.anchorOffset)
        range.deleteContents()
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
    insertHtml(
      `<span data-mention="${escapeHtml(u.user)}">@${escapeHtml(u.full_name)}</span> `,
    )
    setMentionOpen(false)
    setMentionQuery('')
  }

  const filtered = people.filter(
    (p) =>
      p.full_name.toLowerCase().includes(mentionQuery) ||
      p.user.toLowerCase().includes(mentionQuery),
  )

  const submit = () => {
    const ed = editorRef.current
    if (!ed) return
    const html = sanitizeHtml(ed.innerHTML).trim()
    // Reject empty (no text, no image, no mention).
    const hasContent = (ed.textContent || '').trim() || ed.querySelector('img,span[data-mention]')
    if (!hasContent) return
    setPending(true)
    addComment.mutate(html, {
      onSuccess: () => {
        ed.innerHTML = ''
        setMentionOpen(false)
      },
      onError: (err) => toast.error((err as Error).message || 'Failed to add comment'),
      onSettled: () => setPending(false),
    })
  }

  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Comments</h3>
      {isLoading ? (
        <Spinner className="h-5 w-5 text-gray-400" />
      ) : (
        <ul className="space-y-3">
          {(comments ?? []).map((c) => (
            <li key={c.name} className="rounded-xl bg-gray-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">{c.by_name}</span>
                <span className="text-xs text-gray-400">{c.at_human}</span>
              </div>
              <div
                className="comment-body mt-1 text-sm text-gray-700 [&_a]:break-words [&_a]:text-brand-600 [&_a]:underline [&_p]:my-0 [&_img]:my-1 [&_img]:max-w-full [&_img]:rounded-lg [&_[data-mention]]:rounded [&_[data-mention]]:bg-brand-50 [&_[data-mention]]:px-1 [&_[data-mention]]:font-medium [&_[data-mention]]:text-brand-700"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.content) }}
              />
            </li>
          ))}
          {comments && comments.length === 0 && (
            <li className="text-sm text-gray-400">No comments yet.</li>
          )}
        </ul>
      )}
      <div className="relative mt-3 flex items-end gap-2">
        <div className="flex-1">
          <div
            ref={editorRef}
            contentEditable
            role="textbox"
            aria-label="Add a comment"
            data-placeholder="Add a comment…"
            onInput={onInput}
            className="comment-editor max-h-40 min-h-[3rem] overflow-y-auto rounded-xl border border-gray-200 p-2 text-sm focus:border-brand-500 focus:outline-none empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)] [&_[data-mention]]:rounded [&_[data-mention]]:bg-brand-50 [&_[data-mention]]:px-1 [&_[data-mention]]:font-medium [&_[data-mention]]:text-brand-700 [&_img]:my-1 [&_img]:max-w-full [&_img]:rounded-lg"
          />
          {mentionOpen && filtered.length > 0 && (
            <ul className="absolute bottom-12 left-0 z-10 max-h-48 w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
              {filtered.slice(0, 8).map((u) => (
                <li key={u.user}>
                  <button
                    type="button"
                    onClick={() => pickMention(u)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span className="font-medium text-gray-800">{u.full_name}</span>
                    <span className="truncate text-xs text-gray-400">{u.user}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onPickImage}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 disabled:opacity-40"
          aria-label="Attach image"
        >
          {uploading ? <Spinner className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
        </button>
        <button
          onClick={submit}
          disabled={pending}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40"
          aria-label="Send comment"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Confirm `useToast` import path.** The component imports `{ useToast } from './Toast'`. Verify the named export exists: run `grep -n "export.*useToast" frontend/src/components/Toast.tsx`. If the hook lives elsewhere or is a default export, adjust the import line accordingly before building (do not change Toast.tsx).
- [ ] **Step 3: Build frontend.** `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build`. The dist is emitted to and served from `vernon_project/public/frontend/`.
- [ ] **Step 4: Verify on live PWA.** Open an item with comments at `https://project.vernon.id/m/...`. In the composer: (a) tap the image button, pick a JPG/PNG under 5 MB — it inserts inline and, after Send, the comment renders the image; (b) type `@` then a teammate's name — the autocomplete list appears; pick one — a highlighted `@Name` chip appears; Send — the comment shows the highlighted mention.
- [ ] **Step 5: Commit.** `git add frontend/src/components/CommentThread.tsx vernon_project/public/frontend && git commit -m "feat(comments): CommentThread image upload + @mention autocomplete composer"`

---

### Task 8: End-to-end mention notification verification

**Files:**
- Reference: `vernon_project/api/mobile.py` (`add_comment`, `_parse_mentions`, `_notify`); `frontend/src/components/CommentThread.tsx`.

**Interfaces:**
- Consumes: all of Phase 6 plus Phase 1/5 notification feed (bell + `get_notifications`).
- Produces: none.

- [ ] **Step 1: Post a mention as user A.** Logged in as user A on `https://project.vernon.id/m/...`, open a Project Todo (or Project/Project Detail) that user B participates in. Type a comment, `@`-mention user B (pick from autocomplete), optionally attach an image, and Send.
- [ ] **Step 2: Verify the rendered comment.** Confirm the new comment appears with the mention chip highlighted (brand-colored) and the image inline.
- [ ] **Step 3: Verify the notification as user B.** In a separate browser logged in as user B, open the notification bell/feed. Expect a `Mention` notification titled "<A's name> mentioned you" deep-linking to that item. Tapping it navigates to the commented item.
- [ ] **Step 4: Verify no self-notification.** As user A, confirm A did not receive a Comment/Mention notification for A's own comment (Phase 5 `_notify` skips `recipient == actor`).
- [ ] **Step 5 (no code change → no commit).** If any step fails, the fix lands in the relevant earlier task (Task 6 for backend mention parsing/notify; Task 7 for the span markup) and is recommitted there.

---

Notes for the reviewer / implementer:
- Backend file: `/home/frappe/frappe-bench/apps/vernon_project/vernon_project/api/mobile.py`
- Frontend files: `/home/frappe/frappe-bench/apps/vernon_project/frontend/src/components/CommentThread.tsx`, `.../frontend/src/lib/api.ts`, `.../frontend/src/lib/format.ts`, `.../frontend/src/lib/types.ts`
- `_notify(...)` is owned by Phase 5; Phase 6 only calls it. The `import re` and `_MENTION_RE` are added at module scope in Task 6 Step 1 (placed just above `add_comment`); if a later/earlier phase also adds `import re`, dedupe to a single top-of-file import.
- The composer stores HTML (`content`) instead of plain text; the backend `add_comment` already accepts arbitrary `content` and the render path sanitizes via `sanitizeHtml` (Task 5), so no `get_comments` change is required.

---

## Phase 7 — Deferred automated tests + full deploy verification

> Per the live-site / no-test-DB constraint, automated tests were deferred to here. This phase is run once after Phases 1–6 are merged.

### Task 1: End-to-end deploy + smoke verification on the live PWA

**Files:**
- Reference: all changed files across Phases 1–6.

**Interfaces:**
- Consumes: every feature shipped in Phases 1–6.
- Produces: none.

- [ ] **Step 1: Full deploy** — apply all schema, Python, and frontend changes together:
  ```bash
  cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate && bench --site project.vernon.id restart
  cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
  ```
- [ ] **Step 2: Smoke-test each feature on `https://project.vernon.id/m`** — comments newest-first; reward detail drawer → redeem; Review `[All | I own | I led]` toggle; badge chip on Profile/leaderboard/comment; bell unread feed + (push enabled) OS notification across all four event types; comment image upload renders inline + @mention fires a Mention notification.
- [ ] **Step 3: Regression check** — confirm existing flows unbroken: redeem still deducts balance; status workflow still advances; leaderboard ranks unchanged by grants/gifts.

### Task 2: Author backend pytest + frontend smoke tests (now safe to add)

**Files:**
- Create: `vernon_project/tests/test_features_2026_06.py`

**Interfaces:**
- Consumes: the endpoints added in Phases 1–6.
- Produces: a regression suite.

- [ ] **Step 1: Write Frappe unit tests** for the pure/logic pieces that need no live DB writes against prod — `_user_badge` tier selection, `_notify` self-skip + dead-subscription pruning, mention parsing in `add_comment`, comment `order_by` direction. Use a dedicated throwaway test site (`bench new-site test_vernon.localhost`) so prod data is never touched.
- [ ] **Step 2: Run** `bench --site test_vernon.localhost run-tests --app vernon_project` and confirm green.
- [ ] **Step 3: Commit** `git add vernon_project/tests && git commit -m "test: regression suite for 2026-06 feature batch"`
