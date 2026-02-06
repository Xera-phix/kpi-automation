# KPI Automation Dashboard

AI-powered project management dashboard with natural language task updates, S-curve visualization, and resource tracking.

![React](https://img.shields.io/badge/React-18.2-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.109-green) ![Python](https://img.shields.io/badge/Python-3.11-yellow) ![Docker](https://img.shields.io/badge/Docker-Ready-blue)

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- GitHub Token (for AI features)

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Create .env file with your GitHub token
echo "GITHUB_TOKEN=your_token_here" > ../.env

# Start server
uvicorn main:app --host 127.0.0.1 --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Open the App
- **Dashboard:** http://localhost:5173
- **API Docs:** http://localhost:8000/docs

---

## ✨ Features

### 🤖 AI-Powered Chat
Talk to your project data in natural language:
- *"Add 10 hours to Core Development"* → Logs work, updates progress
- *"Set Integration Testing to 50%"* → Direct percentage update
- *"Who's overallocated?"* → Resource analysis
- *"Show tasks over budget"* → Variance analysis

### 📊 S-Curve Visualization
Real-time earned value tracking with three curves:
- **Baseline** (gray): Original plan
- **Scheduled** (blue): Current plan
- **Earned** (green): Actual progress

### 👥 Resource Management
- Capacity vs allocation tracking
- Overallocation warnings
- Utilization percentages

### 📅 Timeline & Gantt (POC)
- Interactive Gantt chart view
- Milestone tracking
- Labor forecast heatmap

### 🔗 Dependencies View (POC)
- Task dependency visualization
- Resource load analysis
- Milestone management

---

## 📁 Project Structure

```
kpi-automation/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── database.py          # SQLite operations, S-curve calculations
│   ├── ai_service.py        # LLM integration, intent handling
│   ├── Dockerfile           # Production container
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main dashboard
│   │   ├── pages/
│   │   │   ├── TimelinePage.jsx    # Gantt POC
│   │   │   └── DependenciesPage.jsx # Dependencies POC
│   │   └── main.jsx         # Router setup
│   ├── Dockerfile           # Multi-stage build
│   └── nginx.conf           # Production proxy
├── docker-compose.yml       # Container orchestration
├── projects.csv             # Initial data seed
└── .env                     # API keys (not committed)
```

---

## 🐳 Docker Deployment

```bash
# Build images
docker-compose build

# Run containers
docker-compose up -d

# Access app
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000

# Stop containers
docker-compose down
```

---

## 💬 AI Chat Commands

| Command | Action | Example |
|---------|--------|---------|
| Add hours | Logs completed work | *"Add 20 hours to Security Audit"* |
| Set percent | Updates completion | *"Set Bug Fix to 80%"* |
| Query status | Returns info | *"What's the status of Core Development?"* |
| Resource check | Analyzes allocation | *"Is anyone overallocated?"* |
| Budget analysis | Variance report | *"Which tasks are over budget?"* |

---

## 📊 Data Model

### Key Fields
| Field | Editable | Description |
|-------|----------|-------------|
| `work_hours` | ✅ | Current planned hours |
| `baseline_hours` | ❌ | Original plan (frozen) |
| `variance` | ❌ | `work_hours - baseline_hours` |
| `percent_complete` | ✅ | 0-100% progress |
| `hours_completed` | ❌ | Auto: `work_hours × %` |
| `hours_remaining` | ❌ | Auto: `work_hours × (1 - %)` |
| `earned_value` | ❌ | Auto: `baseline × %` |
| `finish_date` | ✅ | Auto-adjusts from remaining hours |

### S-Curve Formula
$$\text{SPI} = \frac{\text{Earned Value}}{\text{Planned Value}} = \frac{\sum(B_i \times \%_i)}{\sum B_i}$$

---

## 🔧 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tasks` | GET | All tasks |
| `/api/tasks/{id}` | PUT | Update task |
| `/api/chat` | POST | AI chat interface |
| `/api/scurve` | GET | S-curve data |
| `/api/summary` | GET | Project summary |
| `/api/resources` | GET | Resource list |
| `/api/resource-allocation` | GET | Allocation analysis |
| `/api/timeline` | GET | Gantt data |
| `/api/dependencies` | GET | Task dependencies |
| `/api/milestones` | GET | Project milestones |

---

## �️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite 5, Tailwind CSS v4, Chart.js, Lucide Icons |
| Backend | Python 3.11, FastAPI, SQLite, Uvicorn |
| AI | GPT-4o via GitHub Models API |
| Containerization | Docker, Docker Compose, nginx |

---

## 📝 License

MIT License - See LICENSE for details.
