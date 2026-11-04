"""统一发布事务：来源由入口决定，正文修订与投影、审计、索引任务一并提交。"""

from fastapi import HTTPException

import db
from features.cases import content, gate, repo
from features.cases.models import ArticleProjection, ArticleStep, CasePayload, OfficialRelease


def publish_case(uid: str, payload: CasePayload) -> dict:
    return _publish(uid, payload, None)


def import_official(payload: CasePayload, release: OfficialRelease) -> dict:
    """受信 Git 导入入口。路由不暴露该方法，也不以请求 body 决定来源。"""
    if payload.id not in content.OFFICIAL_IDS:
        raise HTTPException(409, "官方清单未登记此案例，请先完成官方发布登记")
    expected = content.OFFICIAL_PUBLICATIONS[payload.id]
    if any(
        getattr(release, field) != expected[key]
        for field, key in (
            ("base_revision", "baseRevision"),
            ("content_revision", "contentRevision"),
            ("source_commit", "sourceCommit"),
            ("content_hash", "contentHash"),
            ("calibration_status", "calibrationStatus"),
        )
    ):
        raise HTTPException(409, "官方发布元数据与受信清单不符，请重新导出")
    if content.content_hash(payload) != release.content_hash:
        raise HTTPException(409, "官方导出正文与核定哈希不符，请重新导出")
    if release.calibration_status == "needs_review":
        raise HTTPException(409, "此正文尚缺匹配的校准记录，不能作为新修订发布")
    if release.calibration_status == "legacy":
        return _initialize_legacy(payload, release)
    return _publish("git-import", payload, release)


def _initialize_legacy(payload: CasePayload, release: OfficialRelease) -> dict:
    """仅初始化已冻结旧快照：不取新游标、不触发新题索引，不代替校准批准。"""
    if (
        payload.id not in content.LEGACY_HASHES
        or release.content_hash != content.LEGACY_HASHES[payload.id]
        or release.content_revision != 1
        or release.source_commit != content.LEGACY_SOURCE_COMMIT
    ):
        raise HTTPException(409, "只有完全匹配冻结见证的 revision=1 存量可初始化")
    with db.tx() as conn:
        current = repo.get(conn, payload.id, lock=True)
        if current:
            if current["submission_id"] is not None or current["source_type"] not in (None, "official"):
                raise HTTPException(409, "冻结官方初始化不能接管社区内容")
            if (
                current["status"] == "published"
                and current["content_revision"] == 1
                and content.content_hash(CasePayload.model_validate(db.jload(current["payload"], {})))
                == release.content_hash
            ):
                return _result(payload.id, 1, repo.current_cursor(conn), True)
            raise HTTPException(409, "存量初始化不能覆盖已存在的不同正文或较新修订")
        stored = dict(
            content.body(payload),
            contentRevision=1,
            sourceType="official",
            sourceCommit=release.source_commit,
            sourceHash=release.content_hash,
            submissionId=None,
            authorName="官方",
            calibrationStatus="legacy",
        )
        repo.publish(conn, None, payload, stored, None, "official", release.source_commit, 1, 0, False)
        repo.mark_legacy(conn, payload.id)
        repo.save_article(conn, _article(payload, "官方"))
        repo.save_revision(
            conn, payload.id, 1, release.content_hash, stored, "official", release.source_commit, None, legacy=True
        )
        return dict(_result(payload.id, 1, repo.current_cursor(conn)), initializedLegacy=True)


def _result(cid: str, revision: int, cursor: int, unchanged: bool = False) -> dict:
    return {"id": cid, "version": cursor, "contentRevision": revision, "articleId": "a-" + cid, "unchanged": unchanged}


def _publish(uid: str, payload: CasePayload, release: OfficialRelease | None) -> dict:
    digest = content.content_hash(payload)
    with db.tx() as conn:
        snapshot = repo.get(conn, payload.id)
        sid = snapshot["submission_id"] if snapshot else None
        if release is None and (
            payload.id in content.OFFICIAL_IDS or (snapshot and snapshot["source_type"] == "official")
        ):
            raise HTTPException(403, "官方正文和元数据只读，请从 Git 唯一源发布")
        if release and snapshot and (sid or snapshot["source_type"] == "community"):
            raise HTTPException(409, "同 ID 已属于社区内容，不能由官方导入覆盖")
        publication = None
        if sid:
            from features.submissions.service import validate_publication

            publication = validate_publication(conn, sid)
        current = repo.get(conn, payload.id, lock=True)
        if (current["submission_id"] if current else None) != sid:
            raise HTTPException(409, "案例来源已变化，请重新载入")
        if current and current["status"] == "archived":
            raise HTTPException(409, "该独立草稿已归档，不能继续发布")
        if current and current["status"] == "published":
            revision = current["content_revision"]
            if release and release.content_revision < revision:
                raise HTTPException(409, "旧官方发布包不能覆盖较新修订")
            current_payload = CasePayload.model_validate(db.jload(current["payload"], {}))
            if content.content_hash(current_payload) == digest:
                if release and release.content_revision != revision:
                    raise HTTPException(409, "同正文的官方修订标识与已发布记录不一致，请先核定版本")
                return _result(payload.id, revision, repo.current_cursor(conn), True)
            base = release.base_revision if release else payload.base_revision
            if base != revision:
                raise HTTPException(409, "案例修订已变化，请重新载入后发布")
            if release and release.content_revision <= revision:
                raise HTTPException(409, "同一官方修订不能对应不同正文，必须声明更高修订")
            next_revision = release.content_revision if release else revision + 1
        else:
            if not release and payload.base_revision not in (None, 0):
                raise HTTPException(409, "新案例的 baseRevision 必须为 0")
            next_revision = release.content_revision if release else 1
        errors = gate.check_case(payload, require_calibrated_cost=True)
        if errors:
            raise HTTPException(422, {"message": "未过发布门禁", "errors": errors})
        if release:
            source_type, source_commit, author_name = "official", release.source_commit, "官方"
        elif publication:
            source_type = "community"
            source_commit = f"submission:{sid}:material:{publication.material_version}"
            author_name = publication.author_name or f"@{publication.author_login}"
        else:
            source_type, source_commit = "community", None
            author = repo.author(conn, uid)
            author_name = author["name"] or "@" + author["login"]
        stored = dict(
            content.body(payload),
            contentRevision=next_revision,
            sourceType=source_type,
            sourceCommit=source_commit,
            sourceHash=digest,
            submissionId=sid,
            authorName=author_name,
            calibrationStatus=release.calibration_status if release else "editor-reviewed",
        )
        cursor = repo.next_cursor(conn)
        repo.publish(
            conn, uid, payload, stored, sid, source_type, source_commit, next_revision, cursor, current is not None
        )
        repo.save_article(conn, _article(payload, author_name))
        repo.save_revision(conn, payload.id, next_revision, digest, stored, source_type, source_commit, uid)
        repo.enqueue_index(conn, payload.id, next_revision, stored)
        return _result(payload.id, next_revision, cursor)


def _article(payload: CasePayload, author: str) -> ArticleProjection:
    actions = {action.id: action.name for action in payload.actions}
    return ArticleProjection(
        id="a-" + payload.id,
        title=payload.title,
        domain=payload.domain,
        layer=payload.layer,
        author=author,
        steps=[
            ArticleStep(
                observe=step.thought,
                act=actions[step.action_id] if step.action_id else "（推理收束，停止收集）",
                found=step.conclusion,
            )
            for step in payload.expert_chain
        ],
        lessons=[lesson.text for lesson in payload.lessons],
    )
