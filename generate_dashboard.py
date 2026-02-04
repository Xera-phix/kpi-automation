"""
KPI Dashboard Generator
=======================
Generates a beautiful HTML dashboard from projects.csv
Run this after making changes to see the updated view.

Usage:
    python generate_dashboard.py          # Generate and open dashboard
    python generate_dashboard.py --watch  # Auto-refresh on file changes
"""

import csv
import os
import sys
import webbrowser
from datetime import datetime
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECTS_FILE = SCRIPT_DIR / "projects.csv"
OUTPUT_FILE = SCRIPT_DIR / "dashboard.html"


def load_projects():
    """Load projects from CSV."""
    projects = []
    with open(PROJECTS_FILE, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            projects.append(row)
    return projects


def format_date(date_str):
    """Format date for display."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.strftime("%b %d")
    except:
        return date_str


def format_hours(hours):
    """Format hours with comma separator."""
    try:
        return f"{int(float(hours)):,}h"
    except:
        return f"{hours}h"


def get_resource_class(resource):
    """Get CSS class for resource badge."""
    return f"resource-{resource.replace(' ', '-')}"


def generate_task_rows(projects):
    """Generate HTML table rows for all tasks."""
    rows = []

    for p in projects:
        task_id = p["ID"]
        task_name = p["Task"]
        resource = p["Resource"]
        work = int(float(p["Work_Hours"]))
        baseline = int(float(p["Baseline_Hours"]))
        variance = int(float(p["Variance"]))
        start = format_date(p["Start_Date"])
        finish = format_date(p["Finish_Date"])
        percent = int(float(p["Percent_Complete"]))
        parent = p.get("Parent_Task", "")

        # Determine if parent task (has children)
        is_parent = any(proj.get("Parent_Task") == task_name for proj in projects)

        # Row classes
        row_class = "parent-task" if is_parent else ""
        task_class = "task-name subtask" if parent else "task-name"

        # Variance styling
        if variance > 0:
            variance_class = "variance positive"
            variance_display = f"+{variance}h"
        elif variance < 0:
            variance_class = "variance negative"
            variance_display = f"{variance}h"
        else:
            variance_class = "variance zero"
            variance_display = "0h"

        # Progress bar styling
        progress_class = "progress-fill complete" if percent == 100 else "progress-fill"

        row = f"""
                    <tr class="{row_class}">
                        <td>{task_id}</td>
                        <td class="{task_class}">{task_name}</td>
                        <td><span class="resource-badge {get_resource_class(resource)}">{resource}</span></td>
                        <td class="hours">{format_hours(work)}</td>
                        <td class="hours">{format_hours(baseline)}</td>
                        <td class="{variance_class}">{variance_display}</td>
                        <td class="date">{start}</td>
                        <td class="date">{finish}</td>
                        <td class="progress-cell">
                            <div class="progress-bar">
                                <div class="{progress_class}" style="width: {percent}%"></div>
                                <span class="progress-text">{percent}%</span>
                            </div>
                        </td>
                    </tr>"""
        rows.append(row)

    return "\n".join(rows)


def calculate_summary(projects):
    """Calculate summary statistics."""
    total_hours = sum(float(p["Work_Hours"]) for p in projects)
    total_baseline = sum(float(p["Baseline_Hours"]) for p in projects)
    variance = total_hours - total_baseline
    total_percent = sum(float(p["Percent_Complete"]) for p in projects)
    avg_percent = total_percent / len(projects) if projects else 0

    # By resource
    by_resource = {}
    for p in projects:
        resource = p["Resource"]
        if resource not in by_resource:
            by_resource[resource] = 0
        by_resource[resource] += float(p["Work_Hours"])

    return {
        "total_tasks": len(projects),
        "total_hours": total_hours,
        "total_baseline": total_baseline,
        "variance": variance,
        "avg_percent": avg_percent,
        "by_resource": by_resource,
    }


def generate_legend(by_resource):
    """Generate resource legend HTML."""
    colors = {
        "Chethan": "#e8f5e9",
        "Umang": "#e3f2fd",
        "Wasim": "#fff3e0",
        "Mengmei": "#fce4ec",
        "Steven": "#f3e5f5",
    }

    items = []
    for resource, hours in sorted(by_resource.items(), key=lambda x: -x[1]):
        color = colors.get(resource, "#f5f5f5")
        items.append(
            f"""
            <div class="legend-item">
                <div class="legend-color" style="background: {color};"></div>
                <span>{resource} ({int(hours):,}h)</span>
            </div>"""
        )

    return "\n".join(items)


def generate_dashboard():
    """Generate the complete dashboard HTML."""
    projects = load_projects()
    summary = calculate_summary(projects)

    variance_class = "warning" if summary["variance"] > 0 else "success"
    variance_sign = "+" if summary["variance"] > 0 else ""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="5">
    <title>KPI Project Tracker - Dashboard</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f0f0f0;
            color: #333;
        }}
        
        .header {{
            background: linear-gradient(135deg, #1a5276 0%, #2980b9 100%);
            color: white;
            padding: 15px 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }}
        
        .header h1 {{
            font-size: 1.5rem;
            font-weight: 500;
        }}
        
        .header .subtitle {{
            font-size: 0.85rem;
            opacity: 0.8;
        }}
        
        .summary-bar {{
            background: white;
            padding: 15px 30px;
            display: flex;
            gap: 40px;
            border-bottom: 1px solid #ddd;
        }}
        
        .metric {{
            text-align: center;
        }}
        
        .metric-value {{
            font-size: 1.8rem;
            font-weight: 600;
            color: #1a5276;
        }}
        
        .metric-value.warning {{
            color: #e74c3c;
        }}
        
        .metric-value.success {{
            color: #27ae60;
        }}
        
        .metric-label {{
            font-size: 0.75rem;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
        }}
        
        .container {{
            padding: 20px 30px;
        }}
        
        .table-container {{
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }}
        
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }}
        
        thead {{
            background: #2c3e50;
            color: white;
        }}
        
        th {{
            padding: 12px 10px;
            text-align: left;
            font-weight: 500;
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 0.5px;
            border-right: 1px solid #34495e;
            position: sticky;
            top: 0;
        }}
        
        th:last-child {{
            border-right: none;
        }}
        
        td {{
            padding: 10px;
            border-bottom: 1px solid #ecf0f1;
            border-right: 1px solid #ecf0f1;
        }}
        
        td:last-child {{
            border-right: none;
        }}
        
        tr:hover {{
            background: #f8f9fa;
        }}
        
        tr.parent-task {{
            background: #eaf2f8;
            font-weight: 600;
        }}
        
        tr.parent-task:hover {{
            background: #d4e6f1;
        }}
        
        .task-name {{
            max-width: 280px;
        }}
        
        .task-name.subtask {{
            padding-left: 25px;
            position: relative;
        }}
        
        .task-name.subtask::before {{
            content: "└";
            position: absolute;
            left: 8px;
            color: #95a5a6;
        }}
        
        .resource-badge {{
            display: inline-block;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }}
        
        .resource-Chethan {{ background: #e8f5e9; color: #2e7d32; }}
        .resource-Umang {{ background: #e3f2fd; color: #1565c0; }}
        .resource-Wasim {{ background: #fff3e0; color: #ef6c00; }}
        .resource-Mengmei {{ background: #fce4ec; color: #c2185b; }}
        .resource-Steven {{ background: #f3e5f5; color: #7b1fa2; }}
        
        .hours {{
            text-align: right;
            font-family: 'Consolas', monospace;
        }}
        
        .variance {{
            text-align: right;
            font-family: 'Consolas', monospace;
            font-weight: 600;
        }}
        
        .variance.positive {{
            color: #e74c3c;
        }}
        
        .variance.negative {{
            color: #27ae60;
        }}
        
        .variance.zero {{
            color: #95a5a6;
        }}
        
        .progress-cell {{
            width: 120px;
        }}
        
        .progress-bar {{
            height: 20px;
            background: #ecf0f1;
            border-radius: 10px;
            overflow: hidden;
            position: relative;
        }}
        
        .progress-fill {{
            height: 100%;
            background: linear-gradient(90deg, #3498db 0%, #2ecc71 100%);
            border-radius: 10px;
            transition: width 0.3s ease;
        }}
        
        .progress-fill.complete {{
            background: linear-gradient(90deg, #27ae60 0%, #2ecc71 100%);
        }}
        
        .progress-text {{
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 10px;
            font-weight: 600;
            color: #333;
        }}
        
        .date {{
            font-family: 'Consolas', monospace;
            font-size: 12px;
            color: #555;
        }}
        
        .legend {{
            display: flex;
            gap: 20px;
            padding: 15px 30px;
            background: white;
            border-top: 1px solid #ddd;
            font-size: 12px;
            flex-wrap: wrap;
        }}
        
        .legend-item {{
            display: flex;
            align-items: center;
            gap: 6px;
        }}
        
        .legend-color {{
            width: 12px;
            height: 12px;
            border-radius: 3px;
        }}
        
        .refresh-time {{
            font-size: 12px;
            color: rgba(255,255,255,0.7);
        }}
        
        .auto-refresh {{
            background: rgba(255,255,255,0.2);
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 11px;
            margin-left: 10px;
        }}
        
        .command-hint {{
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 8px;
            padding: 15px 20px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 15px;
        }}
        
        .command-hint-icon {{
            font-size: 24px;
        }}
        
        .command-hint-text {{
            flex: 1;
        }}
        
        .command-hint-text strong {{
            display: block;
            margin-bottom: 5px;
        }}
        
        .command-hint-text code {{
            background: #fff;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Consolas', monospace;
            font-size: 12px;
        }}
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>📊 KPI Project Tracker</h1>
            <div class="subtitle">Schedule-IKP - Software Development Tracking</div>
        </div>
        <div class="refresh-time">
            Last updated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}
            <span class="auto-refresh">🔄 Auto-refresh ON</span>
        </div>
    </div>
    
    <div class="summary-bar">
        <div class="metric">
            <div class="metric-value">{summary['total_tasks']}</div>
            <div class="metric-label">Total Tasks</div>
        </div>
        <div class="metric">
            <div class="metric-value">{int(summary['total_hours']):,}h</div>
            <div class="metric-label">Total Work</div>
        </div>
        <div class="metric">
            <div class="metric-value">{int(summary['total_baseline']):,}h</div>
            <div class="metric-label">Baseline</div>
        </div>
        <div class="metric">
            <div class="metric-value {variance_class}">{variance_sign}{int(summary['variance']):,}h</div>
            <div class="metric-label">Variance</div>
        </div>
        <div class="metric">
            <div class="metric-value">{int(summary['avg_percent'])}%</div>
            <div class="metric-label">Avg Complete</div>
        </div>
    </div>
    
    <div class="container">
        <div class="command-hint">
            <div class="command-hint-icon">💬</div>
            <div class="command-hint-text">
                <strong>Talk to Copilot to update this dashboard!</strong>
                Try: <code>"Add 5 hours to Fault Code Reporting for Wasim"</code> or <code>"Set PLID Issue to 50% complete"</code>
            </div>
        </div>
        
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th style="width:40px">ID</th>
                        <th>Task Name</th>
                        <th style="width:100px">Resource</th>
                        <th style="width:80px">Work</th>
                        <th style="width:80px">Baseline</th>
                        <th style="width:80px">Variance</th>
                        <th style="width:90px">Start</th>
                        <th style="width:90px">Finish</th>
                        <th style="width:130px">Progress</th>
                    </tr>
                </thead>
                <tbody>
{generate_task_rows(projects)}
                </tbody>
            </table>
        </div>
    </div>
    
    <div class="legend">
{generate_legend(summary['by_resource'])}
        <div style="margin-left: auto; display: flex; gap: 20px;">
            <div class="legend-item">
                <span style="color: #e74c3c; font-weight: 600;">+Red</span>
                <span>= Over budget</span>
            </div>
            <div class="legend-item">
                <span style="color: #27ae60; font-weight: 600;">-Green</span>
                <span>= Under budget</span>
            </div>
        </div>
    </div>
</body>
</html>"""

    return html


def main():
    # Generate dashboard
    html = generate_dashboard()

    # Write to file
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"✅ Dashboard generated: {OUTPUT_FILE}")

    # Open in browser if not in watch mode
    if "--watch" not in sys.argv:
        webbrowser.open(f"file:///{OUTPUT_FILE}")
        print("🌐 Opened in browser")

    # Watch mode
    if "--watch" in sys.argv:
        import time

        print("👀 Watching for changes... (Ctrl+C to stop)")
        last_modified = os.path.getmtime(PROJECTS_FILE)

        while True:
            try:
                time.sleep(1)
                current_modified = os.path.getmtime(PROJECTS_FILE)
                if current_modified != last_modified:
                    print(f"🔄 Change detected, regenerating...")
                    html = generate_dashboard()
                    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                        f.write(html)
                    print(
                        f"✅ Dashboard updated: {datetime.now().strftime('%H:%M:%S')}"
                    )
                    last_modified = current_modified
            except KeyboardInterrupt:
                print("\n👋 Stopped watching")
                break


if __name__ == "__main__":
    main()
