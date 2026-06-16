# Testing Guide: Done Todo Field Validation

## Fitur yang Diimplementasikan

Validasi untuk mencegah edit field `assigned_to`, `estimated`, dan `deadline` pada Project Todo yang sudah masuk ke status "Done" (🟠 Done) atau "Completed" (✅ Completed).

## File yang Diubah

1. **[project_todo.py](vernon_project/vernon_project/doctype/project_todo/project_todo.py)**
   - Ditambahkan method `validate_done_todo_fields()` pada line 19-51
   - Method ini dipanggil di `validate()` untuk mencegah edit field yang dilindungi

## Cara Testing Manual

### Prerequisite
1. Pastikan ada Project dengan Project Detail dan Todo
2. Akses via UI atau console bench

### Test Scenario 1: Edit saat Status Planned (Seharusnya Berhasil)

```python
# Via bench console
bench --site [nama-site] console

# Ambil project detail
detail = frappe.get_doc("Project Detail", "[nama-detail]")

# Lihat status todo
print(detail.todo[0].status)  # Seharusnya "⚪️ Planned"

# Edit assigned_to
detail.todo[0].assigned_to = "Administrator"
detail.save()  # Seharusnya BERHASIL
frappe.db.commit()
```

### Test Scenario 2: Edit assigned_to saat Status Done (Seharusnya Gagal)

```python
# Ubah status ke Done
detail.reload()
detail.todo[0].status = "🟠 Done"
detail.save()
frappe.db.commit()

# Coba edit assigned_to
detail.reload()
detail.todo[0].assigned_to = "test@example.com"
detail.save()  # Seharusnya GAGAL dengan error "Cannot modify Assigned To..."
```

**Expected Error:**
```
frappe.exceptions.ValidationError: Cannot modify Assigned To when Todo status is '🟠 Done'.
These fields are locked once the todo is marked as Done or Completed.
```

### Test Scenario 3: Edit estimated saat Status Done (Seharusnya Gagal)

```python
detail.reload()
detail.todo[0].estimated = 999
detail.save()  # Seharusnya GAGAL dengan error "Cannot modify Estimated..."
```

### Test Scenario 4: Edit deadline saat Status Done (Seharusnya Gagal)

```python
from frappe.utils import add_days, nowdate

detail.reload()
detail.todo[0].deadline = add_days(nowdate(), 30)
detail.save()  # Seharusnya GAGAL dengan error "Cannot modify Deadline..."
```

### Test Scenario 5: Edit Field Lain (notes) saat Done (Seharusnya Berhasil)

```python
detail.reload()
detail.todo[0].notes = "Updated notes after completion"
detail.save()  # Seharusnya BERHASIL karena notes tidak dilindungi
frappe.db.commit()
```

### Test Scenario 6: Edit saat Status Completed (Seharusnya Gagal)

```python
# Ubah ke Completed
detail.reload()
detail.todo[0].status = "✅ Completed"
detail.save()
frappe.db.commit()

# Coba edit assigned_to
detail.reload()
detail.todo[0].assigned_to = "another@example.com"
detail.save()  # Seharusnya GAGAL dengan error yang sama
```

## Testing via UI

1. Buka Project Detail yang memiliki Todo
2. Ubah status Todo menjadi "Done"
3. Save
4. Coba edit field:
   - Assigned To → Seharusnya muncul error
   - Estimated → Seharusnya muncul error
   - Deadline → Seharusnya muncul error
   - Notes → Seharusnya bisa diedit

## Code Coverage

### Protected Fields
- `assigned_to` - User yang ditugaskan
- `estimated` - Estimasi waktu (menit)
- `deadline` - Deadline todo

### Protected Status
- `🟠 Done`
- `✅ Completed`

### Unprotected (Masih Bisa Diedit)
- Status lain: `⚪️ Planned`, `🔷 Checked By PL`
- Field lain: `notes`, `to_do`, dll

## Implementation Details

Validasi bekerja dengan:
1. Mengecek apakah document adalah baru (`is_new()`) - skip validasi
2. Mengecek apakah status adalah "Done" atau "Completed"
3. Membandingkan nilai field sekarang dengan nilai sebelumnya (`get_doc_before_save()`)
4. Jika ada perubahan pada field yang dilindungi, throw ValidationError

## Benefits

1. **Data Integrity**: Mencegah manipulasi data historis
2. **Audit Trail**: Data todo yang sudah selesai tidak bisa diubah
3. **Accurate Reporting**: Laporan berdasarkan data yang akurat dan tidak termodifikasi
4. **Compliance**: Memenuhi requirement tracking yang ketat

## Changelog Entry

Lihat [CHANGELOG.md](../../CHANGELOG.md) versi 0.2.0 untuk detail lengkap perubahan ini.
