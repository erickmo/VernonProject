# Vernon Project — Performance & Security Audit (jll4vd36n6)

## NOT YET COMPLETE — read this before trusting any "done" claim elsewhere

The two confirmed stored-XSS findings are fixed, tested and deployed (below).
**Everything else the todo's Definition of Done requires is still open**,
most importantly: **the 13 `allow_guest=True` endpoints have not been
reviewed one by one yet** (the DoD explicitly requires this), and the
performance items (indexes, `get_project_item`'s sibling dump) are only
triaged, not built. See "Remaining work" at the end for the full list. This
file is updated in place as that work lands rather than rewritten from
scratch — if you're reading this after the fact, check the "Remaining work"
section is empty before assuming the audit is complete.

## Fixed — Critical

### F1. Stored XSS — Papan Iklan ad description (both frontends)
- **Where**: `frontend/src/pages/PapanIklanDetailScreen.tsx:97` (/m),
  `frontend-web/src/pages/PapanIklanDetail.tsx:123` (/w)
- **Proof**: both rendered `ad.description` via `dangerouslySetInnerHTML` with
  no `sanitizeHtml()` wrap, unlike every sibling screen (`CommentThread.tsx`,
  `CourseScreen.tsx`, `EventDetailScreen.tsx`, `DetailMeta.tsx`), which all
  call it first.
- **Impact**: an ad description containing `<img src=x onerror=...>` (or any
  script-bearing markup) would fire for every viewer of that ad's detail page,
  on both /m and /w.
- **Fix**: wrapped both call sites in `sanitizeHtml(ad.description)`.
  Commit `64be0e4`.
- **Test**: no frontend test runner exists in this repo (see "Accepted risk /
  gap" below) — verified by reading the diff against the already-correct
  sibling pattern; not independently unit-tested.

### F2. Stored XSS — avatar `backgroundColor` (custom 'doodle' style)
- **Where (sink)**: `frontend/src/avatar/doodle.ts:47-48` — `renderDoodle`
  interpolated `options.backgroundColor` raw into SVG markup
  (`` `<rect ... fill='#${bgv}'/>` ``), unlike the `top`/`hair`/`face` slots,
  which only ever index into a fixed art array via `idx()`'s
  `/^v(\d+)$/` check.
- **Where (source)**: `vernon_project/api/mobile.py`'s `save_my_avatar`
  (~line 6094) explicitly skipped validating color slots: `if slot not in
  AVATAR_FREE.get(style, {}): continue  # color/probability/unmapped slots
  are always free`. **The reasoning error**: "free" (no payment/ownership
  check needed) was conflated with "safe" (no validation needed) — the same
  mistake could recreate this bug on any future free-and-unvalidated slot.
- **Impact**: an authenticated user could call `save_my_avatar` directly
  (bypassing the picker UI, which only ever sends palette hex values) with
  `{"style":"doodle","options":{"backgroundColor":["x' onload='alert(1)"]}}`
  and have it stored verbatim, then rendered via
  `DiceBearAvatar.tsx:16`'s `dangerouslySetInnerHTML` on **every surface an
  avatar appears** — task cards, team walls, member sheets, recognition
  gates, the superpower wall. Wider blast radius than F1.
- **Production scan (before fixing)**: 75 `User Avatar` rows, **0** containing
  `<`, `onload`, `onerror`, `script`, or `javascript:`; every stored
  `backgroundColor` was a bare 6-hex-digit color or `"transparent"`. **Not
  exploited — but a close call, not a non-issue**: nothing but a missing
  payload stood between this and a live incident.
- **Fix, both ends**:
  - Sink: `renderDoodle` now validates `bgv` against `/^[0-9a-fA-F]{3,8}$/`
    before interpolating; anything else is dropped (renders no background,
    same as the old `'transparent'` special-case).
  - Source: `save_my_avatar` now rejects a non-hex, non-`"transparent"`
    `skinColor`/`hairColor`/`backgroundColor` with `frappe.ValidationError`
    instead of silently storing it. This is the fix that matters longer-term
    — it keeps the database from ever holding the payload, independent of
    which renderer reads it later.
  - Commit `64be0e4`.
- **Test**: `test_user_avatar.py` — 3 new cases (`test_save_rejects_non_hex_
  background_color`, `test_save_rejects_non_hex_skin_and_hair_color`,
  `test_save_allows_hex_and_transparent_background_color`). Verified RED
  first (temporarily reverted the validation block, confirmed both rejection
  cases failed with "ValidationError not raised" — the right reason), then
  GREEN after restoring. Full `test_user_avatar.py`: 12/12 green. Full
  `vernon_project` suite re-run after the fix: 616 tests, green (1 unrelated
  skip).

### Already checked, not a bug
The real DiceBear-library styles (`lorelei`, `notionists`, `notionistsNeutral`,
`croodles`, `croodlesNeutral`, `bigEars`, `openPeeps`) go through
`@dicebear/core`'s `createAvatar()` — a schema-validated, widely-used library
that does not do raw string interpolation of option values into markup. Only
the custom, non-library `'doodle'` style's `backgroundColor` path was
vulnerable.

## Deploy
- Both bundles rebuilt and committed (`039f02b` for /m, `302ec95` for /w — /m
  bundled together with an unrelated same-day /m-only fix, 8707036).
- Service worker `ASSET_CACHE` bumped v41 → v42 so clients holding the old
  cache refetch `vernon_sw.js` and pick up the fixed bundle.
- Verified live: `sanitizeHtml`'s implementation string and the avatar
  hex-validation regex are both present in the bundles served from
  `project.vernon.id` for both `/m` and `/w` (grepped literal strings, not
  identifier names — minification renames those).
- **CDN edge purge is still pending owner access** — no Cloudflare token/zone
  ID/purge script available on this box. The `ASSET_CACHE` bump forces
  clients past their own cache once they refetch the service worker, so this
  does not block the fix reaching users, but an edge cache in front of the
  origin may still serve a stale response until purged or it naturally
  expires. Escalated to the owner separately.

## Accepted risk / gap — recorded, not fixed
- **No frontend test runner in this repo.** No Vitest, no Playwright config
  anywhere under `frontend/` or `frontend-web/`. The audit's own enumerated
  frontend test cases (XSS via Playwright, Lighthouse, npm audit, request
  budgets) could not be run because the harness doesn't exist. Recommend as
  its own follow-up — building a whole test framework from scratch was out of
  proportion to ship alongside a live security hotfix. The backend test at
  the `save_my_avatar` boundary is the authoritative regression guard for F2
  regardless (it's what prevents the payload from ever being stored).
- **File upload has no type allow-list** (`vernon_project/api/project_todo.py`
  attach endpoint) — size-capped (25MB) and private, and downloads force
  `response.type = "download"` (no inline render), which mitigates
  stored-XSS-via-upload even without a type check. Low severity, accepted.
- **MCP connector — no rate limiting on failed token auth.** Token compare is
  already `hmac.compare_digest` (constant-time, correct) and never logged.
  Missing backoff/lockout on repeated bad tokens is real, cheap
  defense-in-depth that should exist — held, not fixed, because the owner is
  live in `mcp_server/server.py` on unrelated work; recommended as its own
  follow-up rather than risk a collision.
- **MCP connector — single shared identity, by design.** `call_api_method`
  runs as whichever user the configured API key belongs to for every call —
  one token, one identity, documented in the code as "a single-user personal
  server, not a multi-tenant integration." This is an architectural choice,
  not a defect; a multi-tenant "does alice's token stay scoped to alice's
  projects" test does not apply to this design.

## Already handled — confirmed, not a gap
- `impersonate` (mobile.py): System Manager only, blocks targeting Guest/
  Administrator/another System Manager, audit-logged.
- File attach/delete/download (`project_todo.py`): edit-gated, IDOR-safe
  (`attached_to_name` checked before delete/download), private, 25MB cap.
- `_fetch_todos` (the shared query behind `get_dashboard`/`get_calendar`/
  `get_project`/`get_project_item`): parametrized `frappe.db.sql()`, values
  passed via a `%(name)s` dict — no string-interpolated SQL values found in
  this query. A full 68-call-site sweep for the injection case is still
  outstanding (see below).

## Remaining work (triaged, approved, not yet built)
1. **Missing indexes** on `Project Todo` — `assigned_to`, `status`,
   `deadline`, `work_mode` lack `search_index` (only `project`/
   `project_detail` have it). 9,430 rows in production; adding the flags plus
   a patch is low-risk. Approved, next up.
2. **`get_project_item` sibling dump** (`mobile.py:2069`) — calls
   `_fetch_todos([project], include_cancelled=True)` (fetches/shapes every
   sibling todo) then filters to one row in Python. Query count and payload
   scale with sibling count. Approved fix: a scoped single-row fetch
   producing the identical response shape, with a query-count test (10 vs
   300 siblings, same count) as the regression guard.
3. **13 `allow_guest=True` endpoints** not yet individually reviewed for
   private-data leakage: `attendance.py`, `contact.py`, `events.py`,
   `midtrans.py`, `passkey.py` (×3), `recruitment.py` (×6). Ranked ahead of
   the performance items — an unauthenticated surface on a live production
   app outranks an N+1.
4. **Full static sweep** of all ~68 `frappe.db.sql(` call sites for
   string-interpolated values (only `_fetch_todos` was hand-checked so far).
5. `pip-audit` / `npm audit`, Lighthouse scores, CSP/cookie flag checks —
   not run this pass.
