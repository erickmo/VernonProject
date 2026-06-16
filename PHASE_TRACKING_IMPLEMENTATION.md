# Project Todo - Phase Tracking Implementation

## Overview
Fitur ini menambahkan kemampuan tracking waktu yang lebih detail untuk setiap fase dalam workflow Project Todo, tidak hanya dari Planned ke Done, tetapi juga untuk setiap transisi fase berikutnya.

## Workflow Phases
Project Todo memiliki 4 status/fase:
1. **⚪️ Planned** → Status awal
2. **🟠 Done** → Setelah development selesai
3. **🔷 Checked By PL** → Setelah di-review oleh Project Leader
4. **✅ Completed** → Final status

## Features Implemented

### 1. Time Estimation Per Phase (Field Baru)

#### Estimation Fields
- `estimated_planned_to_done` (Float, hours) - Estimasi waktu dari Planned → Done
- `estimated_done_to_checked` (Float, hours) - Estimasi waktu dari Done → Checked By PL
- `estimated_checked_to_completed` (Float, hours) - Estimasi waktu dari Checked By PL → Completed
- `total_estimated_hours` (Float, read-only) - Total estimasi dari semua fase (auto-calculated)

### 2. Phase Timestamp Tracking (Field Baru)

#### Timestamp Fields (Auto-populated)
- `planned_started_at` (Datetime) - Timestamp saat todo dibuat dengan status Planned
- `done_started_at` (Datetime) - Timestamp saat berubah ke Done
- `checked_started_at` (Datetime) - Timestamp saat berubah ke Checked By PL
- `phase_completed_at` (Datetime) - Timestamp saat berubah ke Completed

### 3. Actual Time Calculation (Field Baru)

#### Actual Time Fields (Auto-calculated)
- `actual_planned_to_done` (Float, hours) - Waktu aktual dari Planned → Done
- `actual_done_to_checked` (Float, hours) - Waktu aktual dari Done → Checked By PL
- `actual_checked_to_completed` (Float, hours) - Waktu aktual dari Checked By PL → Completed
- `total_actual_hours` (Float, read-only) - Total waktu aktual (auto-calculated)

## Implementation Details

### File Changes

#### 1. project_todo.json
Ditambahkan field-field baru dengan struktur sections:
- **Time Estimation Per Phase** section (collapsible)
- **Phase Timestamps** section (collapsible)
- **Actual Time Per Phase** section (collapsible)

#### 2. project_todo.py
Ditambahkan methods baru:

```python
def calculate_total_estimated_hours(self):
    """Calculate total estimated hours from all phases"""
    # Menjumlahkan semua estimasi per fase

def track_phase_changes(self):
    """Track timestamp changes when status changes and calculate actual times"""
    # Mencatat timestamp saat status berubah
    # Menghitung waktu aktual berdasarkan selisih timestamp

def calculate_hours_diff(self, start_time, end_time):
    """Calculate difference between two timestamps in hours"""
    # Menghitung selisih waktu dalam jam (2 desimal)

def calculate_total_actual_hours(self):
    """Calculate total actual hours from all phases"""
    # Menjumlahkan semua waktu aktual
```

### Auto-calculation Logic

#### 1. On Create
- Set `planned_started_at` = now()
- Calculate `total_estimated_hours` dari sum of all estimated fields

#### 2. On Status Change to Done
- Set `done_started_at` = now()
- Calculate `actual_planned_to_done` = diff(planned_started_at, done_started_at)
- Update `total_actual_hours`

#### 3. On Status Change to Checked By PL
- Set `checked_started_at` = now()
- Calculate `actual_done_to_checked` = diff(done_started_at, checked_started_at)
- Update `total_actual_hours`

#### 4. On Status Change to Completed
- Set `phase_completed_at` = now()
- Calculate `actual_checked_to_completed` = diff(checked_started_at, phase_completed_at)
- Update `total_actual_hours`

## Testing

### Test File
Location: `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py`

#### Test Class: TestProjectTodoPhaseTracking
Total 10 test cases:

1. `test_calculate_total_estimated_hours` - Validasi perhitungan total estimasi
2. `test_planned_started_at_timestamp` - Validasi timestamp awal
3. `test_done_timestamp_and_actual_time` - Validasi timestamp dan waktu aktual Done
4. `test_checked_timestamp_and_actual_time` - Validasi timestamp dan waktu aktual Checked
5. `test_completed_timestamp_and_actual_time` - Validasi timestamp dan waktu aktual Completed
6. `test_total_actual_hours_calculation` - Validasi total waktu aktual
7. `test_update_estimated_hours_recalculates_total` - Validasi recalculation saat update
8. `test_phase_timestamps_chronological_order` - Validasi urutan chronological
9. `test_zero_estimated_hours` - Validasi handling nilai 0 atau null

### Running Tests

```bash
# Run all Project Todo tests
cd /home/frappe/frappe-bench
bench --site [site-name] run-tests --doctype "Project Todo"

# Or run Python test directly
python3 -m unittest vernon_project.vernon_project.doctype.project_todo.test_project_todo.TestProjectTodoPhaseTracking
```

### Manual Testing Checklist

- [ ] Create new todo with phase estimates
- [ ] Check total_estimated_hours calculated correctly
- [ ] Move todo to Done status
- [ ] Verify done_started_at is set
- [ ] Verify actual_planned_to_done is calculated
- [ ] Move todo to Checked By PL status
- [ ] Verify checked_started_at is set
- [ ] Verify actual_done_to_checked is calculated
- [ ] Move todo to Completed status
- [ ] Verify phase_completed_at is set
- [ ] Verify actual_checked_to_completed is calculated
- [ ] Verify total_actual_hours equals sum of all phases

## Usage Example

### Creating Todo with Phase Estimates

```python
import frappe
from frappe.utils import nowdate, add_days

# Create Project Detail with Todo
detail = frappe.get_doc({
    "doctype": "Project Detail",
    "project": "PRJ-26.03-.00001",
    "detail_name": "Implement Login Feature",
    "estimated": 100,
    "todo": [
        {
            "to_do": "Create login form UI",
            "assigned_to": "developer@company.com",
            "deadline": add_days(nowdate(), 7),
            "estimated": 60,  # Legacy field (minutes)

            # New phase estimation fields (hours)
            "estimated_planned_to_done": 4.0,  # 4 hours coding
            "estimated_done_to_checked": 1.0,  # 1 hour review
            "estimated_checked_to_completed": 0.5,  # 30 mins final check
            # total_estimated_hours will be auto-calculated to 5.5 hours
        }
    ]
})
detail.insert()
frappe.db.commit()

# Reload to see calculated fields
detail.reload()
todo = detail.todo[0]

print(f"Total Estimated: {todo.total_estimated_hours} hours")  # Output: 5.5
print(f"Planned Started: {todo.planned_started_at}")  # Auto-set
```

### Tracking Phase Progress

```python
# Move to Done
detail.todo[0].status = "🟠 Done"
detail.save()
detail.reload()

print(f"Done Started: {detail.todo[0].done_started_at}")  # Auto-set
print(f"Actual Time (Planned→Done): {detail.todo[0].actual_planned_to_done} hours")

# Move to Checked By PL
detail.todo[0].status = "🔷 Checked By PL"
detail.save()
detail.reload()

print(f"Checked Started: {detail.todo[0].checked_started_at}")  # Auto-set
print(f"Actual Time (Done→Checked): {detail.todo[0].actual_done_to_checked} hours")

# Move to Completed
detail.todo[0].status = "✅ Completed"
detail.save()
detail.reload()

print(f"Completed At: {detail.todo[0].phase_completed_at}")  # Auto-set
print(f"Actual Time (Checked→Completed): {detail.todo[0].actual_checked_to_completed} hours")
print(f"Total Actual Time: {detail.todo[0].total_actual_hours} hours")
```

## Analytics & Reporting

Dengan data ini, Anda dapat:

1. **Compare Estimated vs Actual**
   - Berapa akurat estimasi waktu per fase?
   - Fase mana yang sering melebihi estimasi?

2. **Identify Bottlenecks**
   - Fase mana yang paling lama?
   - Apakah review process terlalu lama?

3. **Improve Planning**
   - Historical data untuk estimasi lebih akurat di masa depan
   - Pattern recognition untuk different types of tasks

4. **Team Performance**
   - Developer mana yang paling efisien?
   - Berapa lama rata-rata review time?

## Database Schema

### New Columns in tabProject Todo

```sql
ALTER TABLE `tabProject Todo`
ADD COLUMN `estimated_planned_to_done` DECIMAL(18,2) DEFAULT NULL,
ADD COLUMN `estimated_done_to_checked` DECIMAL(18,2) DEFAULT NULL,
ADD COLUMN `estimated_checked_to_completed` DECIMAL(18,2) DEFAULT NULL,
ADD COLUMN `total_estimated_hours` DECIMAL(18,2) DEFAULT NULL,
ADD COLUMN `planned_started_at` DATETIME DEFAULT NULL,
ADD COLUMN `done_started_at` DATETIME DEFAULT NULL,
ADD COLUMN `checked_started_at` DATETIME DEFAULT NULL,
ADD COLUMN `phase_completed_at` DATETIME DEFAULT NULL,
ADD COLUMN `actual_planned_to_done` DECIMAL(18,2) DEFAULT NULL,
ADD COLUMN `actual_done_to_checked` DECIMAL(18,2) DEFAULT NULL,
ADD COLUMN `actual_checked_to_completed` DECIMAL(18,2) DEFAULT NULL,
ADD COLUMN `total_actual_hours` DECIMAL(18,2) DEFAULT NULL;
```

## Migration

### Existing Data
- Existing todos will have NULL values for new fields
- This is acceptable as tracking starts from the point of implementation
- Old `estimated` field (minutes) is maintained for backward compatibility

### Rollout Steps
1. Deploy code changes
2. Run `bench migrate` to add new columns
3. Clear cache: `bench clear-cache`
4. Restart services: `bench restart`
5. Test with new todos

## Backward Compatibility

- Field `estimated` (minutes) tetap ada dan functional
- Tidak ada breaking changes untuk existing workflows
- New fields optional - system works without them

## Version
- Implemented in: **v0.3.0**
- Date: **2026-03-15**
- See: [CHANGELOG.md](CHANGELOG.md)

## Contributors
- Implementation: Vernon Development Team
- Testing: QA Team

---

For questions or issues, please refer to the main [README.md](README.md) or contact the development team.
