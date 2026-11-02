"""兼容 shim：db 已迁至 core/db.py（feature 架构）。"""

from core.db import *  # noqa: F401,F403
from core.db import DB_PATH, connect, ex, init, jdump, jload, q, tx  # noqa: F401
