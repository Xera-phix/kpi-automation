"""
Database Layer - SQLite
========================
Replaces CSV with proper database operations.
"""

import sqlite3
from pathlib import Path
from datetime import datetime
from contextlib import contextmanager

DB_PATH = Path(__file__).parent.parent / "kpi_data.db"

HOURS_PER_DAY = 8

# Default phase ratios (can be customized per lead)
DEFAULT_PHASE_RATIOS = {"development": 0.65, "testing": 0.25, "review": 0.10}

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    task TEXT NOT NULL,
    resource TEXT,
    work_hours REAL DEFAULT 0,
    baseline_hours REAL DEFAULT 0,
    variance REAL GENERATED ALWAYS AS (work_hours - baseline_hours) STORED,
    hours_completed REAL DEFAULT 0,
    hours_remaining REAL DEFAULT 0,
    earned_value REAL DEFAULT 0,
    -- Phase breakdown
    dev_hours REAL DEFAULT 0,
    dev_percent REAL DEFAULT 0,
    test_hours REAL DEFAULT 0,
    test_percent REAL DEFAULT 0,
    review_hours REAL DEFAULT 0,
    review_percent REAL DEFAULT 0,
    current_phase TEXT DEFAULT 'development',
    -- Dates
    start_date TEXT,
    finish_date TEXT,
    percent_complete INTEGER DEFAULT 0,
    task_type TEXT DEFAULT 'Fixed Work',
    parent_task TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS changelog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    action TEXT,
    task_name TEXT,
    resource TEXT,
    details TEXT
);

CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    available_hours_per_day REAL DEFAULT 8,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lead_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_name TEXT UNIQUE NOT NULL,
    default_adjustment_mode TEXT DEFAULT 'ask',  -- 'ask', 'phase_only', 'scale_all'
    dev_ratio REAL DEFAULT 0.65,
    test_ratio REAL DEFAULT 0.25,
    review_ratio REAL DEFAULT 0.10
);

CREATE TABLE IF NOT EXISTS pending_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    task_id INTEGER,
    action_type TEXT,  -- 'phase_adjustment', 'resource_shift', etc.
    original_query TEXT,
    options TEXT,  -- JSON array of options
    expires_at TEXT,
    status TEXT DEFAULT 'pending'  -- 'pending', 'executed', 'cancelled'
);

CREATE INDEX IF NOT EXISTS idx_tasks_resource ON tasks(resource);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task);
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_actions(status);
"""


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    """Initialize database with schema."""
    with get_db() as conn:
        conn.executescript(SCHEMA)
        conn.commit()

        # Run migrations for existing databases
        _migrate_schema(conn)
    print(f"Database initialized at {DB_PATH}")


def _migrate_schema(conn):
    """Add missing columns to existing tables."""
    cursor = conn.cursor()

    # Get existing columns in tasks table
    cursor.execute("PRAGMA table_info(tasks)")
    existing_columns = {row[1] for row in cursor.fetchall()}

    # Columns that might be missing from older schemas
    migrations = [
        ("hours_completed", "REAL DEFAULT 0"),
        ("hours_remaining", "REAL DEFAULT 0"),
        ("earned_value", "REAL DEFAULT 0"),
        ("dev_hours", "REAL DEFAULT 0"),
        ("dev_percent", "REAL DEFAULT 0"),
        ("test_hours", "REAL DEFAULT 0"),
        ("test_percent", "REAL DEFAULT 0"),
        ("review_hours", "REAL DEFAULT 0"),
        ("review_percent", "REAL DEFAULT 0"),
        ("current_phase", "TEXT DEFAULT 'development'"),
    ]

    for col_name, col_def in migrations:
        if col_name not in existing_columns:
            try:
                cursor.execute(f"ALTER TABLE tasks ADD COLUMN {col_name} {col_def}")
                print(f"Added column: {col_name}")
            except Exception as e:
                # Column might already exist or other issue
                pass

    conn.commit()


def migrate_from_csv(csv_path: Path):
    """Migrate data from CSV to SQLite with phase breakdown."""
    import csv

    if not csv_path.exists():
        print(f"CSV file not found: {csv_path}")
        return

    with get_db() as conn:
        cursor = conn.cursor()

        # Clear existing data
        cursor.execute("DELETE FROM tasks")

        with open(csv_path, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                work_hours = float(row["Work_Hours"] or 0)
                baseline_hours = float(row["Baseline_Hours"] or 0)

                # Calculate phase hours based on default ratios
                dev_hours = work_hours * DEFAULT_PHASE_RATIOS["development"]
                test_hours = work_hours * DEFAULT_PHASE_RATIOS["testing"]
                review_hours = work_hours * DEFAULT_PHASE_RATIOS["review"]

                cursor.execute(
                    """
                    INSERT INTO tasks (id, task, resource, work_hours, baseline_hours, 
                                       dev_hours, test_hours, review_hours,
                                       start_date, finish_date, percent_complete, task_type, parent_task)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        int(row["ID"]),
                        row["Task"],
                        row["Resource"],
                        work_hours,
                        baseline_hours,
                        round(dev_hours, 1),
                        round(test_hours, 1),
                        round(review_hours, 1),
                        row["Start_Date"],
                        row["Finish_Date"],
                        int(float(row["Percent_Complete"] or 0)),
                        row.get("Type", "Fixed Work"),
                        row.get("Parent_Task", ""),
                    ),
                )

        # Migrate unique resources
        cursor.execute(
            """
            INSERT OR IGNORE INTO resources (name)
            SELECT DISTINCT resource FROM tasks WHERE resource IS NOT NULL AND resource != ''
        """
        )

        # Create default lead preferences for each resource
        cursor.execute(
            """
            INSERT OR IGNORE INTO lead_preferences (resource_name)
            SELECT DISTINCT resource FROM tasks WHERE resource IS NOT NULL AND resource != ''
        """
        )

        conn.commit()
        print(f"Migrated tasks from CSV with phase breakdown")


# === CRUD Operations ===


def get_all_tasks():
    """Get all tasks."""
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM tasks ORDER BY id").fetchall()
        return [dict(row) for row in rows]


def get_task(task_id: int):
    """Get single task by ID."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return dict(row) if row else None


def recalculate_finish_date(start_date_str: str, remaining_hours: float) -> str:
    """Calculate new finish date based on remaining hours."""
    try:
        from datetime import datetime, timedelta

        start = datetime.strptime(start_date_str, "%Y-%m-%d")
        work_days = remaining_hours / HOURS_PER_DAY
        current = datetime.now()
        days_added = 0
        while days_added < work_days:
            current += timedelta(days=1)
            if current.weekday() < 5:  # Skip weekends
                days_added += 1
        return current.strftime("%Y-%m-%d")
    except:
        return start_date_str


def update_task(task_id: int, updates: dict):
    """Update task fields with practical calculations."""
    allowed_fields = {
        "task",
        "resource",
        "work_hours",
        "baseline_hours",
        "start_date",
        "finish_date",
        "percent_complete",
        "task_type",
        "parent_task",
        "hours_completed",
        "hours_remaining",
        "earned_value",
        # Phase-specific fields
        "dev_hours",
        "dev_percent",
        "test_hours",
        "test_percent",
        "review_hours",
        "review_percent",
        "current_phase",
    }

    filtered = {k: v for k, v in updates.items() if k in allowed_fields}
    if not filtered:
        return None

    # Get current task for calculations
    current_task = get_task(task_id)
    if not current_task:
        return None

    work_hours = filtered.get("work_hours", current_task["work_hours"])
    baseline_hours = filtered.get("baseline_hours", current_task["baseline_hours"])
    percent = filtered.get("percent_complete", current_task["percent_complete"])

    # Calculate derived values
    hours_completed = work_hours * (percent / 100.0)
    hours_remaining = work_hours * (1 - percent / 100.0)
    earned_value = baseline_hours * (percent / 100.0)

    # Add calculated fields
    filtered["hours_completed"] = round(hours_completed, 1)
    filtered["hours_remaining"] = round(hours_remaining, 1)
    filtered["earned_value"] = round(earned_value, 1)

    # Recalculate finish date if progress or hours changed
    if "percent_complete" in updates or "work_hours" in updates:
        if hours_remaining > 0:
            new_finish = recalculate_finish_date(
                current_task["start_date"], hours_remaining
            )
            filtered["finish_date"] = new_finish

    set_clause = ", ".join(f"{k} = ?" for k in filtered.keys())
    values = list(filtered.values()) + [task_id]

    with get_db() as conn:
        conn.execute(
            f"UPDATE tasks SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            values,
        )
        conn.commit()

    # After updating subtask, recalculate parent task totals
    updated_task = get_task(task_id)
    if updated_task and updated_task.get("parent_task"):
        update_parent_task_totals(updated_task["parent_task"])

    return get_task(task_id)


def update_parent_task_totals(parent_task_name: str):
    """Recalculate parent task totals based on all subtasks."""
    with get_db() as conn:
        # Get all subtasks for this parent
        subtasks = conn.execute(
            "SELECT * FROM tasks WHERE parent_task = ?", (parent_task_name,)
        ).fetchall()

        if not subtasks:
            return

        subtasks = [dict(row) for row in subtasks]

        # Sum up subtask values
        total_work_hours = sum(t.get("work_hours", 0) or 0 for t in subtasks)
        total_baseline_hours = sum(t.get("baseline_hours", 0) or 0 for t in subtasks)
        total_hours_completed = sum(t.get("hours_completed", 0) or 0 for t in subtasks)
        total_hours_remaining = sum(t.get("hours_remaining", 0) or 0 for t in subtasks)
        total_earned_value = sum(t.get("earned_value", 0) or 0 for t in subtasks)

        # Phase hours
        total_dev_hours = sum(t.get("dev_hours", 0) or 0 for t in subtasks)
        total_test_hours = sum(t.get("test_hours", 0) or 0 for t in subtasks)
        total_review_hours = sum(t.get("review_hours", 0) or 0 for t in subtasks)

        # Calculate overall percent complete (weighted by work_hours)
        if total_work_hours > 0:
            weighted_percent = (
                sum(
                    (t.get("percent_complete", 0) or 0) * (t.get("work_hours", 0) or 0)
                    for t in subtasks
                )
                / total_work_hours
            )
            overall_percent = round(weighted_percent)
        else:
            overall_percent = 0

        # Get earliest start and latest finish from subtasks
        start_dates = [t["start_date"] for t in subtasks if t.get("start_date")]
        finish_dates = [t["finish_date"] for t in subtasks if t.get("finish_date")]
        earliest_start = min(start_dates) if start_dates else None
        latest_finish = max(finish_dates) if finish_dates else None

        # Update the parent task
        conn.execute(
            """UPDATE tasks SET 
                work_hours = ?,
                baseline_hours = ?,
                hours_completed = ?,
                hours_remaining = ?,
                earned_value = ?,
                dev_hours = ?,
                test_hours = ?,
                review_hours = ?,
                percent_complete = ?,
                start_date = COALESCE(?, start_date),
                finish_date = COALESCE(?, finish_date),
                updated_at = CURRENT_TIMESTAMP
            WHERE task = ?""",
            (
                round(total_work_hours, 1),
                round(total_baseline_hours, 1),
                round(total_hours_completed, 1),
                round(total_hours_remaining, 1),
                round(total_earned_value, 1),
                round(total_dev_hours, 1),
                round(total_test_hours, 1),
                round(total_review_hours, 1),
                overall_percent,
                earliest_start,
                latest_finish,
                parent_task_name,
            ),
        )
        conn.commit()


def log_change(action: str, task_name: str, resource: str, details: str):
    """Log a change to the changelog."""
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO changelog (action, task_name, resource, details)
            VALUES (?, ?, ?, ?)
        """,
            (action, task_name, resource, details),
        )
        conn.commit()


def get_changelog(limit: int = 50):
    """Get recent changelog entries."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM changelog ORDER BY timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(row) for row in rows]


def get_resources():
    """Get all resources."""
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM resources WHERE is_active = 1").fetchall()
        return [dict(row) for row in rows]


def get_resource_allocation():
    """
    Get resource allocation data in MS Project style.
    Returns capacity, allocated hours, remaining, completed, and utilization per resource.
    """
    resources = get_resources()
    tasks = get_all_tasks()

    # Calculate project timeline for capacity estimation
    from datetime import datetime

    all_dates = []
    for t in tasks:
        try:
            if t.get("start_date"):
                all_dates.append(datetime.strptime(t["start_date"], "%Y-%m-%d"))
            if t.get("finish_date"):
                all_dates.append(datetime.strptime(t["finish_date"], "%Y-%m-%d"))
        except:
            pass

    if all_dates:
        min_date = min(all_dates)
        max_date = max(all_dates)
        project_days = (max_date - min_date).days + 1
    else:
        project_days = 30  # Default

    result = []
    for r in resources:
        resource_name = r["name"]
        hours_per_day = r.get("available_hours_per_day", 8)

        # Capacity = hours per day * work days in project (assume 5/7 are work days)
        work_days = int(project_days * 5 / 7)
        capacity = hours_per_day * work_days

        # Get all tasks for this resource
        resource_tasks = [t for t in tasks if t.get("resource") == resource_name]

        # Allocation = total work hours assigned to this resource
        allocated = sum(t.get("work_hours", 0) or 0 for t in resource_tasks)
        completed = sum(t.get("hours_completed", 0) or 0 for t in resource_tasks)
        remaining = sum(t.get("hours_remaining", 0) or 0 for t in resource_tasks)

        # Utilization percentage (allocation / capacity)
        utilization = (allocated / capacity * 100) if capacity > 0 else 0

        # Overallocated if utilization > 100%
        overallocated = utilization > 100

        result.append(
            {
                "name": resource_name,
                "capacity": round(capacity, 1),
                "allocated": round(allocated, 1),
                "completed": round(completed, 1),
                "remaining": round(remaining, 1),
                "available": round(max(0, capacity - allocated), 1),
                "utilization": round(utilization, 1),
                "overallocated": overallocated,
            }
        )

    return result


def get_summary():
    """Get aggregated summary statistics with earned value."""
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT 
                COUNT(*) as total_tasks,
                SUM(work_hours) as total_hours,
                SUM(baseline_hours) as total_baseline,
                SUM(work_hours) - SUM(baseline_hours) as total_variance,
                AVG(percent_complete) as avg_percent,
                COALESCE(SUM(hours_completed), 0) as total_completed,
                COALESCE(SUM(hours_remaining), 0) as total_remaining,
                COALESCE(SUM(earned_value), 0) as total_earned_value
            FROM tasks
        """
        ).fetchone()
        return dict(row)


def get_scurve_data():
    """
    Get S-curve data with three lines:
    - Baseline: Planned cumulative baseline_hours
    - Scheduled: Current cumulative work_hours
    - Earned: Cumulative earned value (baseline × percent_complete)

    Uses simple date-based accumulation for clarity.
    """
    from datetime import datetime, timedelta

    tasks = get_all_tasks()
    if not tasks:
        return {"labels": [], "baseline": [], "scheduled": [], "earned": []}

    # Get date range from tasks
    all_dates = []
    for t in tasks:
        try:
            if t.get("start_date"):
                all_dates.append(datetime.strptime(t["start_date"], "%Y-%m-%d"))
            if t.get("finish_date"):
                all_dates.append(datetime.strptime(t["finish_date"], "%Y-%m-%d"))
        except:
            pass

    if not all_dates:
        return {"labels": [], "baseline": [], "scheduled": [], "earned": []}

    min_date = min(all_dates)
    max_date = max(all_dates)
    today = datetime.now()

    # Create weekly timeline points
    timeline = []
    current = min_date
    while current <= max_date:
        timeline.append(current)
        current += timedelta(days=7)

    # Ensure we have at least the end date
    if not timeline or timeline[-1] < max_date:
        timeline.append(max_date)

    # Build cumulative data for each point in timeline
    labels = []
    baseline_data = []
    scheduled_data = []
    earned_data = []

    for point_date in timeline:
        labels.append(point_date.strftime("%b %d"))

        baseline_cum = 0
        scheduled_cum = 0
        earned_cum = 0

        for t in tasks:
            try:
                start = datetime.strptime(t["start_date"], "%Y-%m-%d")
                finish = datetime.strptime(t["finish_date"], "%Y-%m-%d")

                baseline_hours = float(t.get("baseline_hours", 0) or 0)
                work_hours = float(t.get("work_hours", 0) or 0)
                percent = float(t.get("percent_complete", 0) or 0) / 100.0
                earned_value = baseline_hours * percent

                if point_date < start:
                    # Task hasn't started - add nothing
                    continue
                elif point_date >= finish:
                    # Task should be complete - add full planned hours
                    baseline_cum += baseline_hours
                    scheduled_cum += work_hours
                    # Earned value only if this date is in the past
                    if point_date <= today:
                        earned_cum += earned_value
                else:
                    # Task in progress - add proportional amount
                    duration = (finish - start).days or 1
                    elapsed = (point_date - start).days
                    portion = elapsed / duration

                    baseline_cum += baseline_hours * portion
                    scheduled_cum += work_hours * portion
                    # Earned value proportional to actual completion
                    if point_date <= today:
                        earned_cum += earned_value * portion

            except Exception:
                continue

        baseline_data.append(round(baseline_cum, 1))
        scheduled_data.append(round(scheduled_cum, 1))
        earned_data.append(round(earned_cum, 1))

    return {
        "labels": labels,
        "baseline": baseline_data,
        "scheduled": scheduled_data,
        "earned": earned_data,
    }


def get_project_scurve_data(parent_task_name: str):
    """Get S-curve data for a specific project - same logic as main S-curve but filtered."""
    from datetime import datetime, timedelta

    tasks = get_all_tasks()

    # Filter to only this project's tasks
    project_tasks = [
        t
        for t in tasks
        if t["task"] == parent_task_name or t["parent_task"] == parent_task_name
    ]

    if not project_tasks:
        return {
            "labels": [],
            "baseline": [],
            "scheduled": [],
            "earned": [],
            "project": parent_task_name,
        }

    # Get date range
    all_dates = []
    for t in project_tasks:
        try:
            if t.get("start_date"):
                all_dates.append(datetime.strptime(t["start_date"], "%Y-%m-%d"))
            if t.get("finish_date"):
                all_dates.append(datetime.strptime(t["finish_date"], "%Y-%m-%d"))
        except:
            pass

    if not all_dates:
        return {
            "labels": [],
            "baseline": [],
            "scheduled": [],
            "earned": [],
            "project": parent_task_name,
        }

    min_date = min(all_dates)
    max_date = max(all_dates)
    today = datetime.now()

    # Weekly timeline
    timeline = []
    current = min_date
    while current <= max_date:
        timeline.append(current)
        current += timedelta(days=7)
    if not timeline or timeline[-1] < max_date:
        timeline.append(max_date)

    # Build cumulative data
    labels = []
    baseline_data = []
    scheduled_data = []
    earned_data = []

    for point_date in timeline:
        labels.append(point_date.strftime("%b %d"))

        baseline_cum = 0
        scheduled_cum = 0
        earned_cum = 0

        for t in project_tasks:
            try:
                start = datetime.strptime(t["start_date"], "%Y-%m-%d")
                finish = datetime.strptime(t["finish_date"], "%Y-%m-%d")

                baseline_hours = float(t.get("baseline_hours", 0) or 0)
                work_hours = float(t.get("work_hours", 0) or 0)
                percent = float(t.get("percent_complete", 0) or 0) / 100.0
                earned_value = baseline_hours * percent

                if point_date < start:
                    continue
                elif point_date >= finish:
                    baseline_cum += baseline_hours
                    scheduled_cum += work_hours
                    if point_date <= today:
                        earned_cum += earned_value
                else:
                    duration = (finish - start).days or 1
                    elapsed = (point_date - start).days
                    portion = elapsed / duration

                    baseline_cum += baseline_hours * portion
                    scheduled_cum += work_hours * portion
                    if point_date <= today:
                        earned_cum += earned_value * portion

            except Exception:
                continue

        baseline_data.append(round(baseline_cum, 1))
        scheduled_data.append(round(scheduled_cum, 1))
        earned_data.append(round(earned_cum, 1))

    return {
        "labels": labels,
        "baseline": baseline_data,
        "scheduled": scheduled_data,
        "earned": earned_data,
        "project": parent_task_name,
    }


# === Pending Actions (Multi-turn AI) ===


def create_pending_action(
    task_id: int, action_type: str, original_query: str, options: list
) -> int:
    """Create a pending action that needs user confirmation."""
    import json
    from datetime import datetime, timedelta

    expires_at = (datetime.now() + timedelta(minutes=5)).isoformat()

    with get_db() as conn:
        cursor = conn.execute(
            """
            INSERT INTO pending_actions (task_id, action_type, original_query, options, expires_at)
            VALUES (?, ?, ?, ?, ?)
        """,
            (task_id, action_type, original_query, json.dumps(options), expires_at),
        )
        conn.commit()
        return cursor.lastrowid


def get_pending_action(action_id: int):
    """Get a pending action by ID."""
    import json

    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM pending_actions WHERE id = ? AND status = 'pending'",
            (action_id,),
        ).fetchone()
        if row:
            result = dict(row)
            result["options"] = json.loads(result["options"])
            return result
        return None


def execute_pending_action(action_id: int, chosen_option: int):
    """Execute a pending action with the user's choice (1-based option number)."""
    action = get_pending_action(action_id)
    if not action:
        return {"success": False, "message": "Action not found or expired"}

    # Find option by option number (1, 2, 3, 4, 5 etc.)
    option = None
    for opt in action["options"]:
        if opt.get("option") == chosen_option:
            option = opt
            break

    if not option:
        return {"success": False, "message": f"Invalid option: {chosen_option}"}

    # Handle cancel option (last option or label contains "cancel")
    is_cancel = (
        option.get("label", "").lower() == "cancel"
        or "cancel" in option.get("label", "").lower()
        or len(option.get("changes", [])) == 0
        and "cancel" in option.get("description", "").lower()
    )

    if is_cancel:
        with get_db() as conn:
            conn.execute(
                "UPDATE pending_actions SET status = 'cancelled' WHERE id = ?",
                (action_id,),
            )
            conn.commit()
        return {"success": True, "message": "Cancelled - no changes made"}

    changes = option.get("changes", [])

    # Apply the changes
    logs = []
    for change in changes:
        task = get_task(change["id"])
        if task:
            old_val = task.get(change["field"], "?")
            update_task(change["id"], {change["field"]: change["value"]})
            log_change(
                "PHASE_ADJUST",
                task["task"],
                task["resource"],
                f"{change['field']}: {old_val} → {change['value']}",
            )
            logs.append(f"{task['task']}: {change['field']} → {change['value']}")

    # Mark as executed
    with get_db() as conn:
        conn.execute(
            "UPDATE pending_actions SET status = 'executed' WHERE id = ?", (action_id,)
        )
        conn.commit()

    return {"success": True, "logs": logs, "message": option.get("label", "Applied")}


def cancel_pending_action(action_id: int):
    """Cancel a pending action."""
    with get_db() as conn:
        conn.execute(
            "UPDATE pending_actions SET status = 'cancelled' WHERE id = ?", (action_id,)
        )
        conn.commit()


def get_lead_preference(resource_name: str):
    """Get lead preferences for a resource."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM lead_preferences WHERE resource_name = ?", (resource_name,)
        ).fetchone()
        return dict(row) if row else None


def update_lead_preference(resource_name: str, updates: dict):
    """Update lead preferences."""
    allowed = {"default_adjustment_mode", "dev_ratio", "test_ratio", "review_ratio"}
    filtered = {k: v for k, v in updates.items() if k in allowed}

    if not filtered:
        return

    set_clause = ", ".join(f"{k} = ?" for k in filtered.keys())
    values = list(filtered.values()) + [resource_name]

    with get_db() as conn:
        conn.execute(
            f"UPDATE lead_preferences SET {set_clause} WHERE resource_name = ?", values
        )
        conn.commit()


# === Phase-Aware Updates ===


def adjust_task_phase(
    task_id: int, phase: str, hours_delta: float, mode: str = "phase_only"
):
    """
    Adjust a task's phase hours.

    mode:
        - 'phase_only': Add hours to just this phase
        - 'scale_all': Scale all phases proportionally
    """
    task = get_task(task_id)
    if not task:
        return None

    phase_map = {
        "development": "dev_hours",
        "dev": "dev_hours",
        "testing": "test_hours",
        "test": "test_hours",
        "review": "review_hours",
    }

    phase_field = phase_map.get(phase.lower())
    if not phase_field:
        return None

    if mode == "phase_only":
        # Just add to this phase
        new_phase_hours = task[phase_field] + hours_delta
        new_total = task["work_hours"] + hours_delta
        updates = {
            phase_field: round(new_phase_hours, 1),
            "work_hours": round(new_total, 1),
        }
    else:
        # Scale all phases proportionally
        scale_factor = (
            (task["work_hours"] + hours_delta) / task["work_hours"]
            if task["work_hours"] > 0
            else 1
        )
        updates = {
            "dev_hours": round(task["dev_hours"] * scale_factor, 1),
            "test_hours": round(task["test_hours"] * scale_factor, 1),
            "review_hours": round(task["review_hours"] * scale_factor, 1),
            "work_hours": round(task["work_hours"] + hours_delta, 1),
        }

    return update_task(task_id, updates)


if __name__ == "__main__":
    # Run migration
    init_db()
    migrate_from_csv(Path(__file__).parent.parent / "projects.csv")
    print("Migration complete!")
    print(f"Tasks: {len(get_all_tasks())}")
    print(f"Resources: {get_resources()}")
