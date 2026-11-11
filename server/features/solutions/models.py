"""solutions 域出参模型。"""

from pydantic import BaseModel, ConfigDict, Field


class StepOut(BaseModel):
    no: int
    observe: str
    act: str
    found: str


class SymptomOut(BaseModel):
    type: str
    title: str
    text: str


class ProblemOut(BaseModel):
    """三段式第一段「问题现场」；镜像 detail.problem，impactHint 沿用 camelCase。"""

    model_config = ConfigDict(populate_by_name=True)
    intro: str
    role: str
    architecture: str
    symptoms: list[SymptomOut]
    timeline: str
    impact_hint: str = Field(alias="impactHint")


class ArticleOut(BaseModel):
    id: str
    title: str
    layer: str
    domain: str
    steps: list[StepOut]
    lessons: list[str]
    author: str
    published_at: str
    problem: ProblemOut | None = None
    root_cause: str | None = None
    principles: list[str] = []
