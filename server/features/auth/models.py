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

    @field_validator("new_password")
    @classmethod
    def _bcrypt_72_bytes(cls, v: str) -> str:
        # bcrypt 5.0 起 >72 字节直接抛 ValueError（4.x 为静默截断）：入口收口为 400，
        # 否则改密 500，且 4.x 截断哈希的用户跨版本升级后会被静默锁死
        if len(v.encode()) > 72:
            raise ValueError("密码过长（最多 72 字节；中文约 24 个字）")
        return v


class SmsSendBody(BaseModel):
    phone: str = Field(pattern=r"^1[3-9]\d{9}$")


class PhoneLoginBody(BaseModel):
    phone: str = Field(pattern=r"^1[3-9]\d{9}$")
    code: str = Field(min_length=6, max_length=6)


class BindPhoneBody(BaseModel):
    phone: str = Field(pattern=r"^1[3-9]\d{9}$")
    code: str = Field(min_length=6, max_length=6)


class PasswordResetVerifyBody(BaseModel):
    """忘记密码第一步：短信验证手机号。"""

    phone: str = Field(pattern=r"^1[3-9]\d{9}$")
    code: str = Field(min_length=6, max_length=6)


class PasswordResetBody(BaseModel):
    """忘记密码第二步：凭重置票据免旧密码设新密码。"""

    reset_token: str = Field(min_length=1, max_length=1024, alias="resetToken")
    new_password: str = Field(min_length=6, max_length=128, alias="newPassword")

    @field_validator("new_password")
    @classmethod
    def _bcrypt_72_bytes(cls, v: str) -> str:
        if len(v.encode()) > 72:
            raise ValueError("密码过长（最多 72 字节；中文约 24 个字）")
        return v
