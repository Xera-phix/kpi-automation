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
  - `tasks` table: id, task, resource, work_hours, baseline_hours, variance (computed), start_date, finish_date, percent_complete, task_type, parent_task
  - `changelog` table: timestamp, action, task_name, resource, details
  - `resources` table: name, available_hours_per_day, is_active
- **Migration:** Original `projects.csv` is auto-migrated on first startup.

### Backend (Python/FastAPI)
- **Location:** `backend/`
- **Files:**
  - `main.py` - FastAPI application with REST endpoints
  - `database.py` - SQLite operations, CRUD, S-curve calculations
  - `ai_service.py` - LLM integration (GitHub Models API)
  - `requirements.txt` - Python dependencies
- **Endpoints:**
  - `GET /api/tasks` - List all tasks
  - `PATCH /api/tasks/{id}` - Update a task
  - `GET /api/summary` - Aggregated stats
  - `GET /api/scurve` - S-curve chart data
  - `POST /api/chat` - AI natural language interface

### Frontend (React/Vite)
- **Location:** `frontend/`
- **Files:**
  - `src/App.jsx` - Main React component
  - `src/index.css` - Styles
  - `package.json` - Node dependencies
  - `vite.config.js` - Dev server with API proxy
- **Features:**
  - Inline editable cells (work hours, dates)
  - Progress sliders
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

**Future Goals (User Brainstorm):**
- Task phases (Development, Testing, Review) with % splits
- Resource availability tracking (e.g., "Umang is away for 2 months")
- Auto-adjust S-curve on changes
- Gantt chart visualization
- Tailorable preferences per lead

---

## 6. Instructions for Future AI Agents

1. **Database:** Use SQLite (`kpi_data.db`) via `backend/database.py`. Do NOT manually edit the file.
2. **API First:** All data changes should go through FastAPI endpoints.
3. **Frontend Dev:** Edit `frontend/src/App.jsx` for UI changes. Use `npm run dev` for hot reload.
4. **AI Logic:** Modify prompts in `backend/ai_service.py` to add new capabilities.
5. **Legacy:** The old `dashboard_server.py` still works but is deprecated.

---

## 7. Directory Structure (v2.0)

```
/
├── backend/                  # FastAPI backend
│   ├── main.py               # API endpoints
│   ├── database.py           # SQLite operations
│   ├── ai_service.py         # LLM integration
│   └── requirements.txt      # Python deps
│
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── App.jsx           # Main component
│   │   ├── index.css         # Styles
│   │   └── main.jsx          # Entry point
│   ├── package.json          # Node deps
│   └── vite.config.js        # Vite config
│
├── kpi_data.db               # SQLite database (generated)
├── projects.csv              # Legacy data (for migration)
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

## 8. Tech Stack Comparison

| Aspect | Old (v1) | New (v2) |
|--------|----------|----------|
| Backend | `http.server` | FastAPI |
| Database | CSV file | SQLite |
| Frontend | Embedded HTML strings | React + Vite |
| Updates | Full page reload | Partial re-render |
| Concurrency | File locking issues | SQLite transactions |
| Maintainability | Hard (1100 lines) | Modular files |
