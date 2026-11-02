"""auth 域入参模型。"""

from pydantic import BaseModel, Field, field_validator


class LoginBody(BaseModel):
    login: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=128)


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    avatar_url: str | None = Field(default=None, max_length=500, alias="avatarUrl")

    @field_validator("avatar_url")
    @classmethod
    def _avatar(cls, v: str | None) -> str | None:
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("头像必须是 http(s) 图片链接")
        return v


class PasswordChange(BaseModel):
    old_password: str = Field(default="", max_length=128, alias="oldPassword")
    new_password: str = Field(min_length=6, max_length=128, alias="newPassword")


class SmsSendBody(BaseModel):
    phone: str = Field(pattern=r"^1[3-9]\d{9}$")


class PhoneLoginBody(BaseModel):
    phone: str = Field(pattern=r"^1[3-9]\d{9}$")
    code: str = Field(min_length=6, max_length=6)


class BindPhoneBody(BaseModel):
    phone: str = Field(pattern=r"^1[3-9]\d{9}$")
    code: str = Field(min_length=6, max_length=6)
