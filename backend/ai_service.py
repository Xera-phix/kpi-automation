"""
AI Service - Comprehensive LLM Integration
============================================
Robust natural language → database operations with full schema awareness,
validation, and intelligent action planning.
"""

import os
import json
import re
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from database import (
    get_all_tasks,
    get_task,
    update_task,
    log_change,
    create_pending_action,
    get_pending_action,
    execute_pending_action,
    get_lead_preference,
    get_resources,
    get_resource_allocation,
    get_summary,
    get_mismatch_warnings,
    HOURS_PER_DAY,
    DEFAULT_PHASE_RATIOS,
    CR_STAGE_MAP,
)

# Load environment
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    with open(env_path, "r") as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ[k] = v


# ============================================================================
# SCHEMA DEFINITIONS - What the AI can understand and modify
# ============================================================================

TASK_SCHEMA = {
    "id": {"type": "int", "editable": False, "description": "Unique task ID"},
    "task": {"type": "str", "editable": True, "description": "Task name"},
    "resource": {"type": "str", "editable": True, "description": "Assigned person"},
    "work_hours": {
        "type": "float",
        "editable": True,
        "description": "Current scheduled hours (actual)",
    },
    "baseline_hours": {
        "type": "float",
        "editable": True,
        "description": "Original planned hours (for variance calculation)",
    },
    "variance": {
        "type": "float",
        "editable": False,
        "description": "work_hours - baseline_hours (auto-calculated)",
    },
    "hours_completed": {
        "type": "float",
        "editable": True,
        "description": "Hours of work done so far",
    },
    "hours_remaining": {
        "type": "float",
        "editable": True,
        "description": "Hours of work left",
    },
    "earned_value": {
        "type": "float",
        "editable": False,
        "description": "baseline_hours × (percent_complete/100)",
    },
    "dev_hours": {
        "type": "float",
        "editable": True,
        "description": "Development phase hours",
    },
    "dev_percent": {
        "type": "float",
        "editable": True,
        "description": "Development phase completion %",
    },
    "test_hours": {
        "type": "float",
        "editable": True,
        "description": "Testing phase hours",
    },
    "test_percent": {
        "type": "float",
        "editable": True,
        "description": "Testing phase completion %",
    },
    "review_hours": {
        "type": "float",
        "editable": True,
        "description": "Code review phase hours",
    },
    "review_percent": {
        "type": "float",
        "editable": True,
        "description": "Review phase completion %",
    },
    "current_phase": {
        "type": "str",
        "editable": True,
        "description": "Current phase: 'development', 'testing', or 'review'",
        "values": ["development", "testing", "review"],
    },
    "cr_stage": {
        "type": "str",
        "editable": True,
        "description": "CR lifecycle stage. Changing stage nudges percent_complete to suggested minimum.",
        "values": list(CR_STAGE_MAP.keys()),
        "stage_pct_map": CR_STAGE_MAP,
    },
    "start_date": {
        "type": "date",
        "editable": True,
        "description": "Task start date (YYYY-MM-DD)",
    },
    "finish_date": {
        "type": "date",
        "editable": True,
        "description": "Task finish date (YYYY-MM-DD)",
    },
    "percent_complete": {
        "type": "int",
        "editable": True,
        "description": "Overall completion percentage (0-100)",
        "min": 0,
        "max": 100,
    },
    "task_type": {
        "type": "str",
        "editable": True,
        "description": "Task type",
        "values": ["Fixed Work", "Fixed Duration", "Fixed Units"],
    },
    "parent_task": {
        "type": "str",
        "editable": True,
        "description": "Parent task name (for hierarchy)",
    },
}


# ============================================================================
# CONTEXT BUILDERS - Rich data for AI understanding
# ============================================================================


def build_full_context() -> Dict[str, Any]:
    """Build comprehensive context object for the AI."""
    tasks = get_all_tasks()
    resources = get_resources()
    resource_alloc = get_resource_allocation()
    summary = get_summary()

    # Build task hierarchy
    parent_tasks = [t for t in tasks if not t.get("parent_task")]
    subtask_map = {}
    for t in tasks:
        if t.get("parent_task"):
            if t["parent_task"] not in subtask_map:
                subtask_map[t["parent_task"]] = []
            subtask_map[t["parent_task"]].append(t["id"])

    # Find issues
    issues = []
    for t in tasks:
        if t.get("variance", 0) > 0 and t.get("percent_complete", 0) < 80:
            issues.append(
                {
                    "type": "over_budget",
                    "task_id": t["id"],
                    "task_name": t["task"],
                    "variance": t.get("variance", 0),
                    "message": f"{t['task']} is {t.get('variance', 0)}h over budget",
                }
            )

        if t.get("finish_date"):
            try:
                finish = datetime.strptime(t["finish_date"], "%Y-%m-%d")
                if finish < datetime.now() and t.get("percent_complete", 0) < 100:
                    issues.append(
                        {
                            "type": "overdue",
                            "task_id": t["id"],
                            "task_name": t["task"],
                            "message": f"{t['task']} was due {t['finish_date']} but is only {t['percent_complete']}% complete",
                        }
                    )
            except:
                pass

    for r in resource_alloc:
        if r.get("overallocated"):
            issues.append(
                {
                    "type": "overallocated_resource",
                    "resource": r["name"],
                    "utilization": r["utilization"],
                    "message": f"{r['name']} is overallocated at {r['utilization']}% utilization",
                }
            )

    # Mismatch warnings
    mismatches = get_mismatch_warnings()
    for m in mismatches:
        issues.append(
            {
                "type": "hours_progress_mismatch",
                "task_id": m["task_id"],
                "task_name": m["task"],
                "message": m["message"],
            }
        )

    return {
        "tasks": tasks,
        "task_count": len(tasks),
        "resources": [r["name"] for r in resources],
        "resource_allocation": resource_alloc,
        "summary": summary,
        "parent_tasks": [t["task"] for t in parent_tasks],
        "subtask_map": subtask_map,
        "issues": issues,
        "cr_stage_map": CR_STAGE_MAP,
        "today": datetime.now().strftime("%Y-%m-%d"),
    }


def build_task_context_string(tasks: List[Dict]) -> str:
    """Build a detailed string representation of all tasks."""
    lines = []
    lines.append("=" * 120)
    lines.append("TASK DATABASE - All Fields")
    lines.append("=" * 120)

    for t in tasks:
        is_parent = any(task.get("parent_task") == t["task"] for task in tasks)
        prefix = (
            "[PARENT] " if is_parent else "  [SUB] " if t.get("parent_task") else ""
        )

        lines.append(f"\n{prefix}[ID: {t['id']}] {t['task']}")
        lines.append(f"   Resource: {t.get('resource', 'Unassigned')}")
        lines.append(
            f"   Hours: work={t.get('work_hours', 0)} | baseline={t.get('baseline_hours', 0)} | variance={t.get('variance', 0)}"
        )
        lines.append(
            f"   Progress: {t.get('percent_complete', 0)}% | completed={t.get('hours_completed', 0)}h | remaining={t.get('hours_remaining', 0)}h"
        )
        lines.append(
            f"   Phases: dev={t.get('dev_hours', 0)}h ({t.get('dev_percent', 0)}%) | test={t.get('test_hours', 0)}h ({t.get('test_percent', 0)}%) | review={t.get('review_hours', 0)}h ({t.get('review_percent', 0)}%)"
        )
        lines.append(
            f"   Dates: {t.get('start_date', '?')} -> {t.get('finish_date', '?')} | Phase: {t.get('current_phase', 'development')}"
        )
        lines.append(
            f"   CR Stage: {t.get('cr_stage', 'submitted')}"
        )
        if t.get("parent_task"):
            lines.append(f"   Parent: {t['parent_task']}")

    return "\n".join(lines)


def build_resource_context_string(resource_alloc: List[Dict]) -> str:
    """Build resource allocation summary."""
    lines = []
    lines.append("\n" + "=" * 60)
    lines.append("RESOURCE ALLOCATION")
    lines.append("=" * 60)

    for r in resource_alloc:
        status = "OVERALLOCATED" if r.get("overallocated") else "OK"
        lines.append(f"\n{r['name']} - {status}")
        lines.append(
            f"   Capacity: {r.get('capacity', 0)}h | Allocated: {r.get('allocated', 0)}h | Available: {r.get('available', 0)}h"
        )
        lines.append(
            f"   Completed: {r.get('completed', 0)}h | Remaining: {r.get('remaining', 0)}h"
        )
        lines.append(f"   Utilization: {r.get('utilization', 0)}%")

    return "\n".join(lines)


# ============================================================================
# VALIDATION
# ============================================================================


def validate_change(task_id: int, field: str, value: Any) -> Dict[str, Any]:
    """Validate a proposed change before applying."""
    errors = []
    warnings = []

    if field not in TASK_SCHEMA:
        errors.append(f"Unknown field: {field}")
        return {"valid": False, "errors": errors, "warnings": warnings}

    schema = TASK_SCHEMA[field]
    if not schema.get("editable", True):
        errors.append(f"Field '{field}' is not editable (auto-calculated)")
        return {"valid": False, "errors": errors, "warnings": warnings}

    expected_type = schema["type"]
    try:
        if expected_type == "int":
            value = int(value)
        elif expected_type == "float":
            value = float(value)
        elif expected_type == "date":
            if isinstance(value, str):
                datetime.strptime(value, "%Y-%m-%d")
    except (ValueError, TypeError):
        errors.append(f"Invalid type for {field}: expected {expected_type}")

    if "min" in schema and value < schema["min"]:
        errors.append(f"{field} must be >= {schema['min']}")
    if "max" in schema and value > schema["max"]:
        errors.append(f"{field} must be <= {schema['max']}")

    if "values" in schema and value not in schema["values"]:
        errors.append(f"{field} must be one of: {schema['values']}")

    task = get_task(task_id)
    if not task:
        errors.append(f"Task {task_id} not found")
        return {"valid": False, "errors": errors, "warnings": warnings}

    if field == "work_hours" and value < 0:
        errors.append("work_hours cannot be negative")

    if field == "percent_complete":
        if value == 100 and task.get("hours_remaining", 0) > 0:
            warnings.append("Setting to 100% but hours_remaining > 0")

    if field == "resource":
        resources = get_resources()
        if value not in [r["name"] for r in resources]:
            warnings.append(f"Resource '{value}' not in resource list")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "coerced_value": value,
    }


def validate_all_changes(changes: List[Dict]) -> Dict[str, Any]:
    """Validate all proposed changes."""
    all_valid = True
    results = []

    for change in changes:
        task_id = change.get("id")
        field = change.get("field")
        value = change.get("value")

        result = validate_change(task_id, field, value)
        result["change"] = change
        results.append(result)

        if not result["valid"]:
            all_valid = False

    return {"all_valid": all_valid, "results": results}


# ============================================================================
# SMART CHANGE CALCULATION
# ============================================================================


def calculate_dependent_changes(task_id: int, field: str, value: Any) -> List[Dict]:
    """Calculate additional changes that should happen when a field changes."""
    task = get_task(task_id)
    if not task:
        return []

    extra_changes = []

    if field == "work_hours":
        percent = task.get("percent_complete", 0) / 100.0
        hours_completed = value * percent
        hours_remaining = value * (1 - percent)

        extra_changes.append(
            {
                "id": task_id,
                "field": "hours_completed",
                "value": round(hours_completed, 1),
            }
        )
        extra_changes.append(
            {
                "id": task_id,
                "field": "hours_remaining",
                "value": round(hours_remaining, 1),
            }
        )

        if hours_remaining > 0 and task.get("start_date"):
            work_days = hours_remaining / HOURS_PER_DAY
            current = datetime.now()
            days_added = 0
            while days_added < work_days:
                current += timedelta(days=1)
                if current.weekday() < 5:
                    days_added += 1
            extra_changes.append(
                {
                    "id": task_id,
                    "field": "finish_date",
                    "value": current.strftime("%Y-%m-%d"),
                }
            )

    if field == "percent_complete":
        work_hours = task.get("work_hours", 0)
        percent = value / 100.0
        hours_completed = work_hours * percent
        hours_remaining = work_hours * (1 - percent)

        extra_changes.append(
            {
                "id": task_id,
                "field": "hours_completed",
                "value": round(hours_completed, 1),
            }
        )
        extra_changes.append(
            {
                "id": task_id,
                "field": "hours_remaining",
                "value": round(hours_remaining, 1),
            }
        )

    if field in ["dev_hours", "test_hours", "review_hours"]:
        current_dev = task.get("dev_hours", 0) if field != "dev_hours" else value
        current_test = task.get("test_hours", 0) if field != "test_hours" else value
        current_review = (
            task.get("review_hours", 0) if field != "review_hours" else value
        )

        new_total = current_dev + current_test + current_review
        if abs(new_total - task.get("work_hours", 0)) > 0.1:
            extra_changes.append(
                {"id": task_id, "field": "work_hours", "value": round(new_total, 1)}
            )

    return extra_changes


# ============================================================================
# INTENT DETECTION
# ============================================================================


def detect_intent(query: str, context: Dict) -> Dict[str, Any]:
    """Detect user intent from natural language query."""
    query_lower = query.lower()

    intent = {
        "is_question": False,
        "is_command": False,
        "mentioned_tasks": [],
        "mentioned_resources": [],
        "mentioned_phases": [],
        "action_keywords": [],
        "numbers": [],
        "dates": [],
    }

    question_words = [
        "what",
        "how",
        "when",
        "where",
        "who",
        "which",
        "is",
        "are",
        "can",
        "show",
        "list",
        "tell",
    ]
    if any(query_lower.startswith(w) for w in question_words) or query_lower.endswith(
        "?"
    ):
        intent["is_question"] = True

    command_words = [
        "set",
        "change",
        "update",
        "add",
        "remove",
        "assign",
        "reassign",
        "move",
        "shift",
        "mark",
        "make",
    ]
    if any(w in query_lower for w in command_words):
        intent["is_command"] = True

    for t in context["tasks"]:
        task_name = t["task"].lower()
        if task_name in query_lower or str(t["id"]) in query:
            intent["mentioned_tasks"].append(t)

    for r in context["resources"]:
        if r.lower() in query_lower:
            intent["mentioned_resources"].append(r)

    phase_keywords = {
        "development": ["development", "dev", "developing", "coding", "implementation"],
        "testing": ["testing", "test", "qa", "quality"],
        "review": ["review", "reviewing", "code review"],
    }
    for phase, keywords in phase_keywords.items():
        if any(kw in query_lower for kw in keywords):
            intent["mentioned_phases"].append(phase)

    numbers = re.findall(r"\d+(?:\.\d+)?", query)
    intent["numbers"] = [float(n) for n in numbers]

    date_patterns = [r"\d{4}-\d{2}-\d{2}", r"\d{2}/\d{2}/\d{4}"]
    for pattern in date_patterns:
        matches = re.findall(pattern, query)
        intent["dates"].extend(matches)

    if "add" in query_lower and any(x in query_lower for x in ["hour", "time"]):
        intent["action_keywords"].append("log_hours")
    if any(
        x in query_lower for x in ["log", "spent", "worked", "completed", "done"]
    ) and any(x in query_lower for x in ["hour", "time"]):
        intent["action_keywords"].append("log_hours")
    if any(
        x in query_lower
        for x in ["increase scope", "increase budget", "allocate more", "add scope"]
    ):
        intent["action_keywords"].append("add_hours")
    if "percent" in query_lower or "%" in query:
        intent["action_keywords"].append("set_progress")
    if any(x in query_lower for x in ["reassign", "assign to", "move to", "give to"]):
        intent["action_keywords"].append("reassign")
    if any(x in query_lower for x in ["shift", "move date", "reschedule"]):
        intent["action_keywords"].append("shift_dates")

    return intent


# ============================================================================
# LLM INTERFACE
# ============================================================================


def call_llm(
    system_prompt: str, user_prompt: str, history: Optional[List[Dict]] = None
) -> Dict:
    """Call the LLM API with structured prompts and optional conversation history."""
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return {"success": False, "message": "API Key missing in .env"}

    try:
        url = "https://models.inference.ai.azure.com/chat/completions"

        # Build messages with history
        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history if provided (limit to last 10 exchanges)
        if history:
            for msg in history[-20:]:  # Last 20 messages (10 exchanges)
                messages.append(
                    {"role": msg.get("role", "user"), "content": msg.get("content", "")}
                )

        # Add current user message
        messages.append({"role": "user", "content": user_prompt})

        payload = {
            "messages": messages,
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

        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode())
            ai_content = result["choices"][0]["message"]["content"]
            return {"success": True, "data": json.loads(ai_content)}

    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        return {
            "success": False,
            "message": f"API Error: {e.code} {e.reason} - {error_body[:200]}",
        }
    except json.JSONDecodeError as e:
        return {"success": False, "message": f"Invalid JSON from AI: {str(e)}"}
    except Exception as e:
        return {"success": False, "message": f"Error: {str(e)}"}


def build_system_prompt() -> str:
    """Build the comprehensive system prompt for the AI."""

    field_docs = []
    for field, schema in TASK_SCHEMA.items():
        editable = "EDITABLE" if schema.get("editable", True) else "READ-ONLY"
        constraints = ""
        if "min" in schema:
            constraints += f" min={schema['min']}"
        if "max" in schema:
            constraints += f" max={schema['max']}"
        if "values" in schema:
            constraints += f" values={schema['values']}"
        field_docs.append(
            f"  - {field} ({schema['type']}) [{editable}]: {schema['description']}{constraints}"
        )

    return f"""You are an expert Project Management AI Assistant for a KPI Tracking System.

## YOUR CAPABILITIES
You can read and modify project task data. You have full access to:
- All task fields including hours, phases, dates, progress, and assignments
- Resource allocation and workload data
- Project hierarchy (parent/child tasks)
- Summary statistics

## TASK SCHEMA
Each task has the following fields:
{chr(10).join(field_docs)}

## IMPORTANT RELATIONSHIPS
1. work_hours = dev_hours + test_hours + review_hours (total scheduled hours)
2. variance = work_hours - baseline_hours (positive = over budget)
3. earned_value = baseline_hours * (percent_complete / 100)
4. hours_completed = work_hours * (percent_complete / 100)
5. hours_remaining = work_hours * (1 - percent_complete / 100)
6. When a subtask updates, its parent_task totals are auto-recalculated

## ACTIONS YOU CAN TAKE
Return JSON with one of these action types:

### 1. UPDATE FIELDS (set absolute values)
{{"action": "update", "changes": [{{"id": 104, "field": "work_hours", "value": 100}}], "reply": "Updated work_hours to 100"}}

### 2. LOG HOURS (record completed work — THIS IS THE DEFAULT FOR "add X hours to task")
Use this when the user says "add hours", "log hours", "I worked X hours", "spent X hours", etc.
This INCREASES progress: hours_completed goes up, percent_complete recalculates, finish_date adjusts.
{{"action": "log_hours", "task_id": 104, "hours": 20, "reply": "Logged 20h of completed work on Build 2"}}
{{"action": "log_hours", "task_id": 104, "hours": 20, "phase": "development", "reply": "Logged 20h of dev work"}}

### 3. ADD SCOPE (increase budget/allocated hours — use ONLY when user explicitly says "increase scope/budget")
Use this when user says "increase the budget", "add scope", "allocate more hours", etc.
This does NOT change progress — it increases the total work_hours (scope increase).
{{"action": "add_hours", "task_id": 104, "hours": 20, "phase": "development", "reply": "Increased dev budget by 20h"}}

### 4. QUERY ONLY (no changes)
{{"action": "query", "reply": "Here is the information you asked for..."}}

### 5. NEEDS CLARIFICATION
{{"action": "clarify", "question": "Which phase?", "options": ["Development", "Testing", "Review"]}}

## CRITICAL RULES
1. DEFAULT to "log_hours" when user says "add X hours to Y" — they mean completed work
2. Only use "add_hours" when user explicitly mentions increasing scope, budget, or allocation
3. Calculate NEW ABSOLUTE values for "update" action, not deltas
4. When adding hours to a phase, also update work_hours to match
5. Dates must be YYYY-MM-DD format
6. Always include a "reply" field with human-readable explanation
7. If uncertain about which task, use "clarify" action
8. For questions without changes, use "query" action

## OUTPUT FORMAT
Always return valid JSON:
{{"action": "update|log_hours|add_hours|query|clarify", "reply": "Human readable response", ...}}
"""


def process_ai_request(query: str, history: Optional[List[Dict]] = None) -> Dict:
    """Process a user query through the AI with full context and conversation history."""
    context = build_full_context()
    intent = detect_intent(query, context)

    task_context = build_task_context_string(context["tasks"])
    resource_context = build_resource_context_string(context["resource_allocation"])

    summary = context["summary"]
    summary_str = f"""
PROJECT SUMMARY (as of {context['today']}):
- Total Tasks: {summary.get('total_tasks', 0)}
- Total Hours: {summary.get('total_hours', 0)} scheduled | {summary.get('total_baseline', 0)} baseline
- Variance: {summary.get('total_variance', 0)}h
- Progress: {summary.get('avg_percent', 0):.1f}% average | {summary.get('total_completed', 0)}h completed | {summary.get('total_remaining', 0)}h remaining
- Earned Value: {summary.get('total_earned_value', 0)}h
"""

    if context["issues"]:
        issues_str = "\nCURRENT ISSUES:\n"
        for issue in context["issues"][:5]:
            issues_str += f"- {issue['message']}\n"
    else:
        issues_str = "\nNo critical issues detected.\n"

    full_context = f"""
{summary_str}
{issues_str}
{task_context}
{resource_context}
"""

    system_prompt = build_system_prompt()
    user_prompt = f"""
{full_context}

---
USER QUERY: {query}
---

Analyze the query and respond with appropriate JSON action.
"""

    result = call_llm(system_prompt, user_prompt, history=history)

    if not result["success"]:
        return result

    return {"success": True, "data": result["data"], "intent": intent}


# ============================================================================
# ACTION HANDLERS
# ============================================================================


def handle_add_hours(data: Dict, context: Dict) -> Dict:
    """Handle add_hours action — increases scope/budget (work_hours)."""
    task_id = data.get("task_id")
    hours = data.get("hours", 0)
    phase = data.get("phase")
    mode = data.get("mode")

    task = get_task(task_id)
    if not task:
        return {"success": False, "message": f"Task {task_id} not found"}

    # Check if the task has any phase hours at all
    has_phases = (
        task.get("dev_hours", 0) > 0
        or task.get("test_hours", 0) > 0
        or task.get("review_hours", 0) > 0
    )

    if not phase and not mode:
        if not has_phases:
            # No phases exist - just add directly to work_hours
            current_total = task.get("work_hours", 0)
            new_total = round(current_total + hours, 1)
            changes = [{"id": task_id, "field": "work_hours", "value": new_total}]
            return {"success": True, "changes": changes}

        options = create_phase_selection_options(task, hours)
        action_id = create_pending_action(
            task_id, "phase_selection", f"Add {hours}h", options
        )

        return {
            "success": True,
            "reply": f"Which phase of **{task['task']}** should I add {hours}h to?",
            "needs_confirmation": True,
            "pending_action_id": action_id,
            "options": options,
        }

    changes = []
    current_total = task.get("work_hours", 0)
    new_total = current_total + hours

    if mode == "scale_all":
        if current_total > 0:
            scale_factor = new_total / current_total
            changes.append(
                {
                    "id": task_id,
                    "field": "dev_hours",
                    "value": round(task.get("dev_hours", 0) * scale_factor, 1),
                }
            )
            changes.append(
                {
                    "id": task_id,
                    "field": "test_hours",
                    "value": round(task.get("test_hours", 0) * scale_factor, 1),
                }
            )
            changes.append(
                {
                    "id": task_id,
                    "field": "review_hours",
                    "value": round(task.get("review_hours", 0) * scale_factor, 1),
                }
            )
    elif phase:
        phase_field = {
            "development": "dev_hours",
            "testing": "test_hours",
            "review": "review_hours",
        }.get(phase)
        if phase_field:
            current_phase = task.get(phase_field, 0)
            changes.append(
                {
                    "id": task_id,
                    "field": phase_field,
                    "value": round(current_phase + hours, 1),
                }
            )

    changes.append({"id": task_id, "field": "work_hours", "value": round(new_total, 1)})

    return {"success": True, "changes": changes}


def handle_log_hours(data: Dict, context: Dict) -> Dict:
    """Handle log_hours action — records completed work, updates progress and dates."""
    task_id = data.get("task_id")
    hours = data.get("hours", 0)
    phase = data.get("phase")

    task = get_task(task_id)
    if not task:
        return {"success": False, "message": f"Task {task_id} not found"}

    work_hours = task.get("work_hours", 0) or 0
    current_completed = task.get("hours_completed", 0) or 0
    new_completed = current_completed + hours

    changes = []

    # If completed work exceeds allocated hours, increase work_hours too
    if new_completed > work_hours and work_hours > 0:
        changes.append(
            {"id": task_id, "field": "work_hours", "value": round(new_completed, 1)}
        )
        work_hours = new_completed
    elif work_hours <= 0:
        # Task has no hours allocated — set work_hours to what's been completed
        changes.append(
            {"id": task_id, "field": "work_hours", "value": round(new_completed, 1)}
        )
        work_hours = new_completed

    # Calculate new percent complete
    new_percent = (
        min(round((new_completed / work_hours) * 100), 100) if work_hours > 0 else 0
    )
    changes.append({"id": task_id, "field": "percent_complete", "value": new_percent})

    # Update phase completion if phase specified
    if phase:
        phase_map = {
            "development": ("dev_hours", "dev_percent"),
            "testing": ("test_hours", "test_percent"),
            "review": ("review_hours", "review_percent"),
        }
        if phase in phase_map:
            hours_field, pct_field = phase_map[phase]
            phase_total = task.get(hours_field, 0) or 0
            if phase_total > 0:
                old_pct = task.get(pct_field, 0) or 0
                old_phase_completed = phase_total * (old_pct / 100)
                new_phase_completed = old_phase_completed + hours
                new_phase_pct = min(
                    round((new_phase_completed / phase_total) * 100), 100
                )
                changes.append(
                    {"id": task_id, "field": pct_field, "value": new_phase_pct}
                )

    return {"success": True, "changes": changes}


def create_phase_selection_options(task: Dict, hours_delta: float) -> List[Dict]:
    """Create options when user didn't specify which phase to add hours to."""
    current_total = task.get("work_hours", 0)
    new_total = current_total + hours_delta

    current_dev = task.get("dev_hours", 0)
    current_test = task.get("test_hours", 0)
    current_review = task.get("review_hours", 0)

    options = [
        {
            "option": 1,
            "label": f"Add to Development (+{hours_delta}h)",
            "description": f"Dev: {current_dev}h -> {current_dev + hours_delta}h | Total: {current_total}h -> {new_total}h",
            "changes": [
                {
                    "id": task["id"],
                    "field": "dev_hours",
                    "value": current_dev + hours_delta,
                },
                {"id": task["id"], "field": "work_hours", "value": new_total},
            ],
        },
        {
            "option": 2,
            "label": f"Add to Testing (+{hours_delta}h)",
            "description": f"Test: {current_test}h -> {current_test + hours_delta}h | Total: {current_total}h -> {new_total}h",
            "changes": [
                {
                    "id": task["id"],
                    "field": "test_hours",
                    "value": current_test + hours_delta,
                },
                {"id": task["id"], "field": "work_hours", "value": new_total},
            ],
        },
        {
            "option": 3,
            "label": f"Add to Review (+{hours_delta}h)",
            "description": f"Review: {current_review}h -> {current_review + hours_delta}h | Total: {current_total}h -> {new_total}h",
            "changes": [
                {
                    "id": task["id"],
                    "field": "review_hours",
                    "value": current_review + hours_delta,
                },
                {"id": task["id"], "field": "work_hours", "value": new_total},
            ],
        },
        {
            "option": 4,
            "label": "Scale all phases proportionally",
            "description": f"Distribute +{hours_delta}h across Dev/Test/Review based on current ratios",
            "changes": [],
        },
        {
            "option": 5,
            "label": "Cancel",
            "description": "No changes",
            "changes": [],
        },
    ]

    if current_total > 0:
        scale_factor = new_total / current_total
        new_dev = round(current_dev * scale_factor, 1)
        new_test = round(current_test * scale_factor, 1)
        new_review = round(current_review * scale_factor, 1)
        options[3]["changes"] = [
            {"id": task["id"], "field": "dev_hours", "value": new_dev},
            {"id": task["id"], "field": "test_hours", "value": new_test},
            {"id": task["id"], "field": "review_hours", "value": new_review},
            {"id": task["id"], "field": "work_hours", "value": new_total},
        ]
        options[3][
            "description"
        ] = f"Dev: {new_dev}h | Test: {new_test}h | Review: {new_review}h"

    return options


# ============================================================================
# APPLY CHANGES
# ============================================================================


def apply_changes(changes: List[Dict]) -> Dict:
    """Apply validated changes to the database, batched per task."""
    # Filter out read-only / auto-calculated fields the AI sometimes tries to set
    auto_fields = {"variance", "earned_value"}
    filtered_changes = [c for c in changes if c.get("field") not in auto_fields]

    validation = validate_all_changes(filtered_changes)

    if not validation["all_valid"]:
        errors = []
        for result in validation["results"]:
            if not result["valid"]:
                errors.extend(result["errors"])
        return {"success": False, "message": f"Validation failed: {'; '.join(errors)}"}

    # Group all changes by task_id so we apply them in a single update_task call
    task_updates = {}
    for change in filtered_changes:
        task_id = int(change["id"])
        field = change["field"]
        value = change["value"]
        if task_id not in task_updates:
            task_updates[task_id] = {}
        task_updates[task_id][field] = value

    logs = []
    total_applied = 0

    for task_id, updates in task_updates.items():
        task = get_task(task_id)
        if not task:
            continue

        # Log each field change
        for field, value in updates.items():
            old_value = task.get(field, "?")
            logs.append(f"{task['task']}: {field} {old_value} -> {value}")

        # Apply ALL fields for this task in one call
        update_task(task_id, updates)
        total_applied += len(updates)

        log_change(
            "AI_EDIT",
            task["task"],
            task.get("resource", ""),
            "; ".join(f"{f}: {task.get(f, '?')} -> {v}" for f, v in updates.items()),
        )

    return {"success": True, "logs": logs, "changes_applied": total_applied}


# ============================================================================
# MAIN ENTRY POINTS
# ============================================================================


def chat(query: str, history: Optional[List[Dict]] = None) -> Dict:
    """Main entry point for chat requests with conversation history."""
    result = process_ai_request(query, history=history)

    if not result["success"]:
        return result

    ai_data = result["data"]
    action = ai_data.get("action", "query")
    reply = ai_data.get("reply", "Done.")

    if action == "query":
        return {
            "success": True,
            "reply": reply,
            "logs": [],
            "changes_count": 0,
        }

    elif action == "clarify":
        return {
            "success": True,
            "reply": ai_data.get("question", reply),
            "needs_clarification": True,
            "options": ai_data.get("options", []),
            "changes_count": 0,
        }

    elif action == "log_hours":
        context = build_full_context()
        log_result = handle_log_hours(ai_data, context)

        if not log_result.get("success"):
            return {
                "success": False,
                "message": log_result.get("message", "Failed to log hours"),
            }

        if log_result.get("changes"):
            apply_result = apply_changes(log_result["changes"])
            return {
                "success": True,
                "reply": reply,
                "logs": apply_result.get("logs", []),
                "changes_count": apply_result.get("changes_applied", 0),
            }

        return {"success": True, "reply": reply, "logs": [], "changes_count": 0}

    elif action == "add_hours":
        context = build_full_context()
        add_result = handle_add_hours(ai_data, context)

        if add_result.get("needs_confirmation"):
            return add_result

        if add_result.get("changes"):
            apply_result = apply_changes(add_result["changes"])
            return {
                "success": True,
                "reply": reply,
                "logs": apply_result.get("logs", []),
                "changes_count": apply_result.get("changes_applied", 0),
            }

    elif action == "update":
        changes = ai_data.get("changes", [])

        if not changes:
            return {
                "success": True,
                "reply": reply,
                "logs": [],
                "changes_count": 0,
            }

        apply_result = apply_changes(changes)

        if not apply_result["success"]:
            return {
                "success": False,
                "message": apply_result.get("message", "Failed to apply changes"),
            }

        return {
            "success": True,
            "reply": reply,
            "logs": apply_result.get("logs", []),
            "changes_count": apply_result.get("changes_applied", 0),
        }

    else:
        changes = ai_data.get("changes", [])
        if changes:
            apply_result = apply_changes(changes)
            return {
                "success": True,
                "reply": reply,
                "logs": apply_result.get("logs", []),
                "changes_count": apply_result.get("changes_applied", 0),
            }

        return {
            "success": True,
            "reply": reply,
            "logs": [],
            "changes_count": 0,
        }


def confirm_action(action_id: int, chosen_option: int) -> Dict:
    """Confirm and execute a pending action."""
    return execute_pending_action(action_id, chosen_option)
