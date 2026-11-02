"""assets 域出入参。"""

from pydantic import BaseModel, Field


class SlotBindBody(BaseModel):
    asset_id: int = Field(ge=1)
