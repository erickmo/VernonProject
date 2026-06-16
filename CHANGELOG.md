# Changelog

Semua perubahan penting pada Vernon Project akan didokumentasikan di file ini.

Format berdasarkan [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
dan project ini mengikuti [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned Features
- Implementasi lengkap Scope of Work DocType
- Implementasi lengkap Project Proposal DocType
- Dashboard untuk monitoring proyek
- Notifikasi untuk deadline todo
- Export/Import data proyek

## [0.4.0] - 2026-03-15

### Added
- **Project Admin Role**: Setiap project sekarang dapat memiliki Project Admin yang ditunjuk
  - Field `project_admin` di Project DocType untuk menunjuk admin project
  - Project Admin otomatis ditambahkan ke team members
  - Permission Role "Project Admin" dengan akses khusus

### Changed
- **Permission System untuk Project Admin**:
  - Project Admin dapat Read, Write, dan Create untuk Project Detail
  - Project Admin dapat Read, Write, dan Create untuk Project Todo
  - **TIDAK dapat mengupdate status todo** - hanya bisa dilakukan oleh Project Owner, Project Leader, atau Assigned To
  - Validasi di level API (`update_status` endpoint) untuk mencegah Project Admin mengupdate status
  - Validasi di level DocType (`validate_project_admin_status_update`) untuk mencegah perubahan status secara langsung
  - Project Admin ditambahkan ke `get_permission_query_conditions` untuk filtering data
  - Project Admin ditambahkan ke `has_permission` untuk document-level access control

### Security
- Pembatasan permission untuk Project Admin sesuai requirement
- Multi-layer validation (API + DocType) untuk mencegah unauthorized status updates
- Konsisten permission filtering across Project, Project Detail, dan Project Todo

## [0.3.0] - 2026-03-15

### Added
- **Estimasi Waktu untuk Setiap Fase Todo**: Todo items sekarang memiliki estimasi waktu per fase workflow
  - Field `estimated_planned_to_done`: Estimasi waktu dari Planned ke Done (jam)
  - Field `estimated_done_to_checked`: Estimasi waktu dari Done ke Checked By PL (jam)
  - Field `estimated_checked_to_completed`: Estimasi waktu dari Checked By PL ke Completed (jam)
  - Auto-calculation total estimated time dari semua fase
  - Field `actual_planned_to_done`: Waktu aktual yang tercatat dari Planned ke Done (jam)
  - Field `actual_done_to_checked`: Waktu aktual yang tercatat dari Done ke Checked By PL (jam)
  - Field `actual_checked_to_completed`: Waktu aktual yang tercatat dari Checked By PL ke Completed (jam)

- **Tracking Waktu Transisi Antar Fase**: System otomatis mencatat timestamp setiap perubahan status
  - Field `planned_started_at`: Timestamp saat todo dibuat dengan status Planned
  - Field `done_started_at`: Timestamp saat todo berubah ke status Done
  - Field `checked_started_at`: Timestamp saat todo berubah ke status Checked By PL
  - Field `completed_at`: Timestamp saat todo berubah ke status Completed
  - Auto-calculation durasi aktual berdasarkan timestamp transisi

- **Reporting dan Analytics**: Laporan perbandingan estimasi vs aktual
  - Visualisasi waktu yang dihabiskan di setiap fase
  - Tracking efisiensi: perbandingan estimated vs actual time
  - Identifikasi bottleneck di fase tertentu
  - Data untuk improvement proses workflow

### Changed
- Project Todo workflow sekarang mencatat estimasi dan waktu aktual untuk setiap transisi fase
- Validasi untuk memastikan estimasi waktu adalah nilai positif
- Auto-update timestamps saat status berubah untuk tracking yang akurat
- Field `estimated` tetap ada sebagai total estimasi waktu untuk backward compatibility

### Improved
- Granularitas tracking waktu lebih detail untuk setiap fase workflow
- Better project planning dengan estimasi per fase
- Enhanced reporting capabilities untuk project management
- Data-driven insights untuk process improvement

## [0.2.0] - 2026-03-15

### Changed
- **Pembatasan Edit Todo yang Sudah Done**: Todo dengan status "Done" atau "Completed" sekarang memiliki field yang read-only
  - Field `assigned_to` tidak dapat diedit setelah todo masuk status Done/Completed
  - Field `estimated` (estimasi waktu) tidak dapat diedit setelah todo masuk status Done/Completed
  - Field `deadline` tidak dapat diedit setelah todo masuk status Done/Completed
  - Validasi di level DocType untuk mencegah perubahan field-field tersebut
  - Proteksi data integritas untuk tracking dan reporting yang akurat

### Security
- Peningkatan data integrity dengan mencegah modifikasi data todo yang sudah selesai
- Validasi tambahan untuk melindungi historical data

## [0.1.0] - 2026-03-15

### Added
- **Recurring Todo Feature**: Todo items sekarang dapat diset sebagai recurring
  - Field `is_recurring`: Checkbox untuk mengaktifkan recurring
  - Field `recurring_frequency`: Pilihan frekuensi (Daily, Weekly, Monthly)
  - Field `recurring_until`: Batas waktu recurring berakhir
  - Field `next_occurrence`: Tanggal otomatis untuk occurrence berikutnya
  - Field `original_todo`: Tracking todo asli untuk recurring chain

- **Auto-Create Recurring Todos**: System otomatis membuat todo baru berdasarkan recurring settings
  - Automatic creation saat todo selesai (status Completed)
  - Scheduled job harian untuk memastikan recurring todos dibuat tepat waktu
  - Validasi recurring_until untuk menghentikan recurring otomatis
  - Preservation semua detail todo (assigned_to, estimated, notes)

- **Scheduled Tasks**:
  - `create_recurring_todos`: Job harian untuk auto-create recurring todos yang terlewat

### Changed
- Project Todo DocType diperluas dengan recurring functionality
- Logika `on_change` di ProjectTodo class untuk handle automatic creation
- Validation logic untuk calculate next occurrence dates

## [0.0.1] - 2026-03-15

### Added
- Rilis awal Vernon Project
- Sistem manajemen proyek berbasis Frappe Framework
- **DocTypes:**
  - Project: Manajemen proyek dengan customer, timeline, dan tim
  - Project Detail: Breakdown detail pekerjaan dengan estimasi dan pricing
  - Project Todo: Todo items dengan workflow status
  - Customer: Master data customer/klien
  - Glossary: Sistem terminologi untuk pengelompokan
  - Project Group: Struktur hierarki untuk organisasi proyek
  - Project Team: Child table untuk anggota tim
  - Project Glossary: Child table untuk glossary multiselect
  - Scope of Work: DocType untuk SOW (basic structure)
  - Project Proposal: DocType untuk proposal (basic structure)

- **Features:**
  - Project grouping dengan tree structure
  - Todo workflow: Planned → Done → Checked By PL → Completed
  - Team management dengan role-based permissions
  - Progress tracking dengan estimasi waktu
  - Auto-update status berdasarkan completion todo
  - Calendar dan Gantt view untuk timeline
  - Validasi business logic (dates, pricing, permissions)
  - Auto-remove duplicate team members

- **API Endpoints:**
  - `get_project_team_members(project_name)` - Ambil daftar team members
  - `get_notes(todo_id)` - Ambil notes dari todo
  - `update_status(todo_id)` - Update status todo dengan workflow validation
  - `save_notes(todo_id, notes)` - Simpan notes todo

- **Reports:**
  - Progress Report: Laporan todo yang sudah dikerjakan
  - Todo Report: Laporan semua todo ongoing
  - Project Todo Deadline Report: Monitor deadline
  - Daily Assignment Report: Assignment harian
  - Daily Performance Report: Performance harian

- **Permission System:**
  - Role: System Manager, Project Owner, Project Leader, Project Team
  - User-based filtering (hanya lihat project yang di-assign)
  - Workflow validation untuk update status
  - Permission check di API endpoints

- **Utilities:**
  - Helper functions untuk project management
  - Validation functions

### Security
- Implementasi role-based access control (RBAC)
- Permission filters berdasarkan team membership
- API endpoint protection dengan permission checks
- Validasi workflow untuk status updates

---

## Kategori Perubahan

- **Added** - Fitur baru
- **Changed** - Perubahan pada fitur existing
- **Deprecated** - Fitur yang akan dihapus
- **Removed** - Fitur yang sudah dihapus
- **Fixed** - Bug fixes
- **Security** - Peningkatan keamanan

---

Untuk informasi lebih lengkap, lihat [README.md](README.md)
