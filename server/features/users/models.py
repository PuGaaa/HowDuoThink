"""users 域出入参。"""
from typing import Literal

from pydantic import BaseModel


class RoleUpdate(BaseModel):
    role: Literal["user", "editor", "admin"]


class StatusUpdate(BaseModel):
    status: Literal["active", "banned"]
