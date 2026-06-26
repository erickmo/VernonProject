# Fair Economy Calibration — Group Types, Levels & Base Rates

**Date:** 2026-06-26
**Status:** Approved (brainstorm), pending implementation
**Builds on:** nested work-type → difficulty levels (shipped). This populates real
data into that structure to make the points economy reflect contribution to the company.

## Problem

After the nested-levels feature, the live taxonomy is mostly placeholder: only
Administration and Creative & Design have real work-type names; the other 6 groups
(Engineering, Operations, Sales & Marketing, Documentation, Partnerships, Misc) still
carry numeric "0–10" types (leftover old levels). All difficulty % = 100, all
base_rate = 1.0 — so the economy is flat. We want points to reflect contribution:
business impact (per-group base rate) and skill scarcity + complexity (per-level
difficulty %).

## Model

`point = base_rate_per_minute(group) × estimated_minutes × (difficulty_percent / 100)`

- **base_rate per group ← business impact** (proximity to revenue/company goals). Range 0.7–1.5.
- **difficulty % per level ← skill scarcity + complexity.** Range 40–200% across a type's levels.
- Net spread ≈ 10× between a senior/complex/high-impact minute and a junior/simple/low-impact one (meaningful; no flat guardrail, per user).

## Per-group base rate

| Group | base_rate |
|---|---|
| Engineering | 1.5 |
| Sales & Marketing | 1.4 |
| Partnerships | 1.3 |
| Creative & Design | 1.1 |
| Operations | 1.0 |
| Documentation | 0.9 |
| Administration | 0.8 |
| Misc | 0.7 |

## Taxonomy (canonical) — type → levels (difficulty %)

**Engineering**
- Backend Development: Bugfix 60, Feature 120, System/Architecture 200
- Frontend / Web: Tweak 50, Component 100, Full Flow 160
- Mobile App: Tweak 60, Feature 120, Module 180
- Module Build (VEdu): Standard 80, Complex 130
- Integration / API: Simple 90, Complex 170
- Bugfix / Maintenance: Minor 50, Major 110

**Sales & Marketing**
- Proposal Writing: Standard 110, Full-System/ERP 200
- SEO: Maintenance 80, Optimization 140
- Content / Influencer: Standard 80, Campaign 140
- Sales Analysis (CAC): Standard 100, Deep 160
- Lead Outreach: Standard 70, Key Account 130

**Partnerships**
- Outreach / Follow-up: Standard 70, Key Partner 130
- Meeting (setup+lead): Setup 60, Lead 120
- MoU / Agreement: Draft 110, Negotiate & Close 190
- Program Setup: Standard 100, Full Program 160
- Training Delivery: Session 90, Full Curriculum 160

**Creative & Design**
- Image: Template-based 50, Custom 100
- Carousel: Standard 80, Premium 130
- Video Editing: Short 100, Long/Complex 180
- Take Content (shoot): Standard 90, Production 150
- Template: Standard 70, System 120

**Operations**
- Warehouse & Inventory: Routine 60, Opname/Audit 110
- Procurement / Sourcing: Standard 90, Negotiation 150
- Legal / Agreement (MoU/PKS/TnC): Draft 100, Full Contract 160
- Service & Catalog Setup: Standard 80, Complex 130
- System / Portal Ops: Config 80, Build 150

**Documentation**
- SOP Writing: Standard 80, Comprehensive 130
- Brand Guideline: Section 90, Full 150
- Technical Docs: Standard 80, System 140
- Process Mapping: Standard 90, Complex 140

**Administration**
- Input Data: Standard 60, Bulk/Complex 90
- Check Data: Standard 70, Audit 100
- Arsip Data: Standard 50, Organize 80

**Misc**
- General Task: Standard 70, Complex 110

## Migration (decision: Replace + reset stale links)

A single idempotent patch:
1. Set `base_rate_per_minute` per group (table above).
2. For each of the 8 groups: DELETE all existing `Group Level` child rows, then INSERT
   the new rows from the taxonomy. Each new row: `type_name`, `level_name`,
   `difficulty_percent`, fresh `level_id` (`frappe.generate_hash(length=10)`), `idx`.
3. Blank the type/level link on IN-FLIGHT todos so assignees re-pick a valid type+level:
   set `level=NULL, level_id=NULL, level_type=NULL` on Project Todo where status IN
   ('⚪️ Planned', '🟠 Done', '🔷 Checked By PL'). Do NOT touch '✅ Completed' (points
   already credited in Point Ledger — leave their cached level/point/ledger intact) or
   '🚫 Cancelled'.
4. `point` is NOT recomputed for blanked todos here; it recomputes naturally when the
   assignee re-saves with a new type/level (snapshot at validate).

### Safety / correctness
- Groups not in the table are not touched. The patch only references the 8 known groups.
- Point Ledger is never modified — completed earnings are preserved.
- Idempotency: re-running replaces the same taxonomy (delete+insert by group) and
  re-blanks in-flight todos (already-blank → no-op). Safe to re-run.
- Generating `level_id` per row keeps the existing snapshot/resolution contract intact.

## Out of scope (YAGNI)

- Per-assignee or per-seniority multipliers (handled by choosing the right level).
- Auto-classifying existing todos into the new types (assignees re-pick; too error-prone
  to guess).
- Changing the point formula or `_compute_earned`/ledger logic.

## Verification

LIVE site, no test DB. After the patch (console, read-back):
- Each group's `base_rate_per_minute` matches the table; each group's level rows match
  the taxonomy (counts + sample %s).
- In-flight todos have NULL level/level_id/level_type; a Completed todo retains its
  cached level/point and its Point Ledger row is unchanged.
- Spot compute: a Backend/System todo at 60 min → 1.5 × 60 × 200% = 180.
