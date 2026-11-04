"""进度结算：账号串行事务、档案唯一归属与事实投影。"""

from fastapi import HTTPException

import db
from features.progress import projection, repo
from features.progress.models import (
    ImportOperation,
    ProgressOperation,
    ProgressSnapshot,
    ProgressSyncResult,
    SessionOperation,
)


def get_progress(uid: str) -> ProgressSnapshot:
    with db.tx() as conn:
        history = repo.load(conn, uid)
        state = projection.project(history.baseline, history.archives, history.operations)
    return ProgressSnapshot(**state.model_dump(), revision=history.revision, updatedAt=history.updated_at)


def sync_operations(uid: str, operations: list[ProgressOperation]) -> ProgressSyncResult:
    with db.tx() as conn:
        repo.lock_user(conn, uid)
        history = repo.load(conn, uid)
        repo.preserve_baseline(conn, uid, history.baseline)
        # 不同账号同时导入同组档案时也以固定次序取得归属锁。
        imports = sorted(
            (op for op in operations if isinstance(op, ImportOperation)), key=lambda op: op.payload.archive_id
        )
        for operation in imports:
            if repo.claim_archive(conn, uid, operation) != uid:
                raise HTTPException(409, "该游客或历史档案已归入其他账号")
        revision = history.revision
        for operation in operations:
            if repo.has_operation(conn, uid, operation.op_id):
                continue
            new_session = repo.add_operation(conn, uid, operation)
            if isinstance(operation, SessionOperation) and new_session:
                repo.add_session_event(conn, uid, operation)
            revision += 1
        history = repo.load(conn, uid)
        state = projection.project(history.baseline, history.archives, history.operations)
        updated_at = repo.save(conn, uid, state, revision)
    return ProgressSyncResult(
        **state.model_dump(),
        revision=revision,
        updatedAt=updated_at,
        confirmedOperationIds=[operation.op_id for operation in operations],
    )
