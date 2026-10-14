"""progress 域模型：进度云同步的载荷。
v1 同步范围：案例进度 + streak + 动物统计 + 任务计数 + 每日一题 + 检查单使用数。"""
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
