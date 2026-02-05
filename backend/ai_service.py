"""
AI Service - LLM Integration with Multi-Turn Conversations
============================================================
Handles natural language → database operations with clarification prompts.
"""

import os
import json
import re
import urllib.request
import urllib.error
from pathlib import Path

from database import (
    get_all_tasks,
    get_task,
    update_task,
    log_change,
    create_pending_action,
    get_pending_action,
    execute_pending_action,
    get_lead_preference,
    adjust_task_phase,
    DEFAULT_PHASE_RATIOS,
)

# Load environment
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    with open(env_path, "r") as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ[k] = v


def call_llm(prompt: str) -> dict:
    """Call the LLM API."""
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return {"success": False, "message": "API Key missing in .env"}

    try:
        url = "https://models.inference.ai.azure.com/chat/completions"
        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": "You are a helpful assistant that outputs JSON.",
                },
                {"role": "user", "content": prompt},
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

        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode())
            ai_content = result["choices"][0]["message"]["content"]
            return {"success": True, "data": json.loads(ai_content)}

    except urllib.error.HTTPError as e:
        return {"success": False, "message": f"API Error: {e.code} {e.reason}"}
    except Exception as e:
        return {"success": False, "message": f"Error: {str(e)}"}


def detect_phase_adjustment(query: str, tasks: list) -> dict:
    """Detect if query is about phase-specific adjustments."""
    query_lower = query.lower()

    phase_keywords = {
        "development": ["development", "dev", "developing", "coding", "implementation"],
        "testing": ["testing", "test", "qa", "quality"],
        "review": ["review", "reviewing", "code review"],
    }

    detected_phase = None
    for phase, keywords in phase_keywords.items():
        if any(kw in query_lower for kw in keywords):
            detected_phase = phase
            break

    hours_match = re.search(
        r"(\d+)\s*(?:hours?|hrs?|h)\s*(?:more|longer|extra|additional)?", query_lower
    )
    hours_delta = float(hours_match.group(1)) if hours_match else None

    task_match = None
    for t in tasks:
        if t["task"].lower() in query_lower:
            task_match = t
            break

    return {
        "phase": detected_phase,
        "hours_delta": hours_delta,
        "task": task_match,
        "needs_clarification": detected_phase is not None
        and hours_delta is not None
        and task_match is not None,
    }


def create_phase_adjustment_options(task: dict, phase: str, hours_delta: float) -> list:
    """Create options for phase adjustment."""
    current_total = task["work_hours"]
    new_total = current_total + hours_delta

    phase_field = {
        "development": "dev_hours",
        "testing": "test_hours",
        "review": "review_hours",
    }[phase]
    current_phase_hours = task.get(phase_field, 0)

    option_a = {
        "option": 1,
        "label": f"Add {hours_delta}h to {phase.title()} only",
        "description": f"{phase.title()}: {current_phase_hours}h → {current_phase_hours + hours_delta}h | Total: {current_total}h → {new_total}h",
        "changes": [
            {
                "id": task["id"],
                "field": phase_field,
                "value": current_phase_hours + hours_delta,
            },
            {"id": task["id"], "field": "work_hours", "value": new_total},
        ],
    }

    if current_total > 0:
        scale_pct = (hours_delta / current_total) * 100
        scale_factor = new_total / current_total

        new_dev = round(task.get("dev_hours", 0) * scale_factor, 1)
        new_test = round(task.get("test_hours", 0) * scale_factor, 1)
        new_review = round(task.get("review_hours", 0) * scale_factor, 1)

        option_b = {
            "option": 2,
            "label": f"Scale all phases by +{scale_pct:.1f}%",
            "description": f"Dev: {new_dev}h | Test: {new_test}h | Review: {new_review}h",
            "changes": [
                {"id": task["id"], "field": "dev_hours", "value": new_dev},
                {"id": task["id"], "field": "test_hours", "value": new_test},
                {"id": task["id"], "field": "review_hours", "value": new_review},
                {"id": task["id"], "field": "work_hours", "value": new_total},
            ],
        }
    else:
        option_b = {
            "option": 2,
            "label": "N/A (no existing hours)",
            "description": "No existing hours",
            "changes": [],
        }

    option_c = {
        "option": 3,
        "label": "Cancel",
        "description": "No changes",
        "changes": [],
    }

    return [option_a, option_b, option_c]


def process_ai_request(query: str) -> dict:
    """Send query to LLM with phase-aware logic and clarification."""
    tasks = get_all_tasks()

    # Check for phase-specific adjustment first
    phase_detection = detect_phase_adjustment(query, tasks)

    if phase_detection["needs_clarification"]:
        task = phase_detection["task"]
        phase = phase_detection["phase"]
        hours_delta = phase_detection["hours_delta"]

        # Check lead preference
        pref = get_lead_preference(task["resource"])

        if pref and pref.get("default_adjustment_mode") not in (None, "ask"):
            mode = pref["default_adjustment_mode"]
            adjust_task_phase(task["id"], phase, hours_delta, mode)
            return {
                "success": True,
                "data": {
                    "reply": f"Applied {hours_delta}h to {task['task']} ({mode})",
                    "changes": [],
                    "auto_applied": True,
                },
            }

        options = create_phase_adjustment_options(task, phase, hours_delta)
        action_id = create_pending_action(
            task["id"], "phase_adjustment", query, options
        )

        return {
            "success": True,
            "data": {
                "reply": f"📋 **{task['task']}** {phase.title()} needs +{hours_delta}h. How should I adjust?",
                "needs_confirmation": True,
                "pending_action_id": action_id,
                "options": options,
                "changes": [],
            },
        }

    # Standard LLM processing
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return {"success": False, "message": "API Key missing in .env"}

    # Build context with phase info
    context = "Current Project State:\n"
    context += "ID | Task | Resource | Total | Dev | Test | Review | Finish | %\n"
    context += "-" * 90 + "\n"
    for t in tasks:
        context += f"{t['id']} | {t['task']} | {t['resource']} | {t['work_hours']} | "
        context += f"{t.get('dev_hours', 0)} | {t.get('test_hours', 0)} | {t.get('review_hours', 0)} | "
        context += f"{t['finish_date']} | {t['percent_complete']}%\n"

    system_prompt = f"""You are a Project Management AI Assistant.
You manage the following dataset:
{context}

User Query: "{query}"

CAPABILITIES:
1. **Add Time**: "Task X takes 20 hours longer" → ADD to work_hours
2. **Phase Updates**: Update dev_hours, test_hours, review_hours
3. **Resource Reassignment**: Change resource field
4. **Date Shifts**: Update finish_date
5. **Progress Updates**: Update percent_complete

RULES:
- Calculate NEW absolute values
- Update finish_date if hours change (8h/day)
- Return JSON only

Output Format:
{{
    "reply": "Brief summary",
    "changes": [
        {{ "id": 104, "field": "work_hours", "value": 1862 }}
    ]
}}

Valid fields: task, resource, work_hours, dev_hours, test_hours, review_hours, start_date, finish_date, percent_complete
"""

    return call_llm(system_prompt)


def apply_ai_updates(changes: list) -> list:
    """Apply list of changes from AI."""
    logs = []

    for change in changes:
        task_id = int(change["id"])
        field = change["field"]
        value = change["value"]

        task = get_task(task_id)
        if not task:
            logs.append(f"Task {task_id} not found")
            continue

        old_value = task.get(field, "?")
        update_task(task_id, {field: value})
        log_change(
            "AI_EDIT",
            task["task"],
            task["resource"],
            f"{field}: {old_value} -> {value}",
        )
        logs.append(f"{task['task']}: {field} {old_value} → {value}")

    return logs


def confirm_action(action_id: int, chosen_option: int) -> dict:
    """Confirm and execute a pending action."""
    return execute_pending_action(action_id, chosen_option)


def chat(query: str) -> dict:
    """Main entry point for chat requests."""
    result = process_ai_request(query)

    if not result["success"]:
        return result

    ai_data = result["data"]

    # If needs confirmation, return without applying
    if ai_data.get("needs_confirmation"):
        return {
            "success": True,
            "reply": ai_data["reply"],
            "needs_confirmation": True,
            "pending_action_id": ai_data["pending_action_id"],
            "options": ai_data["options"],
            "changes_count": 0,
        }

    changes = ai_data.get("changes", [])
    reply = ai_data.get("reply", "Done.")

    logs = []
    if changes:
        logs = apply_ai_updates(changes)

    return {
        "success": True,
        "reply": reply,
        "logs": logs,
        "changes_count": len(changes),
    }
