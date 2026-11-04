"""按合并后的主体计算北京时间批次；不成熟样本单列，不计流失。"""

from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import db

TRIAL_CASE_IDS = {"first-npe", "caused-by", "log-correlation"}
TIMEZONE = ZoneInfo("Asia/Shanghai")


def timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(TIMEZONE)


def calculate(rows: list[dict], as_of: str | None = None) -> dict:
    today = date.fromisoformat(as_of) if as_of else datetime.now(TIMEZONE).date()
    by_user = defaultdict(list)
    for row in rows:
        payload = db.jload(row["payload"], {})
        at = timestamp(row["occurred_at"])
        if at.date() > today or payload.get("testMode") or payload.get("preview"):
            continue
        by_user[row["user_id"]].append({**payload, "kind": row["kind"], "at": at, "day": at.date()})
    started = finished = solved = weekly_solved = 0
    first_solved = first_failed = first_unfinished = 0
    d1 = {"eligibleUsers": 0, "retainedUsers": 0}
    d7 = {"eligibleUsers": 0, "retainedUsers": 0}
    d7_solved = {"eligibleUsers": 0, "retainedUsers": 0}
    three = {"eligibleUsers": 0, "completedUsers": 0}
    save = {"eligibleUsers": 0, "convertedUsers": 0}
    continued = {"eligibleUsers": 0, "continuedUsers": 0}
    immature = {"d1": 0, "d7": 0, "threeCase7d": 0, "saveConversion7d": 0, "continue7d": 0}
    cohorts: dict[str, dict] = {}
    sources = defaultdict(set)
    week_start = today - timedelta(days=today.weekday())
    for uid, events in by_user.items():
        events.sort(key=lambda event: event["at"])
        starts = [event for event in events if event["kind"] == "session_start"]
        for event in starts:
            sources[event.get("source", "unknown")].add(uid)
        ends = {}
        for event in events:
            if event["kind"] != "session_end":
                continue
            sid = event.get("sessionId")
            if sid not in ends or event.get("authoritative"):
                ends[sid] = event
        verifications = [event for event in events if event["kind"] == "verification"]
        effective = [
            end
            for sid, end in ends.items()
            if any(
                v.get("sessionId") == sid and v.get("caseId") == end.get("caseId") and v["at"] <= end["at"]
                for v in verifications
            )
        ]
        successes = [end for end in ends.values() if end.get("solved") is True]
        weekly_solved += any(week_start <= end["day"] <= today for end in successes)
        prompts = [event for event in events if event["kind"] == "save_prompt"]
        # 保存成功必须来自登录后的进度确认，匿名伪造事件不构成账号保存。
        saves = [event for event in events if event["kind"] == "progress_saved" and not uid.startswith("guest:")]
        if prompts:
            prompt = prompts[0]
            if (today - prompt["day"]).days >= 6:
                save["eligibleUsers"] += 1
                save["convertedUsers"] += any(
                    event["at"] >= prompt["at"] and 0 <= (event["day"] - prompt["day"]).days <= 6 for event in saves
                )
            else:
                immature["saveConversion7d"] += 1
        if saves:
            saved = saves[0]
            if (today - saved["day"]).days >= 6:
                continued["eligibleUsers"] += 1
                continued["continuedUsers"] += any(
                    event["at"] >= saved["at"] and 0 <= (event["day"] - saved["day"]).days <= 6 for event in effective
                )
            else:
                immature["continue7d"] += 1
        trial_entries = [
            event for event in events if event["kind"] == "trial_enter" and event.get("caseId") in TRIAL_CASE_IDS
        ]
        if trial_entries:
            trial_start = trial_entries[0]
            if (today - trial_start["day"]).days >= 6:
                three["eligibleUsers"] += 1
                cases = {
                    end.get("caseId")
                    for end in effective
                    if end.get("caseId") in TRIAL_CASE_IDS and 0 <= (end["day"] - trial_start["day"]).days <= 6
                }
                three["completedUsers"] += TRIAL_CASE_IDS.issubset(cases)
            else:
                immature["threeCase7d"] += 1
        if not starts:
            continue
        first = starts[0]
        first_end = ends.get(first.get("sessionId"))
        first_solved += first_end is not None and first_end.get("solved") is True
        first_failed += first_end is not None and first_end.get("solved") is False
        first_unfinished += first_end is None or first_end.get("solved") is None
        started += 1
        finished += bool(ends)
        solved += bool(successes)
        age = (today - first["day"]).days
        cohort = cohorts.setdefault(first["day"].isoformat(), {"startedUsers": 0, "firstSolvedUsers": 0})
        cohort["startedUsers"] += 1
        cohort["firstSolvedUsers"] += first_end is not None and first_end.get("solved") is True
        for days, metric, key in [(1, d1, "d1"), (7, d7, "d7")]:
            if age < days:
                immature[key] += 1
                continue
            metric["eligibleUsers"] += 1
            retained = [end for end in effective if (end["day"] - first["day"]).days == days]
            metric["retainedUsers"] += bool(retained)
            if days == 7:
                d7_solved["eligibleUsers"] += 1
                d7_solved["retainedUsers"] += any(end.get("solved") is True for end in retained)
    return {
        "asOf": today.isoformat(),
        "timezone": "Asia/Shanghai",
        "window": {
            "firstDay": min(cohorts) if cohorts else None,
            "lastDay": today.isoformat(),
            "sevenDayOffsets": [0, 6],
        },
        "sampleUsers": len(by_user),
        "immatureUsers": immature,
        "funnel": {"startedUsers": started, "finishedUsers": finished, "solvedUsers": solved},
        "firstSession": {
            "startedUsers": started,
            "solvedUsers": first_solved,
            "failedUsers": first_failed,
            "unfinishedUsers": first_unfinished,
        },
        "d1": d1,
        "d7": d7,
        "d7Solved": d7_solved,
        "threeCase7d": three,
        "saveConversion7d": save,
        "continue7d": continued,
        "weeklySolvedUsers": weekly_solved,
        "cohorts": [{"firstDay": day, **counts} for day, counts in sorted(cohorts.items())],
        "sources": [{"source": source, "startedUsers": len(users)} for source, users in sorted(sources.items())],
    }
