"""环境变量集中地：所有配置只在这里读 os.environ，其余模块一律 import core.config。
JWT_SECRET 未设置时使用进程内随机密钥（重启后所有会话失效，生产必须显式配置）。"""

import os
import secrets

from sqlalchemy.engine import URL

_jwt_secret_env = os.environ.get("JWT_SECRET", "")
JWT_SECRET = _jwt_secret_env or secrets.token_hex(32)
JWT_SECRET_EPHEMERAL = not bool(_jwt_secret_env)
WEB_ORIGIN = os.environ.get("WEB_ORIGIN", "http://localhost:3000")
# 管理端独立工程（admin/）的访问源：CORS 白名单用；空 = 未部署管理端前端
ADMIN_WEB_ORIGIN = os.environ.get("ADMIN_WEB_ORIGIN", "")
APP_H5_ORIGIN = os.environ.get("APP_H5_ORIGIN", "http://127.0.0.1:5183")
# 管理端 SPA 构建产物目录（绝对路径，或相对 server/ 目录）；未构建时 /admin 返回 404
ADMIN_DIST_DIR = os.environ.get("ADMIN_DIST_DIR", "admin_dist")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
# 登录防爆破与 AI 单价已迁至 core/settings（运行时经管理端「系统设置」调整，
# env 变量 LOGIN_MAX_FAILURES / LOGIN_LOCK_SECONDS / DEEPSEEK_PRICE_IN / DEEPSEEK_PRICE_OUT 仍作部署默认值）。
# 显式开发模式开关：/api/dev/login 与 admin* 提权捷径只在 ENV=dev 下可用
DEV_MODE = os.environ.get("ENV", "").lower() == "dev"
# 生产 HTTPS 部署时设 COOKIE_SECURE=1，会话 cookie 仅经 HTTPS 传输
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "") == "1"

# 短信：所有环境使用同一 provider 实现，仅配置项随部署环境变化。
SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "dev")
ALIYUN_SMS_ACCESS_KEY = os.environ.get("ALIYUN_SMS_ACCESS_KEY", "")
ALIYUN_SMS_SECRET = os.environ.get("ALIYUN_SMS_SECRET", "")
ALIYUN_SMS_SIGN = os.environ.get("ALIYUN_SMS_SIGN", "")
ALIYUN_SMS_TEMPLATE = os.environ.get("ALIYUN_SMS_TEMPLATE", "")

# —— AI：对话/起草走 DeepSeek（OpenAI 兼容端点）；向量默认本地字符 bigram，可选智谱 embedding-3 ——
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
AI_BASE_URL = os.environ.get("AI_BASE_URL", "https://api.deepseek.com")
AI_CHAT_MODEL = os.environ.get("AI_CHAT_MODEL", "deepseek-chat")

# 数据库：所有环境统一 MySQL 8，MYSQL_* 仅配置连接与容量。
DB_PROVIDER = "mysql"
MYSQL_HOST = os.environ.get("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", "3306"))
MYSQL_USER = os.environ.get("MYSQL_USER", "hdt")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.environ.get("MYSQL_DATABASE", "hdt")
MYSQL_POOL_SIZE = int(os.environ.get("MYSQL_POOL_SIZE", "5"))
MYSQL_POOL_MAX_OVERFLOW = int(os.environ.get("MYSQL_POOL_MAX_OVERFLOW", "5"))
MYSQL_POOL_TIMEOUT = float(os.environ.get("MYSQL_POOL_TIMEOUT", "5"))

# 向量化：fastembed = 本地 BGE-M3（默认，ONNX CPU 推理，模型首用下载到 FASTEMBED_CACHE_DIR）；
#         zhipu = 智谱 embedding-3（需 ZHIPU_API_KEY）；local = 内置字符 bigram（零资源兜底）
EMBED_PROVIDER = os.environ.get("EMBED_PROVIDER", "fastembed")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "BAAI/bge-small-zh-v1.5")
FASTEMBED_CACHE_DIR = os.environ.get("FASTEMBED_CACHE_DIR", "")
ZHIPU_API_KEY = os.environ.get("ZHIPU_API_KEY", "")
ZHIPU_BASE_URL = os.environ.get("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
GLM_EMBED_MODEL = os.environ.get("GLM_EMBED_MODEL", "embedding-3")
GLM_EMBED_DIM = int(os.environ.get("GLM_EMBED_DIM", "1024"))

# AI 用量审计的成本单价也迁至 core/settings（见上注）。

# 错误追踪：Sentry（免费档）。无 DSN = 不启用（运行时降级；所有环境装同一份 requirements 保持同构）
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
SENTRY_ENV = os.environ.get("SENTRY_ENV", os.environ.get("ENV", "prod"))

# 服务健康快照：后台线程间隔（秒）与保留天数
OPS_SNAPSHOT_INTERVAL = int(os.environ.get("OPS_SNAPSHOT_INTERVAL", "300"))
OPS_RETENTION_DAYS = int(os.environ.get("OPS_RETENTION_DAYS", "30"))

# —— 对象存储 OSS（素材管理）：阿里云 oss2。四项配齐素材功能才可用，缺任一 = 路由 503 降级 ——
OSS_ENDPOINT = os.environ.get("OSS_ENDPOINT", "")
OSS_BUCKET = os.environ.get("OSS_BUCKET", "") or os.environ.get("OSS_BUCKET_NAME", "")
OSS_ACCESS_KEY_ID = os.environ.get("OSS_ACCESS_KEY_ID", "")
OSS_ACCESS_KEY_SECRET = os.environ.get("OSS_ACCESS_KEY_SECRET", "") or os.environ.get("OSS_SECRET_ACCESS_KEY", "")
# 对象 key 前缀与单文件上限（MB）
OSS_KEY_PREFIX = os.environ.get("OSS_KEY_PREFIX", "assets")
OSS_MAX_UPLOAD_MB = int(os.environ.get("OSS_MAX_UPLOAD_MB", "10"))

# 全局请求体上限（MB）：无上限 body 是内存 DoS 面（声明式 Content-Length 超限即 413）
BODY_LIMIT_MB = int(os.environ.get("BODY_LIMIT_MB", "64"))


def mysql_database_url() -> URL:
    """使用结构化字段构造 MySQL URL，凭据中的特殊字符不参与 URL 语法解析。"""
    return URL.create(
        "mysql+pymysql",
        username=MYSQL_USER,
        password=MYSQL_PASSWORD,
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        database=MYSQL_DATABASE,
        query={"charset": "utf8mb4"},
    )


def oss_configured() -> bool:
    return bool(OSS_ENDPOINT and OSS_BUCKET and OSS_ACCESS_KEY_ID and OSS_ACCESS_KEY_SECRET)
