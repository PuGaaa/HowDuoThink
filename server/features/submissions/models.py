"""submissions 域模型。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SubmissionMaterial(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    """用户投稿：必填 3 项 + 选填——轻是设计，字段与 Case 素材一一对应。"""

    title: str = Field(min_length=4, max_length=40)
    symptom: str = Field(min_length=10, max_length=1200)
    resolution: str = Field(min_length=10, max_length=2400)
    key_error: str | None = Field(default=None, max_length=600, alias="keyError")
    timeline: str | None = Field(default=None, max_length=300)
    lessons: list[str] = Field(default_factory=list, max_length=3)
    stack_tags: list[str] = Field(default_factory=list, max_length=6, alias="stackTags")
    domain_hint: str | None = Field(default=None, max_length=20, alias="domainHint")

    @field_validator("lessons")
    @classmethod
    def _lessons(cls, v: list[str]) -> list[str]:
        for x in v:
            if len(x) > 80:
                raise ValueError("单条经验 ≤80 字")
        return v


class SubmissionCreate(SubmissionMaterial):
    request_id: str = Field(min_length=1, max_length=80, alias="requestId")


class SubmissionStatusBody(BaseModel):
    status: Literal["pending", "needs_more", "accepted", "rejected", "archived"]
    review_note: str = Field(default="", max_length=600, alias="reviewNote")


class SupplementBody(BaseModel):
    text: str = Field(min_length=4, max_length=3000)


class DraftMaterial(SubmissionMaterial):
    domain_hint: Literal["network", "data", "build", "runtime", "deploy", "concurrency"] = Field(alias="domainHint")


class MaterialBody(BaseModel):
    material: DraftMaterial


class ConsentBody(BaseModel):
    version: int = Field(ge=1)


class ReviewBody(BaseModel):
    decision: Literal["distinct", "merge", "needs_more", "reject"]
    mechanism: str = Field(min_length=4, max_length=1200)
    evidence: str = Field(min_length=4, max_length=1200)
    reasoning: str = Field(min_length=4, max_length=1200)
    candidate_ids: list[str] = Field(default_factory=list, alias="candidateIds")
    linked_case_id: str | None = Field(default=None, alias="linkedCaseId")
    parent_submission_id: str | None = Field(default=None, alias="parentSubmissionId")
    public_note: str = Field(default="", max_length=1200, alias="publicNote")
    internal_note: str = Field(default="", max_length=3000, alias="internalNote")


class SubmissionReceipt(BaseModel):
    id: str
    status: str
    duplicate: bool


class SubmissionMessage(BaseModel):
    id: int
    author_id: str
    visibility: str
    kind: str
    body: str
    created_at: str


class SubmissionView(BaseModel):
    id: str
    title: str
    symptom: str
    resolution: str
    keyError: str | None
    timeline: str | None
    lessons: list[str]
    stackTags: list[str]
    domainHint: str | None
    status: str
    displayStatus: Literal["received", "needs_more", "producing", "published", "rejected"]
    reviewNote: str | None
    createdAt: str
    author: str | None
    caseId: str | None
    playPath: str | None
    articlePath: str | None
    linkedCaseId: str | None
    parentSubmissionId: str | None
    materialVersion: int
    materialConfirmed: bool
    materialCurrent: bool
    material: DraftMaterial | None
    messages: list[SubmissionMessage]


class InternalReview(BaseModel):
    source_revision: int
    material_source_revision: int
    material_version: int
    confirmed_version: int
    reviewed_material_version: int
    decision: str | None
    mechanism: str | None
    evidence: str | None
    reasoning: str | None
    candidate_ids: str
    reviewer_id: str | None


class AdminSubmissionView(SubmissionView):
    review: InternalReview


class SimilarCandidate(BaseModel):
    id: str
    key: str
    kind: str
    status: str
    title: str
    excerpt: str
    url: str | None
    score: int


class SimilarResult(BaseModel):
    items: list[SimilarCandidate]


class Contributor(BaseModel):
    authorId: str
    author: str
    role: Literal["source", "evidence"]


class ContributorsResult(BaseModel):
    items: list[Contributor]


class PublicationSource(BaseModel):
    submission_id: str
    author_name: str | None
    author_login: str | None
    material_version: int
