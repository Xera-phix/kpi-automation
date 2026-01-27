"""
KPI Automation - Project Update Helper Functions
================================================
Helper functions for updating project data. Used by Copilot or can be run standalone.

Usage with Copilot:
    Just ask: "Add 5 hours to [task] for [resource]"
    Copilot will edit projects.csv directly and log the change.

Standalone usage:
    python update_project.py --add-hours "Fault Code Reporting Implementation" 5
    python update_project.py --set-percent "PLID Issue VO" 50
    python update_project.py --list
"""

import csv
import os
from datetime import datetime, timedelta
from typing import Optional

# Configuration
PROJECTS_FILE = "projects.csv"
CHANGELOG_FILE = "changelog.md"
HOURS_PER_DAY = 8  # For date recalculation


def load_projects() -> list[dict]:
    """Load all projects from CSV."""
    with open(PROJECTS_FILE, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def save_projects(projects: list[dict]) -> None:
    """Save projects back to CSV."""
    if not projects:
        return
    fieldnames = projects[0].keys()
    with open(PROJECTS_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(projects)


def find_task(
    projects: list[dict], task_query: str, resource_query: Optional[str] = None
) -> Optional[dict]:
    """
    Find a task by name (fuzzy match) and optionally by resource.
    Returns the matching task dict or None.
    """
    task_query_lower = task_query.lower()

    matches = []
    for project in projects:
        task_name = project.get("Task", "").lower()
        resource_name = project.get("Resource", "").lower()

        # Check if query matches task name (substring match)
        if task_query_lower in task_name or task_name in task_query_lower:
            # If resource specified, must also match
            if resource_query:
                if resource_query.lower() in resource_name:
                    matches.append(project)
            else:
                matches.append(project)

    # Return best match (shortest task name that contains query = most specific)
    if matches:
        return min(matches, key=lambda x: len(x.get("Task", "")))
    return None


def recalculate_finish_date(start_date_str: str, total_hours: float) -> str:
    """
    Calculate new finish date based on hours (assumes 8 hours/day).
    """
    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        work_days = total_hours / HOURS_PER_DAY

        # Add work days (skip weekends)
        current_date = start_date
        days_added = 0
        while days_added < work_days:
            current_date += timedelta(days=1)
            # Skip weekends (Saturday=5, Sunday=6)
            if current_date.weekday() < 5:
                days_added += 1

        return current_date.strftime("%Y-%m-%d")
    except Exception:
        return start_date_str


def add_hours(task_name: str, hours: float, resource: Optional[str] = None) -> dict:
    """
    Add hours to a task and recalculate finish date.

    Returns:
        dict with 'success', 'message', 'before', 'after' keys
    """
    projects = load_projects()
    task = find_task(projects, task_name, resource)

    if not task:
        return {
            "success": False,
            "message": f"Task '{task_name}' not found"
            + (f" for {resource}" if resource else ""),
            "before": None,
            "after": None,
        }

    # Store before state
    before = {
        "task": task["Task"],
        "resource": task["Resource"],
        "work_hours": float(task["Work_Hours"]),
        "finish_date": task["Finish_Date"],
        "variance": float(task["Variance"]),
    }

    # Update hours
    new_hours = float(task["Work_Hours"]) + hours
    baseline = float(task["Baseline_Hours"])
    new_variance = new_hours - baseline

    # Recalculate finish date
    new_finish = recalculate_finish_date(task["Start_Date"], new_hours)

    # Apply changes
    task["Work_Hours"] = str(int(new_hours))
    task["Variance"] = str(int(new_variance))
    task["Finish_Date"] = new_finish

    # Store after state
    after = {
        "task": task["Task"],
        "resource": task["Resource"],
        "work_hours": new_hours,
        "finish_date": new_finish,
        "variance": new_variance,
    }

    # Save
    save_projects(projects)

    # Log change
    log_change(
        action="ADD_HOURS",
        task=task["Task"],
        resource=task["Resource"],
        details=f"+{hours}h: {before['work_hours']}h → {after['work_hours']}h, finish: {before['finish_date']} → {after['finish_date']}",
    )

    return {
        "success": True,
        "message": f"Updated {task['Task']}",
        "before": before,
        "after": after,
    }


def set_percent_complete(
    task_name: str, percent: float, resource: Optional[str] = None
) -> dict:
    """
    Set the completion percentage of a task.
    """
    projects = load_projects()
    task = find_task(projects, task_name, resource)

    if not task:
        return {
            "success": False,
            "message": f"Task '{task_name}' not found",
            "before": None,
            "after": None,
        }

    before_percent = task["Percent_Complete"]
    task["Percent_Complete"] = str(int(percent))

    save_projects(projects)

    log_change(
        action="SET_PERCENT",
        task=task["Task"],
        resource=task["Resource"],
        details=f"{before_percent}% → {percent}%",
    )

    return {
        "success": True,
        "message": f"Updated {task['Task']} to {percent}% complete",
        "before": {"percent": before_percent},
        "after": {"percent": percent},
    }


def extend_deadline(
    task_name: str, new_date: str, resource: Optional[str] = None
) -> dict:
    """
    Extend/change the finish date of a task.
    new_date should be in YYYY-MM-DD format.
    """
    projects = load_projects()
    task = find_task(projects, task_name, resource)

    if not task:
        return {
            "success": False,
            "message": f"Task '{task_name}' not found",
            "before": None,
            "after": None,
        }

    before_date = task["Finish_Date"]
    task["Finish_Date"] = new_date

    save_projects(projects)

    log_change(
        action="EXTEND_DEADLINE",
        task=task["Task"],
        resource=task["Resource"],
        details=f"{before_date} → {new_date}",
    )

    return {
        "success": True,
        "message": f"Updated {task['Task']} deadline to {new_date}",
        "before": {"finish_date": before_date},
        "after": {"finish_date": new_date},
    }


def log_change(action: str, task: str, resource: str, details: str) -> None:
    """Append a change to the changelog."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    entry = f"| {timestamp} | {action} | {task} | {resource} | {details} |\n"

    # Create file with header if doesn't exist
    if not os.path.exists(CHANGELOG_FILE):
        with open(CHANGELOG_FILE, "w", encoding="utf-8") as f:
            f.write("# Project Changelog\n\n")
            f.write("| Timestamp | Action | Task | Resource | Details |\n")
            f.write("|-----------|--------|------|----------|--------|\n")

    with open(CHANGELOG_FILE, "a", encoding="utf-8") as f:
        f.write(entry)


def list_tasks() -> None:
    """Print all tasks in a readable format."""
    projects = load_projects()

    print("\n" + "=" * 100)
    print(
        f"{'ID':<5} {'Task':<45} {'Resource':<10} {'Hours':<8} {'Baseline':<10} {'Variance':<10} {'%':<5}"
    )
    print("=" * 100)

    for p in projects:
        variance = int(p["Variance"])
        variance_str = f"+{variance}" if variance > 0 else str(variance)
        print(
            f"{p['ID']:<5} {p['Task']:<45} {p['Resource']:<10} {p['Work_Hours']:<8} {p['Baseline_Hours']:<10} {variance_str:<10} {p['Percent_Complete']:<5}"
        )

    print("=" * 100 + "\n")


def get_summary() -> dict:
    """Get summary statistics."""
    projects = load_projects()

    total_hours = sum(float(p["Work_Hours"]) for p in projects)
    total_baseline = sum(float(p["Baseline_Hours"]) for p in projects)
    total_variance = total_hours - total_baseline

    # By resource
    by_resource = {}
    for p in projects:
        resource = p["Resource"]
        if resource not in by_resource:
            by_resource[resource] = {"hours": 0, "tasks": 0}
        by_resource[resource]["hours"] += float(p["Work_Hours"])
        by_resource[resource]["tasks"] += 1

    return {
        "total_hours": total_hours,
        "total_baseline": total_baseline,
        "total_variance": total_variance,
        "by_resource": by_resource,
        "task_count": len(projects),
    }


# CLI Interface
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="KPI Project Update Tool")
    parser.add_argument("--list", action="store_true", help="List all tasks")
    parser.add_argument(
        "--summary", action="store_true", help="Show summary statistics"
    )
    parser.add_argument(
        "--add-hours", nargs=2, metavar=("TASK", "HOURS"), help="Add hours to a task"
    )
    parser.add_argument(
        "--set-percent",
        nargs=2,
        metavar=("TASK", "PERCENT"),
        help="Set completion percentage",
    )
    parser.add_argument("--resource", type=str, help="Filter by resource name")

    args = parser.parse_args()

    if args.list:
        list_tasks()
    elif args.summary:
        summary = get_summary()
        print(f"\n📊 Project Summary")
        print(f"   Total Tasks: {summary['task_count']}")
        print(f"   Total Hours: {summary['total_hours']:.0f}h")
        print(f"   Baseline: {summary['total_baseline']:.0f}h")
        print(
            f"   Variance: {'+' if summary['total_variance'] > 0 else ''}{summary['total_variance']:.0f}h"
        )
        print(f"\n   By Resource:")
        for resource, data in summary["by_resource"].items():
            print(f"     {resource}: {data['hours']:.0f}h across {data['tasks']} tasks")
    elif args.add_hours:
        task, hours = args.add_hours
        result = add_hours(task, float(hours), args.resource)
        if result["success"]:
            print(f"✅ {result['message']}")
            print(
                f"   Hours: {result['before']['work_hours']}h → {result['after']['work_hours']}h"
            )
            print(
                f"   Finish: {result['before']['finish_date']} → {result['after']['finish_date']}"
            )
        else:
            print(f"❌ {result['message']}")
    elif args.set_percent:
        task, percent = args.set_percent
        result = set_percent_complete(task, float(percent), args.resource)
        if result["success"]:
            print(f"✅ {result['message']}")
        else:
            print(f"❌ {result['message']}")
    else:
        parser.print_help()
