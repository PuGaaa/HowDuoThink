"""素材服务：校验 → OSS 写入 → 落库；资源位绑定；清单/派发 = 表内容 + CDN 前缀（settings）。
本模块同时承担数据访问层（assets / resource_slots 表的 SQL 都在这里）。
异常三态供路由层映射：AssetError→400 / NotConfiguredError→503 / AssetUnavailableError→502 / RateLimitError→429。"""
import datetime
import hashlib
import re
import time
import uuid

import db
from core import config, settings
from features.assets import oss

ALLOWED_EXTS = {"png", "jpg", "jpeg", "webp", "gif", "svg"}
CONTENT_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
    "svg": "image/svg+xml",
}
ALLOWED_CATEGORIES = {"mascot", "avatar", "banner", "misc"}

# 资源位注册表：key 固定（App 端按此引用），绑定哪张图由管理端随时更换。
# 头像池不需要槽位：category='avatar' 的全部素材即池子，App 按 URL 列表取用。
MASCOT_SLOTS = [
    "mascot.frog",
    "mascot.snail",
    "mascot.otter",
    "mascot.rabbit",
    "mascot.dino",
]


class AssetError(ValueError):
    """入参不合法（400）。"""


class NotConfiguredError(Exception):
    """OSS 环境变量未配齐（503）。"""


class AssetUnavailableError(Exception):
    """OSS 读写出错（502，不泄露底层细节）。"""


class RateLimitError(Exception):
    """频控触发（429）。"""


# 每用户每日上传次数上限：防 editor 账号脚本化刷 OSS 存储/流量
UPLOAD_DAILY_LIMIT = 100


def _safe_filename(name: str) -> str:
    return re.sub(r"[^0-9A-Za-z._-]+", "_", name or "file")[:80]


def _ext_of(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _url(object_key: str) -> str:
    base = str(settings.get("assets.cdn_base") or "").strip()
    base = base if base else oss.bucket_base_url()
    return base.rstrip("/") + "/" + object_key


def _public_row(row) -> dict:
    return {
        "id": row["id"],
        "key": row["object_key"],
        "url": _url(row["object_key"]),
        "filename": row["filename"],
        "category": row["category"],
        "size": row["size_bytes"],
        "sha256": row["sha256"],
        "note": row["note"],
        "uploaded_by": row["uploaded_by"],
        "created_at": row["created_at"],
    }


def upload(data: bytes, filename: str, category: str, note: str, uid: str) -> dict:
    if not oss.configured():
        raise NotConfiguredError()
    today = time.strftime("%Y-%m-%d", time.gmtime())
    rows = db.q(
        "SELECT COUNT(*) AS n FROM assets WHERE uploaded_by=? AND substr(created_at,1,10)=?",
        (uid, today),
    )
    if int(rows[0]["n"] or 0) >= UPLOAD_DAILY_LIMIT:
        raise RateLimitError("今日上传次数已达上限")
    if not data:
        raise AssetError("空文件")
    if category not in ALLOWED_CATEGORIES:
        raise AssetError("分类不合法")
    ext = _ext_of(filename)
    if ext not in ALLOWED_EXTS:
        raise AssetError(f"不支持的文件类型 .{ext or '（无后缀）'}")
    if len(filename) > 255:
        # MySQL filename VARCHAR(255)：超长在严格模式 500、SQLite 无感——入口显式 400 拉平
        raise AssetError("文件名过长（≤255 字符）")
    if len(note) > 512:
        raise AssetError("备注过长（≤512 字符）")
    max_bytes = config.OSS_MAX_UPLOAD_MB * 1024 * 1024
    if len(data) > max_bytes:
        raise AssetError(f"文件超过上限 {config.OSS_MAX_UPLOAD_MB}MB")

    sha = hashlib.sha256(data).hexdigest()
    # 同分类同内容秒传：直接返回已有行，不重复占桶
    rows = db_q_by_sha(sha, category)
    if rows:
        return _public_row(rows[0])

    today = datetime.date.today().strftime("%Y%m")
    object_key = (
        f"{config.OSS_KEY_PREFIX}/{category}/{today}/{uuid.uuid4().hex[:12]}-{_safe_filename(filename)}"
    )
    try:
        oss.put_bytes(object_key, data, CONTENT_TYPES[ext])
    except Exception as e:
        raise AssetUnavailableError(f"OSS 写入失败：{e}") from e
    db.ex(
        "INSERT INTO assets(object_key, filename, category, content_type, size_bytes, sha256, note, uploaded_by) "
        "VALUES(?,?,?,?,?,?,?,?)",
        (object_key, filename, category, CONTENT_TYPES[ext], len(data), sha, note, uid),
    )
    row = db.q("SELECT * FROM assets WHERE object_key=?", (object_key,))[0]
    return _public_row(row)


def db_q_by_sha(sha: str, category: str) -> list:
    return db.q("SELECT * FROM assets WHERE sha256=? AND category=?", (sha, category))


def list_rows(category: str | None = None) -> list[dict]:
    if category:
        rows = db.q("SELECT * FROM assets WHERE category=? ORDER BY id DESC", (category,))
    else:
        rows = db.q("SELECT * FROM assets ORDER BY id DESC")
    return [_public_row(r) for r in rows]


def delete(asset_id: int, uid: str) -> None:
    rows = db.q("SELECT * FROM assets WHERE id=?", (asset_id,))
    if not rows:
        raise AssetError("素材不存在")
    row = rows[0]
    try:
        oss.delete_key(row["object_key"])
    except Exception as e:
        raise AssetUnavailableError(f"OSS 删除失败：{e}") from e
    with db.tx() as conn:
        conn.execute("DELETE FROM resource_slots WHERE asset_id=?", (asset_id,))
        conn.execute("DELETE FROM assets WHERE id=?", (asset_id,))


# ---------- 资源位（固定 key → 可替换素材）：App 端按 slot key 引用 ----------


class SlotError(ValueError):
    """资源位操作不合法（400）。"""


def bind_slot(slot: str, asset_id: int, uid: str) -> None:
    if slot not in MASCOT_SLOTS:
        raise SlotError("未知资源位")
    if not db.q("SELECT id FROM assets WHERE id=?", (asset_id,)):
        raise SlotError("素材不存在")
    db.ex(
        "INSERT INTO resource_slots(slot, asset_id, updated_by) VALUES(?,?,?) "
        "ON CONFLICT(slot) DO UPDATE SET asset_id=excluded.asset_id, updated_at=datetime('now'), updated_by=excluded.updated_by",
        (slot, asset_id, uid),
    )


def unbind_slot(slot: str) -> None:
    if slot not in MASCOT_SLOTS:
        raise SlotError("未知资源位")
    db.ex("DELETE FROM resource_slots WHERE slot=?", (slot,))


def slots_admin() -> list[dict]:
    """管理端视图：全部槽位 + 当前绑定素材（未绑定为 None）。"""
    bound = {r["slot"]: r["asset_id"] for r in db.q("SELECT slot, asset_id FROM resource_slots")}
    out = []
    for s in MASCOT_SLOTS:
        item: dict = {"slot": s, "name": s.split(".", 1)[1], "asset": None}
        aid = bound.get(s)
        if aid is not None:
            arows = db.q("SELECT * FROM assets WHERE id=?", (aid,))
            if arows:
                item["asset"] = _public_row(arows[0])
        out.append(item)
    return out


def app_resources() -> dict:
    """客户端资源派发（公开）：吉祥物槽位 URL 表 + 头像池 URL 列表。
    version 随内容集变化，App 端可据此判断是否需要刷新本地缓存。"""
    bound = {r["slot"]: r["asset_id"] for r in db.q("SELECT slot, asset_id FROM resource_slots")}
    mascots: dict[str, str] = {}
    for s in MASCOT_SLOTS:
        aid = bound.get(s)
        if aid is None:
            continue
        arows = db.q("SELECT object_key FROM assets WHERE id=?", (aid,))
        if arows:
            mascots[s.split(".", 1)[1]] = _url(arows[0]["object_key"])
    avatars = [
        _url(r["object_key"])
        for r in db.q("SELECT object_key FROM assets WHERE category='avatar' ORDER BY id")
    ]
    digest = hashlib.sha1(
        ("|".join(f"{k}:{v}" for k, v in sorted(mascots.items())) + "||" + "|".join(avatars)).encode()
    ).hexdigest()[:12]
    return {"version": digest, "mascots": mascots, "avatars": avatars}


def manifest() -> dict:
    """公开清单：App 启动拉取后按 url 取用。version 随内容集变化，供客户端做缓存判断。"""
    rows = db.q(
        "SELECT object_key, category, size_bytes, sha256, created_at FROM assets ORDER BY id"
    )
    items = [
        {
            "key": r["object_key"],
            "url": _url(r["object_key"]),
            "category": r["category"],
            "size": r["size_bytes"],
            "sha256": r["sha256"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]
    digest = hashlib.sha1(
        "|".join(f"{i['key']}:{i['sha256']}" for i in items).encode()
    ).hexdigest()[:12]
    return {"version": digest, "count": len(items), "items": items}
