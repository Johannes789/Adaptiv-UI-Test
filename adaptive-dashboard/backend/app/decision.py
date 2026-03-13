from collections import Counter
from typing import Tuple, Dict, List
from .models import Event

DEFAULT_TASKS = [1,2,3,4,5,6]
DEFAULT_ACTIONS = ["open", "edit", "complete", "details"]

def decide_layout(events: List[Event]) -> Tuple[List[int], List[str], Dict[str, str]]:
    # Zähle Task-Klicks und Action-Klicks
    task_clicks = Counter()
    action_clicks = Counter()

    for e in events:
        if e.event_type == "click_task" and e.target.startswith("task:"):
            task_id = int(e.target.split(":")[1])
            task_clicks[task_id] += 1
        if e.event_type == "click_action" and e.target.startswith("action:"):
            action = e.target.split(":")[1]
            action_clicks[action] += 1

    # Sortierung: häufig geklickte Tasks nach oben
    ordered_tasks = sorted(DEFAULT_TASKS, key=lambda t: (-task_clicks[t], t))

    # Hervorhebung: Top-2 Actions
    top_actions = [a for a,_ in action_clicks.most_common(2)]
    highlighted = top_actions if top_actions else ["open"]

    rationale = {}
    for t in ordered_tasks[:3]:
        rationale[f"task:{t}"] = f"Höher priorisiert (Klicks={task_clicks[t]})"
    for a in highlighted:
        rationale[f"action:{a}"] = f"Hervorgehoben (Klicks={action_clicks[a]})"

    return ordered_tasks, highlighted, rationale