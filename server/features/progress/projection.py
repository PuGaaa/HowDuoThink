"""由历史基线和已结算事实重建投影；上传顺序不参与日周或成绩判断。"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from features.progress.models import (
    CaseProjection,
    ProgressBlob,
    ProgressOperation,
    ProgressState,
    Score,
    SessionOperation,
    Streak,
)

BEIJING = ZoneInfo("Asia/Shanghai")
GRADE_RANK = {"S": 0, "A": 1, "B": 2, "F": 3, "": 4}


def today() -> date:
    return datetime.now(BEIJING).date()


def week_key(day: date) -> str:
    return (day - timedelta(days=day.weekday())).isoformat()


def _day(operation: ProgressOperation) -> date:
    return operation.occurred_at.astimezone(BEIJING).date()


def _increment(periods: dict[str, dict[str, int]], key: str, metric: str, amount: int = 1) -> None:
    period = periods.setdefault(key, {})
    period[metric] = period.get(metric, 0) + amount


def _score(current: CaseProjection, operation: SessionOperation) -> None:
    p = operation.payload
    key = f"{p.content_revision}:{p.scoring_version}"
    result = current.scores.setdefault(key, Score(contentRevision=p.content_revision, scoringVersion=p.scoring_version))
    if GRADE_RANK[p.grade] < GRADE_RANK[result.best_grade]:
        result.best_grade = p.grade
    if p.solved and (result.best_cost is None or p.player_cost < result.best_cost):
        result.best_cost = p.player_cost


def project(
    baseline: ProgressBlob | None,
    archives: dict[str, ProgressBlob],
    operations: list[ProgressOperation],
) -> ProgressState:
    state = ProgressState(legacyBaseline=baseline, legacyArchives=archives)
    unlocked: set[str] = set()
    failed: dict[str, datetime | None] = {}
    if baseline is not None:
        for cid, old in baseline.cases.items():
            state.cases[cid] = CaseProjection(solved=old.solved, plays=old.plays, fails=old.fails)
            if old.fails:
                failed[cid] = None
        state.mascots = dict(baseline.mascots)
        state.checkuse = baseline.checkuse
        unlocked.update(baseline.unlocked_chapter_ids)
    for archive in archives.values():
        unlocked.update(archive.unlocked_chapter_ids)
        for cid, old in archive.cases.items():
            current = state.cases.setdefault(cid, CaseProjection())
            current.solved = current.solved or old.solved

    daily = state.tasks.daily_history
    weekly = state.tasks.weekly_history
    successful_days: set[date] = set()
    sessions: dict[str, SessionOperation] = {}
    week_cases: dict[str, set[str]] = {}
    week_layers: dict[str, set[str]] = {}
    for operation in sorted(operations, key=lambda item: (item.occurred_at, item.op_id)):
        day = _day(operation)
        day_id, week = day.isoformat(), week_key(day)
        p = operation.payload
        if operation.kind == "session_end":
            sessions[p.session_id] = operation
            current = state.cases.setdefault(p.case_id, CaseProjection())
            current.solved = current.solved or p.solved
            current.plays += 1
            current.fails += int(not p.solved)
            _score(current, operation)
            for mascot in p.mascot_events:
                state.mascots[mascot.id] = state.mascots.get(mascot.id, 0) + 1
            if p.solved:
                successful_days.add(day)
                _increment(daily, day_id, "win")
                week_cases.setdefault(week, set()).add(p.case_id)
                week_layers.setdefault(week, set()).add(p.chapter_id)
                if p.case_id in failed and (failed[p.case_id] is None or failed[p.case_id] < operation.occurred_at):
                    _increment(daily, day_id, "retrain")
                    _increment(weekly, week, "retrain")
            else:
                failed.setdefault(p.case_id, operation.occurred_at)
        elif operation.kind == "checklist_use":
            state.checkuse += 1
            _increment(daily, day_id, "checkuse")
            _increment(weekly, week, "checkuse")
        elif operation.kind == "task_increment":
            _increment(daily, day_id, "hypo", p.amount)
            _increment(weekly, week, "hypo", p.amount)
        elif operation.kind == "unlocked_chapters":
            unlocked.update(p.chapter_ids)

    done_days: set[date] = set()
    for operation in operations:
        if operation.kind == "daily_done":
            p = operation.payload
            if p.session_id not in sessions:
                continue  # 完成标记可先于结束局到达；结束局补传后再结算。
            session = sessions[p.session_id]
            if session.payload.solved and session.payload.case_id == p.case_id:
                done_days.add(_day(session))
    for day in done_days:
        _increment(daily, day.isoformat(), "dailycase")
        _increment(weekly, week_key(day), "dailycase")
    state.daily_done = max(done_days).isoformat() if done_days else ""
    for week, cases in week_cases.items():
        _increment(weekly, week, "casewin7", len(cases))
        _increment(weekly, week, "layers2", len(week_layers[week]))
    for current in state.cases.values():
        if current.scores:
            latest = max(current.scores.values(), key=lambda score: (score.content_revision, score.scoring_version))
            current.content_revision = latest.content_revision
            current.scoring_version = latest.scoring_version
            current.best_grade = latest.best_grade
            current.best_cost = latest.best_cost
    if successful_days:
        last = max(successful_days)
        count, day = 0, last
        while day in successful_days:
            count += 1
            day -= timedelta(days=1)
        state.streak = Streak(last=last.isoformat(), count=count if last >= today() - timedelta(days=1) else 0)
    state.unlocked_chapter_ids = sorted(unlocked)
    state.tasks.day = today().isoformat()
    state.tasks.week = week_key(today())
    state.tasks.daily = daily.get(state.tasks.day, {})
    state.tasks.weekly = weekly.get(state.tasks.week, {})
    return state
