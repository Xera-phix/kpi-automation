# KPI Automation Project Manifest

This document serves as a comprehensive knowledge base for the KPI Automation project. It details the project's history, architecture, current status, and strategic goals to ensure continuity across different devices and AI sessions.

## 1. Project Overview
**Goal:** Create a lightweight, "Minimum Viable Product" (MVP) project tracking dashboard that replaces complex tools like MS Project.
**Core Philosophy:**
- **"Talk to the Code":** The user prefers interacting via natural language prompts (VS Code Copilot) to modify data rather than clicking through heavy GUIs.
- **Simplicity:** No heavy frameworks (Django/Flask/React) unless necessary. Uses Python standard libraries where possible.
- **Portability:** Everything runs locally. Data is stored in plain CSV.
- **Aesthetics:** A "Modern," clean, dark-themed dashboard is preferred over raw data tables.

## 2. Architecture

### Data Layer (Source of Truth)
- **File:** `projects.csv`
- **Schema:** 
  - `ID`: Unique identifier.
  - `Task`, `Resource`: Descriptive fields.
  - `Work_Hours`, `Baseline_Hours`, `Variance`: Quantitative metrics.
  - `Start_Date`, `Finish_Date`: ISO 8601 dates (YYYY-MM-DD).
  - `Percent_Complete`: Integer (0-100).
  - `type` / `Parent_Task`: Metadata for grouping (though currently flat-listed in UI).

### Application Logic (Python)
- **`dashboard_server.py` (The Core):**
  - Runs a local `http.server` on port 8080.
  - **GET**: Serves the interactive "Modern" HTML dashboard with live data from CSV.
  - **POST**: Handles JSON payloads to update specific cells (inline editing) or rows. Auto-calculates variances.
  - **Logging**: Appends all changes to `changelog.md` for audit trails.
- **`update_project.py`:**
  - CLI utility for programmatic updates (e.g., used by Copilot to "add 5 hours to task X").
  - Handles date recalculations and business logic.
- **`generate_dashboard.py`:**
  - Generates a static read-only HTML file (`dashboard.html`) for offline viewing.

### Frontend (Presentation)
- **Technology:** Vanilla HTML5, CSS3, JavaScript (embedded in Python scripts for portability).
- **Style:** Dark mode, card-based layout for summary stats, interactive grid for task list.
- **Features:**
  - Inline editing of cells.
  - Progress bars.
  - "Save" buttons that trigger AJAX POST requests to the Python server.

## 3. Current Status & Capabilities
- **Status:** **Stable / MVP Complete**.
- **Version Control:** Repository initialized and pushed to GitHub (`https://github.com/Xera-phix/kpi-automation`). 
- **Key Features:**
  - ✅ **Visualization:** Modern dashboard renders CSV data correctly.
  - ✅ **Interactivity:** Users can edit rows directly in the browser; changes persist to CSV.
  - ✅ **AI Chat Assistant:** Integrated "Talk to Data" feature using LLM API. Users can type requests like "Add 5 hours to Build 2" directly in the dashboard.
  - ✅ **Audit:** All changes are logged in `changelog.md`.
  - ✅ **AI workflow:** The system is optimized for an AI agent to read `projects.csv` and make updates via `update_project.py` upon user request.

## 4. Conversation History & User Intent
**Evolution:**
1.  **Initial Request:** Wanted an MVP KPI tracker. Considered Streamlit vs. VS Code.
2.  **Pivot:** Decided on VS Code + Copilot. "I just want to talk to you aka my copilot" to manage the project.
3.  **UI Iteration:** The initial CLI output was too raw ("ugly"). We iterated through 3 designs (Simple, Corporate, Modern). The user selected **"Modern"**.
4.  **Feature Add:** Added manual editing capabilities to the dashboard.
5.  **Deployment:** Code pushed to GitHub for syncing across devices.

## 5. Instructions for Future AI Agents
When working on this workspace:
1.  **Data Integrity:** Always treat `projects.csv` as the database. Do not manually edit it if possible; use `update_project.py` or the server logic to ensure consistency.
2.  **Server Management:** The user runs the dashboard via `python dashboard_server.py`. If they ask to "see" the data, check if the server is running or read the CSV.
3.  **Modifications:**
    - If UI changes are needed, edit the HTML string inside `dashboard_server.py`.
    - If Logic changes are needed (e.g., new columns), update `projects.csv` header AND the CSV handling logic in python scripts.
4.  **Commit Protocol:** The user likes to keep things synced. Remind them to push changes to GitHub after significant updates.

## 6. Directory Structure
```
/
├── .git/                 # Git metadata
├── .gitignore            # Ignored files (pycache, etc.)
├── changelog.md          # Audit log of changes
├── dashboard_server.py   # MAIN APP: Web server + UI
├── projects.csv          # MAIN DATA
├── update_project.py     # CLI Logic for AI updates
├── generate_dashboard.py # Static generator (legacy/backup)
└── views/                # Mockups (reference only)
```
