# Todo Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ordered, checkable sub-item list ("checklist") to a Project Todo, editable on the todo detail screen in both frontends, with a `done/total` chip on the todo card.

**Architecture:** Checklist is stored as a JSON array in a new Small Text field on Project Todo, mirroring the existing `notes` feature end to end — a dedicated `save_checklist` endpoint (looser "can edit notes" gate), exposure via `_shape_todo`, and a self-persisting `<Checklist>` component beside `<Notes>` in each detail screen. No status gating, no points, no progress bar.

**Tech Stack:** Frappe (Python) backend; React + TanStack Query (`useMutation`/`useQueryClient`) frontends; shared logic in `frontend/src` imported by web as `@`.

## Global Constraints

- **Both frontends.** Every user-facing change ships to `/m` (`frontend/`) and `/w` (`frontend-web/`). Shared logic in `frontend/src`; presentation per-platform (mobile Soft-Pop cards, web bento/detail).
- **No native `confirm`/`alert`/`prompt`** — use in-app dialog if a confirm is ever needed (delete-item does not need one).
- **What's New** row required after ship: App Release doctype, Bahasa, one bullet per line, `published=1`, `platform=Both`, semver-bumped from newest row.
- **Docs generator** unaffected (field-only, no new DocType/endpoint-cluster change) — but run `python3 scripts/gen_docs.py && git diff --exit-code docs/assets/data.js` to confirm no drift.
- Live site `project.vernon.id`, no test DB — backend self-check runs as a plain assert script, not against the live DB.
- Storage keys are compact: `t` (text), `d` (done bool). Array order = display order.

---

### Task 1: Backend — field, parse helper, save endpoint, shape exposure

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.json` (add field + field_order entry)
- Modify: `vernon_project/api/project_todo.py` (add `_parse_checklist`, `save_checklist`)
- Modify: `vernon_project/api/mobile.py:856` area (`_shape_todo` — expose `checklist`), `:584` and `:1213` (add `t.checklist` to the two todo SELECT column lists)
- Test: `scratchpad/test_checklist_parse.py` (throwaway assert script — not committed)

**Interfaces:**
- Produces:
  - Field `checklist` (Small Text) on Project Todo — JSON string `[{"t": str, "d": bool}, …]`.
  - `_parse_checklist(raw) -> list[dict]` in `project_todo.py` — safe on `None`/malformed → `[]`; each item `{"t": <trimmed str>, "d": <bool>}`, empty-`t` rows dropped.
  - `save_checklist(todo_id, checklist)` whitelisted → `{"status": "ok"|"error", "message": str}`.
  - `_shape_todo` output gains `checklist: list[{t,d}]` (always present; `[]` when none).

- [ ] **Step 1: Add the field to the doctype JSON**

In `project_todo.json`, add `"checklist"` to the `field_order` array immediately after `"notes"`, and add this object to the `fields` array (right after the `notes` field object):

```json
{
  "fieldname": "checklist",
  "fieldtype": "Small Text",
  "label": "Checklist",
  "description": "JSON array of {t: text, d: done} sub-items. Edited in-app, not in Desk."
}
```

- [ ] **Step 2: Add the parse helper + save endpoint** to `vernon_project/api/project_todo.py` (place next to `save_notes`, ~line 507)

```python
import json

def _parse_checklist(raw):
    """Normalize the stored checklist JSON into a clean list.
    Safe on None / malformed JSON → []. Each item is {"t": str, "d": bool};
    empty-text rows are dropped."""
    if not raw:
        return []
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return []
    if not isinstance(data, list):
        return []
    out = []
    for it in data:
        if not isinstance(it, dict):
            continue
        t = str(it.get("t") or "").strip()
        if not t:
            continue
        out.append({"t": t, "d": bool(it.get("d"))})
    return out


@frappe.whitelist()
def save_checklist(todo_id, checklist):
    """Save the checklist for a project todo. Gate mirrors the detail screen's
    `can_edit_notes`: assignee, project owner/leader, project admins, or System
    Manager. `checklist` is a JSON string from the client; it is re-validated
    and re-serialized server-side."""
    try:
        todo = frappe.get_doc("Project Todo", todo_id)
        project_detail = frappe.get_doc("Project Detail", todo.project_detail)
        project = frappe.get_doc("Project", project_detail.project)

        user = frappe.session.user
        from vernon_project.api.mobile import get_project_admins
        allowed = user in (todo.assigned_to, project.project_owner, project.project_leader) \
            or user in get_project_admins(project) \
            or "System Manager" in frappe.get_roles(user)
        if not allowed:
            return {"status": "error", "message": "Anda tidak punya izin mengubah checklist ini."}

        clean = _parse_checklist(checklist)
        todo.checklist = json.dumps(clean, ensure_ascii=False)
        todo.save(ignore_permissions=True)
        return {"status": "ok", "message": "Checklist tersimpan.", "checklist": clean}

    except frappe.DoesNotExistError:
        return {"status": "error", "message": f"Todo {todo_id} tidak ditemukan."}
    except Exception as e:
        return {"status": "error", "message": str(e)}
```

(Confirm `get_project_admins` is importable from `vernon_project.api.mobile` — it is used there throughout; if the import is circular at module load, import it lazily inside the function as shown.)

- [ ] **Step 3: Expose `checklist` in `_shape_todo`** (`mobile.py`, in the `out = {…}` dict, next to the `"notes"` key ~line 856)

```python
        "notes": row.get("notes") or "",
        "checklist": _parse_checklist_shared(row.get("checklist")),
```

Import the helper at top of `mobile.py` (or reference via module): add
`from vernon_project.api.project_todo import _parse_checklist as _parse_checklist_shared`
near the other `project_todo` import already present (`list_todo_files` is imported lazily at line 1981 — you may import `_parse_checklist` the same lazy way inside `_shape_todo` to avoid any load-order issue, or add a top-level import if none exists).

- [ ] **Step 4: Add `t.checklist` to the two todo SELECT column lists**

In `mobile.py` line ~584 and line ~1213, both SELECTs list `t.notes` among the columns. Add `t.checklist` right after `t.notes` in each:

```
t.ongoing, t.notes, t.checklist, t.cancellation_reason, ...
```

- [ ] **Step 5: Write + run the parse self-check** (`scratchpad/test_checklist_parse.py`)

```python
import sys; sys.path.insert(0, "vernon_project/api")
# _parse_checklist is pure (no frappe) — import the function source directly.
import importlib.util, json
spec = importlib.util.spec_from_file_location("pt", "vernon_project/api/project_todo.py")
# The module imports frappe at top; stub it so the pure helper can load.
import types; sys.modules["frappe"] = types.ModuleType("frappe")
pt = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(pt)
except Exception:
    pass  # only need _parse_checklist defined
f = pt._parse_checklist
assert f(None) == []
assert f("") == []
assert f("not json") == []
assert f("{}") == []            # not a list
assert f('[{"t":"a","d":true},{"t":"b"}]') == [{"t":"a","d":True},{"t":"b","d":False}]
assert f('[{"t":"  ","d":true},{"t":" x ","d":1}]') == [{"t":"x","d":True}]  # drop empty, trim, coerce
assert f([{"t":"already","d":False}]) == [{"t":"already","d":False}]        # list passthrough
print("OK")
```

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 scratchpad/test_checklist_parse.py`
Expected: `OK` (if the frappe-stub import trick fails, instead copy `_parse_checklist` into the test file verbatim and assert against that — the point is to lock the normalization rules).

- [ ] **Step 6: Migrate + restart, smoke-test the endpoint**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
sudo /usr/local/bin/tj-restart
bench --site project.vernon.id console <<'EOF'
import frappe
# pick any todo; assert round-trip
name = frappe.get_all("Project Todo", limit=1)[0].name
from vernon_project.api.project_todo import save_checklist, _parse_checklist
frappe.set_user("Administrator")
print(save_checklist(name, '[{"t":"one","d":true},{"t":"two","d":false},{"t":"  ","d":true}]'))
print(_parse_checklist(frappe.db.get_value("Project Todo", name, "checklist")))
frappe.db.rollback()
EOF
```

Expected: status `ok`, checklist has 2 items (`one` done, `two` not; empty dropped).

- [ ] **Step 7: Commit**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.json vernon_project/api/project_todo.py vernon_project/api/mobile.py
git commit -m "feat(todo): checklist field + save_checklist endpoint + shape exposure"
```

---

### Task 2: Shared frontend wiring (api client, mutation hook, type)

**Files:**
- Modify: `frontend/src/lib/api.ts` (add `saveChecklist`)
- Modify: `frontend/src/hooks/useData.ts` (add `useSaveChecklist`)
- Modify: the todo-detail type (search `can_edit_notes` in `frontend/src/lib/types.ts` or wherever the detail type lives) — add `checklist`.

**Interfaces:**
- Consumes: `save_checklist` endpoint from Task 1.
- Produces:
  - `mobileApi.saveChecklist(todoId: string, checklist: string) => Promise<{status, message}>`
  - `useSaveChecklist(todoId: string)` — `useMutation` whose `mutationFn` takes `items: {t:string;d:boolean}[]`, JSON-stringifies, posts, throws on error, invalidates `keys.projectItem(todoId)`.
  - Detail type field `checklist: { t: string; d: boolean }[]`.

- [ ] **Step 1: Add the api method** (`api.ts`, right after `saveNotes` ~line 232)

```ts
  saveChecklist: (todoId: string, checklist: string) =>
    api.post<{ status: string; message: string }>(
      'vernon_project.api.project_todo.save_checklist',
      { todo_id: todoId, checklist },
    ),
```

- [ ] **Step 2: Add the hook** (`useData.ts`, right after `useSaveNotes` ~line 886)

```ts
export type ChecklistItem = { t: string; d: boolean }

export function useSaveChecklist(todoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: ChecklistItem[]) => {
      const res = await mobileApi.saveChecklist(todoId, JSON.stringify(items))
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projectItem(todoId) }),
  })
}
```

- [ ] **Step 3: Add `checklist` to the todo-detail type**

Find the type backing `useProjectItem`'s data (grep `can_edit_notes` in `frontend/src`). Add:

```ts
  checklist: { t: string; d: boolean }[]
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit` (and confirm web still typechecks against `@`: `cd ../frontend-web && npx tsc --noEmit`)
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/useData.ts frontend/src/lib/types.ts
git commit -m "feat(todo): shared checklist api + useSaveChecklist hook + type"
```

---

### Task 3: Mobile UI — `<Checklist>` component, placement, card chip

**Files:**
- Modify: `frontend/src/pages/ProjectItemScreen.tsx` (add local `Checklist` component next to `Notes` ~line 431; render it next to `<Notes>` ~line 1485)
- Modify: `frontend/src/components/TodoCard.tsx` (add `▢ done/total` chip when `checklist.length > 0`)

**Interfaces:**
- Consumes: `useSaveChecklist`, `ChecklistItem`, `data.checklist`, `data.can_edit_notes` from Tasks 1–2.

- [ ] **Step 1: Add the `Checklist` component** in `ProjectItemScreen.tsx` (mirror the local `Notes` component's shape — local state, optimistic, `canEdit` gate)

```tsx
function Checklist({ todoId, initial, canEdit }: { todoId: string; initial: ChecklistItem[]; canEdit: boolean }) {
  const save = useSaveChecklist(todoId)
  const toast = useToast()
  const [items, setItems] = useState<ChecklistItem[]>(initial ?? [])
  const baseline = useRef(JSON.stringify(initial ?? []))

  useEffect(() => {
    // adopt server state only when we have no pending local divergence
    if (baseline.current === JSON.stringify(items)) {
      setItems(initial ?? [])
      baseline.current = JSON.stringify(initial ?? [])
    }
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: ChecklistItem[]) => {
    setItems(next)
    save.mutate(next, {
      onSuccess: () => { baseline.current = JSON.stringify(next) },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  const done = items.filter((i) => i.d).length

  if (!canEdit) {
    if (!items.length) return <p className="text-sm italic text-slate-400 dark:text-slate-500">No checklist.</p>
    return (
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span>{it.d ? '☑' : '☐'}</span>
            <span className={it.d ? 'text-slate-400 line-through' : 'text-slate-600 dark:text-slate-300'}>{it.t}</span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <p className="text-xs font-medium text-slate-400">{done}/{items.length} selesai</p>
      )}
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={it.d}
            onChange={() => commit(items.map((x, j) => (j === i ? { ...x, d: !x.d } : x)))}
            className="h-5 w-5 shrink-0 accent-indigo-500"
          />
          <input
            value={it.t}
            onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))}
            onBlur={() => { if (JSON.stringify(items) !== baseline.current) commit(items) }}
            placeholder="Item…"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
          <button
            onClick={() => commit(items.filter((_, j) => j !== i))}
            className="shrink-0 text-slate-400 hover:text-rose-500"
            aria-label="Hapus item"
          >✕</button>
        </div>
      ))}
      <button
        onClick={() => setItems([...items, { t: '', d: false }])}
        className="text-sm font-medium text-indigo-500"
      >+ Tambah item</button>
    </div>
  )
}
```

- [ ] **Step 2: Render it in the detail screen** — beside the existing `<Notes … />` (~line 1485), add a titled section:

```tsx
<Checklist todoId={data.name} initial={data.checklist} canEdit={data.can_edit_notes} />
```

(Match the surrounding section wrapper/heading used for Notes so it reads as a sibling block, e.g. a "Checklist" heading above it.)

- [ ] **Step 3: Add the card chip** in `TodoCard.tsx` — where other meta chips render, add:

```tsx
{!!todo.checklist?.length && (
  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
    ☑ {todo.checklist.filter((i) => i.d).length}/{todo.checklist.length}
  </span>
)}
```

(Ensure the `TodoCard` todo type includes `checklist` — extend the shared list-item type from Task 2 Step 3 if the card uses a narrower type.)

- [ ] **Step 4: Build + manually verify mobile**

Run: `cd frontend && npm run build`
Then load `/m`, open a todo detail: add two items, tick one, reload → persisted; card shows `☑ 1/2`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ProjectItemScreen.tsx frontend/src/components/TodoCard.tsx frontend/src/lib/types.ts
git commit -m "feat(todo): mobile checklist UI + card chip"
```

---

### Task 4: Web UI — `<Checklist>` component, placement, card chip

**Files:**
- Modify: `frontend-web/src/pages/ProjectItem.tsx` (add local `Checklist` next to its `Notes`; render at ~line 1549)
- Modify: the web todo card/row component that shows todo meta (grep `to_do` in `frontend-web/src/components`, e.g. the todo table row / card) — add the chip.

**Interfaces:**
- Consumes: `useSaveChecklist`, `ChecklistItem` (from `@`), `data.checklist`, `data.can_edit_notes`.

- [ ] **Step 1: Add the `Checklist` component** in `ProjectItem.tsx`, mirroring the web `Notes` component's markup/design tokens (web uses its own classes — `text-muted`, bento/detail styling). Logic is identical to Task 3 Step 1 (local optimistic state, `commit`, `canEdit` gate, checkbox toggles immediately, text commits on blur). Import `useSaveChecklist` and `ChecklistItem` from `@/hooks/useData`.

```tsx
import { useSaveChecklist, type ChecklistItem } from '@/hooks/useData'

function Checklist({ todoId, initial, canEdit }: { todoId: string; initial: ChecklistItem[]; canEdit: boolean }) {
  const save = useSaveChecklist(todoId)
  const toast = useToast()
  const [items, setItems] = useState<ChecklistItem[]>(initial ?? [])
  const baseline = useRef(JSON.stringify(initial ?? []))

  useEffect(() => {
    if (baseline.current === JSON.stringify(items)) {
      setItems(initial ?? [])
      baseline.current = JSON.stringify(initial ?? [])
    }
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: ChecklistItem[]) => {
    setItems(next)
    save.mutate(next, {
      onSuccess: () => { baseline.current = JSON.stringify(next) },
      onError: (err) => toast('error', (err as Error).message),
    })
  }
  const done = items.filter((i) => i.d).length

  if (!canEdit) {
    if (!items.length) return <p className="text-sm italic text-muted">No checklist.</p>
    return (
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span>{it.d ? '☑' : '☐'}</span>
            <span className={it.d ? 'text-muted line-through' : ''}>{it.t}</span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && <p className="text-xs font-medium text-muted">{done}/{items.length} selesai</p>}
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="checkbox" checked={it.d}
            onChange={() => commit(items.map((x, j) => (j === i ? { ...x, d: !x.d } : x)))} />
          <input value={it.t}
            onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))}
            onBlur={() => { if (JSON.stringify(items) !== baseline.current) commit(items) }}
            placeholder="Item…" className="flex-1 rounded border px-2 py-1 text-sm" />
          <button onClick={() => commit(items.filter((_, j) => j !== i))} aria-label="Hapus item">✕</button>
        </div>
      ))}
      <button onClick={() => setItems([...items, { t: '', d: false }])} className="text-sm font-medium text-primary">+ Tambah item</button>
    </div>
  )
}
```

(Adjust class names to the web design system's actual tokens — match the neighboring `Notes` block.)

- [ ] **Step 2: Render it** beside `<Notes … />` (~line 1549) with a "Checklist" heading matching the notes section.

- [ ] **Step 3: Add the card chip** to the web todo card/row component (same `☑ done/total` derived from `checklist`), matching web chip styling.

- [ ] **Step 4: Build + manually verify web**

Run: `cd frontend-web && npm run build`
Then load `/w`, open a todo: add/tick items, reload → persisted; card chip shows the ratio.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/ProjectItem.tsx frontend-web/src/components/
git commit -m "feat(todo): web checklist UI + card chip"
```

---

### Task 5: Ship — verify bundles, docs check, What's New

**Files:**
- Modify: `vernon_project/public/frontend{,_web}/index.html` + hashed bundles (produced by the builds in Tasks 3–4)
- Data: one App Release row on the live site

- [ ] **Step 1: Confirm the feature is in the built bundles** (source committed ≠ shipped)

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
grep -l "save_checklist" vernon_project/public/frontend/assets/index-*.js
grep -l "save_checklist" vernon_project/public/frontend_web/assets/index-*.js
```

Expected: the current hashed bundle named in each `index.html` contains `save_checklist`.

- [ ] **Step 2: Docs staleness check**

```bash
python3 scripts/gen_docs.py && git diff --exit-code docs/assets/data.js && echo "docs OK"
```

Expected: no diff (field-only change). If `data.js` changed, commit it.

- [ ] **Step 3: Commit the rebuilt bundles**

```bash
git add vernon_project/public/frontend vernon_project/public/frontend_web
git commit -m "chore: rebuild bundles for todo checklist"
```

- [ ] **Step 4: Insert the What's New row** — write `scratchpad/releases.json` (semver-bump from the newest existing App Release; Bahasa; `platform=Both`; `published=1`) then insert loop-free:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/home/frappe/frappe-bench/apps/vernon_project/scratchpad/releases.json"))])
frappe.db.commit()
EOF
```

Suggested `notes` (one bullet per line, Bahasa, non-technical):
```
Sekarang setiap tugas bisa punya checklist — daftar langkah kecil yang bisa dicentang satu per satu (/m & /w)
Tambah, ubah, centang, atau hapus item langsung di halaman tugas
Kartu tugas menampilkan progres checklist, misalnya 2/5 selesai
```

- [ ] **Step 5: Verify through the real endpoint, per platform**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Mobile")[0])
print(frappe.call("vernon_project.api.app_release.get_app_releases", platform="Web")[0])
EOF
```

Expected: the new row is the newest for both.

---

## Self-Review

**Spec coverage:**
- Storage (Small Text JSON field) → Task 1 Step 1. ✓
- `save_checklist` endpoint + gate + validation → Task 1 Steps 2, 6. ✓
- `_parse_checklist` shared helper + self-check → Task 1 Steps 2, 5. ✓
- Shape exposure + SELECT columns → Task 1 Steps 3–4. ✓
- Shared api/hook/type → Task 2. ✓
- Mobile component + placement + chip → Task 3. ✓
- Web component + placement + chip → Task 4. ✓
- Build both, docs check, What's New → Task 5. ✓
- Non-goals (no gating/points/progress-bar) → nothing in the plan adds them. ✓
- Deferred reorder → intentionally omitted from all tasks (spec "Open/deferred"). ✓

**Type consistency:** `ChecklistItem = {t: string; d: boolean}` defined once in `useData.ts` (Task 2), imported by both components (Tasks 3–4) and the detail/list types. Backend item shape `{"t","d"}` matches. Endpoint path `vernon_project.api.project_todo.save_checklist` identical in api.ts and the plan. ✓

**Placeholder scan:** no TBD/TODO; all code blocks concrete. The two "adjust class names to the design system" notes are deliberate per-frontend styling latitude, not logic gaps. ✓
