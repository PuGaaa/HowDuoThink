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

# 向量化：local = 内置字符 bigram 哈希向量（零依赖零 API 费）；zhipu = 智谱 embedding-3（需 ZHIPU_API_KEY）
EMBED_PROVIDER = os.environ.get("EMBED_PROVIDER", "local")
ZHIPU_API_KEY = os.environ.get("ZHIPU_API_KEY", "")
ZHIPU_BASE_URL = os.environ.get("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
GLM_EMBED_MODEL = os.environ.get("GLM_EMBED_MODEL", "embedding-3")
GLM_EMBED_DIM = int(os.environ.get("GLM_EMBED_DIM", "1024"))
