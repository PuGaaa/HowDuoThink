"""进度同步契约：历史档案、版本化成绩与有身份的事实操作。"""

from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator


class Model(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class ProgressCase(Model):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    solved: bool = False
    best_grade: str = Field(default="", alias="bestGrade")
    best_cost: int | None = Field(default=None, ge=0, alias="bestCost")
    plays: int = Field(default=0, ge=0)
    fails: int = Field(default=0, ge=0)


class Streak(Model):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    last: str = ""
    count: int = 0


class Tasks(Model):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    day: str = ""
    week: str = ""
    daily: dict[str, int] = Field(default_factory=dict)
    weekly: dict[str, int] = Field(default_factory=dict)
    daily_history: dict[str, dict[str, int]] = Field(default_factory=dict, alias="dailyHistory")
    weekly_history: dict[str, dict[str, int]] = Field(default_factory=dict, alias="weeklyHistory")


class ProgressBlob(Model):
    """旧格式只作档案；日期、评级与累计数原样保留，不伪造版本。"""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    cases: dict[str, ProgressCase] = Field(default_factory=dict)
    streak: Streak = Field(default_factory=Streak)
    mascots: dict[str, int] = Field(default_factory=dict)
    tasks: Tasks = Field(default_factory=Tasks)
    daily_done: str = Field(default="", alias="dailyDone")
    checkuse: int = Field(default=0, ge=0)
    unlocked_chapter_ids: list[str] = Field(default_factory=list, alias="unlockedChapterIds")


class Score(Model):
    content_revision: int = Field(alias="contentRevision")
    scoring_version: int = Field(alias="scoringVersion")
    best_grade: str = Field(default="", alias="bestGrade")
    best_cost: int | None = Field(default=None, alias="bestCost")


class CaseProjection(ProgressCase):
    content_revision: int | None = Field(default=None, alias="contentRevision")
    scoring_version: int | None = Field(default=None, alias="scoringVersion")
    scores: dict[str, Score] = Field(default_factory=dict)


class ProgressState(Model):
    schema_version: Literal[2] = Field(default=2, alias="schemaVersion")
    cases: dict[str, CaseProjection] = Field(default_factory=dict)
    streak: Streak = Field(default_factory=Streak)
    mascots: dict[str, int] = Field(default_factory=dict)
    tasks: Tasks = Field(default_factory=Tasks)
    daily_done: str = Field(default="", alias="dailyDone")
    checkuse: int = 0
    unlocked_chapter_ids: list[str] = Field(default_factory=list, alias="unlockedChapterIds")
    legacy_baseline: ProgressBlob | None = Field(default=None, alias="legacyBaseline")
    legacy_archives: dict[str, ProgressBlob] = Field(default_factory=dict, alias="legacyArchives")


class MascotEvent(Model):
    id: Literal["frog", "snail", "otter", "rabbit", "dino"]


class SessionPayload(Model):
    session_id: str = Field(min_length=1, max_length=191, alias="sessionId")
    case_id: str = Field(alias="caseId")
    content_revision: int = Field(ge=1, alias="contentRevision")
    scoring_version: int = Field(ge=1, alias="scoringVersion")
    expert_cost: int = Field(gt=0, alias="expertCost")
    chapter_id: str = Field(min_length=1, alias="chapterId")
    solved: bool
    grade: Literal["S", "A", "B", "F"]
    player_cost: int = Field(ge=0, alias="playerCost")
    wrong_identifies: int = Field(default=0, ge=0, alias="wrongIdentifies")
    mascot_events: list[MascotEvent] = Field(default_factory=list, alias="mascotEvents")
    anonymous_id: str | None = Field(default=None, alias="anonymousId")
    event_id: str | None = Field(default=None, alias="eventId")
    test_mode: bool = Field(default=False, alias="testMode")


class ImportPayload(Model):
    archive_id: str = Field(min_length=1, max_length=191, alias="archiveId")
    bundle: ProgressBlob


class ChecklistPayload(Model):
    pass


class TaskPayload(Model):
    metric: Literal["hypo"]
    amount: int = Field(ge=1)


class DailyPayload(Model):
    session_id: str = Field(alias="sessionId")
    case_id: str = Field(alias="caseId")


class UnlockPayload(Model):
    chapter_ids: list[str] = Field(alias="chapterIds")


class Operation(Model):
    op_id: str = Field(min_length=1, max_length=191, alias="opId")
    occurred_at: AwareDatetime = Field(alias="occurredAt")

    @field_validator("occurred_at")
    @classmethod
    def _utc(cls, value: datetime) -> datetime:
        return value.astimezone(timezone.utc)


class SessionOperation(Operation):
    kind: Literal["session_end"]
    payload: SessionPayload


class ImportOperation(Operation):
    kind: Literal["bootstrap"]
    payload: ImportPayload


class ChecklistOperation(Operation):
    kind: Literal["checklist_use"]
    payload: ChecklistPayload


class TaskOperation(Operation):
    kind: Literal["task_increment"]
    payload: TaskPayload


class DailyOperation(Operation):
    kind: Literal["daily_done"]
    payload: DailyPayload


class UnlockOperation(Operation):
    kind: Literal["unlocked_chapters"]
    payload: UnlockPayload


ProgressOperation = Annotated[
    SessionOperation | ImportOperation | ChecklistOperation | TaskOperation | DailyOperation | UnlockOperation,
    Field(discriminator="kind"),
]


class ProgressSyncBody(Model):
    operations: list[ProgressOperation] = Field(default_factory=list, max_length=256)


class ProgressSnapshot(ProgressState):
    revision: int = 0
    updated_at: str = Field(default="", alias="updatedAt")


class ProgressSyncResult(ProgressSnapshot):
    confirmed_operation_ids: list[str] = Field(alias="confirmedOperationIds")
