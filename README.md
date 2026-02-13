# KPI Automation Dashboard

AI-powered project management dashboard that replaces manual Microsoft Project updates with natural language commands, real-time S-curve tracking, and resource analytics.

![React](https://img.shields.io/badge/React-18.2-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.109-green) ![Python](https://img.shields.io/badge/Python-3.11-yellow) ![SQLite](https://img.shields.io/badge/SQLite-3-lightgrey) ![Docker](https://img.shields.io/badge/Docker-Ready-blue)

---

## Overview

This is an MVP prototype built to automate KPI tracking for engineering projects. Instead of manually updating MS Project files, team members can type natural language commands like *"Add 10 hours to Core Development"* and the system handles all derived calculations — progress percentages, remaining hours, earned value, and finish date projections.

### What It Does
- **AI Chat Interface** — Talk to your project data. The AI parses intent, validates changes, and updates the database.
- **S-Curve Visualization** — Real-time earned value management with baseline vs scheduled vs actual progress curves.
- **Resource Tracking** — Capacity vs allocation, overallocation warnings, utilization percentages.
- **Task Management** — Hierarchical task table with inline editing, phase breakdowns (dev/test/review), and auto-calculated fields.
- **Timeline & Dependencies (POC)** — Gantt chart, milestone tracking, and task dependency views.

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- GitHub Personal Access Token (for AI chat — needs `models:read` permission)

### 1. Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Create .env in project root with your GitHub token
echo GITHUB_TOKEN=your_token_here > ../.env

uvicorn main:app --host 127.0.0.1 --port 8000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 3. Open
- **Dashboard:** http://localhost:5173
- **API Docs:** http://localhost:8000/docs

On first start, the backend auto-seeds the database from `projects.csv` if the DB is empty.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  React 18 + Vite 5 + Tailwind CSS v4                        │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌──────────────┐ │
│  │ Dashboard │ │ S-Curve  │ │  AI Chat   │ │  Task Table  │ │
│  │ Summary   │ │ Chart.js │ │  Panel     │ │  (editable)  │ │
│  └──────────┘ └──────────┘ └─────┬──────┘ └──────────────┘ │
│  ┌──────────────────┐ ┌──────────┴───────────┐              │
│  │ Timeline/Gantt   │ │ Dependencies View    │              │
│  │ (POC page)       │ │ (POC page)           │              │
│  └──────────────────┘ └──────────────────────┘              │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP (REST API)
┌──────────────────────────┴──────────────────────────────────┐
│                     Backend (FastAPI)                         │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ main.py  │  │ database.py  │  │ ai_service.py          │ │
│  │ 21 API   │  │ SQLite CRUD  │  │ GPT-4o via GitHub      │ │
│  │ endpoints│  │ S-curve calc │  │ Models API             │ │
│  │ CORS     │  │ Phase mgmt   │  │ Intent detection       │ │
│  │ Pydantic │  │ Derived      │  │ Validation             │ │
│  │ models   │  │ field calcs  │  │ Action handling        │ │
│  └──────────┘  └──────┬───────┘  └───────────┬────────────┘ │
│                       │                       │              │
│                  ┌────┴────┐           ┌──────┴──────┐      │
│                  │ SQLite  │           │ GitHub      │      │
│                  │ DB      │           │ Models API  │      │
│                  └─────────┘           │ (GPT-4o)    │      │
│                                        └─────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## How the AI Chat Works

### Flow
```
User Message → Intent Detection → Build Context → GPT-4o (JSON mode) → Validate → Apply Changes → Database
```

1. **User types** a natural language request
2. **Intent detection** classifies the action via keyword matching
3. **Context builder** gathers all tasks, resources, issues, and project state
4. **System prompt** tells GPT-4o the exact schema, rules, and available actions
5. **GPT-4o returns JSON** with a structured action and human-readable reply
6. **Validation** checks field types, ranges, and constraints
7. **Database updated** with cascading derived-field recalculations

### Supported Actions

| Action | Trigger | What It Does |
|--------|---------|--------------|
| `log_hours` | *"Add 10 hours to X"* | Records completed work → updates `percent_complete`, `hours_completed`, `hours_remaining`, `finish_date` |
| `add_hours` | *"Increase budget for X"* | Increases scope (`work_hours`) → rescales phase breakdown |
| `update` | *"Set X to 50%"* | Direct field modification with validation |
| `query` | *"What's the status of X?"* | Returns information, no changes |
| `reassign` | *"Reassign X to Steven"* | Changes task resource |
| `shift_dates` | *"Push X to March 15"* | Reschedules task dates |
| `clarify` | Ambiguous request | Returns options for user to choose |

### Key Design Decisions
- **`log_hours` is the default** when a user says "add hours" — they mean recording completed work, not increasing scope
- **`add_hours` only triggers** when user explicitly says "increase budget" or "allocate more"
- **Auto-calculated fields** (`variance`, `earned_value`, `hours_completed`, `hours_remaining`) are filtered out of AI responses to prevent validation errors
- **Changes are batched by task** — all field updates for a single task go through one `update_task()` call to avoid redundant recalculations

---

## Data Model

### Database: SQLite (`kpi_data.db`)

| Table | Purpose |
|-------|---------|
| `tasks` | All task data (26+ fields per task) |
| `changelog` | Audit trail of every change |
| `resources` | Team members and capacity (40h/week default) |
| `lead_preferences` | Stored user preferences per lead |
| `pending_actions` | Multi-option confirmations (e.g., which phase?) |
| `task_dependencies` | FS/SS/FF/SF relationships with lag |
| `milestones` | Project milestones with dates and colors |

### Task Fields

| Field | Editable | Description |
|-------|----------|-------------|
| `work_hours` | ✅ | Current planned hours (can change) |
| `baseline_hours` | ❌ | Original plan (frozen at project start) |
| `variance` | ❌ | Generated: `work_hours - baseline_hours` |
| `percent_complete` | ✅ | 0–100% overall progress |
| `hours_completed` | ❌ | Derived: `work_hours × percent / 100` |
| `hours_remaining` | ❌ | Derived: `work_hours × (1 - percent / 100)` |
| `earned_value` | ❌ | Derived: `baseline_hours × percent / 100` |
| `finish_date` | ✅ | Auto-adjusts based on remaining hours ÷ 8h/day, skipping weekends |
| `dev_hours` / `test_hours` / `review_hours` | ✅ | Phase breakdown (default ratio: 65/25/10) |
| `dev_percent` / `test_percent` / `review_percent` | ✅ | Phase-level completion |
| `current_phase` | ✅ | `development`, `testing`, or `review` |

### Cascading Calculations
When any task is updated:
1. `hours_completed` and `hours_remaining` recalculated from `work_hours` × `percent_complete`
2. `earned_value` recalculated from `baseline_hours` × `percent_complete`
3. `finish_date` projected from remaining hours ÷ 8h per business day (weekends skipped)
4. If task has subtasks → parent task aggregates from children automatically

---

## S-Curve Generation

The S-curve shows three cumulative lines over a weekly timeline:

| Line | Color | Formula |
|------|-------|---------|
| **Baseline** | Gray | Cumulative `baseline_hours` spread proportionally over each task's duration |
| **Scheduled** | Blue | Cumulative `work_hours` spread proportionally over each task's duration |
| **Earned** | Green | Cumulative `baseline_hours × percent_complete` (only for dates ≤ today) |

**Reading the chart:**
- Baseline = Scheduled → On track to original plan
- Scheduled > Baseline → Scope creep
- Earned < Baseline → Behind schedule (SPI < 1.0)
- Earned ≈ Scheduled → Good execution

$$\text{SPI} = \frac{\text{Earned Value}}{\text{Planned Value}} = \frac{\sum(B_i \times \%_i)}{\sum B_i}$$

---

## API Reference (21 Endpoints)

### Core
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check + version |
| `/api/tasks` | GET | All tasks |
| `/api/tasks/{id}` | PATCH | Update task fields |
| `/api/summary` | GET | Project summary stats |
| `/api/changelog` | GET | Change history (limit param) |

### AI
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Natural language chat (with history) |
| `/api/confirm-action` | POST | Confirm a pending multi-option action |

### Visualization
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scurve` | GET | S-curve data (all projects) |
| `/api/scurve/{name}` | GET | S-curve for specific project |

### Resources
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/resources` | GET | All team members |
| `/api/resource-allocation` | GET | Capacity, utilization, overallocation |
| `/api/labor-forecast` | GET | 12-month labor forecast by resource |
| `/api/resource-load` | GET | Weekly resource load with overload detection |

### Timeline & Dependencies (POC)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/timeline` | GET | Gantt data (tasks + deps + milestones) |
| `/api/dependencies` | GET/POST/DELETE | Task dependency CRUD |
| `/api/milestones` | GET/POST/DELETE | Milestone CRUD |

---

## Project Structure

```
kpi-automation/
├── backend/
│   ├── main.py              # FastAPI app, 21 endpoints, CORS, startup
│   ├── database.py          # SQLite CRUD, S-curve, phase management
│   ├── ai_service.py        # GPT-4o integration, intent handling, validation
│   ├── Dockerfile           # Production container
│   └── requirements.txt     # FastAPI, uvicorn, pydantic
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Dashboard: charts, task table, AI chat
│   │   ├── main.jsx         # React Router setup
│   │   ├── index.css        # Tailwind imports
│   │   └── pages/
│   │       ├── TimelinePage.jsx      # Gantt/timeline POC
│   │       └── DependenciesPage.jsx  # Dependencies POC
│   ├── Dockerfile           # Multi-stage Node → nginx build
│   └── nginx.conf           # Production reverse proxy
├── docker-compose.yml       # Container orchestration
├── projects.csv             # Initial seed data (26 tasks, 4 projects)
├── kpi_data.db              # SQLite database (auto-created)
└── .env                     # GITHUB_TOKEN (not committed)
```

---

## Demo Data

4 projects, 26 tasks, 5 resources:

| Project | Tasks | Budget | Timeline | Status |
|---------|-------|--------|----------|--------|
| Vehicle Control System | 7 (parent + 6 subtasks) | 2,400h | Jun 2025 – Mar 2026 | 35% |
| Fault Monitoring System | 6 (parent + 5 subtasks) | 600h | Aug – Dec 2025 | 45% |
| Cybersecurity Upgrade | 6 (parent + 5 subtasks) | 480h | Sep 2025 – Jan 2026 | 55% |
| Bug Fixes Sprint | 6 (parent + 5 subtasks) | 200h | Oct – Dec 2025 | 70% |

Resources: Steven, Umang, Chethan, Wasim (40h/week capacity each)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite 5, Tailwind CSS v4, Chart.js, react-chartjs-2, Lucide Icons, Radix UI |
| Backend | Python 3.11, FastAPI, Uvicorn, Pydantic |
| Database | SQLite (generated columns, auto-derived fields) |
| AI | GPT-4o via GitHub Models API (`models.inference.ai.azure.com`) |
| Containerization | Docker, Docker Compose, nginx (multi-stage builds) |

---

## Development Progress

| Phase | What Was Built |
|-------|---------------|
| **Phase 1 — CSV + CLI** | Initial `projects.csv` with MS Project data, `update_project.py` CLI tool, `changelog.md` audit trail |
| **Phase 2 — Streamlit** | Web interface with chat, color-coded variance table, mock AI mode |
| **Phase 3 — React + FastAPI** | Full rewrite: React 18 dashboard, FastAPI backend, SQLite database, proper REST API |
| **Phase 4 — AI Integration** | GPT-4o integration via GitHub Models, natural language → structured JSON → validated database updates |
| **Phase 5 — S-Curve & Charts** | Earned value S-curve (baseline/scheduled/earned), resource workload bars, phase breakdown doughnut |
| **Phase 6 — AI Fixes** | Fixed `log_hours` vs `add_hours` distinction, date parsing for both formats, batched `apply_changes`, auto-field filtering |
| **Phase 7 — POC Pages** | Timeline/Gantt page, Dependencies page, milestone/dependency seeding, navigation links |
| **Phase 8 — Docker & Demo** | Dockerfiles for backend/frontend, docker-compose orchestration, clean demo data, production-ready images |
