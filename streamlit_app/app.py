"""
KPI Automation - Streamlit Web Interface
=========================================
A visual dashboard for managing project hours with natural language commands.

Run with: streamlit run app.py
"""

import streamlit as st
import pandas as pd
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

# Page config
st.set_page_config(
    page_title="KPI Project Tracker",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom CSS for better styling
st.markdown(
    """
<style>
    .stDataFrame {
        font-size: 14px;
    }
    .variance-positive {
        color: #ff4b4b;
        font-weight: bold;
    }
    .variance-negative {
        color: #00cc66;
        font-weight: bold;
    }
    .change-log {
        background-color: #f0f2f6;
        padding: 10px;
        border-radius: 5px;
        font-family: monospace;
        font-size: 12px;
    }
    .metric-card {
        background-color: #ffffff;
        padding: 20px;
        border-radius: 10px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
</style>
""",
    unsafe_allow_html=True,
)

# Load data
DATA_FILE = Path(__file__).parent / "sample_data.json"


@st.cache_data
def load_data():
    with open(DATA_FILE, "r") as f:
        return json.load(f)


def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)
    st.cache_data.clear()


# Initialize session state
if "data" not in st.session_state:
    st.session_state.data = load_data()

if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

if "change_log" not in st.session_state:
    st.session_state.change_log = []


# Mock AI Parser (no API key needed)
def parse_command_mock(user_input: str) -> dict:
    """
    Parse natural language command into structured action.
    This is a mock implementation - replace with OpenAI for production.
    """
    user_input_lower = user_input.lower()

    # Pattern: "add X hours to [task] for [resource]"
    add_hours_pattern = (
        r"add\s+(\d+)\s*(?:more\s+)?hours?\s+(?:to\s+)?(.+?)(?:\s+for\s+(\w+))?$"
    )
    match = re.search(add_hours_pattern, user_input_lower)
    if match:
        hours = int(match.group(1))
        task = match.group(2).strip()
        resource = match.group(3) if match.group(3) else None
        return {
            "action": "add_hours",
            "task": task,
            "resource": resource,
            "hours": hours,
            "confidence": 0.9,
        }

    # Pattern: "[resource] needs X hours on [task]"
    needs_hours_pattern = (
        r"(\w+)\s+needs?\s+(\d+)\s*(?:more\s+)?hours?\s+(?:on\s+)?(.+)"
    )
    match = re.search(needs_hours_pattern, user_input_lower)
    if match:
        resource = match.group(1)
        hours = int(match.group(2))
        task = match.group(3).strip()
        return {
            "action": "add_hours",
            "task": task,
            "resource": resource,
            "hours": hours,
            "confidence": 0.85,
        }

    # Pattern: "set [task] to X% complete"
    percent_pattern = (
        r"(?:set|mark|update)\s+(.+?)\s+(?:to|as)\s+(\d+)%?\s*(?:complete)?"
    )
    match = re.search(percent_pattern, user_input_lower)
    if match:
        task = match.group(1).strip()
        percent = int(match.group(2))
        return {
            "action": "set_percent",
            "task": task,
            "percent": percent,
            "confidence": 0.9,
        }

    # Pattern: "extend/push [task] deadline to [date]"
    deadline_pattern = r"(?:extend|push|move)\s+(.+?)\s+(?:deadline\s+)?to\s+(\d{4}-\d{2}-\d{2}|\w+\s+\d+)"
    match = re.search(deadline_pattern, user_input_lower)
    if match:
        task = match.group(1).strip()
        date = match.group(2)
        return {
            "action": "extend_deadline",
            "task": task,
            "new_date": date,
            "confidence": 0.85,
        }

    # Pattern: "show summary" or "list tasks"
    if any(
        word in user_input_lower for word in ["summary", "overview", "total", "list"]
    ):
        return {"action": "show_summary", "confidence": 0.95}

    return {"action": "unknown", "original": user_input, "confidence": 0}


def find_task(projects: list, task_query: str, resource_query: str = None) -> dict:
    """Find a task by fuzzy matching."""
    task_query_lower = task_query.lower()

    matches = []
    for project in projects:
        task_name = project.get("task", "").lower()
        resource_name = project.get("resource", "").lower()

        if task_query_lower in task_name or task_name in task_query_lower:
            if resource_query:
                if resource_query.lower() in resource_name:
                    matches.append(project)
            else:
                matches.append(project)

    if matches:
        return min(matches, key=lambda x: len(x.get("task", "")))
    return None


def recalculate_finish_date(start_date_str: str, total_hours: float) -> str:
    """Calculate new finish date based on hours (8 hrs/day, skip weekends)."""
    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        work_days = total_hours / 8

        current_date = start_date
        days_added = 0
        while days_added < work_days:
            current_date += timedelta(days=1)
            if current_date.weekday() < 5:
                days_added += 1

        return current_date.strftime("%Y-%m-%d")
    except Exception:
        return start_date_str


def execute_command(parsed: dict) -> str:
    """Execute a parsed command and return result message."""
    data = st.session_state.data
    projects = data["projects"]

    if parsed["action"] == "add_hours":
        task = find_task(projects, parsed["task"], parsed.get("resource"))
        if not task:
            return f"❌ Could not find task matching '{parsed['task']}'"

        # Store before state
        before_hours = task["work_hours"]
        before_finish = task["finish_date"]
        before_variance = task["variance"]

        # Update
        task["work_hours"] += parsed["hours"]
        task["variance"] = task["work_hours"] - task["baseline_hours"]
        task["finish_date"] = recalculate_finish_date(
            task["start_date"], task["work_hours"]
        )

        # Log change
        change = {
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "action": "ADD_HOURS",
            "task": task["task"],
            "details": f"+{parsed['hours']}h: {before_hours}h → {task['work_hours']}h",
        }
        st.session_state.change_log.append(change)

        return f"""✅ **Updated {task['task']}**
        
| Field | Before | After |
|-------|--------|-------|
| Work Hours | {before_hours}h | {task['work_hours']}h |
| Variance | {before_variance:+}h | {task['variance']:+}h |
| Finish Date | {before_finish} | {task['finish_date']} |
"""

    elif parsed["action"] == "set_percent":
        task = find_task(projects, parsed["task"])
        if not task:
            return f"❌ Could not find task matching '{parsed['task']}'"

        before_percent = task["percent_complete"]
        task["percent_complete"] = parsed["percent"]

        change = {
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "action": "SET_PERCENT",
            "task": task["task"],
            "details": f"{before_percent}% → {parsed['percent']}%",
        }
        st.session_state.change_log.append(change)

        return f"✅ Updated **{task['task']}** to {parsed['percent']}% complete (was {before_percent}%)"

    elif parsed["action"] == "show_summary":
        total_hours = sum(p["work_hours"] for p in projects)
        total_baseline = sum(p["baseline_hours"] for p in projects)
        variance = total_hours - total_baseline

        by_resource = {}
        for p in projects:
            r = p["resource"]
            if r not in by_resource:
                by_resource[r] = 0
            by_resource[r] += p["work_hours"]

        resource_summary = "\n".join(
            [f"- **{r}**: {h}h" for r, h in by_resource.items()]
        )

        return f"""📊 **Project Summary**

| Metric | Value |
|--------|-------|
| Total Tasks | {len(projects)} |
| Total Hours | {total_hours}h |
| Baseline | {total_baseline}h |
| Variance | {variance:+}h |

**Hours by Resource:**
{resource_summary}
"""

    else:
        return f'🤔 I didn\'t understand that command. Try:\n- "Add 5 hours to [task name]"\n- "Set [task] to 50% complete"\n- "Show summary"'


# ============== UI Layout ==============

st.title("📊 KPI Project Tracker")
st.caption("Natural language project management • Type commands in the chat below")

# Sidebar - Summary & Filters
with st.sidebar:
    st.header("📈 Summary")

    data = st.session_state.data
    projects = data["projects"]

    total_hours = sum(p["work_hours"] for p in projects)
    total_baseline = sum(p["baseline_hours"] for p in projects)
    variance = total_hours - total_baseline

    col1, col2 = st.columns(2)
    with col1:
        st.metric("Total Hours", f"{total_hours:,}h")
        st.metric("Tasks", len(projects))
    with col2:
        st.metric("Baseline", f"{total_baseline:,}h")
        st.metric(
            "Variance", f"{variance:+,}h", delta=f"{variance:+}h", delta_color="inverse"
        )

    st.divider()

    st.header("🎯 Filter")
    resources = ["All"] + data["resources"]
    selected_resource = st.selectbox("Resource", resources)

    show_only_active = st.checkbox("Show only active tasks", value=False)

    st.divider()

    st.header("📝 Change Log")
    if st.session_state.change_log:
        for change in reversed(st.session_state.change_log[-5:]):
            st.markdown(f"**{change['timestamp']}** - {change['action']}")
            st.caption(f"{change['task']}: {change['details']}")
    else:
        st.caption("No changes yet")

# Main content - Project Table
st.header("📋 Project Tasks")

# Convert to DataFrame for display
df = pd.DataFrame(st.session_state.data["projects"])

# Apply filters
if selected_resource != "All":
    df = df[df["resource"] == selected_resource]

if show_only_active:
    df = df[df["percent_complete"] < 100]

# Format for display
display_df = df[
    [
        "id",
        "task",
        "resource",
        "work_hours",
        "baseline_hours",
        "variance",
        "start_date",
        "finish_date",
        "percent_complete",
    ]
].copy()

display_df.columns = [
    "ID",
    "Task",
    "Resource",
    "Work (hrs)",
    "Baseline (hrs)",
    "Variance",
    "Start",
    "Finish",
    "% Complete",
]


# Color-code variance
def color_variance(val):
    if val > 0:
        return "color: #ff4b4b; font-weight: bold"
    elif val < 0:
        return "color: #00cc66; font-weight: bold"
    return ""


# Progress bar for completion
def progress_bar(val):
    return f"background: linear-gradient(90deg, #00cc66 {val}%, transparent {val}%)"


styled_df = display_df.style.applymap(color_variance, subset=["Variance"]).applymap(
    lambda x: progress_bar(x) if isinstance(x, (int, float)) else "",
    subset=["% Complete"],
)

st.dataframe(styled_df, use_container_width=True, height=400)

# Chat interface
st.divider()
st.header("💬 Command Center")
st.caption("Type natural language commands to update the project")

# Display chat history
for msg in st.session_state.chat_history:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# Chat input
if prompt := st.chat_input("e.g., 'Add 5 hours to Fault Code Reporting for Wasim'"):
    # Add user message
    st.session_state.chat_history.append({"role": "user", "content": prompt})

    with st.chat_message("user"):
        st.markdown(prompt)

    # Parse and execute
    parsed = parse_command_mock(prompt)
    result = execute_command(parsed)

    # Add assistant message
    st.session_state.chat_history.append({"role": "assistant", "content": result})

    with st.chat_message("assistant"):
        st.markdown(result)

    # Rerun to update table
    st.rerun()

# Example commands
with st.expander("💡 Example Commands"):
    st.markdown(
        """
    **Add hours:**
    - "Add 5 hours to Fault Code Reporting"
    - "Wasim needs 8 more hours on the implementation"
    - "Add 10 hours to Bug Fixes for Chethan"
    
    **Update completion:**
    - "Set PLID Issue to 75% complete"
    - "Mark Cybersecurity Update as 100% complete"
    
    **View info:**
    - "Show summary"
    - "List all tasks"
    
    **Coming soon:**
    - "Extend Build 2 deadline to 2027-03-01"
    - "What's Mengmei working on?"
    """
    )

# Footer
st.divider()
st.caption(
    "💡 **Tip:** For production use, replace the mock AI parser with OpenAI API for better natural language understanding."
)
