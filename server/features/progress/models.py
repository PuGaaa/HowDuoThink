"""progress 域模型：进度投影与事实操作。"""

from typing import Any

from pydantic import BaseModel, Field


class ProgressCase(BaseModel):
    solved: bool = False
    best_grade: str = Field(default="", max_length=4, alias="bestGrade")
    best_cost: int = Field(default=0, ge=0, le=999, alias="bestCost")
    plays: int = Field(default=0, ge=0)
    fails: int = Field(default=0, ge=0)

    model_config = {"populate_by_name": True}


class ProgressBlob(BaseModel):
    cases: dict[str, ProgressCase] = Field(default_factory=dict)
    streak: dict[str, Any] = Field(default_factory=dict)
    mascots: dict[str, Any] = Field(default_factory=dict)
    tasks: dict[str, Any] = Field(default_factory=dict)
    daily_done: str = Field(default="", alias="dailyDone")
    checkuse: int = Field(default=0, ge=0)

    model_config = {"populate_by_name": True}


class ProgressOperation(BaseModel):
    op_id: str = Field(alias="opId")
    kind: str
    occurred_at: str = Field(alias="occurredAt")
    payload: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class ProgressSyncBody(BaseModel):
    operations: list[ProgressOperation] = Field(default_factory=list)
