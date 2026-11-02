"""settings 域出入参。"""

from pydantic import BaseModel, Field


class SettingsUpdateBody(BaseModel):
    values: dict[str, int | float | str] = Field(min_length=1, max_length=50)
