"""auth 域·bcrypt 72 字节限制：bcrypt 5.0 起 >72 字节密码抛 ValueError（4.x 静默截断），
入口必须收口为 400，否则注册/改密 500、跨版本升级时存量用户静默锁死。"""

import os

from tests.conftest import login_admin, make_client

PW_24_CN = "好" * 24  # 24 个中文 = 72 字节，边界内
PW_25_CN = "好" * 25  # 25 个中文 = 75 字节，超限
# 管理员测试密码从 conftest 注入的环境变量派生，文件内不落明文凭据
ADMIN = os.environ["ADMIN_PASSWORD"]


def test_change_password_over_72_bytes_rejected_422():
    """改密 >72 字节：422 入参校验拒绝（项目惯例状态码；原实现 max_length=128 字符
    放行 → bcrypt 5.0 抛错 → 500）。"""
    with make_client() as c:
        login_admin(c)
        r = c.post("/api/me/password", json={"newPassword": PW_25_CN, "oldPassword": ADMIN})
        assert r.status_code == 422, f"期望 422，实际 {r.status_code}: {r.text}"
        assert "72" in r.json()["detail"][0]["msg"]


def test_change_password_at_72_bytes_ok():
    """恰 72 字节（24 中文）：正常改密成功。"""
    with make_client() as c:
        login_admin(c)
        r = c.post("/api/me/password", json={"newPassword": PW_24_CN, "oldPassword": ADMIN})
        assert r.status_code == 200, r.text
        # 改回，避免污染同会话后续用例（login_admin 依赖 ADMIN_PASSWORD 对应密码）
        r2 = c.post("/api/me/password", json={"newPassword": ADMIN, "oldPassword": PW_24_CN})
        assert r2.status_code == 200, r2.text


def test_login_over_72_bytes_password_401_not_500():
    """登录路径本就安全（verify 捕获 ValueError → 401）：回归哨兵，禁止退化成 500。"""
    with make_client() as c:
        r = c.post("/api/auth/login", json={"login": "admin", "password": PW_25_CN})
        assert r.status_code == 401, f"期望 401，实际 {r.status_code}"
