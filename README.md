# KPI Automation - Project Hours Tracker

Automate Microsoft Project updates using natural language commands via VS Code Copilot or a Streamlit web app.

## 🚀 Quick Start (VS Code + Copilot)

### 1. View the Project Table

Open `projects.csv` in VS Code. For a better table view, install one of these extensions:
- **Rainbow CSV** (mechatroner.rainbow-csv) - syntax highlighting
- **Excel Viewer** (GrapeCity.gc-excelviewer) - spreadsheet view

### 2. Talk to Copilot

Open Copilot Chat and type natural language commands:

```
"Add 5 hours to Fault Code Reporting for Wasim"

"Mark PLID Issue VO as 75% complete"

"Extend the deadline for Build 2 to 2027-02-15"

"Show me a summary of hours by resource"
```

Copilot will:
1. Show you the proposed changes
2. Wait for your approval
3. Edit the CSV file
4. Log the change to `changelog.md`

### 3. Command Examples

| You Say | What Happens |
|---------|--------------|
| "Wasim needs 8 more hours on Fault Code" | +8h to Work_Hours, recalc finish date, update variance |
| "Set Bug Fixes to 50% complete" | Updates Percent_Complete to 50 |
| "Push Standby Mode deadline to Dec 20" | Changes Finish_Date to 2025-12-20 |
| "What's the total variance?" | Shows summary of hours over/under baseline |
| "List all of Mengmei's tasks" | Filters and displays tasks for Mengmei |

---

## 🖥️ Alternative: Streamlit Web App

A visual web interface with chat is available in `streamlit_app/`.

### Setup
```bash
cd streamlit_app
pip install -r requirements.txt
streamlit run app.py
```

### Features
- Interactive table with color-coded variance (red = over baseline)
- Chat interface for natural language commands
- Change log panel
- Mock AI mode (no API key needed for demo)

---

## 📁 File Structure

```
kpi-automation/
├── projects.csv           # 📊 Main project data (open this!)
├── update_project.py      # 🔧 Helper functions for updates
├── changelog.md           # 📝 Audit trail of all changes
├── README.md              # 📖 This file
└── streamlit_app/         # 🌐 Web interface (Option B)
    ├── app.py
    ├── requirements.txt
    └── sample_data.json
```

---

## 🔧 CLI Usage (Optional)

You can also run commands directly from terminal:

```powershell
# List all tasks
python update_project.py --list

# Show summary
python update_project.py --summary

# Add hours to a task
python update_project.py --add-hours "Fault Code Reporting" 5

# Set completion percentage
python update_project.py --set-percent "PLID Issue" 50

# Filter by resource
python update_project.py --add-hours "Bug Fixes" 10 --resource Chethan
```

---

## 📊 Data Fields

| Column | Description |
|--------|-------------|
| ID | Task ID from MS Project |
| Task | Task name |
| Resource | Assigned team member |
| Work_Hours | Current total work hours |
| Baseline_Hours | Original planned hours |
| Variance | Work - Baseline (+ = over, - = under) |
| Start_Date | Task start date (YYYY-MM-DD) |
| Finish_Date | Task end date (auto-recalculated) |
| Percent_Complete | Completion percentage |
| Type | Fixed Work / Fixed Duration |
| Parent_Task | Parent task for subtasks |

---

## 🔄 Syncing with MS Project

To import changes back to MS Project:
1. Open MS Project
2. File → Open → Select `projects.csv`
3. Follow the import wizard to map columns

To export from MS Project:
1. File → Save As → CSV format
2. Replace `projects.csv` with the new export

---

## 💡 Tips

- **Be specific**: "Add 5 hours to Fault Code Reporting Implementation for Wasim" works better than "add hours to that task"
- **Check changelog**: Review `changelog.md` to see all changes made
- **Backup**: The original baseline hours are preserved; variance shows drift from plan
- **Weekends skipped**: Date calculations skip Saturday/Sunday automatically
