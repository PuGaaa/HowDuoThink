"""把存量已发布案例的文章投影批量重建为三段式 detail（问题/根因/层契约）。

用途
    遍历 cases 表 status='published' 的全部案例，复用发布事务里的同一个派生函数
    （features.cases.publication.derive_article）重新生成 articles 投影并落库：
    detail 列补齐三段式，title/steps/lessons/author 等既有列同源重写，无双源漂移。
    这是存量旧格式文章（detail 为 NULL）唯一的升级入口；新发布/修订案例由发布
    事务自动产出三段式，不需要本脚本。

用法（环境加载与 dev.sh 同构：先 source 对应环境的 .env 让进程继承连接配置；
本脚本不读取、不打印任何 .env* 文件的值，只使用进程环境变量）
    dev（本机，连接串来自 server/.env.dev.local，与 dev.sh 的加载方式一致）：
        cd server && set -a && . ./.env.dev.local && set +a && .venv/bin/python ops/rebuild_articles.py
    预发 / 生产（部署机部署目录内执行；api 容器已由 compose 注入 .env，ops/ 随镜像分发）：
        docker compose exec api python ops/rebuild_articles.py

安全边界
    - 只写 articles 表（upsert 幂等），cases 表零接触；重复执行结果一致，可随时重跑。
    - save_article 冲突分支会刷新 published_at，脚本先读原值并在同事务写回，
      保证 solutions 列表按发布时间的排序不被重建打乱。
    - 作者名沿用现有 articles 行的 author；无行或 author 为空时按 cases.author_id
      联查 users（取 name，缺省 @login）兜底；查无用户直接报错终止（宁崩不默）。
    - 派生遇到 0 个 correct 根因会抛 StopIteration（发布门禁保证恰好 1 个），
      属数据异常的 fail-fast 设计，脚本不做兜底。
    - 单个案例失败即终止（带案例 id 重新抛出）：逐 case 独立事务，此前已重建的
      保持成功，修复数据后重跑自动续上。
    - 需先完成 0012_article_detail 迁移（新库/升级由 api 启动时自动执行），
      否则落库缺 detail 列报错。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # server/ 入 sys.path，复用 core/*

from core import config, db  # noqa: E402
from features.cases import repo  # noqa: E402
from features.cases.models import CasePayload  # noqa: E402
from features.cases.publication import derive_article  # noqa: E402


def rebuild_all() -> tuple[int, int]:
    """重建全部已发布案例的文章投影，返回 (rebuilt, total)。

    total 为 status='published' 的案例数；rebuilt 为成功重建数（upsert 全量重写，
    正常跑完两者相等）。单个案例失败抛 RuntimeError 并带案例 id，不吞异常。
    """
    rows = db.q("SELECT id, payload, author_id FROM cases WHERE status='published'")
    total = len(rows)
    rebuilt = 0
    for row in rows:
        cid = row["id"]
        article_id = "a-" + cid
        try:
            # 解析也在 try 内：payload JSON 损坏 / 历史 payload 与当前 schema 漂移时，
            # 异常同样带案例 id 重抛（与下方派生错误同一处理）。
            payload = CasePayload.model_validate(db.jload(row["payload"], {}))
            with db.tx() as conn:
                # 先读原行：author 沿用 + published_at 原值（save_article 冲突分支会刷新时间）
                existing = conn.execute(
                    "SELECT author, published_at FROM articles WHERE id=?", (article_id,)
                ).fetchone()
                if existing and existing["author"]:
                    author = existing["author"]
                else:
                    user = repo.author(conn, row["author_id"]) if row["author_id"] else None
                    if user is None:
                        raise LookupError(
                            f"案例 {cid} 无法确定作者：articles 无行/author 为空，"
                            f"且 author_id={row['author_id']!r} 查无用户"
                        )
                    author = user["name"] or "@" + user["login"]
                repo.save_article(conn, derive_article(payload, author))
                if existing and existing["published_at"]:
                    conn.execute(
                        "UPDATE articles SET published_at=? WHERE id=?", (existing["published_at"], article_id)
                    )
        except Exception as e:
            raise RuntimeError(f"案例 {cid} 重建失败（已重建 {rebuilt}/{total}，修复后重跑自动续上）") from e
        rebuilt += 1
    return rebuilt, total


def main() -> None:
    print(f"目标库：{config.MYSQL_HOST}:{config.MYSQL_PORT}/{config.MYSQL_DATABASE}")
    rebuilt, total = rebuild_all()
    print(f"重建完成：{rebuilt}/{total} 篇文章投影已升级为三段式（幂等，可重跑）")


if __name__ == "__main__":
    main()
