from datetime import datetime

from pydantic import AwareDatetime, BaseModel, Field


class LearningEventBody(BaseModel):
    kind: str = Field(min_length=1, max_length=64)
    session_id: str = Field(min_length=1, max_length=191, alias="sessionId")
    case_id: str = Field(min_length=1, max_length=64, alias="caseId")
    source: str = Field(min_length=1, max_length=64)
    content_revision: int = Field(default=0, ge=0, alias="contentRevision")
    anonymous_id: str | None = Field(default=None, max_length=191, alias="anonymousId")
    occurred_at: AwareDatetime = Field(default_factory=lambda: datetime.now().astimezone(), alias="occurredAt")
