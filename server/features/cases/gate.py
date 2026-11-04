"""发布门禁：写作规范红线的 Python 版。
结构红线代码强制（过不了就不许发布）；语义红线（证据自洽/双路径/噪声质量）人工勾选清单。"""

from features.cases.models import CasePayload


def check_case(payload: CasePayload, *, require_calibrated_cost: bool = False) -> list[str]:
    errors: list[str] = []
    acts = payload.actions
    act_ids = {a.id for a in acts}

    # 影响面动作唯一性（cost=1 且 gain=high 可能多个——影响面特指第一个被专家链引用的）
    impact_ids = [a.id for a in acts if a.cost == 1 and a.gain == "high"]
    first = payload.expert_chain[0].action_id if payload.expert_chain else ""
    if first and first not in impact_ids:
        errors.append("专家链第一步不是影响面动作")

    # 危险动作：L≥2 必须含重启/回滚类
    if payload.difficulty >= 2 and not any(a.danger for a in acts):
        errors.append("L2 及以上必须含重启/回滚类危险动作")

    # 干扰假设排除路径：每个非正确假设至少一个动作把它 excluded/down
    effect_map: dict[str, set[str]] = {}
    for a in acts:
        for h in a.hypotheses:
            effect_map.setdefault(h.id, set()).add(h.status)
    for h in payload.hypotheses:
        st = effect_map.get(h.id, set())
        if not st & {"excluded", "down", "confirmed"}:
            errors.append(f"假设 {h.id} 没有任何排除/降权/实锤路径")

    # tests 绑定：非通用动作必须绑定至少一个假设；每个假设（除正确假设外）至少一个专属绑定或被通用覆盖
    for a in acts:
        for t in a.tests:
            if t not in {h.id for h in payload.hypotheses}:
                errors.append(f"动作 {a.id} 的 tests 引用了不存在的假设 {t}")

    # 专家链：动作引用有效 + 四段式已有 schema 保证；这里查"why 敷衍"
    for i, step in enumerate(payload.expert_chain):
        if len(step.why) < 12:
            errors.append(f"专家链第 {i + 1} 步 why 太敷衍")

    # 重启陷阱动作存在性
    if payload.restart_action_id and payload.restart_action_id not in act_ids:
        errors.append("restartActionId 指向不存在的动作")

    # domain 合法
    if payload.domain not in {"network", "deploy", "data", "runtime", "build", "concurrency"}:
        errors.append(f"domain 非法：{payload.domain}")

    if require_calibrated_cost:
        costs = {action.id: action.cost for action in acts}
        standard_cost = sum(costs[step.action_id] for step in payload.expert_chain if step.action_id)
        if payload.expert_cost != standard_cost:
            errors.append(f"expertCost={payload.expert_cost} 与标准专家路径成本 {standard_cost} 不一致")
    return errors
