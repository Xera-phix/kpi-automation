# KPI Automation Project Manifest

This document serves as a comprehensive knowledge base for the KPI Automation project. It details the project's history, architecture, current status, and strategic goals to ensure continuity across different devices and AI sessions.

---

## 1. Project Overview

**Goal:** Create a project tracking dashboard that replaces complex tools like MS Project, with AI-powered natural language updates.

**Core Philosophy:**
- **"Talk to the Data":** Users interact via natural language prompts to modify data (e.g., "Add 20 hours to Build 2").
- **Modern Stack:** FastAPI backend + React frontend + SQLite database.
- **Real-time Updates:** No full page reloads; only affected cells update.
- **Local-First:** Everything runs locally, with option to deploy later.

---

## 2. Architecture (v2.0)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ARCHITECTURE v2.0                               │
└─────────────────────────────────────────────────────────────────────────────┘

  BROWSER (React)              BACKEND (FastAPI)              DATABASE (SQLite)
        │                            │                              │
        │  GET /api/tasks            │                              │
        ├───────────────────────────►│  SELECT * FROM tasks         │
        │                            ├─────────────────────────────►│
        │  JSON [{task}, ...]        │◄─────────────────────────────┤
        │◄───────────────────────────┤                              │
        │                            │                              │
        │  PATCH /api/tasks/104      │                              │
        │  {work_hours: 1862}        │  UPDATE tasks SET...         │
        ├───────────────────────────►├─────────────────────────────►│
        │                            │                              │
        │  setState(tasks[104])      │  (Partial update only)       │
        │  ← Only row 104 re-renders │                              │
        │                            │                              │
        │  POST /api/chat            │                              │
        │  {query: "Add 20h..."}     │  → LLM API → Parse JSON      │
        ├───────────────────────────►│  → UPDATE multiple rows      │
        │                            ├─────────────────────────────►│
        │  {reply, changes_count}    │                              │
        │◄───────────────────────────┤                              │
```

### Data Layer
- **Database:** `kpi_data.db` (SQLite)
- **Schema:**
  - `tasks` table: id, task, resource, work_hours, baseline_hours, variance (computed), start_date, finish_date, percent_complete, task_type, parent_task, dev_hours, test_hours, review_hours, hours_completed, hours_remaining, earned_value
  - `changelog` table: timestamp, action, task_name, resource, details
  - `resources` table: name, available_hours_per_day, is_active
  - `pending_actions` table: id, task_id, action_type, options (JSON), created_at
  - `lead_preferences` table: lead_name, phase_default_distribution, updated_at
- **Migration:** Original `projects.csv` is auto-migrated on first startup. Existing databases auto-migrate with `_migrate_schema()` to add new columns.

### Backend (Python/FastAPI)
- **Location:** `backend/`
- **Files:**
  - `main.py` - FastAPI application with REST endpoints
  - `database.py` - SQLite operations, CRUD, S-curve calculations, phase management
  - `ai_service.py` - LLM integration (GitHub Models API) with multi-turn conversation support
  - `requirements.txt` - Python dependencies
- **Endpoints:**
  - `GET /api/tasks` - List all tasks
  - `PATCH /api/tasks/{id}` - Update a task (includes phase fields: dev_hours, test_hours, review_hours)
  - `GET /api/summary` - Aggregated stats
  - `GET /api/scurve` - S-curve chart data (cumulative baseline vs actual hours)
  - `GET /api/scurve/{project_name}` - Per-project S-curve data
  - `POST /api/chat` - AI natural language interface with multi-turn support
  - `POST /api/confirm-action` - Confirm multi-turn AI clarification options
  - `GET /api/resources` - Resource availability and hours
  - `GET /api/changelog` - Audit trail of all changes
- **AI Features:**
  - Phase-aware detection: Recognizes "dev"/"test"/"review" keywords
  - Multi-turn confirmations: Generates A/B/C options for user to choose from
  - Intelligent adjustments: Can scale entire phase or adjust individual components

### Frontend (React/Vite)
- **Location:** `frontend/`
- **Files:**
  - `src/App.jsx` - Main React component with state management and chart rendering
  - `src/index.css` - Dark-themed dashboard styles with responsive layout
  - `package.json` - Node dependencies (includes Chart.js)
  - `vite.config.js` - Dev server with API proxy
- **Features:**
  - **Inline Editing:** Editable cells for work hours, dates, percent complete
  - **Animated Progress Bars:** Color-coded bars (yellow <50%, blue 50-99%, green 100%) with smooth animations
  - **AI Chat Interface:** Multi-turn conversation with pending action buttons for confirmations
  - **Analytics Dashboard:** 
    - **S-Curves:** Overall and per-project cumulative hours (baseline vs actual)
    - **Resource Workload:** Stacked bar chart showing hours distribution by resource
    - **Phase Breakdown:** Doughnut chart showing dev/test/review split for selected task
  - **Project Selector:** Filter charts by parent task/project
  - **Real-time Updates:** No full page reloads; only affected cells/charts update
  - Resource dropdowns
  - S-Curve chart (Chart.js)
  - AI Chat widget

---

## 3. Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| SQLite Database | ✅ Complete | Auto-migration from CSV, phase columns |
| FastAPI Backend | ✅ Complete | REST API + AI endpoint + confirm actions |
| React Frontend | ✅ Complete | Table, chat, charts, confirmation UI |
| AI Integration | ✅ Complete | GitHub Models (gpt-4o) with multi-turn |
| Phase-Aware AI | ✅ Complete | Detects dev/test/review queries, asks clarification |
| Legacy (dashboard_server.py) | ⚠️ Deprecated | Still works, but use new stack |

---

## 3.1. Phase-Aware AI Feature

The AI now supports **multi-turn conversations** for phase-specific adjustments:

**Example Flow:**
```
User: "Build 2 development is taking 20 hours longer"

AI: 📋 Build 2 Development needs +20h. How should I adjust?
    [1] Add 20h to Development only (Dev: 0h → 20h | Total: 1862h → 1882h)
    [2] Scale all phases by +1.1% (Dev: 20.2h | Test: 0h | Review: 0h)
    [3] Cancel

User clicks option 1 → Changes applied
```

**Database Schema (new columns):**
- `dev_hours`, `test_hours`, `review_hours` - Phase breakdown
- `hours_completed`, `hours_remaining`, `earned_value` - Calculated fields
- `pending_actions` table - Stores options until user confirms
- `lead_preferences` table - Per-resource default behavior

---

## 4. Quick Start

### Backend
```powershell
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```powershell
cd frontend
npm install
npm run dev
```

Then open: **http://localhost:5173**

---

## 5. User Intent & History

**Evolution:**
1. **MVP Request:** Started with Python `http.server` + CSV + embedded HTML
2. **UI Iteration:** Moved from raw tables → "Modern" dark-themed dashboard
3. **AI Chat:** Added natural language interface for updates
4. **Stack Upgrade:** Migrated to FastAPI + SQLite + React for maintainability
5. **Phase-Based Tasks:** Implemented dev/test/review hour splitting with AI-guided adjustments
6. **Visualizations:** Added animated progress bars, S-curves, resource workload, phase breakdown charts

**Features Implemented:**
✅ AI Chat Copilot with GitHub Models (gpt-4o)  
✅ Multi-turn phase-aware confirmations (A/B/C options)  
✅ Practical hour calculations (hours_completed, hours_remaining, earned_value)  
✅ Animated progress bars with color coding  
✅ S-curve visualizations (overall + per-project)  
✅ Resource workload bar charts  
✅ Phase breakdown donut charts  
✅ Real-time dashboard updates  

**Remaining Goals:**
- Gantt chart visualization
- Task dependencies
- Resource availability calendar
- Export to PDF/Excel
- Team collaboration features
- Production deployment
- Resource availability tracking (e.g., "Umang is away for 2 months")
- Tailorable preferences per lead

---

## 6. AI Chat Copilot Architecture

### How Multi-Turn Confirmations Work

1. **User Request:** "Build 2 development is taking 20 hours longer"
2. **Backend Detection:**
   - `detect_phase_adjustment()` parses for phase keywords (dev/test/review)
   - Extracts hours delta from natural language
   - Identifies affected task and phase
3. **Option Generation:**
   - `create_phase_adjustment_options()` creates 3 proposals:
     - **Option A:** Add hours to development phase only
     - **Option B:** Scale all phases proportionally
     - **Option C:** Cancel operation
4. **User Choice:**
   - Frontend displays buttons for each option
   - User clicks one button to confirm
   - Backend executes `execute_pending_action()` with chosen option
5. **Task Update:**
   - Task record updated with new hours
   - Changelog entry recorded
   - All connected charts and progress bars re-render

### GitHub Models Integration
- **Model:** gpt-4o via GitHub Models API
- **Environment:** GitHub token stored in `.env` as `GITHUB_TOKEN`
- **Prompt Strategy:** 
  - General queries routed to LLM for free-form responses
  - Phase adjustments handled by multi-turn confirmation flow
  - JSON response format for structured data extraction

---

## 7. Instructions for Future AI Agents

1. **Database:** Use SQLite (`kpi_data.db`) via `backend/database.py`. Do NOT manually edit the file.
2. **API First:** All data changes should go through FastAPI endpoints.
3. **Frontend Dev:** Edit `frontend/src/App.jsx` for UI changes. Use `npm run dev` for hot reload.
4. **AI Logic:** Modify prompts in `backend/ai_service.py` to add new capabilities.
5. **Phase Adjustments:** Always use multi-turn confirmation flow for dev/test/review hour changes.
6. **Legacy:** The old `dashboard_server.py` still works but is deprecated.

---

## 8. Directory Structure (v2.0)

```
/
├── backend/                  # FastAPI backend
│   ├── main.py               # API endpoints
│   ├── database.py           # SQLite ops + S-curve + phases
│   ├── ai_service.py         # LLM + multi-turn logic
│   └── requirements.txt      # Python deps (fastapi, httpx, etc)
│
├── frontend/                 # React + Vite
│   ├── src/
│   │   ├── App.jsx           # Main component + charts
│   │   ├── index.css         # Dark theme + animations
│   │   └── main.jsx          # Entry point
│   ├── package.json          # Node deps (react, vite, chart.js)
│   └── vite.config.js        # Proxy to :8000
│
├── kpi_data.db               # SQLite database (auto-created)
├── projects.csv              # Legacy data (auto-migrated)
├── .env                      # API keys (gitignored)
├── changelog.md              # Audit log
├── PROJECT_MANIFEST.md       # This file
│
└── [Legacy - Deprecated]
    ├── dashboard_server.py   # Old monolithic server
    ├── update_project.py     # Old CLI tool
    └── generate_dashboard.py # Old static generator
```

---

## 9. Tech Stack Comparison

| Aspect | Old (v1) | New (v2) |
|--------|----------|----------|
| Backend | `http.server` | FastAPI |
| Database | CSV file | SQLite |
| Frontend | Embedded HTML strings | React + Vite |
| Updates | Full page reload | Partial re-render |
| Concurrency | File locking issues | SQLite transactions |
| Maintainability | Hard (1100 lines) | Modular files |
| AI Features | None | GitHub Models + multi-turn confirmations |
| Visualizations | None | S-curves, charts, animated progress |
| Phase Management | None | Dev/test/review splitting |
| Real-time Charts | None | Chart.js with live updates |

---

## 10. Configuration

### Environment Variables (.env)
```
GITHUB_TOKEN=ghp_xxxxxxxxxxxx  # GitHub Models API key
```

### Phase Distribution (Default: 65/25/10)
- **Development:** 65% of estimated work_hours
- **Testing:** 25% of estimated work_hours
- **Review:** 10% of estimated work_hours

Can be customized per lead via `lead_preferences` table.
