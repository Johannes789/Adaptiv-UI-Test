from pathlib import Path
from typing import List
from .models import Event

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(exist_ok=True)

def _file_for_user(user_id: str) -> Path:
    return DATA_DIR / f"events_{user_id}.jsonl"

def append_event(ev: Event) -> None:
    path = _file_for_user(ev.user_id)
    with path.open("a", encoding="utf-8") as f:
        f.write(ev.model_dump_json() + "\n")

def read_events(user_id: str) -> List[Event]:
    path = _file_for_user(user_id)
    if not path.exists():
        return []

    events = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(Event.model_validate_json(line))
    return events

def read_all_events() -> List[Event]:
    events = []
    for path in DATA_DIR.glob("events_*.jsonl"):
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    events.append(Event.model_validate_json(line))
    return events