"""
KPI Dashboard Server
====================
Interactive dashboard with inline editing.
Changes sync back to projects.csv automatically.

Usage:
    python dashboard_server.py

Then open: http://localhost:8080
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import csv
import os
import webbrowser
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs
import urllib.request
import urllib.error
import threading

# Configuration
PORT = 8080
SCRIPT_DIR = Path(__file__).parent
PROJECTS_FILE = SCRIPT_DIR / "projects.csv"
CHANGELOG_FILE = SCRIPT_DIR / "changelog.md"
HOURS_PER_DAY = 8

# Load environment variables
if (SCRIPT_DIR / ".env").exists():
    with open(SCRIPT_DIR / ".env", "r") as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ[k] = v


def load_projects():
    """Load projects from CSV."""
    projects = []
    with open(PROJECTS_FILE, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            projects.append(row)
    return projects


def save_projects(projects):
    """Save projects back to CSV."""
    if not projects:
        return
    fieldnames = projects[0].keys()
    with open(PROJECTS_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(projects)


def log_change(action, task, resource, details):
    """Append to changelog."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"| {timestamp} | {action} | {task} | {resource} | {details} |\n"

    if not os.path.exists(CHANGELOG_FILE):
        with open(CHANGELOG_FILE, "w", encoding="utf-8") as f:
            f.write("# Project Changelog\n\n")
            f.write("| Timestamp | Action | Task | Resource | Details |\n")
            f.write("|-----------|--------|------|----------|--------|\n")

    with open(CHANGELOG_FILE, "a", encoding="utf-8") as f:
        f.write(entry)


def recalculate_finish_date(start_date_str, total_hours):
    """Calculate finish date based on hours."""
    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        work_days = total_hours / HOURS_PER_DAY
        current_date = start_date
        days_added = 0
        while days_added < work_days:
            current_date += timedelta(days=1)
            if current_date.weekday() < 5:
                days_added += 1
        return current_date.strftime("%Y-%m-%d")
    except:
        return start_date_str


def process_ai_request(query):
    """Send query to LLM and get update instructions."""
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return {"success": False, "message": "❌ API Key missing in .env"}

    projects = load_projects()

    # Context for the AI
    context = "Current Project State (CSV):\nID,Task,Resource,Work_Hours,Percent_Complete,Finish_Date\n"
    for p in projects:
        context += f"{p['ID']},{p['Task']},{p['Resource']},{p['Work_Hours']},{p['Percent_Complete']},{p['Finish_Date']}\n"

    system_prompt = f"""You are a Project Management AI Assistant.
    You manage the following dataset:
    {context}
    
    User Query: "{query}"
    
    YOUR GOAL:
    Determine what changes to make to the CSV based on the query.
    1. If the user wants to update data (e.g. "Add 5 hours to Build 2"), allow it. Calculate the NEW absolute value.
    2. Return a JSON object with a "changes" list.
    
    Output Format (JSON ONLY):
    {{
        "reply": "Short text response to user",
        "changes": [
            {{ "id": "104", "field": "Work_Hours", "value": "1847" }},
            {{ "id": "104", "field": "Finish_Date", "value": "2027-01-23" }}
        ]
    }}
    
    Valid fields: Task, Resource, Work_Hours, Start_Date, Finish_Date, Percent_Complete.
    Calculate Finish_Date updates if Work_Hours changes (approx 8h/day).
    Do not include markdown formatting.
    """

    try:
        url = "https://models.inference.ai.azure.com/chat/completions"
        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": "You are a helpful assistant that outputs JSON.",
                },
                {"role": "user", "content": system_prompt},
            ],
            "model": "gpt-4o",
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
        )

        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode())
            ai_content = result["choices"][0]["message"]["content"]
            parsed = json.loads(ai_content)
            return {"success": True, "data": parsed}

    except Exception as e:
        return {"success": False, "message": f"AI Error: {str(e)}"}


def apply_ai_updates(changes):
    """Apply list of changes from AI."""
    projects = load_projects()
    logs = []

    for change in changes:
        t_id = change["id"]
        field = change["field"]
        val = str(change["value"])

        for p in projects:
            if p["ID"] == str(t_id):
                old = p.get(field, "?")
                p[field] = val

                # Recalc variance if needed
                if field == "Work_Hours":
                    try:
                        p["Variance"] = str(
                            int(float(val) - float(p["Baseline_Hours"]))
                        )
                    except:
                        pass

                logs.append(f"AI: {p['Task']} {field} {old}->{val}")
                log_change(
                    "AI_EDIT", p["Task"], p["Resource"], f"{field}: {old} -> {val}"
                )

    save_projects(projects)
    return logs


def generate_dashboard_html():
    """Generate the interactive dashboard HTML."""
    projects = load_projects()

    # Calculate summary
    total_hours = sum(float(p["Work_Hours"]) for p in projects)
    total_baseline = sum(float(p["Baseline_Hours"]) for p in projects)
    variance = total_hours - total_baseline
    avg_percent = (
        sum(float(p["Percent_Complete"]) for p in projects) / len(projects)
        if projects
        else 0
    )

    variance_class = "warning" if variance > 0 else "success"
    variance_sign = "+" if variance > 0 else ""

    # Generate table rows
    rows_html = ""
    for p in projects:
        task_id = p["ID"]
        task_name = p["Task"]
        resource = p["Resource"]
        work = int(float(p["Work_Hours"]))
        baseline = int(float(p["Baseline_Hours"]))
        var = int(float(p["Variance"]))
        start = p["Start_Date"]
        finish = p["Finish_Date"]
        percent = int(float(p["Percent_Complete"]))
        parent = p.get("Parent_Task", "")

        is_parent = any(proj.get("Parent_Task") == task_name for proj in projects)
        row_class = "parent-task" if is_parent else ""
        task_class = "task-name subtask" if parent else "task-name"

        if var > 0:
            var_class = "variance positive"
            var_display = f"+{var}"
        elif var < 0:
            var_class = "variance negative"
            var_display = str(var)
        else:
            var_class = "variance zero"
            var_display = "0"

        rows_html += f"""
                    <tr class="{row_class}" data-id="{task_id}">
                        <td>{task_id}</td>
                        <td class="{task_class}">{task_name}</td>
                        <td>
                            <select class="resource-select" data-field="Resource" data-id="{task_id}">
                                <option {"selected" if resource == "Chethan" else ""}>Chethan</option>
                                <option {"selected" if resource == "Umang" else ""}>Umang</option>
                                <option {"selected" if resource == "Wasim" else ""}>Wasim</option>
                                <option {"selected" if resource == "Mengmei" else ""}>Mengmei</option>
                                <option {"selected" if resource == "Steven" else ""}>Steven</option>
                            </select>
                        </td>
                        <td class="hours editable" data-field="Work_Hours" data-id="{task_id}" contenteditable="true">{work}</td>
                        <td class="hours">{baseline}</td>
                        <td class="{var_class}">{var_display}</td>
                        <td class="date">{start}</td>
                        <td class="date editable" data-field="Finish_Date" data-id="{task_id}" contenteditable="true">{finish}</td>
                        <td class="progress-cell">
                            <div class="progress-container">
                                <input type="range" min="0" max="100" value="{percent}" 
                                       class="progress-slider" data-field="Percent_Complete" data-id="{task_id}">
                                <span class="progress-value">{percent}%</span>
                            </div>
                        </td>
                    </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KPI Project Tracker - Interactive Dashboard</title>
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
        
        .metric-value.warning {{ color: #e74c3c; }}
        .metric-value.success {{ color: #27ae60; }}
        
        .metric-label {{
            font-size: 0.75rem;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
        }}
        
        .container {{
            padding: 20px 30px;
        }}
        
        .toolbar {{
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
            align-items: center;
        }}
        
        .toolbar button {{
            padding: 8px 16px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
        }}
        
        .btn-primary {{
            background: #3498db;
            color: white;
        }}
        
        .btn-primary:hover {{
            background: #2980b9;
        }}
        
        .btn-success {{
            background: #27ae60;
            color: white;
        }}
        
        .btn-success:hover {{
            background: #1e8449;
        }}
        
        .status-message {{
            margin-left: auto;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            opacity: 0;
            transition: opacity 0.3s;
        }}
        
        .status-message.show {{
            opacity: 1;
        }}
        
        .status-message.success {{
            background: #d4edda;
            color: #155724;
        }}
        
        .status-message.error {{
            background: #f8d7da;
            color: #721c24;
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
        }}
        
        th:last-child {{ border-right: none; }}
        
        td {{
            padding: 10px;
            border-bottom: 1px solid #ecf0f1;
            border-right: 1px solid #ecf0f1;
        }}
        
        td:last-child {{ border-right: none; }}
        
        tr:hover {{ background: #f8f9fa; }}
        
        tr.parent-task {{
            background: #eaf2f8;
            font-weight: 600;
        }}
        
        tr.parent-task:hover {{ background: #d4e6f1; }}
        
        .task-name {{ max-width: 280px; }}
        
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
        
        /* Editable cells */
        .editable {{
            cursor: pointer;
            position: relative;
        }}
        
        .editable:hover {{
            background: #fff3cd !important;
        }}
        
        .editable:focus {{
            background: #fff !important;
            outline: 2px solid #3498db;
            outline-offset: -2px;
        }}
        
        .editable.modified {{
            background: #d4edda !important;
        }}
        
        /* Resource dropdown */
        .resource-select {{
            padding: 4px 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 12px;
            background: white;
            cursor: pointer;
        }}
        
        .resource-select:hover {{
            border-color: #3498db;
        }}
        
        /* Progress slider */
        .progress-container {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        
        .progress-slider {{
            width: 80px;
            cursor: pointer;
        }}
        
        .progress-value {{
            font-size: 11px;
            font-weight: 600;
            min-width: 35px;
        }}
        
        .hours {{
            text-align: right;
            font-family: 'Consolas', monospace;
        }}
        
        .variance {{
            text-align: right;
            font-family: 'Consolas', monospace;
            font-weight: 600;
        }}
        
        .variance.positive {{ color: #e74c3c; }}
        .variance.negative {{ color: #27ae60; }}
        .variance.zero {{ color: #95a5a6; }}
        
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
        }}
        
        .legend-item {{
            display: flex;
            align-items: center;
            gap: 6px;
        }}
        
        .refresh-time {{
            font-size: 12px;
            color: rgba(255,255,255,0.7);
        }}
        
        .edit-mode-badge {{
            background: #27ae60;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 11px;
            margin-left: 10px;
        }}
        
        .help-text {{
            background: #e8f4fd;
            border: 1px solid #3498db;
            border-radius: 8px;
            padding: 12px 20px;
            margin-bottom: 15px;
            font-size: 13px;
            color: #1a5276;
        }}
        
        .help-text strong {{ color: #2c3e50; }}

        /* Chat Widget */
        .chat-widget {{
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 350px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid #ddd;
            z-index: 1000;
        }}
        .chat-header {{
            background: #2c3e50;
            color: white;
            padding: 10px 15px;
            font-weight: 600;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .chat-messages {{
            height: 300px;
            padding: 15px;
            overflow-y: auto;
            background: #f9f9f9;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }}
        .message {{
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 13px;
            max-width: 85%;
        }}
        .message.user {{
            background: #3498db;
            color: white;
            align-self: flex-end;
        }}
        .message.bot {{
            background: #e9ecef;
            color: #333;
            align-self: flex-start;
        }}
        .chat-input-area {{
            padding: 10px;
            border-top: 1px solid #ddd;
            display: flex;
            gap: 5px;
        }}
        .chat-input {{
            flex: 1;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            outline: none;
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
            <span class="edit-mode-badge">✏️ Edit Mode ON</span>
        </div>
    </div>
    
    <div class="summary-bar">
        <div class="metric">
            <div class="metric-value" id="total-tasks">{len(projects)}</div>
            <div class="metric-label">Total Tasks</div>
        </div>
        <div class="metric">
            <div class="metric-value" id="total-hours">{int(total_hours):,}h</div>
            <div class="metric-label">Total Work</div>
        </div>
        <div class="metric">
            <div class="metric-value" id="total-baseline">{int(total_baseline):,}h</div>
            <div class="metric-label">Baseline</div>
        </div>
        <div class="metric">
            <div class="metric-value {variance_class}" id="total-variance">{variance_sign}{int(variance):,}h</div>
            <div class="metric-label">Variance</div>
        </div>
        <div class="metric">
            <div class="metric-value" id="avg-percent">{int(avg_percent)}%</div>
            <div class="metric-label">Avg Complete</div>
        </div>
    </div>
    
    <div class="container">
        <div class="help-text">
            <strong>💡 Interactive Mode:</strong> 
            Click on <strong>Work hours</strong>, <strong>Finish date</strong>, or drag the <strong>Progress slider</strong> to edit. 
            Changes are saved automatically!
        </div>
        
        <div class="toolbar">
            <button class="btn-primary" onclick="location.reload()">🔄 Refresh</button>
            <button class="btn-success" onclick="window.open('/changelog', '_blank')">📝 View Changelog</button>
            <div class="status-message" id="status-message"></div>
        </div>
        
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th style="width:40px">ID</th>
                        <th>Task Name</th>
                        <th style="width:110px">Resource</th>
                        <th style="width:80px">Work ✏️</th>
                        <th style="width:80px">Baseline</th>
                        <th style="width:80px">Variance</th>
                        <th style="width:90px">Start</th>
                        <th style="width:100px">Finish ✏️</th>
                        <th style="width:150px">Progress ✏️</th>
                    </tr>
                </thead>
                <tbody>
{rows_html}
                </tbody>
            </table>
        </div>
    </div>
    
    <div class="legend">
        <div class="legend-item">
            <span style="background: #fff3cd; padding: 2px 8px; border-radius: 3px;">Yellow</span>
            <span>= Hover to edit</span>
        </div>
        <div class="legend-item">
            <span style="background: #d4edda; padding: 2px 8px; border-radius: 3px;">Green</span>
            <span>= Modified & saved</span>
        </div>
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
    
    <div class="chat-widget">
        <div class="chat-header">
            <span>🤖 AI Copilot</span>
        </div>
        <div class="chat-messages" id="chat-messages">
            <div class="message bot">Hello! I can help you update tasks. Try "Add 10 hours to Build 2".</div>
        </div>
        <div class="chat-input-area">
            <input type="text" class="chat-input" id="chat-input" placeholder="Type instructions...">
            <button class="btn-primary" onclick="sendMessage()">Send</button>
        </div>
    </div>
    
    <script>
        // Show status message
        function showStatus(message, type) {{
            const el = document.getElementById('status-message');
            el.textContent = message;
            el.className = 'status-message show ' + type;
            setTimeout(() => el.classList.remove('show'), 3000);
        }}
        
        // Save changes to server
        async function saveChange(id, field, value) {{
            try {{
                const response = await fetch('/update', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{ id, field, value }})
                }});
                
                const result = await response.json();
                
                if (result.success) {{
                    showStatus('✅ Saved: ' + result.message, 'success');
                    
                    // Update variance display
                    if (result.new_variance !== undefined) {{
                        const row = document.querySelector(`tr[data-id="${{id}}"]`);
                        const varianceCell = row.querySelector('.variance');
                        const v = result.new_variance;
                        varianceCell.textContent = v > 0 ? '+' + v : v;
                        varianceCell.className = 'variance ' + (v > 0 ? 'positive' : v < 0 ? 'negative' : 'zero');
                    }}
                    
                    // Update finish date if recalculated
                    if (result.new_finish) {{
                        const row = document.querySelector(`tr[data-id="${{id}}"]`);
                        const finishCell = row.querySelector('td[data-field="Finish_Date"]');
                        finishCell.textContent = result.new_finish;
                    }}
                    
                    // Update summary
                    if (result.summary) {{
                        document.getElementById('total-hours').textContent = result.summary.total_hours.toLocaleString() + 'h';
                        document.getElementById('total-variance').textContent = 
                            (result.summary.variance > 0 ? '+' : '') + result.summary.variance.toLocaleString() + 'h';
                        document.getElementById('avg-percent').textContent = Math.round(result.summary.avg_percent) + '%';
                    }}
                }} else {{
                    showStatus('❌ Error: ' + result.message, 'error');
                }}
            }} catch (err) {{
                showStatus('❌ Connection error', 'error');
            }}
        }}
        
        // Handle editable cells (Work_Hours, Finish_Date)
        document.querySelectorAll('.editable').forEach(cell => {{
            const originalValue = cell.textContent;
            
            cell.addEventListener('blur', function() {{
                const newValue = this.textContent.trim();
                if (newValue !== originalValue) {{
                    const id = this.dataset.id;
                    const field = this.dataset.field;
                    this.classList.add('modified');
                    saveChange(id, field, newValue);
                }}
            }});
            
            cell.addEventListener('keydown', function(e) {{
                if (e.key === 'Enter') {{
                    e.preventDefault();
                    this.blur();
                }}
                if (e.key === 'Escape') {{
                    this.textContent = originalValue;
                    this.blur();
                }}
            }});
        }});
        
        // Handle resource dropdown
        document.querySelectorAll('.resource-select').forEach(select => {{
            select.addEventListener('change', function() {{
                const id = this.dataset.id;
                const field = this.dataset.field;
                saveChange(id, field, this.value);
            }});
        }});
        
        // Handle progress sliders
        document.querySelectorAll('.progress-slider').forEach(slider => {{
            slider.addEventListener('input', function() {{
                const valueSpan = this.parentElement.querySelector('.progress-value');
                valueSpan.textContent = this.value + '%';
            }});
            
            slider.addEventListener('change', function() {{
                const id = this.dataset.id;
                const field = this.dataset.field;
                saveChange(id, field, this.value);
            }});
        }});

        // Chat Logic
        async function sendMessage() {{
            const input = document.getElementById('chat-input');
            const msg = input.value.trim();
            if (!msg) return;
            
            addMessage(msg, 'user');
            input.value = '';
            
            const loadingId = addMessage('Thinking...', 'bot');
            
            try {{
                const response = await fetch('/chat', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{ query: msg }})
                }});
                
                const data = await response.json();
                document.getElementById(loadingId).remove();
                
                if (data.success) {{
                    addMessage(data.reply, 'bot');
                    if (data.changes_count > 0) {{
                        showStatus(`✨ ${{data.changes_count}} changes applied!`, 'success');
                        setTimeout(() => location.reload(), 1500);
                    }}
                }} else {{
                    addMessage('❌ ' + (data.message || 'Error'), 'bot');
                }}
            }} catch (err) {{
                if (document.getElementById(loadingId)) document.getElementById(loadingId).remove();
                addMessage('❌ Connection failed', 'bot');
            }}
        }}

        function addMessage(text, role) {{
            const div = document.createElement('div');
            div.className = `message ${{role}}`;
            div.textContent = text;
            div.id = 'msg-' + Date.now();
            const container = document.getElementById('chat-messages');
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
            return div.id;
        }}

        document.getElementById('chat-input').addEventListener('keypress', function(e) {{
            if (e.key === 'Enter') sendMessage();
        }});
    </script>
</body>
</html>"""

    return html


def generate_changelog_html():
    """Generate HTML view of changelog."""
    if not os.path.exists(CHANGELOG_FILE):
        content = "No changes recorded yet."
    else:
        with open(CHANGELOG_FILE, "r", encoding="utf-8") as f:
            content = f.read()

    # Convert markdown table to HTML
    lines = content.split("\n")
    html_content = ""
    in_table = False

    for line in lines:
        if line.startswith("|"):
            if not in_table:
                html_content += '<table class="changelog-table">'
                in_table = True

            if "---" in line:
                continue

            cells = [c.strip() for c in line.split("|")[1:-1]]
            tag = "th" if "Timestamp" in line else "td"
            html_content += (
                "<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in cells) + "</tr>"
            )
        else:
            if in_table:
                html_content += "</table>"
                in_table = False
            if line.startswith("#"):
                html_content += f'<h2>{line.replace("#", "").strip()}</h2>'

    if in_table:
        html_content += "</table>"

    return f"""<!DOCTYPE html>
<html>
<head>
    <title>Changelog</title>
    <style>
        body {{ font-family: 'Segoe UI', sans-serif; padding: 30px; background: #f5f5f5; }}
        h2 {{ color: #2c3e50; }}
        .changelog-table {{ width: 100%; border-collapse: collapse; background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        th, td {{ padding: 10px 15px; border: 1px solid #ddd; text-align: left; }}
        th {{ background: #2c3e50; color: white; }}
        tr:hover {{ background: #f8f9fa; }}
    </style>
</head>
<body>
    {html_content}
</body>
</html>"""


class DashboardHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress default logging

    def do_GET(self):
        if self.path == "/" or self.path == "/dashboard":
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(generate_dashboard_html().encode())

        elif self.path == "/changelog":
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(generate_changelog_html().encode())

        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == "/chat":
            content_length = int(self.headers["Content-Length"])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode())
            query = data.get("query", "")

            result = process_ai_request(query)

            response = {}
            if result["success"]:
                ai_data = result["data"]
                changes = ai_data.get("changes", [])
                reply = ai_data.get("reply", "Done.")

                logs = []
                if changes:
                    logs = apply_ai_updates(changes)

                response = {
                    "success": True,
                    "reply": reply,
                    "logs": logs,
                    "changes_count": len(changes),
                }
            else:
                response = result  # Propagate error

            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())

        elif self.path == "/update":
            content_length = int(self.headers["Content-Length"])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode())

            task_id = data["id"]
            field = data["field"]
            value = data["value"]

            # Load and update projects
            projects = load_projects()
            task = None

            for p in projects:
                if p["ID"] == str(task_id):
                    task = p
                    old_value = p.get(field, "")
                    p[field] = str(value)

                    # Recalculate variance if work hours changed
                    if field == "Work_Hours":
                        work = float(value)
                        baseline = float(p["Baseline_Hours"])
                        p["Variance"] = str(int(work - baseline))

                        # Recalculate finish date
                        new_finish = recalculate_finish_date(p["Start_Date"], work)
                        p["Finish_Date"] = new_finish

                    break

            if task:
                save_projects(projects)
                log_change(
                    "EDIT",
                    task["Task"],
                    task["Resource"],
                    f"{field}: {old_value} → {value}",
                )

                # Calculate new summary
                total_hours = sum(float(p["Work_Hours"]) for p in projects)
                total_baseline = sum(float(p["Baseline_Hours"]) for p in projects)
                variance = total_hours - total_baseline
                avg_percent = sum(float(p["Percent_Complete"]) for p in projects) / len(
                    projects
                )

                response = {
                    "success": True,
                    "message": f"{task['Task']} updated",
                    "new_variance": int(float(task["Variance"])),
                    "new_finish": task.get("Finish_Date"),
                    "summary": {
                        "total_hours": int(total_hours),
                        "variance": int(variance),
                        "avg_percent": avg_percent,
                    },
                }
            else:
                response = {"success": False, "message": "Task not found"}

            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())


def main():
    server = HTTPServer(("localhost", PORT), DashboardHandler)

    print(
        f"""
╔══════════════════════════════════════════════════════════════╗
║  🚀 KPI Dashboard Server Running                             ║
║                                                              ║
║  Open in browser: http://localhost:{PORT}                      ║
║                                                              ║
║  Features:                                                   ║
║  • Click on Work hours to edit                              ║
║  • Drag progress sliders                                    ║
║  • Change resource assignments                              ║
║  • All changes save automatically to CSV                    ║
║                                                              ║
║  Press Ctrl+C to stop                                        ║
╚══════════════════════════════════════════════════════════════╝
"""
    )

    # Open browser after short delay
    def open_browser():
        webbrowser.open(f"http://localhost:{PORT}")

    threading.Timer(1.0, open_browser).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Server stopped")
        server.shutdown()


if __name__ == "__main__":
    main()
