"""submissions 域模型。"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class SubmissionCreate(BaseModel):
    """用户投稿：必填 3 项 + 选填——轻是设计，字段与 Case 素材一一对应。"""

    title: str = Field(min_length=4, max_length=40)
    symptom: str = Field(min_length=10, max_length=1200)
    resolution: str = Field(min_length=10, max_length=2400)
    key_error: str | None = Field(default=None, max_length=600, alias="keyError")
    timeline: str | None = Field(default=None, max_length=300)
    lessons: list[str] = Field(default_factory=list, max_length=3)
    stack_tags: list[str] = Field(default_factory=list, max_length=6)
    domain_hint: str | None = Field(default=None, max_length=20, alias="domainHint")

    @field_validator("lessons")
    @classmethod
    def _lessons(cls, v: list[str]) -> list[str]:
        for x in v:
            if len(x) > 80:
                raise ValueError("单条经验 ≤80 字")
        return v


class SubmissionStatusBody(BaseModel):
    status: Literal["pending", "accepted", "rejected", "archived"]
    review_note: str = Field(default="", max_length=600, alias="reviewNote")
