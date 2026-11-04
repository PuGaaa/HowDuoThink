"""6523490冻结目录的旧解锁规则，仅用于历史资格迁移。"""

from pathlib import Path

from pydantic import BaseModel, Field

from features.progress.models import ProgressBlob


class FrozenChapter(BaseModel):
    id: str
    part: str
    required_case_ids: list[str] = Field(alias="requiredCaseIds")
    challenge_case_id: str = Field(alias="challengeCaseId")


class FrozenCourse(BaseModel):
    chapters: list[FrozenChapter]


COURSE = FrozenCourse.model_validate_json(Path(__file__).with_name("course-20261104.json").read_text())


def unlocked_chapters(baseline: ProgressBlob) -> list[str]:
    solved = {cid for cid, progress in baseline.cases.items() if progress.solved}
    unlocked = set(baseline.unlocked_chapter_ids)
    previous: dict[str, FrozenChapter] = {}
    for chapter in COURSE.chapters:
        prior = previous.get(chapter.part)
        if prior is None or chapter.challenge_case_id in solved or set(prior.required_case_ids) <= solved:
            unlocked.add(chapter.id)
        previous[chapter.part] = chapter
    return sorted(unlocked)
