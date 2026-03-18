from collections import Counter, defaultdict
from typing import Tuple, Dict, List
from sklearn.tree import DecisionTreeClassifier
from .models import Event

DEFAULT_TASKS = [1, 2, 3, 4, 5, 6]
DEFAULT_ACTIONS = ["open", "edit", "complete", "details"]

ACTION_TO_INT = {
    "open": 0,
    "edit": 1,
    "complete": 2,
    "details": 3,
}

INT_TO_ACTION = {v: k for k, v in ACTION_TO_INT.items()}


def _aggregate_task_features(events: List[Event]) -> Dict[int, dict]:
    """
    Aggregiert Interaktionsdaten pro Aufgabe.
    """
    task_features = {
        task_id: {
            "task_clicks": 0,
            "open_count": 0,
            "edit_count": 0,
            "details_count": 0,
            "complete_count": 0,
            "dwell_total_ms": 0,
            "dwell_events": 0,
            "completed": 0,
        }
        for task_id in DEFAULT_TASKS
    }

    for e in events:
        # Task-Klicks
        if e.event_type == "click_task" and e.target.startswith("task:"):
            task_id = int(e.target.split(":")[1])
            if task_id in task_features:
                task_features[task_id]["task_clicks"] += 1

        # Dwell
        elif e.event_type == "dwell_task" and e.target.startswith("task:"):
            task_id = int(e.target.split(":")[1])
            if task_id in task_features:
                dwell_ms = int(e.meta.get("dwell_ms", 0) or 0)
                task_features[task_id]["dwell_total_ms"] += dwell_ms
                task_features[task_id]["dwell_events"] += 1

        # Aktionen
        elif e.event_type == "click_action" and e.target.startswith("action:"):
            action = e.target.split(":")[1]
            task_id = e.meta.get("task_id")
            if task_id in task_features:
                if action == "open":
                    task_features[task_id]["open_count"] += 1
                elif action == "edit":
                    task_features[task_id]["edit_count"] += 1
                elif action == "details":
                    task_features[task_id]["details_count"] += 1
                elif action == "complete":
                    task_features[task_id]["complete_count"] += 1

        # Abgeschlossen
        elif e.event_type == "task_complete" and e.target.startswith("task:"):
            task_id = int(e.target.split(":")[1])
            if task_id in task_features:
                task_features[task_id]["completed"] = 1

    return task_features


def _feature_vector(feature_dict: dict) -> List[float]:
    avg_dwell = 0.0
    if feature_dict["dwell_events"] > 0:
        avg_dwell = feature_dict["dwell_total_ms"] / feature_dict["dwell_events"]

    return [
        feature_dict["task_clicks"],
        feature_dict["open_count"],
        feature_dict["edit_count"],
        feature_dict["details_count"],
        feature_dict["complete_count"],
        avg_dwell,
        feature_dict["completed"],
    ]


def _build_training_data(events: List[Event]) -> Tuple[List[List[float]], List[int]]:
    """
    Baut Trainingsdaten aus historischen Action-Events.
    Für jede Aktion wird der aktuelle Feature-Zustand der Aufgabe als Input genommen.
    """
    X = []
    y = []

    # Schrittweise Aggregation, damit vor jeder Aktion der aktuelle Zustand als Feature verwendet wird
    running_features = {
        task_id: {
            "task_clicks": 0,
            "open_count": 0,
            "edit_count": 0,
            "details_count": 0,
            "complete_count": 0,
            "dwell_total_ms": 0,
            "dwell_events": 0,
            "completed": 0,
        }
        for task_id in DEFAULT_TASKS
    }

    for e in events:
        if e.event_type == "click_task" and e.target.startswith("task:"):
            task_id = int(e.target.split(":")[1])
            if task_id in running_features:
                running_features[task_id]["task_clicks"] += 1

        elif e.event_type == "dwell_task" and e.target.startswith("task:"):
            task_id = int(e.target.split(":")[1])
            if task_id in running_features:
                dwell_ms = int(e.meta.get("dwell_ms", 0) or 0)
                running_features[task_id]["dwell_total_ms"] += dwell_ms
                running_features[task_id]["dwell_events"] += 1

        elif e.event_type == "click_action" and e.target.startswith("action:"):
            action = e.target.split(":")[1]
            task_id = e.meta.get("task_id")

            if task_id in running_features and action in ACTION_TO_INT:
                # Vor der Aktion als Trainingsbeispiel nutzen
                X.append(_feature_vector(running_features[task_id]))
                y.append(ACTION_TO_INT[action])

                # Danach den Zustand updaten
                if action == "open":
                    running_features[task_id]["open_count"] += 1
                elif action == "edit":
                    running_features[task_id]["edit_count"] += 1
                elif action == "details":
                    running_features[task_id]["details_count"] += 1
                elif action == "complete":
                    running_features[task_id]["complete_count"] += 1

        elif e.event_type == "task_complete" and e.target.startswith("task:"):
            task_id = int(e.target.split(":")[1])
            if task_id in running_features:
                running_features[task_id]["completed"] = 1

    return X, y


def _fallback_highlighted_actions(task_features: Dict[int, dict]) -> List[str]:
    """
    Fallback, falls noch nicht genug Trainingsdaten für den Decision Tree vorhanden sind.
    """
    action_scores = Counter()

    for _, f in task_features.items():
        action_scores["open"] += f["open_count"]
        action_scores["edit"] += f["edit_count"]
        action_scores["details"] += f["details_count"]
        action_scores["complete"] += f["complete_count"]

    top_actions = [a for a, _ in action_scores.most_common(2)]
    return top_actions if top_actions else ["open"]


def decide_layout(events: List[Event]) -> Tuple[List[int], List[str], Dict[str, str]]:
    """
    Gibt zurück:
    - Reihenfolge der Aufgaben
    - hervorgehobene Aktionen
    - rationale Hinweise
    """
    task_features = _aggregate_task_features(events)

    # Reihenfolge weiterhin nachvollziehbar über einfache Priorisierung
    def task_score(task_id: int) -> float:
        f = task_features[task_id]
        avg_dwell = (
            f["dwell_total_ms"] / f["dwell_events"] if f["dwell_events"] > 0 else 0
        )
        return (
            f["task_clicks"] * 3
            + f["open_count"] * 2
            + f["edit_count"] * 3
            + f["details_count"] * 1.5
            + f["complete_count"] * 2
            + avg_dwell / 1000.0
        )

    ordered_tasks = sorted(DEFAULT_TASKS, key=lambda t: (-task_score(t), t))

    # Decision Tree trainieren
    X, y = _build_training_data(events)

    if len(X) >= 5 and len(set(y)) >= 2:
        # print("[DecisionTree] Training aktiv")
        # print(f"[DecisionTree] Trainingsbeispiele: {len(X)}")
        # print(f"[DecisionTree] Klassen: {set(y)}")
        clf = DecisionTreeClassifier(max_depth=3, random_state=42)
        clf.fit(X, y)

        predicted_actions = []
        for task_id in ordered_tasks:
            fv = _feature_vector(task_features[task_id])
            pred = clf.predict([fv])[0]
            predicted_actions.append(INT_TO_ACTION[pred])

        highlighted_actions = list(dict.fromkeys(predicted_actions))[:2]
    else:
        # print("[DecisionTree] Fallback aktiv")
        # print(f"[DecisionTree] Trainingsbeispiele: {len(X)}")
        # print(f"[DecisionTree] Klassen: {set(y)}")
        highlighted_actions = _fallback_highlighted_actions(task_features)

    rationale = {}

    for t in ordered_tasks[:3]:
        f = task_features[t]
        rationale[f"task:{t}"] = (
            f"Priorisiert aufgrund der bisherigen Nutzung "
            f"(Klicks={f['task_clicks']}, Bearbeitungen={f['edit_count']}, "
            f"Details={f['details_count']})."
        )

    for action in highlighted_actions:
        rationale[f"action:{action}"] = (
            f"Empfohlene Aktion basierend auf der durch den Decision Tree "
            f"abgeleiteten Nutzungstendenz."
        )

    return ordered_tasks, highlighted_actions, rationale