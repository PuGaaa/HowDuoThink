"""向 users 表幂等写入一个「App Store 审核演示账号 + 密码」，供 iOS 提审时提供给 Apple 审核员登录。

用途
    upsert 一个普通可登录用户（role='user'、status='active'、绑定手机号、bcrypt 密码哈希）。
    按手机号幂等：重复执行不报错，密码/资料被刷新为本次参数，不产生重复行。

用法（环境加载与 dev.sh 同构：先 source 对应环境的 .env 让进程继承连接配置；
本脚本不读取、不打印任何 .env* 文件的值，只使用进程环境变量）
    dev（本机，连接串来自 server/.env.dev.local，与 dev.sh 的加载方式一致）：
        cd server && set -a && . ./.env.dev.local && set +a && .venv/bin/python ops/seed_test_account.py
    预发 / 生产（部署机部署目录内执行；api 容器已由 compose 注入 .env，ops/ 随镜像分发）：
        docker compose exec api python ops/seed_test_account.py --phone 13800000001 --password '演示密码'
    只查询不写入（写入后验证用）：
        ... ops/seed_test_account.py --check

参数
    --phone     手机号，默认 13800000001（明显测试号段）；校验 ^1[3-9]\\d{9}$（与 auth 入参一致）
    --password  登录密码；未传时用内置默认值并打印提示（仅供测试，可随时重跑覆盖）。
                长度规则与 features/auth/models.py 一致：6–128 字符且 ≤72 字节（bcrypt 上限）。
    --check     只打印非敏感列（手机号/角色/状态/创建时间等），不写入。

安全边界
    - 密码哈希复用 core/security.hash_password（bcrypt），与登录/改密链路同一函数，不自造哈希。
    - 输出只打印密码掩码（如 Hdu****），绝不回显明文密码或哈希。
    - 目标手机号若已被非本脚本创建的账号占用（可能是真实用户），拒绝写入并退出，
      防止在生产覆盖真实用户密码；账号 id/login 固定派生自手机号（review-<phone>），
      与 dev-（开发绕行）、ph-（验证码建号）、pw-admin（管理员引导）命名空间互不重叠。
"""

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # server/ 入 sys.path，复用 core/*

from core import config, db, security  # noqa: E402

DEFAULT_PHONE = "13800000001"
DEFAULT_PASSWORD = "HduReview2026"  # 仅供测试的内置默认密码；正式演示前可用 --password 覆盖
SEED_NAME = "审核演示账号"
_PHONE_RE = re.compile(r"^1[3-9]\d{9}$")

# SQLite 方言书写（? 占位 / ON CONFLICT ... DO UPDATE），MySQL 引擎由 core/db._translate 统一翻译；
# phone 列带 UNIQUE KEY ux_users_phone，冲突目标成立。写入列与 0001_baseline 的 users 表一致。
_UPSERT_SQL = (
    "INSERT INTO users(id, login, name, avatar, role, status, password_hash, phone) "
    "VALUES(?,?,?,?,?,?,?,?) "
    "ON CONFLICT(phone) DO UPDATE SET login=excluded.login, name=excluded.name, avatar=excluded.avatar, "
    "role=excluded.role, status=excluded.status, password_hash=excluded.password_hash"
)
_SHOW_COLUMNS = "id, login, name, avatar, role, status, phone, created_at"


def mask(password: str) -> str:
    """密码掩码：只露前 3 位，输出永不出现明文或哈希。"""
    return password[:3] + "****"


def seed_id(phone: str) -> str:
    return "review-" + phone


def seed_login(phone: str) -> str:
    return "review" + phone


def validate_password(password: str) -> None:
    """与 features/auth/models.py 的 PasswordChange 校验同规则：6–128 字符、≤72 字节。"""
    if not 6 <= len(password) <= 128:
        sys.exit("拒绝写入：密码长度需 6–128 字符（与 App 登录入口一致）")
    if len(password.encode()) > 72:
        sys.exit("拒绝写入：密码过长（最多 72 字节，bcrypt 上限；中文约 24 个字）")


def precheck(phone: str) -> None:
    """生产安全护栏：手机号/id/login 任一已被「别的账号」占用即拒绝，绝不覆盖真实用户。"""
    sid, slogin = seed_id(phone), seed_login(phone)
    rows = db.q("SELECT id FROM users WHERE phone=?", (phone,))
    if rows and rows[0]["id"] != sid:
        sys.exit(f"拒绝写入：手机号 {phone} 已被既有账号占用（id={rows[0]['id']}，可能是真实用户），请改用其他 --phone")
    rows = db.q("SELECT phone FROM users WHERE id=?", (sid,))
    if rows and rows[0]["phone"] != phone:
        sys.exit(f"拒绝写入：id={sid} 已绑定其他手机号，请改用其他 --phone 或人工核对")
    rows = db.q("SELECT id FROM users WHERE login=?", (slogin,))
    if rows and rows[0]["id"] != sid:
        sys.exit(f"拒绝写入：login={slogin} 已被其他账号（id={rows[0]['id']}）占用，请改用其他 --phone")


def seed(phone: str, password: str) -> None:
    validate_password(password)
    precheck(phone)
    existed = bool(db.q("SELECT id FROM users WHERE phone=?", (phone,)))
    db.ex(
        _UPSERT_SQL,
        (seed_id(phone), seed_login(phone), SEED_NAME, "", "user", "active", security.hash_password(password), phone),
    )
    action = "更新（幂等 upsert，密码已刷新）" if existed else "新建"
    print(f"已写入演示账号：{action}")
    show(phone)


def show(phone: str) -> None:
    """打印非敏感列（不含 password_hash），供执行后人工核对。"""
    rows = db.q(f"SELECT {_SHOW_COLUMNS} FROM users WHERE phone=?", (phone,))
    if not rows:
        sys.exit(f"未找到手机号 {phone} 对应的账号")
    for key, value in rows[0].items():
        print(f"{key}\t{value}")


def main() -> None:
    parser = argparse.ArgumentParser(description="写入/更新 App Store 审核演示账号（按手机号幂等 upsert）")
    parser.add_argument("--phone", default=DEFAULT_PHONE, help="手机号（默认 %(default)s，测试号段）")
    parser.add_argument("--password", default=None, help="登录密码；未传用内置默认值（仅供测试）")
    parser.add_argument("--check", action="store_true", help="只查询不写入")
    args = parser.parse_args()

    if not _PHONE_RE.match(args.phone):
        sys.exit(f"拒绝写入：手机号格式不合法：{args.phone!r}（要求形如 13800000001）")
    print(f"目标库：{config.MYSQL_HOST}:{config.MYSQL_PORT}/{config.MYSQL_DATABASE}")

    if args.check:
        show(args.phone)
        return

    password = args.password
    if password is None:
        password = DEFAULT_PASSWORD
        print("提示：未指定 --password，使用内置默认密码（仅供测试，可被 --password 覆盖）")
    print(f"密码（掩码）：{mask(password)}")
    seed(args.phone, password)


if __name__ == "__main__":
    main()
