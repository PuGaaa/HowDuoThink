"""将已获作者确认的脱敏素材组织为待编辑的关卡骨架。"""

from features.submissions.models import DraftMaterial


def skeleton(sid: str, material: dict) -> dict:
    s = DraftMaterial.model_validate(material).model_dump()
    title = s["title"]
    symptoms = [{"type": "text", "title": "现象描述", "text": s["symptom"]}]
    if s["key_error"]:
        symptoms.insert(0, {"type": "error", "title": "关键报错", "text": s["key_error"]})
    timeline = s["timeline"] or "时间线待补充"
    # 解决过程按行拆分为专家链骨架：每行 → 观察( thought )，动作占位
    chain = []
    lines = [ln.strip() for ln in s["resolution"].replace("；", "\n").replace("。", "\n").split("\n") if ln.strip()]
    for ln in lines[:8]:
        chain.append(
            {
                "thought": ln[:120],
                "update": "（待补充：这一步假设如何更新）",
                "actionId": "",
                "why": "（待补充：为什么这一步值这个成本）",
                "conclusion": "（待补充：排除了什么/确认了什么）",
            }
        )
    if not chain:
        chain.append(
            {
                "thought": "（待补充）",
                "update": "（待补充）",
                "actionId": "",
                "why": "（待补充）",
                "conclusion": "（待补充）",
            }
        )
    while len(chain) < 4:
        chain.append(
            {
                "thought": "（待补充）",
                "update": "（待补充）",
                "actionId": "",
                "why": "（待补充）",
                "conclusion": "（待补充）",
            }
        )
    lessons = s["lessons"]
    lesson_list = [{"text": it, "principle": "（待补充：这一层的契约）"} for it in lessons]
    lesson_list.append({"text": "（待补充检查单）", "principle": "（待补充原理）"})
    pid = "c-" + sid.replace("s-", "")
    chapter = {
        "network": "access",
        "data": "data",
        "build": "build",
        "runtime": "runtime",
        "concurrency": "concurrency",
        "deploy": "deployment",
    }[s["domain_hint"]]
    return {
        "id": pid,
        "title": title,
        "intro": title,
        "domain": s["domain_hint"],
        "layer": "（待补充层契约）",
        "part": {
            "access": "apprentice",
            "build": "apprentice",
            "data": "engineer",
            "runtime": "engineer",
            "concurrency": "master",
            "deployment": "master",
        }[chapter],
        "chapterId": chapter,
        "order": 99,
        "typeTags": [],
        "difficulty": 1,
        "scene": {
            "role": "（待补充：玩家角色代入）",
            "architecture": "（待补充：链路图）",
            "symptoms": symptoms,
            "timeline": timeline,
            "impactHint": "（待补充）",
        },
        "hypotheses": [
            {"id": "h-a", "text": "（待补充假设A）", "excludeActionId": ""},
            {"id": "h-b", "text": "（待补充假设B）", "excludeActionId": ""},
            {"id": "h-c", "text": "（待补充假设C）", "excludeActionId": ""},
        ],
        "actions": [
            {
                "id": "act-1",
                "name": "（待补充动作）",
                "desc": "（待补充）",
                "cost": 1,
                "gain": "high",
                "danger": False,
                "effects": [],
                "tests": [],
                "hypotheses": [],
                "result": {"type": "text", "title": "（待补充）", "text": "（待补充）"},
            },
        ],
        "rootCauses": [
            {"id": "rc-a", "text": "（待补充根因A）", "correct": False},
            {"id": "rc-b", "text": "（待补充根因B）", "correct": False},
            {"id": "rc-c", "text": "（待补充根因C）", "correct": False},
        ],
        "expertCost": 5,
        "restartActionId": "",
        "expertChain": chain,
        "lessons": lesson_list,
    }
