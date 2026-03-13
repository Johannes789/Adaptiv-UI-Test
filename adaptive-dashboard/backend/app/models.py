from pydantic import BaseModel, Field
from typing import Optional, Literal, Dict, Any
from datetime import datetime

Condition = Literal["static", "adaptive"]

class Event(BaseModel):
    user_id: str = Field(..., description="Pseudonymisierte Test-ID")
    condition: Condition
    event_type: str = Field(..., description="z.B. click_task, click_action, view")
    target: str = Field(..., description="z.B. task:3 oder action:complete")
    ts: datetime = Field(default_factory=datetime.utcnow)
    meta: Dict[str, Any] = Field(default_factory=dict)

class LayoutResponse(BaseModel):
    condition: Condition
    ordered_task_ids: list[int]
    highlighted_actions: list[str]
    rationale: Dict[str, str]  # kurze Erklärungen (Transparenz)