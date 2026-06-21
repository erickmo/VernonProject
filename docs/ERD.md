# Vernon Project — Entity-Relationship Diagram

All 14 DocTypes and their Link / child-table relationships, generated from the DocType JSON.
Rendered version: [`docs/erd.html`](erd.html). Field-by-field reference: [`docs/doctypes.html`](doctypes.html).

Crow's-foot: `||` exactly one · `o{` zero-or-many · `o|` zero-or-one. Child-table DocTypes
(`istable: 1`) are reached only through their parent's Table field.

```mermaid
erDiagram
  Brand["Brand"] {
    Data brand_name PK
  }
  Project["Project"] {
    Link brand FK
    Link project_owner FK
    Link project_leader FK
    Link project_admin FK
  }
  ProjectTeam["Project Team (child)"] {
    Link user FK
  }
  ProjectDetail["Project Detail"] {
    Link project FK
    Link grouping FK
    Select status
    Currency price
    Currency discount
  }
  Glossary["Glossary"] {
    Link project FK
    Data glossary
  }
  ProjectGlossary["Project Glossary (child)"] {
    Link glossary FK
  }
  ProjectTodo["Project Todo"] {
    Link project_detail FK
    Link project FK
    Link assigned_to FK
    Link group FK
    Select level
    Float point
    Select status
  }
  ProjectTodoAllocation["Project Todo Allocation (child)"] {
    Date allocation_date
    Int estimated_minutes
  }
  Group["Group"] {
    Data group_name PK
    Percent late_penalty
    Percent early_bonus
  }
  GroupLevel["Group Level (child)"] {
    Data level_name
    Float point
  }
  PointLedger["Point Ledger"] {
    Link user FK
    Link todo FK
    Link group FK
    Link project FK
    Float points_earned
  }
  ProjectProposal["Project Proposal"] {
    Link amended_from FK
  }
  ScopeOfWork["Scope of Work"] {
    Link proposal FK
  }
  User["User (Frappe)"] {
    Data email PK
  }

  Project          }o--|| Brand                 : brand
  Project          ||--o{ ProjectTeam           : team_members
  ProjectTeam      }o--|| User                  : user
  Project          }o--|| User                  : "owner/leader/admin"
  Project          ||--o{ ProjectDetail         : details
  ProjectDetail    }o--o| Glossary              : grouping
  Glossary         }o--|| Project               : project
  ProjectDetail    ||--o{ ProjectGlossary       : glossaries
  ProjectGlossary  }o--|| Glossary              : glossary
  ProjectDetail    ||--o{ ProjectTodo           : todos
  ProjectTodo      }o--o| Project               : project
  ProjectTodo      }o--|| Group                  : group
  ProjectTodo      }o--|| User                  : "assignee/approvers"
  ProjectTodo      ||--o{ ProjectTodoAllocation : allocations
  Group            ||--o{ GroupLevel            : levels
  PointLedger      }o--|| User                  : user
  PointLedger      }o--|| ProjectTodo           : todo
  PointLedger      }o--o| Group                  : group
  PointLedger      }o--o| Project               : project
  ScopeOfWork      }o--o| ProjectProposal       : proposal
```

## Notes

- **Project Todo is standalone.** It links its parent via `project_detail` (earlier it was a `todo`
  child table) and owns the `allocations` child table for per-day planning.
- **Brand** replaces the former **Customer** DocType.
- **Scoring** runs through Group → Group Level (`level`/`point`) with awards recorded in Point Ledger.
