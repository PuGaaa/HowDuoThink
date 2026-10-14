"""环境变量集中地：所有配置只在这里读 os.environ，其余模块一律 import core.config。
JWT_SECRET 未设置时使用进程内随机密钥（重启后所有会话失效，生产必须显式配置）。"""
import os
import secrets

CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
_jwt_secret_env = os.environ.get("JWT_SECRET", "")
JWT_SECRET = _jwt_secret_env or secrets.token_hex(32)
JWT_SECRET_EPHEMERAL = not bool(_jwt_secret_env)
WEB_ORIGIN = os.environ.get("WEB_ORIGIN", "http://localhost:3000")
# 管理端独立工程（admin/）的访问源：CORS 白名单用；空 = 未部署管理端前端
ADMIN_WEB_ORIGIN = os.environ.get("ADMIN_WEB_ORIGIN", "")
# 管理端 SPA 构建产物目录（绝对路径，或相对 server/ 目录）；未构建时 /admin 返回 404
ADMIN_DIST_DIR = os.environ.get("ADMIN_DIST_DIR", "admin_dist")
GITHUB_ADMIN_LOGINS = set(filter(None, os.environ.get("GITHUB_ADMIN_LOGINS", "").split(",")))
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
# 显式开发模式开关：/api/dev/login 与 admin* 提权捷径只在 ENV=dev 下可用
DEV_MODE = os.environ.get("ENV", "").lower() == "dev"
# 生产 HTTPS 部署时设 COOKIE_SECURE=1，会话 cookie 仅经 HTTPS 传输
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "") == "1"


def oauth_configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET)


# —— AI：对话/起草走 DeepSeek（OpenAI 兼容端点）；向量默认本地字符 bigram，可选智谱 embedding-3 ——
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
AI_BASE_URL = os.environ.get("AI_BASE_URL", "https://api.deepseek.com")
AI_CHAT_MODEL = os.environ.get("AI_CHAT_MODEL", "deepseek-chat")

# 数据库：sqlite（默认，零部署）/ mysql（生产多用户，配 MYSQL_* 五项）
DB_PROVIDER = os.environ.get("DB_PROVIDER", "sqlite")
MYSQL_HOST = os.environ.get("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", "3306"))
MYSQL_USER = os.environ.get("MYSQL_USER", "hdt")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.environ.get("MYSQL_DATABASE", "hdt")

# 向量化：fastembed = 本地 BGE-M3（默认，ONNX CPU 推理，模型首用下载到 FASTEMBED_CACHE_DIR）；
#         zhipu = 智谱 embedding-3（需 ZHIPU_API_KEY）；local = 内置字符 bigram（零资源兜底）
EMBED_PROVIDER = os.environ.get("EMBED_PROVIDER", "fastembed")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "BAAI/bge-small-zh-v1.5")
FASTEMBED_CACHE_DIR = os.environ.get("FASTEMBED_CACHE_DIR", "")
ZHIPU_API_KEY = os.environ.get("ZHIPU_API_KEY", "")
ZHIPU_BASE_URL = os.environ.get("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
GLM_EMBED_MODEL = os.environ.get("GLM_EMBED_MODEL", "embedding-3")
GLM_EMBED_DIM = int(os.environ.get("GLM_EMBED_DIM", "1024"))
