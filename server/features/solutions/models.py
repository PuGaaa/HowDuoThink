"""solutions 域出参模型。"""
from pydantic import BaseModel


class StepOut(BaseModel):
    no: int
    observe: str
    act: str
    found: str


class ArticleOut(BaseModel):
    id: str
    title: str
    layer: str
    domain: str
    steps: list[StepOut]
    lessons: list[str]
    author: str
    published_at: str
