"""progress 域模型：检查单/进度云同步的载荷。
v0 同步范围：案例进度（solved/bestGrade/bestCost/plays）。任务计数不同步。"""
from pydantic import BaseModel, Field


class ProgressCase(BaseModel):
    solved: bool = False
    best_grade: str = Field(default="", max_length=4, alias="bestGrade")
    best_cost: int = Field(default=0, ge=0, le=999, alias="bestCost")
    plays: int = Field(default=0, ge=0)

    model_config = {"populate_by_name": True}


class ProgressBlob(BaseModel):
    cases: dict[str, ProgressCase] = Field(default_factory=dict)
