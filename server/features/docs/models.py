"""docs 域出入参。"""

from pydantic import BaseModel, Field


class DocUpdateBody(BaseModel):
    # TEXT 上限 64KB，中文约 2 万字；隐私政策实际 5~8k 字，给足余量即可
    content: str = Field(min_length=1, max_length=20000)
