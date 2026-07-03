# vernon_entre — Data Model Design

**Date:** 2026-07-03
**Status:** Approved (design), pending implementation plan
**Scope:** Sub-project 1 of 2 — the data model (app + doctypes). The student canvas web UI is sub-project 2 and gets its own spec after this ships.

## Purpose

A new Frappe app, `vernon_entre`, supporting students studying entrepreneurship. It lets a student create a **Venture** (their business idea) and work it through four standard entrepreneurship frameworks as structured, queryable documents: **SWOT**, **Business Model Canvas**, **Value Proposition Canvas**, and **Empathy Map**.

This spec covers the backend data model only. It is the foundation the web UI (sub-project 2) will read and write through whitelisted API.

## Context / decisions

- **Fresh app.** An existing `vernonedu_entrepreneurship` app exists but is an empty, uninstalled scaffold (no doctypes, no pages, not on any site). It is ignored; `vernon_entre` is built new.
- **Architecture:** a parent `Venture` doctype ties the four canvases together. Each canvas links to a Venture.
- **Field storage:** every section of every canvas is a **child table of individual items** (not free-text), so points are queryable and orderable and a sticky-note UI can render them later.
- **Child doctype reuse:** ONE child doctype, `Entre Canvas Item`, is reused by every section table field across all four canvases. Not ~25 separate child doctypes. Child rows carry `parent`/`parenttype`/`parentfield` so the same child doctype serves every section.
- **Student identity:** the student is the document `owner` (a Frappe User). No separate Student doctype, no cohort/class link (deferred).
- **Target site for build:** `dev.vernon.id` (build/verify safely; promote to a production site later).

## Module

App `vernon_entre`, single module `Vernon Entre`. All doctypes below belong to this module.

## Doctypes

### 1. Entre Canvas Item (child)

`istable = 1`. Reused by every section table field of all four canvases.

| field | type | notes |
|---|---|---|
| `item` | Small Text | the point / sticky note. **reqd** |
| `note` | Small Text | optional supporting detail |
| `priority` | Select | options `High\nMedium\nLow`, default `Medium` |

`in_list_view`: `item` (main), `priority`. Keep columns compact so every section renders the same 2–3 column grid.

### 2. Venture (parent)

Naming: `autoname = field:venture_name`, `title_field = venture_name`.

| field | type | notes |
|---|---|---|
| `venture_name` | Data | **reqd**, document title |
| `pitch` | Small Text | one-line pitch |
| `description` | Text | longer description |
| `status` | Select | options `Draft\nActive\nArchived`, default `Draft` |

Student = `owner` (Frappe User). No submit / workflow.

### 3. SWOT

| field | type | child |
|---|---|---|
| `venture` | Link → Venture | **reqd** |
| `strengths` | Table | Entre Canvas Item |
| `weaknesses` | Table | Entre Canvas Item |
| `opportunities` | Table | Entre Canvas Item |
| `threats` | Table | Entre Canvas Item |

### 4. Business Model Canvas

`venture` Link → Venture (reqd), then nine Table fields, each `Entre Canvas Item`:

`key_partners`, `key_activities`, `key_resources`, `value_propositions`, `customer_relationships`, `channels`, `customer_segments`, `cost_structure`, `revenue_streams`.

### 5. Value Proposition Canvas

`venture` Link → Venture (reqd), then six Table fields, each `Entre Canvas Item`, grouped by two sides:

- Customer profile: `customer_jobs`, `pains`, `gains`
- Value map: `products_and_services`, `pain_relievers`, `gain_creators`

### 6. Empathy Map

`venture` Link → Venture (reqd), then six Table fields, each `Entre Canvas Item`:

`says`, `thinks`, `feels`, `does`, `pains`, `gains`.

## Cardinality

Each canvas has a `venture` Link. Multiple canvases of the same type may point to the same Venture — no forced uniqueness (YAGNI; iteration/versioning is cheap this way, enforce later only if needed).

## Permissions

- Role **Entre Student** (new): create/read/write/delete, restricted to own documents via `if_owner` on all five parent doctypes.
- Role **System Manager** (and an instructor role, reuse System Manager for now): full read across all documents.
- Child doctype `Entre Canvas Item` inherits parent permissions (standard Frappe child behaviour).

Instructor-specific role and grading are deferred.

## Naming-collision check

Doctype names `SWOT`, `Business Model Canvas`, `Value Proposition Canvas`, `Empathy Map`, `Venture`, `Entre Canvas Item` must not already exist on the target site `dev.vernon.id`. `Venture` is the only generically-risky name. The plan must verify (`bench --site dev.vernon.id list doctype`-style check or console) before install; if a collision exists, prefix the offender with `Entre ` and note it.

## Explicitly out of scope (this spec)

- The student-facing canvas web UI (React SPA, vernon convention) — sub-project 2, separate spec.
- Cohort/class grouping, submit-for-grading workflow, per-canvas scoring, versioning.
- Any production-site install (build stays on `dev.vernon.id`).

## Verification (data model)

After implementation on `dev.vernon.id`:
1. `bench --site dev.vernon.id migrate` succeeds; all six doctypes present.
2. Create one Venture, then one of each canvas linked to it, add a few `Entre Canvas Item` rows in different sections — saves cleanly.
3. Confirm an Entre Student user sees only own Ventures/canvases; System Manager sees all.
