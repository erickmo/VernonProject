# vernon_entre Data Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `vernon_entre` Frappe app with a `Venture` parent and four entrepreneurship-canvas doctypes (SWOT, Business Model Canvas, Value Proposition Canvas, Empathy Map), every canvas section backed by one reused child doctype `Entre Canvas Item`.

**Architecture:** New Frappe app + single module `Vernon Entre`. Doctypes are created programmatically with `frappe.get_doc({...}).insert()` run through `bench execute`, with `developer_mode` on so Frappe exports the doctype JSON into the app folder for commit. Each canvas Links to a Venture; each section is a `Table` field pointing at the shared `Entre Canvas Item`. Student = document `owner`.

**Tech Stack:** Frappe (Python), bench CLI, MariaDB. No frontend in this plan.

## Global Constraints

- Build/verify site: `dev.vernon.id` (do NOT touch any production site).
- App: `vernon_entre`; module: `Vernon Entre` (auto-created by `bench new-app`).
- One reused child doctype: `Entre Canvas Item` — do NOT create per-section child doctypes.
- Student identity = document `owner` (Frappe User). No Student/cohort doctype.
- Permissions on every parent doctype = exactly two rows: `Entre Student` (create/read/write/delete, `if_owner`) and `System Manager` (full).
- **Refinement over spec:** `Venture` uses series autoname `VEN-.#####` + `title_field: venture_name` — NOT `autoname: field:venture_name`. Reason: `field:` autoname makes the docname globally unique, so two students could not both name a venture "EcoBottle". Series naming + title field avoids cross-student collisions.
- Canvas doctypes use series autoname (`SWOT-.#####`, `BMC-.#####`, `VPC-.#####`, `EMAP-.#####`) + `title_field: venture`.
- Code-first per project convention: schema changes land via `bench migrate`; commit the exported JSON. Behavioural tests deferred to the final verification task (Task 8), per standing project instruction.

---

### Task 1: Scaffold app, install on dev.vernon.id, dev mode, role, collision pre-check

**Files:**
- Create: `apps/vernon_entre/**` (via `bench new-app`)
- Modify: `sites/dev.vernon.id/site_config.json` (developer_mode)

**Interfaces:**
- Produces: installed app `vernon_entre`, module `Vernon Entre`, role `Entre Student`. Later tasks assume all three exist and `developer_mode=1`.

- [ ] **Step 1: Recheck git state (user works in parallel)**

Run: `cd /home/frappe/frappe-bench && git -C apps/vernon_project status --short | head` — note current branch; only ever `git add` files under `apps/vernon_entre` going forward.

- [ ] **Step 2: Create the app**

Run: `cd /home/frappe/frappe-bench && bench new-app vernon_entre`
Answer prompts: App Title `Vernon Entre`, Description `Entrepreneurship student canvases (SWOT, BMC, VPC, Empathy Map)`, Publisher `Intinusa`, Email `mo@intinusa.id`, License `mit`, branch → accept default.
Expected: `apps/vernon_entre/` created; `apps/vernon_entre/vernon_entre/modules.txt` contains `Vernon Entre`.

- [ ] **Step 3: Install on dev.vernon.id**

Run: `bench --site dev.vernon.id install-app vernon_entre`
Expected: ends with `Installing vernon_entre... success`. Verify: `bench --site dev.vernon.id list-apps` includes `vernon_entre`.

- [ ] **Step 4: Enable developer mode (needed so DocType inserts export JSON to the app)**

Run: `bench --site dev.vernon.id set-config developer_mode 1 && bench --site dev.vernon.id clear-cache`

- [ ] **Step 5: Doctype-name collision pre-check**

Run:
```bash
bench --site dev.vernon.id execute frappe.get_all --kwargs "{'doctype':'DocType','filters':{'name':['in',['Venture','SWOT','Business Model Canvas','Value Proposition Canvas','Empathy Map','Entre Canvas Item']]},'pluck':'name'}"
```
Expected: `[]` (empty). If ANY name is returned, STOP — prefix that doctype with `Entre ` in all later tasks and note it in the final report.

- [ ] **Step 6: Create the Entre Student role**

Run:
```bash
bench --site dev.vernon.id execute frappe.client.insert --args "[{'doctype':'Role','role_name':'Entre Student','desk_access':1}]"
```
Expected: prints the created role dict. Verify: `bench --site dev.vernon.id execute frappe.db.exists --args "['Role','Entre Student']"` → `Entre Student`.

- [ ] **Step 7: Commit the scaffold**

```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add -A && git commit -m "chore: scaffold vernon_entre app"
```
(New app is its own git repo created by `bench new-app`; commit there, not in vernon_project.)

---

### Task 2: Entre Canvas Item (shared child doctype)

**Files:**
- Create: `apps/vernon_entre/vernon_entre/vernon_entre/doctype/entre_canvas_item/*` (exported by insert)

**Interfaces:**
- Produces: child doctype `Entre Canvas Item` with fields `item` (Small Text, reqd), `note` (Small Text), `priority` (Select High/Medium/Low, default Medium). Every canvas `Table` field in Tasks 4–7 sets `options: "Entre Canvas Item"`.

- [ ] **Step 1: Create the child doctype**

Save this to `/tmp/claude-1000/-home-frappe-frappe-bench-apps-vernon-project/3fbc7e36-9952-411a-8c6f-44667287317c/scratchpad/mk_item.py` and run with `bench --site dev.vernon.id execute` (or paste into `bench --site dev.vernon.id console`):
```python
import frappe
frappe.get_doc({
    "doctype": "DocType",
    "name": "Entre Canvas Item",
    "module": "Vernon Entre",
    "istable": 1,
    "editable_grid": 1,
    "fields": [
        {"fieldname": "item", "label": "Item", "fieldtype": "Small Text", "reqd": 1, "in_list_view": 1, "columns": 5},
        {"fieldname": "note", "label": "Note", "fieldtype": "Small Text", "in_list_view": 1, "columns": 4},
        {"fieldname": "priority", "label": "Priority", "fieldtype": "Select", "options": "High\nMedium\nLow", "default": "Medium", "in_list_view": 1, "columns": 2},
    ],
}).insert()
frappe.db.commit()
print("created Entre Canvas Item")
```
Run (console form): `bench --site dev.vernon.id console < .../mk_item.py`

- [ ] **Step 2: Migrate + verify**

Run: `bench --site dev.vernon.id migrate`
Then: `bench --site dev.vernon.id execute frappe.get_meta --args "['Entre Canvas Item']"` — must not error; `istable` true.
Confirm JSON exported: `ls apps/vernon_entre/vernon_entre/vernon_entre/doctype/entre_canvas_item/entre_canvas_item.json`

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add vernon_entre/vernon_entre/doctype/entre_canvas_item
git commit -m "feat: Entre Canvas Item child doctype"
```

---

### Task 3: Venture (parent)

**Files:**
- Create: `apps/vernon_entre/vernon_entre/vernon_entre/doctype/venture/*`

**Interfaces:**
- Consumes: role `Entre Student` (Task 1).
- Produces: doctype `Venture`, fields `venture_name` (Data, reqd), `pitch` (Small Text), `description` (Text), `status` (Select Draft/Active/Archived, default Draft). Autoname `VEN-.#####`, title `venture_name`. Canvas tasks Link to `Venture`.

- [ ] **Step 1: Create the doctype**
```python
import frappe
PERMS = [
    {"role": "Entre Student", "read": 1, "write": 1, "create": 1, "delete": 1, "if_owner": 1},
    {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "share": 1, "print": 1, "email": 1},
]
frappe.get_doc({
    "doctype": "DocType",
    "name": "Venture",
    "module": "Vernon Entre",
    "naming_rule": "Expression (old style)",
    "autoname": "VEN-.#####",
    "title_field": "venture_name",
    "track_changes": 1,
    "fields": [
        {"fieldname": "venture_name", "label": "Venture Name", "fieldtype": "Data", "reqd": 1, "in_list_view": 1},
        {"fieldname": "pitch", "label": "One-line Pitch", "fieldtype": "Small Text", "in_list_view": 1},
        {"fieldname": "status", "label": "Status", "fieldtype": "Select", "options": "Draft\nActive\nArchived", "default": "Draft", "in_list_view": 1},
        {"fieldname": "description", "label": "Description", "fieldtype": "Text"},
    ],
    "permissions": PERMS,
}).insert()
frappe.db.commit()
print("created Venture")
```

- [ ] **Step 2: Migrate + verify**

`bench --site dev.vernon.id migrate` then `bench --site dev.vernon.id execute frappe.db.table_exists --args "['Venture']"` → `True`.

- [ ] **Step 3: Commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add vernon_entre/vernon_entre/doctype/venture
git commit -m "feat: Venture parent doctype"
```

---

### Task 4: SWOT

**Files:** Create `apps/vernon_entre/vernon_entre/vernon_entre/doctype/swot/*`

**Interfaces:**
- Consumes: `Venture` (Task 3), `Entre Canvas Item` (Task 2), role `Entre Student` (Task 1).
- Produces: doctype `SWOT`, `venture` Link (reqd) + 4 Table fields `strengths`, `weaknesses`, `opportunities`, `threats` (all `Entre Canvas Item`).

- [ ] **Step 1: Create the doctype**
```python
import frappe
CI = "Entre Canvas Item"
PERMS = [
    {"role": "Entre Student", "read": 1, "write": 1, "create": 1, "delete": 1, "if_owner": 1},
    {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "share": 1, "print": 1, "email": 1},
]
frappe.get_doc({
    "doctype": "DocType",
    "name": "SWOT",
    "module": "Vernon Entre",
    "autoname": "SWOT-.#####",
    "title_field": "venture",
    "fields": [
        {"fieldname": "venture", "label": "Venture", "fieldtype": "Link", "options": "Venture", "reqd": 1, "in_list_view": 1},
        {"fieldname": "strengths", "label": "Strengths", "fieldtype": "Table", "options": CI},
        {"fieldname": "weaknesses", "label": "Weaknesses", "fieldtype": "Table", "options": CI},
        {"fieldname": "opportunities", "label": "Opportunities", "fieldtype": "Table", "options": CI},
        {"fieldname": "threats", "label": "Threats", "fieldtype": "Table", "options": CI},
    ],
    "permissions": PERMS,
}).insert()
frappe.db.commit()
print("created SWOT")
```

- [ ] **Step 2: Migrate + verify**

`bench --site dev.vernon.id migrate` then `bench --site dev.vernon.id execute frappe.db.table_exists --args "['SWOT']"` → `True`.

- [ ] **Step 3: Commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add vernon_entre/vernon_entre/doctype/swot
git commit -m "feat: SWOT doctype"
```

---

### Task 5: Business Model Canvas

**Files:** Create `apps/vernon_entre/vernon_entre/vernon_entre/doctype/business_model_canvas/*`

**Interfaces:**
- Consumes: `Venture`, `Entre Canvas Item`, `Entre Student`.
- Produces: doctype `Business Model Canvas`, `venture` Link (reqd) + 9 Table fields: `key_partners`, `key_activities`, `key_resources`, `value_propositions`, `customer_relationships`, `channels`, `customer_segments`, `cost_structure`, `revenue_streams`.

- [ ] **Step 1: Create the doctype**
```python
import frappe
CI = "Entre Canvas Item"
PERMS = [
    {"role": "Entre Student", "read": 1, "write": 1, "create": 1, "delete": 1, "if_owner": 1},
    {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "share": 1, "print": 1, "email": 1},
]
tbl = lambda fn, lb: {"fieldname": fn, "label": lb, "fieldtype": "Table", "options": CI}
frappe.get_doc({
    "doctype": "DocType",
    "name": "Business Model Canvas",
    "module": "Vernon Entre",
    "autoname": "BMC-.#####",
    "title_field": "venture",
    "fields": [
        {"fieldname": "venture", "label": "Venture", "fieldtype": "Link", "options": "Venture", "reqd": 1, "in_list_view": 1},
        tbl("key_partners", "Key Partners"),
        tbl("key_activities", "Key Activities"),
        tbl("key_resources", "Key Resources"),
        tbl("value_propositions", "Value Propositions"),
        tbl("customer_relationships", "Customer Relationships"),
        tbl("channels", "Channels"),
        tbl("customer_segments", "Customer Segments"),
        tbl("cost_structure", "Cost Structure"),
        tbl("revenue_streams", "Revenue Streams"),
    ],
    "permissions": PERMS,
}).insert()
frappe.db.commit()
print("created Business Model Canvas")
```

- [ ] **Step 2: Migrate + verify**

`bench --site dev.vernon.id migrate` then `bench --site dev.vernon.id execute frappe.db.table_exists --args "['Business Model Canvas']"` → `True`.

- [ ] **Step 3: Commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add vernon_entre/vernon_entre/doctype/business_model_canvas
git commit -m "feat: Business Model Canvas doctype"
```

---

### Task 6: Value Proposition Canvas

**Files:** Create `apps/vernon_entre/vernon_entre/vernon_entre/doctype/value_proposition_canvas/*`

**Interfaces:**
- Consumes: `Venture`, `Entre Canvas Item`, `Entre Student`.
- Produces: doctype `Value Proposition Canvas`, `venture` Link (reqd) + 6 Table fields: customer profile `customer_jobs`, `pains`, `gains`; value map `products_and_services`, `pain_relievers`, `gain_creators`.

- [ ] **Step 1: Create the doctype**
```python
import frappe
CI = "Entre Canvas Item"
PERMS = [
    {"role": "Entre Student", "read": 1, "write": 1, "create": 1, "delete": 1, "if_owner": 1},
    {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "share": 1, "print": 1, "email": 1},
]
tbl = lambda fn, lb: {"fieldname": fn, "label": lb, "fieldtype": "Table", "options": CI}
frappe.get_doc({
    "doctype": "DocType",
    "name": "Value Proposition Canvas",
    "module": "Vernon Entre",
    "autoname": "VPC-.#####",
    "title_field": "venture",
    "fields": [
        {"fieldname": "venture", "label": "Venture", "fieldtype": "Link", "options": "Venture", "reqd": 1, "in_list_view": 1},
        {"fieldname": "sec_profile", "label": "Customer Profile", "fieldtype": "Section Break"},
        tbl("customer_jobs", "Customer Jobs"),
        tbl("pains", "Pains"),
        tbl("gains", "Gains"),
        {"fieldname": "sec_map", "label": "Value Map", "fieldtype": "Section Break"},
        tbl("products_and_services", "Products & Services"),
        tbl("pain_relievers", "Pain Relievers"),
        tbl("gain_creators", "Gain Creators"),
    ],
    "permissions": PERMS,
}).insert()
frappe.db.commit()
print("created Value Proposition Canvas")
```

- [ ] **Step 2: Migrate + verify**

`bench --site dev.vernon.id migrate` then `bench --site dev.vernon.id execute frappe.db.table_exists --args "['Value Proposition Canvas']"` → `True`.

- [ ] **Step 3: Commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add vernon_entre/vernon_entre/doctype/value_proposition_canvas
git commit -m "feat: Value Proposition Canvas doctype"
```

---

### Task 7: Empathy Map

**Files:** Create `apps/vernon_entre/vernon_entre/vernon_entre/doctype/empathy_map/*`

**Interfaces:**
- Consumes: `Venture`, `Entre Canvas Item`, `Entre Student`.
- Produces: doctype `Empathy Map`, `venture` Link (reqd) + 6 Table fields: `says`, `thinks`, `feels`, `does`, `pains`, `gains`.

- [ ] **Step 1: Create the doctype**
```python
import frappe
CI = "Entre Canvas Item"
PERMS = [
    {"role": "Entre Student", "read": 1, "write": 1, "create": 1, "delete": 1, "if_owner": 1},
    {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "share": 1, "print": 1, "email": 1},
]
tbl = lambda fn, lb: {"fieldname": fn, "label": lb, "fieldtype": "Table", "options": CI}
frappe.get_doc({
    "doctype": "DocType",
    "name": "Empathy Map",
    "module": "Vernon Entre",
    "autoname": "EMAP-.#####",
    "title_field": "venture",
    "fields": [
        {"fieldname": "venture", "label": "Venture", "fieldtype": "Link", "options": "Venture", "reqd": 1, "in_list_view": 1},
        tbl("says", "Says"),
        tbl("thinks", "Thinks"),
        tbl("feels", "Feels"),
        tbl("does", "Does"),
        tbl("pains", "Pains"),
        tbl("gains", "Gains"),
    ],
    "permissions": PERMS,
}).insert()
frappe.db.commit()
print("created Empathy Map")
```

- [ ] **Step 2: Migrate + verify**

`bench --site dev.vernon.id migrate` then `bench --site dev.vernon.id execute frappe.db.table_exists --args "['Empathy Map']"` → `True`.

- [ ] **Step 3: Commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_entre
git add vernon_entre/vernon_entre/doctype/empathy_map
git commit -m "feat: Empathy Map doctype"
```

---

### Task 8: End-to-end verification (data model)

**Files:** Create `apps/vernon_entre/vernon_entre/vernon_entre/doctype/venture/test_venture.py`

**Interfaces:**
- Consumes: all six doctypes.

- [ ] **Step 1: Write an integration test that builds the full graph**

Create `apps/vernon_entre/vernon_entre/vernon_entre/doctype/venture/test_venture.py`:
```python
import frappe
from frappe.tests.utils import FrappeTestCase


class TestVenture(FrappeTestCase):
    def test_full_canvas_graph(self):
        v = frappe.get_doc({
            "doctype": "Venture",
            "venture_name": "TEST EcoBottle",
            "pitch": "Reusable bottle subscription",
            "status": "Active",
        }).insert()
        self.addCleanup(lambda: frappe.delete_doc("Venture", v.name, force=1))

        swot = frappe.get_doc({
            "doctype": "SWOT",
            "venture": v.name,
            "strengths": [{"item": "Low unit cost", "priority": "High"}],
            "weaknesses": [{"item": "No brand yet"}],
            "opportunities": [{"item": "Eco trend"}],
            "threats": [{"item": "Incumbents"}],
        }).insert()
        self.addCleanup(lambda: frappe.delete_doc("SWOT", swot.name, force=1))
        self.assertEqual(swot.strengths[0].priority, "High")

        for dt, field in [
            ("Business Model Canvas", "revenue_streams"),
            ("Value Proposition Canvas", "customer_jobs"),
            ("Empathy Map", "says"),
        ]:
            d = frappe.get_doc({
                "doctype": dt,
                "venture": v.name,
                field: [{"item": "sample point"}],
            }).insert()
            self.addCleanup(lambda dt=dt, n=d.name: frappe.delete_doc(dt, n, force=1))
            self.assertEqual(d.get(field)[0].item, "sample point")
```

- [ ] **Step 2: Run the test**

Run: `bench --site dev.vernon.id run-tests --module vernon_entre.vernon_entre.doctype.venture.test_venture`
Expected: `OK` (1 test). If it fails, fix the offending doctype and re-run — do not proceed until green.

- [ ] **Step 3: Permission spot-check (owner isolation)**
```bash
bench --site dev.vernon.id execute frappe.permissions.get_role_permissions --args "[{'doctype':'Venture'},'Entre Student']"
```
Expected: shows `if_owner` read/write/create/delete = 1 for `Entre Student`. Confirm `System Manager` has non-owner read via the DocType's permissions in Desk.

- [ ] **Step 4: Final migrate + commit**
```bash
bench --site dev.vernon.id migrate
cd /home/frappe/frappe-bench/apps/vernon_entre
git add vernon_entre/vernon_entre/doctype/venture/test_venture.py
git commit -m "test: end-to-end venture + canvas graph"
```

- [ ] **Step 5: Report**

Report: doctypes created, collision-check result, test result, and note that the student canvas web UI is the next sub-project (separate spec/plan).

---

## Notes for the next sub-project (out of scope here)

Student-facing React canvas UI (vernon convention: Vite+React → `public/`, served via `www/*.html`, whitelisted API in `vernon_entre/api/`). Gets its own spec + plan after this data model is verified on `dev.vernon.id`.
