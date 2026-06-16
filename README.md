# Vernon Project

Aplikasi manajemen proyek berbasis Frappe Framework untuk mengelola proyek, tugas, tim, dan progres pekerjaan dengan sistem workflow yang terstruktur.

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Struktur DocTypes](#struktur-doctypes)
- [Role & Permissions](#role--permissions)
- [API Endpoints](#api-endpoints)
- [Reports](#reports)
- [Installation](#installation)
- [Panduan Penggunaan](#panduan-penggunaan)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)

## Fitur Utama

- **Manajemen Proyek**: Kelola multiple proyek dengan customer, timeline, dan tim yang berbeda
- **Project Grouping**: Organisasi proyek dalam struktur hierarki menggunakan Project Group
- **Project Details**: Breakdown proyek menjadi detail-detail pekerjaan dengan estimasi dan pricing
- **Todo Management**: Sistem todo dengan workflow status (Planned → Done → Checked By PL → Completed)
- **Team Management**: Kelola tim proyek dengan role Project Owner, Project Leader, dan Team Members
- **Glossary System**: Definisi istilah dan pengelompokan project detail
- **Progress Tracking**: Monitor progres pekerjaan dengan estimasi waktu dan deadline
- **Permission System**: Sistem permission berbasis role dengan akses terbatas per project team
- **Reporting**: Berbagai laporan untuk monitoring todo, progress, dan deadline
- **Mobile App (PWA)**: Aplikasi mobile modern berbasis React untuk penggunaan harian (lihat di bawah)

## Mobile App (PWA)

Tersedia aplikasi mobile (Progressive Web App) yang bisa di-_install_ ke home
screen, dibangun dengan **React + Vite + Tailwind** dan dilayani Frappe di route
**`/m`**. Dioptimalkan untuk pemakaian harian tim: melihat tugas hari ini,
menjalankan workflow approval dalam 1 tap, antrian review untuk leader, dan
progres proyek — semuanya dari HP.

- Buka di HP: **`https://<site-anda>/m`** lalu pilih *Add to Home Screen*.
- Source: [`frontend/`](frontend) · Backend API: [`vernon_project/api/mobile.py`](vernon_project/api/mobile.py)
- Dokumentasi lengkap (arsitektur, alur UX harian, onboarding): [MOBILE_APP.md](MOBILE_APP.md)

Build:

```bash
cd apps/vernon_project/frontend && npm install && npm run build
bench --site <site> clear-cache && bench restart
```

## Struktur DocTypes

### 1. Project

DocType utama untuk mengelola proyek.

**Fields:**
- `project_name` - Nama proyek (required)
- `naming_series` - Auto-naming: PRJ-.YY..MM.-.#####
- `project_group` - Link ke Project Group (required)
- `customer` - Link ke Customer (required)
- `start_date` - Tanggal mulai proyek (required)
- `deadline` - Deadline proyek (required)
- `status` - Status: Ongoing / Closed (default: Ongoing)
- `project_owner` - PIC utama proyek (required)
- `project_leader` - Leader proyek (required)
- `team_members` - Table: daftar anggota tim
- `goal` - Tujuan proyek

**Business Logic:**
- Start Date harus lebih kecil dari Deadline
- Project Owner dan Project Leader otomatis ditambahkan ke Team Members
- Duplicate team members otomatis dihapus
- Mendukung Calendar dan Gantt view

**File:** [vernon_project/doctype/project/project.py](vernon_project/vernon_project/doctype/project/project.py)

---

### 2. Project Detail

Breakdown detail pekerjaan dalam sebuah proyek.

**Fields:**
- `title` - Judul detail pekerjaan (required)
- `naming_series` - Auto-naming: PD-.{project}.-.#####
- `project` - Link ke Project (required)
- `grouping` - Link ke Glossary untuk pengelompokan (required)
- `glossaries` - Table MultiSelect: glossary terkait
- `current_condition` - Kondisi saat ini (Text Editor)
- `expected_outcome` - Hasil yang diharapkan (Text Editor)
- `todo` - Child Table: Project Todo
- `status` - Status: Pending / Ongoing / Completed
- `is_pending` - Checkbox untuk menandai pending
- `latest_deadline` - Deadline dari project detail
- `latest_todo` - Latest deadline dari todo (calculated)
- `todo_count` - Jumlah todo (calculated)
- `todo_without_estimation` - Jumlah todo tanpa estimasi (calculated)
- `total_estimated` - Total estimasi waktu (calculated)
- `total_remaining_estimated` - Sisa estimasi (calculated)
- `price` - Harga (Currency)
- `discount` - Diskon (Currency)
- `total` - Total = Price - Discount (calculated)
- `keterangan_di_sow` - Keterangan SOW (Text Editor)

**Business Logic:**
- Grouping harus bagian dari Project yang dipilih
- Glossaries harus bagian dari Project yang dipilih
- Price harus ≥ Discount
- Status auto-update berdasarkan todo:
  - `Completed` jika `total_remaining_estimated` = 0 dan ada todo
  - `Pending` jika `is_pending` = 1
  - `Ongoing` untuk kondisi lainnya
- Tidak bisa delete todo yang status bukan "⚪ Planned"
- Tidak bisa delete Project Detail jika masih ada todo yang bukan "⚪ Planned"

**File:** [vernon_project/doctype/project_detail/project_detail.py](vernon_project/vernon_project/doctype/project_detail/project_detail.py)

---

### 3. Project Todo

Child table untuk todo items dalam Project Detail.

**Fields:**
- `ongoing` - Checkbox untuk menandai sedang dikerjakan
- `to_do` - Deskripsi todo (required)
- `assigned_to` - User yang ditugaskan (required)
- `deadline` - Deadline todo (required)
- `estimated` - Estimasi waktu dalam menit (Int)
- `notes` - Catatan (Text Editor)
- `status` - Status workflow (default: ⚪ Planned):
  - ⚪ Planned (belum dikerjakan)
  - 🟠 Done (selesai dikembangkan)
  - 🔷 Checked By PL (sudah dicek Project Leader)
  - ✅ Completed (selesai semua)
- `action` - Button untuk next status
- `developed_at` - Timestamp selesai develop (auto)
- `developed_by` - User yang develop (auto)
- `tested_at` - Timestamp selesai testing (auto)
- `tested_by` - User yang testing (auto)
- `completed_at` - Timestamp completed (auto)
- `completed_by` - User yang complete (auto)

**Business Logic:**
- Ketika status berubah, parent Project Detail akan di-save ulang
- Tidak bisa delete kecuali status = "⚪ Planned"
- Workflow status diatur melalui API

**File:** [vernon_project/doctype/project_todo/project_todo.py](vernon_project/vernon_project/doctype/project_todo/project_todo.py)

---

### 4. Customer

Master data customer/klien.

**Fields:**
- `customer_name` - Nama customer (required, unique)

**Naming:** By fieldname (customer_name)

**File:** [vernon_project/doctype/customer/customer.json](vernon_project/vernon_project/doctype/customer/customer.json)

---

### 5. Glossary

Istilah/terminologi untuk pengelompokan project detail.

**Fields:**
- `glossary` - Nama istilah (required)
- `project` - Link ke Project (required)
- `description` - Deskripsi (Text Editor)

**Naming:** Format: {project}-{glossary}

**File:** [vernon_project/doctype/glossary/glossary.json](vernon_project/vernon_project/doctype/glossary/glossary.json)

---

### 6. Project Group

Pengelompokan proyek dalam struktur tree/hierarki.

**Fields:**
- `project_name` - Nama group (required, unique)
- `is_group` - Checkbox apakah ini folder group
- `parent_project_group` - Parent group (untuk tree structure)
- `lft`, `rgt`, `old_parent` - Fields untuk Nested Set Model

**Features:**
- Tree view (is_tree: true)
- Nested Set Model untuk hierarki

**File:** [vernon_project/doctype/project_group/project_group.json](vernon_project/vernon_project/doctype/project_group/project_group.json)

---

### 7. Project Team

Child table untuk team members di Project.

**Fields:**
- `user` - Link ke User

---

### 8. Project Glossary

Child table MultiSelect untuk glossaries di Project Detail.

**Fields:**
- `glossary` - Link ke Glossary

---

### 9. Scope of Work

DocType untuk mengelola scope of work (belum fully implemented).

---

### 10. Project Proposal

DocType untuk mengelola proposal proyek (belum fully implemented).

## Role & Permissions

### Roles

1. **System Manager**
   - Full access ke semua data
   - Tidak ada batasan permission

2. **Project Owner**
   - Bisa create project
   - Full access ke project yang dia buat atau menjadi team member
   - Bisa approve todo sampai tahap Completed
   - Bisa create/edit/delete Project Detail dan Customer

3. **Project Leader**
   - Read access ke project yang dia assigned sebagai leader atau team member
   - Bisa approve todo sampai tahap "Checked By PL"
   - Bisa create/edit/delete Project Detail

4. **Project Team**
   - Read-only access ke project yang dia menjadi team member
   - Bisa update status todo yang assigned ke dia

### Permission Logic

**Project:**
- User hanya bisa lihat project yang:
  - Dia sebagai project_owner, ATAU
  - Dia ada di team_members

**Project Detail:**
- User hanya bisa lihat project detail yang:
  - Project-nya memenuhi kriteria permission Project

**Project Todo:**
- Permission mengikuti parent (Project Detail)
- Update status melalui API dengan validasi role

## API Endpoints

### 1. Get Project Team Members

Mengambil daftar team members dari sebuah project.

```python
@frappe.whitelist()
def get_project_team_members(project_name)
```

**Parameter:**
- `project_name` (str) - Nama project

**Returns:**
- List of user names

**File:** [vernon_project/api/project.py](vernon_project/api/project.py)

---

### 2. Get Todo Notes

Mengambil notes dari sebuah todo.

```python
@frappe.whitelist()
def get_notes(todo_id)
```

**Parameter:**
- `todo_id` (str) - ID todo

**Returns:**
- `{'notes': '...'}`

**File:** [vernon_project/api/project_todo.py](vernon_project/api/project_todo.py)

---

### 3. Update Todo Status

Update status todo mengikuti workflow dengan validasi permission.

```python
@frappe.whitelist()
def update_status(todo_id)
```

**Parameter:**
- `todo_id` (str) - ID todo

**Workflow:**
1. ⚪ Planned → 🟠 Done (oleh Assigned To / Project Owner / Project Leader)
2. 🟠 Done → 🔷 Checked By PL (oleh Project Owner / Project Leader)
3. 🔷 Checked By PL → ✅ Completed (oleh Project Owner)

**Returns:**
- `{"status": "info|error", "message": "..."}`

**File:** [vernon_project/api/project_todo.py](vernon_project/api/project_todo.py)

---

### 4. Save Todo Notes

Menyimpan notes untuk todo dengan validasi permission.

```python
@frappe.whitelist()
def save_notes(todo_id, notes)
```

**Parameter:**
- `todo_id` (str) - ID todo
- `notes` (str) - Catatan

**Permission:**
- Hanya assigned_to, project_owner, atau project_leader yang bisa save

**Returns:**
- `{"status": "ok|error", "message": "..."}`

**File:** [vernon_project/api/project_todo.py](vernon_project/api/project_todo.py)

## Reports

### 1. Progress Report

Laporan progress todo yang sudah dikerjakan (status bukan 'Scheduled').

**Filters:**
- `project` - Filter by project
- `user` - Filter by assigned user
- `date_range` - Filter by tanggal (developed_at, tested_at, atau completed_at)

**Columns:**
- To Do, Status, Deadline, Assigned To
- Estimated (Hours)
- Developed At/By, Tested At/By, Completed At/By
- Project, Project Detail ID

**File:** [vernon_project/report/progress_report/progress_report.py](vernon_project/vernon_project/report/progress_report/progress_report.py)

---

### 2. Todo Report

Laporan semua todo yang statusnya Ongoing.

**Filters:**
- `project` - Filter by project
- `grouping` - Filter by glossary grouping
- `assigned_to` - Filter by assigned user
- `status` - Filter by project detail status
- `date_range` - Filter by deadline range
- `todo_status` - Filter by todo status

**Columns:**
- To Do, To Do Status, Deadline, Assigned To
- Estimated (minutes)
- Project, Project Detail, Grouping
- SOW Note, Note

**File:** [vernon_project/report/todo_report/todo_report.py](vernon_project/vernon_project/report/todo_report/todo_report.py)

---

### 3. Project Todo Deadline Report

Laporan deadline todo.

**File:** [vernon_project/report/project_todo_deadline_report/](vernon_project/vernon_project/report/project_todo_deadline_report/)

---

### 4. Daily Assignment Report

Laporan assignment harian.

**File:** [vernon_project/report/daily_assignment_report/](vernon_project/vernon_project/report/daily_assignment_report/)

---

### 5. Daily Performance Report

Laporan performance harian.

**File:** [vernon_project/report/daily_performance_report/](vernon_project/vernon_project/report/daily_performance_report/)

## Installation

Anda dapat menginstall aplikasi ini menggunakan [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch develop
bench install-app vernon_project
```

### Install di Site

```bash
bench --site [nama-site] install-app vernon_project
```

### Migrate Database

```bash
bench --site [nama-site] migrate
```

## Panduan Penggunaan

### 1. Setup Awal

1. **Buat Customer**
   - Buka menu Customer
   - Tambahkan customer/klien baru

2. **Buat Project Group** (opsional)
   - Buka menu Project Group
   - Buat struktur folder untuk organisasi project

3. **Buat Glossary**
   - Buka menu Glossary
   - Buat istilah-istilah untuk pengelompokan project detail
   - Setiap glossary terkait dengan satu project

### 2. Membuat Project

1. Buka menu **Project**
2. Klik **New**
3. Isi data:
   - Project Name
   - Project Group
   - Customer
   - Start Date & Deadline
   - Project Owner & Project Leader
   - Team Members (Owner & Leader otomatis ditambahkan)
   - Goal
4. **Save**

### 3. Membuat Project Detail

1. Buka Project yang sudah dibuat
2. Klik link **Project Detail** atau buat baru
3. Isi data:
   - Title
   - Project (auto-filled jika dari link)
   - Grouping (pilih Glossary)
   - Current Condition & Expected Outcome
   - Price & Discount (jika ada)
   - Keterangan SOW
4. **Save**

### 4. Menambahkan Todo

1. Buka Project Detail
2. Di tab **TODO**, tambahkan baris baru:
   - To Do (deskripsi)
   - Assigned To (pilih user dari team)
   - Deadline
   - Estimated (dalam menit)
   - Notes (opsional)
3. Status default: ⚪ Planned
4. **Save**

### 5. Update Status Todo

**Cara 1: Via API (Recommended)**
- Gunakan endpoint `update_status(todo_id)`
- Akan otomatis next ke status berikutnya sesuai permission

**Cara 2: Via Button**
- Klik button **Next** di grid todo
- Sistem akan validasi permission dan update status

**Workflow:**
- Developer klik Next → Status jadi 🟠 Done
- Project Leader review & klik Next → Status jadi 🔷 Checked By PL
- Project Owner final check & klik Next → Status jadi ✅ Completed

### 6. Monitoring Progress

**Melalui Report:**
- **Todo Report**: Lihat semua todo yang sedang ongoing
- **Progress Report**: Lihat history pekerjaan yang sudah selesai
- **Project Todo Deadline Report**: Monitor deadline

**Melalui Project Detail:**
- Lihat statistik:
  - Total Todo
  - Todo without Estimation
  - Total Estimated
  - Total Remaining Estimated
- Status otomatis update ke Completed jika semua todo selesai

## Struktur File

```
vernon_project/
├── vernon_project/
│   ├── __init__.py
│   ├── hooks.py                          # App hooks & configuration
│   ├── api/
│   │   ├── project.py                    # Project APIs
│   │   └── project_todo.py               # Todo APIs
│   ├── utilities/
│   │   └── project.py                    # Utility functions
│   ├── public/
│   │   ├── js/                          # JavaScript files
│   │   └── css/                         # CSS files
│   └── vernon_project/
│       ├── doctype/
│       │   ├── project/                 # Project DocType
│       │   ├── project_detail/          # Project Detail DocType
│       │   ├── project_todo/            # Project Todo DocType
│       │   ├── customer/                # Customer DocType
│       │   ├── glossary/                # Glossary DocType
│       │   ├── project_group/           # Project Group DocType
│       │   ├── project_team/            # Project Team (child)
│       │   ├── project_glossary/        # Project Glossary (child)
│       │   ├── scope_of_work/           # Scope of Work DocType
│       │   └── project_proposal/        # Project Proposal DocType
│       └── report/
│           ├── progress_report/         # Progress Report
│           ├── todo_report/             # Todo Report
│           ├── project_todo_deadline_report/
│           ├── daily_assignment_report/
│           └── daily_performance_report/
├── README.md
├── license.txt
└── pyproject.toml
```

## Contributing

Aplikasi ini menggunakan `pre-commit` untuk code formatting dan linting. Silakan [install pre-commit](https://pre-commit.com/#installation) dan enable untuk repository ini:

```bash
cd apps/vernon_project
pre-commit install
```

Pre-commit dikonfigurasi untuk menggunakan tools berikut:

- **ruff** - Python linter & formatter
- **eslint** - JavaScript linter
- **prettier** - Code formatter
- **pyupgrade** - Python syntax upgrader

### Development Guidelines

1. **Code Style**
   - Python: Ikuti PEP 8, gunakan tabs untuk indentation
   - Line length: 110 characters
   - Use double quotes untuk strings

2. **Naming Conventions**
   - DocTypes: PascalCase
   - Fields: snake_case
   - Functions: snake_case
   - Variables: snake_case

3. **Git Workflow**
   - Buat branch untuk setiap feature
   - Commit message yang jelas dan deskriptif
   - Test sebelum merge ke develop

## Technical Details

**Requirements:**
- Python >= 3.10
- Frappe Framework >= 15.0

**Build System:**
- flit_core >= 3.4, < 4

**App Info:**
- Name: vernon_project
- Title: Vernon Project
- Publisher: Vernon
- Email: help@vernon.id
- Version: 0.0.1

## Changelog

Untuk melihat riwayat perubahan dan update aplikasi, silakan lihat [CHANGELOG.md](CHANGELOG.md).

## License

MIT License

Copyright (c) 2026 Vernon

Lihat [license.txt](license.txt) untuk detail lengkap.

---

**Developed by Vernon** | [help@vernon.id](mailto:help@vernon.id)
