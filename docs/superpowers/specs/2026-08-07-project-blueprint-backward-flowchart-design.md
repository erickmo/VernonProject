# Project Blueprint — "Begin with the End in Mind" backward whiteboard

**Date:** 2026-08-07
**Status:** Design — approved decisions below, pending user spec review
**Ships to:** both frontends (`/m` mobile, `/w` web), two surfaces (`/plan`, `/project/:name`)

## Problem / intent

Give the user a Covey-style "begin with the end in mind" view of a project: the
**goal** (Project) on the right, its **subgoals** (Project Detail) to its left, and
the **actions** (Project Todo) further left — a single connected whiteboard that reads
backward from the end. The horizontal axis is time: **latest deadline = rightmost**
(the goal), earlier work flows left. Beyond the parent→child hierarchy, the board also
draws **dependency** edges between todos (`blocked_by` / `blocking`), and **drawing a
new edge writes those fields** — the board is an editor, not a picture.

## Locked decisions

| Question | Decision |
|---|---|
| Plan-page scope | One project at a time, via a project **picker** (same chart as project page). |
| Fidelity | True flowchart with drawn **SVG connectors**. |
| Interaction | Clickable nodes **+ inline quick-add** (subgoal, todo). |
| Canvas | **One pannable/zoomable whiteboard**, not rigid columns. |
| X axis | **Deadline**; latest = rightmost (goal). Undated todos → a left "no deadline" parking lane. |
| Dependencies | Draw edges from `blocked_by`/`blocking`; **drag-to-connect** writes them. |
| Positioning | **Auto-layout** (computed from deadline + hierarchy). No saved per-node coordinates. |
| Connect gesture | **Drag** from a todo's connect handle, drop on another todo. |

## Data

### New endpoint — `api/mobile.py::get_project_blueprint(project)`

`get_project_gantt` is close but (a) drops todos with neither an allocation date nor a
deadline and (b) carries no goal/subgoal metadata — so a dedicated endpoint is cleaner
than overloading it. Reuses existing helpers (`_visible_projects`, `_fetch_todos`,
`_status_key`, `_user_name_map`).

Returns:

```jsonc
{
  "goal":   { "name", "project_name", "goal", "deadline", "status" },
  "details":[ { "name", "title", "deadline",            // project_deadline || latest_deadline
               "expected_outcome",                       // plain text, HTML stripped
               "status" } ],
  "todos":  [ { "id", "label", "detail",                 // project_detail name
               "deadline",                               // null allowed → parking lane
               "statusKey", "overdue", "assignee",
               "blocking": ["<todo id>", ...] } ]        // outgoing dependency edges
}
```

- Permission: `if project not in _visible_projects(): frappe.throw(PermissionError)`.
- **Includes undated todos** (unlike gantt).
- Dependency edges are emitted **once**, from the `blocking` side, in one batched
  child-table query (mirror of the `item` endpoint's `blocked_by`/`blocking` fetch) —
  no per-todo lookups.

### Writes — reuse `update_project_item(..., blocking=[...])`

Already exists. The **controller auto-mirrors** the two sides (`Project Todo.on_update`
→ `_add_block_link`/`_remove_block_link`): setting `A.blocking += B` automatically adds
`A` to `B.blocked_by`. So creating edge `A → B` (A blocks B) is a **single call** —
`useUpdateTodo(A).mutate({ blocking: [...A.blocking, B] })`; removing = same call without
B. Because every edge always has a `blocking` side (mirror invariant), the read emits
each edge **once** from `blocking` with no double-counting. No new write endpoint.

## Layout model — `frontend/src/lib/blueprint.ts` (pure, shared)

Input: the endpoint payload + a viewport size. Output: positioned nodes + edge paths +
canvas bounds. Deterministic (no clock, no random).

- **X = deadline.** Map `[minDeadline … goalDeadline]` → x; goal pinned to max x
  (rightmost). Earlier deadline → smaller x. Todos with `deadline == null` → a fixed
  **left parking lane** (x = 0, labelled "Belum ada tenggat").
- **Y = subgoal band.** One horizontal band per Project Detail (ordered by the detail's
  deadline). A subgoal's todos stack within its band at their own X. The subgoal node
  sits at the band's right edge; the goal node is centered vertically at far right.
- **Edges:**
  - hierarchy: `todo → its subgoal`, `subgoal → goal` (curved bezier).
  - dependency: `todo → todo` for each `blocking` entry, arrow-headed, visually distinct
    (dashed/accent). Overdue-source edges tinted.
- Node tint by status (`statusKey` for todos, Pending/Ongoing/Completed for subgoals,
  project status for goal). Overdue todo = red ring.

`blueprint.selfcheck.ts` asserts, on a fixture: earlier deadline ⇒ smaller x; undated ⇒
leftmost lane; same subgoal ⇒ same band; goal ⇒ max x; one dependency edge per `blocking`
entry; no self-edge.

## Canvas engine — `frontend/src/components/BlueprintCanvas.tsx` (shared, render-prop)

One shared engine, imported by both frontends (like the existing shared `PlanRow`):

- **Pan/zoom**: CSS `transform: translate() scale()` on an inner `<g>`/div; wheel + pinch
  to zoom, drag empty space to pan; fit-to-content on first render. Minimal, no lib.
- **SVG edges** drawn in one `<svg>` layer behind the nodes.
- **Nodes** rendered via a `renderNode(node)` prop so each frontend keeps its own design
  system — web = bento tile, mobile = soft-pop card. This satisfies the two-frontends
  rule (presentation per-frontend) while keeping the hard interaction logic in one place.
- **Drag-to-connect**: pointer-down on a todo's connect handle starts a live bezier to
  the cursor; pointer-up over another todo node fires `onConnect(source, target)`. Guards:
  no self, no exact duplicate, no direct 2-cycle (A↔B). Deeper cycle detection is
  deferred (`// ponytail: only direct-cycle guard; add DFS if chains get abused`).
- **Edge tap** → `onDisconnect(source, target)`, gated behind the in-app `useConfirm()`
  (never native `confirm`).
- `onConnect`/`onDisconnect` call `useUpdateTodo` (optimistic + refetch). A `403` from the
  perm check surfaces a toast ("Tidak diizinkan mengubah ketergantungan").

## Surfaces

Both project pages already have a `view: 'list' | 'gantt'` toggle; add **`'blueprint'`**
("Peta"):

- **Project page** — `frontend-web/src/pages/Project.tsx`, `frontend/src/pages/ProjectScreen.tsx`:
  new "Peta" chip beside List/Gantt; full-width canvas for the current project.
- **Plan page** — `frontend-web/src/pages/Plan.tsx`, `frontend/src/pages/PlanScreen.tsx`:
  new "Peta" mode beside date/project + a `SearchableSelect` project picker (projects the
  user owns/leads), then the same `BlueprintCanvas`.

Both consume the shared `useProjectBlueprint(project)` hook.

## Quick-add (reuse, no new forms)

- **"+ Subgoal"** near the goal node → existing `ProjectDetailFormDialog` (web) /
  `ProjectDetailFormSheet` (mobile), prefilled `project`.
- **"+ Aksi"** on each subgoal node → existing `CreateProjectItemDialog` (web) /
  `CreateProjectItemSheet` (mobile), prefilled `project` + `project_detail`.
- On success → refetch blueprint.

## Empty state

Project with no subgoals → centered prompt + "+ Subgoal" button.

## Testing

- `frontend/src/lib/blueprint.selfcheck.ts` — layout + edge invariants (above).
- Python `test_get_project_blueprint` — permission throw for a non-visible project;
  grouping shape; an **undated** todo appears; `blocking` edges returned; no self-edge.
- Manual: drag-connect writes the dependency (confirm via the `item` endpoint); edge tap
  removes it; non-permitted user gets the toast, not a write.

## Ship checklist

1. Build **both** bundles (`frontend` + `frontend-web`).
2. `sudo /usr/local/bin/tj-restart` (new Python endpoint).
3. `python3 scripts/gen_docs.py` (new whitelisted endpoint) + commit `docs/assets/data.js`.
4. After live-verify, insert an **App Release** row (`platform: Both`), Bahasa, biggest
   item first.

## Deliberate scope limits (ponytail)

- **Auto-layout only** — no draggable-and-saved node positions (no new coordinate
  storage). Positions always reflect real deadlines.
- **Two-node cycle guard only** — full DAG validation deferred until abuse is seen.
- **No canvas virtualization** — SVG handles a normal project fine; revisit only if a
  single project exceeds a few hundred todos (`// ponytail: virtualize past ~300 nodes`).
