"""
FastAPI Backend
================
Modern async API replacing http.server.

Run: uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import database
import ai_service

# Initialize
app = FastAPI(
    title="KPI Project Tracker API",
    description="API for managing project tasks with AI assistance",
    version="2.0.0",
)

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# === Models ===


class TaskUpdate(BaseModel):
    task: Optional[str] = None
    resource: Optional[str] = None
    work_hours: Optional[float] = None
    baseline_hours: Optional[float] = None
    start_date: Optional[str] = None
    finish_date: Optional[str] = None
    percent_complete: Optional[int] = None
    task_type: Optional[str] = None
    parent_task: Optional[str] = None
    # Phase fields
    dev_hours: Optional[float] = None
    test_hours: Optional[float] = None
    review_hours: Optional[float] = None
    hours_completed: Optional[float] = None
    hours_remaining: Optional[float] = None


class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str


class ChatRequest(BaseModel):
    query: str
    history: Optional[List[ChatMessage]] = None  # Previous conversation messages


class ConfirmActionRequest(BaseModel):
    action_id: int
    chosen_option: int  # 1, 2, or 3


# === Endpoints ===


@app.get("/")
def root():
    return {"status": "ok", "message": "KPI Tracker API v2.0"}


@app.get("/api/tasks")
def get_tasks():
    """Get all tasks."""
    return database.get_all_tasks()


@app.get("/api/tasks/{task_id}")
def get_task(task_id: int):
    """Get single task."""
    task = database.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, updates: TaskUpdate):
    """Update a task."""
    update_dict = updates.model_dump(exclude_none=True)
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Get old values for logging
    old_task = database.get_task(task_id)
    if not old_task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Apply updates
    result = database.update_task(task_id, update_dict)

    # Log changes
    for field, new_val in update_dict.items():
        old_val = old_task.get(field, "?")
        database.log_change(
            "EDIT",
            old_task["task"],
            old_task["resource"],
            f"{field}: {old_val} → {new_val}",
        )

    return result


@app.get("/api/summary")
def get_summary():
    """Get summary statistics."""
    return database.get_summary()


@app.get("/api/scurve")
def get_scurve():
    """Get S-curve data."""
    return database.get_scurve_data()


@app.get("/api/scurve/{project_name}")
def get_project_scurve(project_name: str):
    """Get S-curve data for a specific project."""
    return database.get_project_scurve_data(project_name)


@app.get("/api/resources")
def get_resources():
    """Get all resources."""
    return database.get_resources()


@app.get("/api/resource-allocation")
def get_resource_allocation():
    """Get MS Project-style resource allocation data with capacity, allocation, and utilization."""
    return database.get_resource_allocation()


@app.get("/api/changelog")
def get_changelog(limit: int = 50):
    """Get recent changelog."""
    return database.get_changelog(limit)


@app.post("/api/chat")
def chat(request: ChatRequest):
    """Process AI chat request."""
    # Convert history to format expected by ai_service
    history = None
    if request.history:
        history = [{"role": m.role, "content": m.content} for m in request.history]

    result = ai_service.chat(request.query, history=history)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("message", "AI error"))
    return result


@app.post("/api/confirm-action")
def confirm_action(request: ConfirmActionRequest):
    """Confirm a pending action with chosen option."""
    result = ai_service.confirm_action(request.action_id, request.chosen_option)
    if not result["success"]:
        raise HTTPException(
            status_code=400, detail=result.get("message", "Failed to execute action")
        )
    return result


# === Timeline / Gantt Endpoints ===


@app.get("/api/timeline")
def get_timeline():
    """Get all timeline/Gantt data (tasks, dependencies, milestones)."""
    return database.get_timeline_data()


@app.get("/api/dependencies")
def get_dependencies():
    """Get all task dependencies."""
    return database.get_all_dependencies()


class DependencyCreate(BaseModel):
    predecessor_id: int
    successor_id: int
    dependency_type: str = "FS"
    lag_days: int = 0


@app.post("/api/dependencies")
def create_dependency(dep: DependencyCreate):
    """Add a dependency between two tasks."""
    result = database.add_dependency(
        dep.predecessor_id, dep.successor_id, dep.dependency_type, dep.lag_days
    )
    if not result:
        raise HTTPException(status_code=404, detail="One or both tasks not found")
    return result


@app.delete("/api/dependencies/{dep_id}")
def delete_dependency(dep_id: int):
    """Remove a dependency."""
    database.remove_dependency(dep_id)
    return {"success": True}


@app.get("/api/milestones")
def get_milestones():
    """Get all milestones."""
    return database.get_all_milestones()


class MilestoneCreate(BaseModel):
    name: str
    date: str
    color: str = "#9333ea"
    description: str = ""


@app.post("/api/milestones")
def create_milestone(ms: MilestoneCreate):
    """Add a milestone."""
    return database.add_milestone(ms.name, ms.date, ms.color, ms.description)


@app.delete("/api/milestones/{milestone_id}")
def delete_milestone(milestone_id: int):
    """Remove a milestone."""
    database.remove_milestone(milestone_id)
    return {"success": True}


@app.get("/api/labor-forecast")
def get_labor_forecast(months: int = 12):
    """Get 12-month labor forecast by resource."""
    return database.get_labor_forecast(months)


@app.get("/api/resource-load")
def get_resource_load(weeks: int = 8):
    """Get weekly resource load for overload detection."""
    return database.get_resource_load(weeks)


# === Startup ===


@app.on_event("startup")
def startup():
    """Initialize database on startup."""
    database.init_db()

    # Auto-migrate if DB is empty but CSV exists
    from pathlib import Path

    csv_path = Path(__file__).parent.parent / "projects.csv"
    if csv_path.exists():
        tasks = database.get_all_tasks()
        if not tasks:
            print("Empty database, migrating from CSV...")
            database.migrate_from_csv(csv_path)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
