# Smart Attendance Management System
**Institutional Enterprise Platform for Higher Education Colleges & Universities**

Designed and engineered for large higher education institutions (~5,000+ students, 200+ faculty members, 6 academic departments, multiple cohort sections, curriculum credit courses, institutional executive leadership, and registrar administration).

---

## 1. Project Structure

The project is organized strictly inside: `D:\productive\smart_attendance_management\`

```text
smart_attendance_management/
├── backend/
│   ├── apps/
│   │   ├── academic/               # Departments, Sections, Subjects, Faculty Allocations, Class Sessions
│   │   ├── analytics/              # Exception Detection, Department Aggregates, Macro Telemetry, Substitutions
│   │   ├── attendance/             # Attendance Sheets, Corrections Audit Ledger, Biometric Device Punches
│   │   ├── core/                   # Custom User Model, Multi-Tier RBAC Permissions, Global Settings
│   │   └── imports/                # Two-Phase Bulk CSV Ingestion Engine with Staged Previews
│   ├── config/                     # Django Settings, URLs, WSGI, ASGI, SimpleJWT Lifecycle
│   ├── staticfiles/                # WhiteNoise static production assets
│   ├── venv/                       # Dedicated Python 3.10 virtual environment
│   ├── .env                        # Active environment configuration (Neon Cloud PostgreSQL)
│   ├── .env.example                # Template configuration with placeholder credentials
│   ├── Dockerfile                  # Containerized production runtime definition
│   ├── manage.py                   # Django CLI administrative entrypoint
│   ├── Procfile                    # Web & Release worker process definitions (Gunicorn + Migrate)
│   ├── requirements.txt            # Python dependencies
│   └── runtime.txt                 # Target Python engine (python-3.10.11)
│
├── frontend/
│   ├── dist/                       # Optimized production build artifacts
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/              # Admin Control Panel, Directories & Bulk CSV Staging
│   │   │   ├── common/             # Reusable UI primitives: Navbar, StatCard, StatusBadge, Modal, Pagination
│   │   │   ├── faculty/            # Attendance Sheet, Biometric Punch, Counsellor Portal, Audited Corrections
│   │   │   ├── hod/                # HOD Command Center, Section Cards, Dynamic Semesters, Proctor Assignment
│   │   │   ├── landing/            # Institutional Portal Entry & One-Click Role Switcher
│   │   │   ├── principal/          # Executive Institutional Macro KPIs & Biometric Monitoring
│   │   │   ├── student/            # Personal Attendance Gauge, Daily Activity Feed, Interactive Calendar
│   │   │   └── vp/                 # Academic Oversight & 5-Tier Hierarchical Drill-Down Navigator
│   │   ├── context/
│   │   │   └── AuthContext.jsx     # Institutional JWT Session & Role State Provider
│   │   ├── services/
│   │   │   └── api.js              # Centralized Axios Client & Authorization Interceptors
│   │   ├── App.jsx                 # Top-level Routing & Protected Route Guards
│   │   ├── index.css               # Tailwind CSS Layer Directives & Font Smoothing
│   │   └── main.jsx                # React Concurrent DOM Root Mount & StrictMode Wrapper
│   ├── .env.example                # Frontend environment template
│   ├── index.html                  # HTML5 Shell
│   ├── package.json                # Dependencies and build scripts
│   ├── tailwind.config.js          # Exact 6-Color Institutional Palette Configuration
│   ├── vercel.json                 # Single-Page Application (SPA) routing rules for Vercel
│   └── vite.config.js              # Vite bundler configuration
│
├── data/
│   ├── synthetic_faculty_200.csv   # Master onboarding dataset (200 teaching faculty records)
│   └── synthetic_students_5000.csv # Master onboarding dataset (5,000 enrolled student records)
│
├── .gitignore                      # Git exclusion rules for secrets, virtualenvs, and node_modules
├── docker-compose.yml              # Local multi-container orchestration configuration
├── render.yaml                     # Infrastructure-as-code deployment blueprint for Render
└── README.md                       # Comprehensive platform documentation
```

---

## 2. Institutional Role Hierarchy & Access Matrix

| Role | Institutional ID Example | Scope & Responsibility | Daily Class Attendance Submission? |
| :--- | :--- | :--- | :---: |
| **Administration** | `ADM-001`, `ADM-002` | Master data (Depts, Sections, Subjects), User Onboarding, Bulk CSV Engine, System Settings | No |
| **Principal** | `PR001` | College-wide macro oversight, faculty presence, department rankings, executive exceptions | No |
| **Vice Principal** | `VP001` | Academic monitoring, 5-tier drill-down (College → Dept → Sec → Subj → Attendance roster) | No |
| **HOD** | `HOD-CSE-001` | Scoped to Department: faculty allocations, workload, absent faculty substitution, advance semesters, counsellor assignment | No |
| **Faculty** | `FAC-CSE-001` | Assigned classes only: Interactive Attendance Sheet, Audited Corrections with Reason, Biometric log | **Yes** |
| **Student** | `STU-CSE1-0001` | Personal read-only: Overall %, Subject-wise breakdown, daily history, date-picker calendar view, proctor card | No (Read-Only) |

---

## 3. Technology Stack & Database Architecture

- **Backend**: Python 3.10, Django 5.2, Django REST Framework, SimpleJWT (`rest_framework_simplejwt`), WhiteNoise, Gunicorn.
- **Active Database**: Remote **Neon Serverless PostgreSQL** with persistent connection pooling (`conn_max_age=600`, SSL mode required).
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Axios.
- **Institutional Color Palette**:
  - `#AAFFC7` — Pale Mint (Success highlights, present tag)
  - `#78DABE` — Soft Mint Teal (Subtle badges, borders)
  - `#53B4AF` — Bright Teal (KPI accents, charts)
  - `#3F8F99` — Muted Teal (Interactive buttons, icons)
  - `#376A7B` — Deep Cyan Blue (Primary brand action color)
  - `#2F4858` — Deep Slate Navy (Top navigation, headers, dark text)

---

## 4. Uniform Login Credentials & Counsellor Roles

Every account in the institutional database follows a clean, predictable **Uniform Password Format**:

- **All Faculty**: `Faculty@123`
- **All Students**: `Student@123`
- **HODs**: `Hod@123`
- **Administration**: `Admin@123`
- **Principal / Vice Principal**: `Principal@123` / `VP@123`

You can click any role in the landing page switcher to autofill, or enter manually:

| Role | Username / ID | Password | Role Details & Counsellor Status |
| :--- | :--- | :--- | :--- |
| **Administration** | `ADM-001` | `Admin@123` | Institutional Records Administrator |
| **Principal** | `PR001` | `Principal@123` | Dr. K. S. Ramanathan (Executive Campus Oversight) |
| **Vice Principal** | `VP001` | `VP@123` | Dr. Meenakshi Sundaram (Academic Operations VP) |
| **HOD (CSE)** | `HOD-CSE-001` | `Hod@123` | Dr. Rajesh Sharma (Can Assign Counsellors & Advance Semesters) |
| **Faculty (Counsellor)** | `FAC-CSE-001` | `Faculty@123` | Dr. Vikram Singhania (**Designated Proctor for CSE-1**) |
| **Faculty (Teaching)** | `FAC-CSE-005` | `Faculty@123` | Dr. Kunal Nair (**Non-Counsellor Teaching Faculty**) |
| **Student (CSE-1)** | `STU-CSE1-0001` | `Student@123` | Aarav Sharma (CSE-1, Counsellor: Dr. Vikram Singhania) |
| **Student (CSE-3)** | `STU-CSE3-0001` | `Student@123` | Vihaan Joshi (CSE-3, 81.8% Attendance, Counsellor: Prof. Amit Kumar) |

---

## 5. Development & Local Execution

### 1. Backend API Service:
```powershell
cd D:\productive\smart_attendance_management\backend
.\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

### 2. Frontend Development Server:
```powershell
cd D:\productive\smart_attendance_management\frontend
npm run dev
```
Open your browser at: `http://localhost:5173`

### 3. System Health Verification:
```powershell
# Verify Django backend integrity:
cd D:\productive\smart_attendance_management\backend
.\venv\Scripts\python.exe manage.py check

# Verify Frontend production build:
cd D:\productive\smart_attendance_management\frontend
npm run build
```

---

## 6. Production Deployment Options

### Option A: Render / Railway Deployment
1. **Backend**:
   - Build Command: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`
   - Start Command: `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT`
   - Environment Variables:
     - `DATABASE_URL`: Your Neon PostgreSQL connection string.
     - `SECRET_KEY`: Production Django secret key.
     - `DEBUG`: `False`
     - `ALLOWED_HOSTS`: `*`
2. **Frontend (Vercel / Netlify / Render Static Site)**:
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Publish Directory: `dist`
   - Environment Variable: `VITE_API_URL` pointing to your deployed backend API URL (e.g. `https://your-api.onrender.com/api`).

### Option B: Docker Container Deployment
Run the pre-configured multi-container stack:
```bash
docker compose up --build -d
```
