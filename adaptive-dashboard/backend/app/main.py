import csv
import io
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .models import Event, LayoutResponse
from .storage import append_event, read_events, read_all_events
from .decision import decide_layout, DEFAULT_TASKS

app = FastAPI(title="Adaptive Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/event")
def log_event(ev: Event):
    append_event(ev)
    return {"status": "ok"}

@app.get("/layout", response_model=LayoutResponse)
def get_layout(user_id: str, condition: str):
    if condition == "static":
        return LayoutResponse(
            condition="static",
            ordered_task_ids=DEFAULT_TASKS,
            highlighted_actions=[],
            rationale={}
        )

    events = [e for e in read_events(user_id) if e.condition == "adaptive"]
    ordered, highlighted, rationale = decide_layout(events)

    return LayoutResponse(
        condition="adaptive",
        ordered_task_ids=ordered,
        highlighted_actions=highlighted,
        rationale=rationale
    )

@app.get("/export_csv")
def export_csv(user_id: str | None = Query(default=None)):
    if user_id:
        events = read_events(user_id)
        filename = f"events_{user_id}.csv"
    else:
        events = read_all_events()
        filename = "events_all.csv"

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "user_id",
        "condition",
        "event_type",
        "target",
        "timestamp",
        "task_id",
        "test_task_id",
        "dwell_ms",
        "duration_ms",
        "success",
        "success_reason"
    ])

    for e in events:
        writer.writerow([
            e.user_id,
            e.condition,
            e.event_type,
            e.target,
            e.ts.isoformat(),
            e.meta.get("task_id", ""),
            e.meta.get("test_task_id", ""),
            e.meta.get("dwell_ms", ""),
            e.meta.get("duration_ms", ""),
            e.meta.get("success", ""),
            e.meta.get("success_reason", "")
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
    
@app.get("/export_summary_csv")
def export_summary_csv(user_id: str | None = Query(default=None)):
    if user_id:
        events = read_events(user_id)
        filename = f"summary_{user_id}.csv"
    else:
        events = read_all_events()
        filename = "summary_all.csv"

    # Gruppierung nach (user_id, condition)
    grouped = {}

    for e in events:
        key = (e.user_id, e.condition)
        if key not in grouped:
            grouped[key] = {
                "user_id": e.user_id,
                "condition": e.condition,
                "task_clicks": 0,
                "action_clicks": 0,
                "dwell_events": 0,
                "total_dwell_ms": 0,
                "avg_dwell_ms": 0,
                "completed_tasks": 0,
                "total_duration_ms": 0,
                "avg_duration_ms": 0,
                "completed_test_tasks": 0,
                "successful_test_tasks": 0,
                "failed_test_tasks": 0,
                "success_rate": 0,
                "refresh_count": 0,
                "switch_count": 0,
            }

        row = grouped[key]

        if e.event_type == "click_task":
            row["task_clicks"] += 1
        elif e.event_type == "click_action":
            row["action_clicks"] += 1
        elif e.event_type == "dwell_task":
            row["dwell_events"] += 1
            row["total_dwell_ms"] += int(e.meta.get("dwell_ms", 0) or 0)
        elif e.event_type == "task_complete":
            row["completed_tasks"] += 1
            row["total_duration_ms"] += int(e.meta.get("duration_ms", 0) or 0)
        elif e.event_type == "test_task_complete":
            row["completed_test_tasks"] += 1
        elif e.event_type == "refresh_layout":
            row["refresh_count"] += 1
        elif e.event_type == "switch_condition":
            row["switch_count"] += 1
        if e.meta.get("success") is True:
            row["successful_test_tasks"] += 1
        else:
            row["failed_test_tasks"] += 1

    # Durchschnittliche Verweildauer berechnen
    for row in grouped.values():
        if row["dwell_events"] > 0:
            row["avg_dwell_ms"] = round(row["total_dwell_ms"] / row["dwell_events"], 2)
        else:
            row["avg_dwell_ms"] = 0

        if row["completed_tasks"] > 0:
            row["avg_duration_ms"] = round(row["total_duration_ms"] / row["completed_tasks"], 2)
        else:
            row["avg_duration_ms"] = 0
        if row["completed_test_tasks"] > 0:
            row["success_rate"] = round(
                row["successful_test_tasks"] / row["completed_test_tasks"] * 100, 2
            )
        else:
            row["success_rate"] = 0

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "user_id",
        "condition",
        "task_clicks",
        "action_clicks",
        "dwell_events",
        "total_dwell_ms",
        "avg_dwell_ms",
        "completed_tasks",
        "total_duration_ms",
        "avg_duration_ms",
        "completed_test_tasks",
        "successful_test_tasks",
        "failed_test_tasks",
        "success_rate",
        "refresh_count",
        "switch_count",
    ])

    for row in grouped.values():
        writer.writerow([
            row["user_id"],
            row["condition"],
            row["task_clicks"],
            row["action_clicks"],
            row["dwell_events"],
            row["total_dwell_ms"],
            row["avg_dwell_ms"],
            row["completed_tasks"],
            row["total_duration_ms"],
            row["avg_duration_ms"],
            row["completed_test_tasks"],
            row["successful_test_tasks"],
            row["failed_test_tasks"],
            row["success_rate"],
            row["refresh_count"],
            row["switch_count"],
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )