# Cheer Pop — vibrant homepage celebration for received buzz & appreciation

**Date:** 2026-07-27
**Status:** Approved design
**Scope:** Frontend only (both `/m` and `/w`). No backend, no schema, no new endpoint.

## Goal

When a user *receives* a buzz (deadline nudge) or an appreciation (a "said thanks"
or a "cheered your work" reaction), the homepage greets them with a full-screen
confetti pop — tailored so a work-nudge does not read as a party. It settles/dismisses
and does not fire again for the same event.

## Source of truth

Both events already exist as `Vernon Notification` rows delivered through
`vernon_project.api.mobile._notify()` (bell + web push). No new data is created.

| Event | Producer | `type` | Title pattern | `actor` |
|---|---|---|---|---|
| Buzz nudge | `api/report.py::buzz_todo` | `Deadline` | `"{name} nudged you"` | set |
| Said thanks | `api/mobile.py::say_thanks` | `Kudos` | `"{name} said thanks 🙏"` | set |
| Cheered work | `api/mobile.py` reaction (~4442) | `Kudos` | `"{name} cheered your work"` | set |

**Discriminator = `actor` presence.** Automated notifications carry no actor:
scheduled deadline reminders (`tasks.py`, type `Deadline`, no actor) and the
"Kenali rekanmu hari ini ⚡" reminder (`superpowers.py`, type `Kudos`, no actor)
are therefore excluded without any title string-matching.

Classification:
- **buzz** = `type === "Deadline"` && `actor` truthy
- **thanks** = `type === "Kudos"` && `actor` truthy
- else → not a cheer

The notification feed already returns `name, type, title, body, actor, is_read,
creation` (see `get_notifications`), so the client has everything needed. No API change.

## Components

### 1. `frontend/src/lib/cheer.ts` (shared, pure)

```
export type CheerKind = 'thanks' | 'buzz'
export function classifyCheer(n: { type: string; actor?: string | null }): CheerKind | null
```

- `Deadline` + actor → `'buzz'`; `Kudos` + actor → `'thanks'`; else `null`.
- Includes an `assert`-based `demo()` self-check (ponytail test requirement):
  buzz row → `'buzz'`, thanks/cheer rows → `'thanks'`, actorless scheduled
  reminder → `null`, actorless "Kenali rekanmu" Kudos → `null`.

### 2. `frontend/src/hooks/useCheerPop.ts` (shared; web imports via `@`)

Reads the existing notification feed (`useNotifications`), tracks which cheers have
already been popped in a per-user localStorage set, returns:

```
{ cheer: { kind: CheerKind; title: string; body: string; from: string; name: string } | null,
  dismiss: () => void }
```

Behaviour:
- **Candidate** = feed row where `classifyCheer(row)` non-null AND `is_read === 0`
  AND `creation` within the last 48h AND `name` not in the seen-set.
- **First-ever load (no localStorage key yet) = baseline:** add all current
  candidate names to the seen-set *without* popping. Prevents a historical
  backlog dumping confetti on a new device. `ponytail:` comment names this.
- **Subsequent:** expose the newest candidate as `cheer`; add all candidate
  names to the seen-set immediately (so a re-render / refetch doesn't re-pop).
- `dismiss()` clears the current `cheer` (already marked seen). Next candidate,
  if any, surfaces on the following tick.
- Seen-set persisted as `cheerpop:seen:v1:<user>`; capped to the most recent
  ~200 names (`ponytail:` comment — bump if teams get chattier).
- Storage key includes the session user so switching accounts on a shared device
  starts clean.

Because it keys off the react-query notification feed, it fires on home mount and
again if a new cheer arrives while home is open (refetch/poll) — one mechanism, no
extra live-push wiring.

### 3. `frontend/src/components/CheerPop.tsx` (shared overlay)

Full-screen fixed overlay rendered when `cheer` is non-null. Tap anywhere or an
auto-timeout (~4.5s) calls `dismiss()`.

- **Confetti:** ~30 absolutely-positioned emoji/dot `<span>`s with a CSS fall+fade
  keyframe, per-span randomised (`left`, `delay`, `duration`, `rotate`) via inline
  style. **No confetti library** — reuses the Soft-Pop `animate-*` vocabulary.
- **Tailored by kind:**
  - `thanks` → warm: gold/pink palette, 🙏 🎉, headline like "Appreciated!",
    line = notification title (e.g. "Sarah cheered your work").
  - `buzz` → energetic attention: indigo/amber, 🔔 ⚡, headline like "You're needed",
    line = "{from} is waiting on you" + body (the due date).
- One shared component styled in Soft-Pop; both homes mount it. Idiomatic here —
  `/w` already reuses `/m` cards via `@`. (Considered per-frontend styling; a
  centered celebratory overlay is universal enough that two copies is pure
  duplication.)
- A11y: overlay is dismissible by tap and by Escape; confetti spans are
  `aria-hidden`; the headline/line are real text.

### 4. Mount points

- `frontend/src/pages/Today.tsx` (`/m` home) — render `<CheerPop/>` once.
- `frontend-web/src/pages/Home.tsx` (`/w` home) — render `<CheerPop/>` once.

## Non-goals / deferred

- **Cross-device dedupe.** Seen-set is per-device localStorage, so the same cheer
  can pop once on phone and once on web. Acceptable for a cosmetic moment; add a
  server-side `celebrated` flag only if double-pops are reported.
- **Sound / haptics.** Out of scope.
- **A cheer history / inbox surface.** The bell already lists them.

## Ship checklist

- Build BOTH bundles (`/m` and `/w`) — verify the feature string is in the hashed
  bundle before claiming shipped.
- What's New entry (user-visible change) — Bahasa, `Both`, after it is live.
- No `gen_docs.py` run (no DocType/endpoint/hook shape change).
- `bench restart` not required (frontend-only); asset cache purge per the usual
  rebuild flow.

## Test

- `cheer.ts` `demo()` — classifier truth table (buzz / thanks / cheer / two
  actorless negatives). The one non-trivial money/logic path; runnable, no framework.
