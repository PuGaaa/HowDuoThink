"""Pydantic 模型：字段完整性的第一道门（防"填太多"靠 Submission 轻量，防"丢字段"靠 CasePayload 强校验）。"""
from pydantic import BaseModel, Field, field_validator, model_validator

GAINS = {"high", "mid", "low", "none"}
DOMAINS = {"network", "deploy", "data", "runtime", "build", "concurrency"}


class EvidenceIn(BaseModel):
    type: str = Field(min_length=1)  # log | error | text | code
    title: str = Field(min_length=1, max_length=60)
    text: str = Field(min_length=1, max_length=2000)


class HypothesisEffectIn(BaseModel):
    id: str = Field(min_length=1)
    status: str  # excluded | confirmed | down | up

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in {"excluded", "confirmed", "down", "up"}:
            raise ValueError("status 必须是 excluded/confirmed/down/up")
        return v


class ActionIn(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=60)
    desc: str = Field(min_length=1, max_length=200)
    cost: int = Field(ge=1, le=10)
    gain: str
    danger: bool = False
    effects: list[str] = []
    tests: list[str] = []          # 绑定的假设 id；空 = 通用侦查
    hypotheses: list[HypothesisEffectIn] = []
    result: EvidenceIn

    @field_validator("gain")
    @classmethod
    def _gain(cls, v: str) -> str:
        if v not in GAINS:
            raise ValueError("gain 必须是 high/mid/low/none")
        return v


class HypothesisIn(BaseModel):
    id: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=80)
    exclude_action_id: str = Field(default="", alias="excludeActionId")


class RootCauseIn(BaseModel):
    id: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=120)
    correct: bool = False


class ExpertStepIn(BaseModel):
    thought: str = Field(min_length=1)
    update: str = Field(min_length=1)
    action_id: str = Field(default="", alias="actionId")
    why: str = Field(min_length=6)
    conclusion: str = Field(min_length=1)


class LessonIn(BaseModel):
    text: str = Field(min_length=1, max_length=120)
    principle: str = Field(min_length=6, max_length=300)


class SceneIn(BaseModel):
    role: str = Field(min_length=1, max_length=300)
    architecture: str = Field(min_length=1, max_length=300)
    timeline: str = Field(min_length=1, max_length=300)
    impact_hint: str = Field(min_length=1, max_length=120, alias="impactHint")
    symptoms: list[EvidenceIn] = Field(min_length=1)


class CasePayload(BaseModel):
    """App 关卡完整 schema（与 app/types/case.ts 的 DiagnosisCase 对齐）——发布门禁的结构校验层。"""
    id: str = Field(pattern=r"^[a-z0-9-]{3,40}$")
    title: str = Field(min_length=1, max_length=40)
    intro: str = Field(min_length=1, max_length=80)
    domain: str
    layer: str = Field(min_length=1, max_length=120)
    part: str = Field(default='engineer')
    chapter_id: str = Field(default='', alias='chapterId')
    order: int = Field(default=1)
    type_tags: list[str] = Field(default_factory=list, alias='typeTags')
    difficulty: int = Field(ge=1, le=3)
    scene: SceneIn
    hypotheses: list[HypothesisIn] = Field(min_length=3, max_length=8)
    actions: list[ActionIn] = Field(min_length=8, max_length=15)
    root_causes: list[RootCauseIn] = Field(min_length=3, alias="rootCauses")
    expert_cost: int = Field(gt=0, alias="expertCost")
    restart_action_id: str = Field(default="", alias="restartActionId")
    expert_chain: list[ExpertStepIn] = Field(min_length=4, alias="expertChain")
    lessons: list[LessonIn] = Field(min_length=2, max_length=4)

    @model_validator(mode="after")
    def _cross(self) -> "CasePayload":
        act_ids = {a.id for a in self.actions}
        hyp_ids = {h.id for a in self.actions for h in a.hypotheses}
        # 恰一个正确根因
        if sum(1 for r in self.root_causes if r.correct) != 1:
            raise ValueError("correct 根因必须恰好 1 个")
        # 根因数与假设数一致（同池平权）
        if len(self.root_causes) != len(self.hypotheses):
            raise ValueError("根因数与假设数不一致（应同池平权）")
        # tests 绑定完备：每个干扰假设至少被一个动作检验（排除/降权/实锤路径）
        for h in self.hypotheses:
            if h.id not in hyp_ids:
                raise ValueError(f"假设 {h.id} 没有任何动作可检验（缺排除路径）")
        # 动作引用的假设存在
        for h in hyp_ids:
            if h not in {x.id for x in self.hypotheses}:
                raise ValueError(f"动作引用了不存在的假设 {h}")
        # 影响面动作：cost=1 且 gain=high，且专家链第一步是它
        impact = [a for a in self.actions if a.cost == 1 and a.gain == "high"]
        if not impact:
            raise ValueError("缺影响面动作（cost=1 且 gain=high）")
        # 专家链首步 = 影响面动作；末步 = 停止规则
        if self.expert_chain[0].action_id != impact[0].id:
            raise ValueError("专家链第一步必须是影响面动作")
        if self.expert_chain[-1].action_id != "":
            raise ValueError("专家链最后一步应是停止规则")
        # expertCost 小于总成本
        total = sum(a.cost for a in self.actions)
        if self.expert_cost >= total:
            raise ValueError("expertCost 必须小于动作总成本")
        return self


class SubmissionCreate(BaseModel):
    """用户投稿：必填 3 项 + 选填——轻是设计，字段与 Case 素材一一对应。"""
    title: str = Field(min_length=4, max_length=40)
    symptom: str = Field(min_length=10, max_length=1200)
    resolution: str = Field(min_length=10, max_length=2400)
    key_error: str | None = Field(default=None, max_length=600, alias="keyError")
    timeline: str | None = Field(default=None, max_length=300)
    lessons: list[str] = Field(default_factory=list, max_length=3)
    stack_tags: list[str] = Field(default_factory=list, max_length=6)
    domain_hint: str | None = Field(default=None, max_length=20, alias="domainHint")

    @field_validator("lessons")
    @classmethod
    def _lessons(cls, v: list[str]) -> list[str]:
        for x in v:
            if len(x) > 80:
                raise ValueError("单条经验 ≤80 字")
        return v


class SubmissionOut(BaseModel):
    id: str
    title: str
    status: str
    created_at: str
    review_note: str | None = None

    model_config = {"from_attributes": True}


class StepOut(BaseModel):
    no: int
    observe: str
    act: str
    found: str


class ArticleOut(BaseModel):
    id: str
    title: str
    layer: str
    domain: str
    steps: list[StepOut]
    lessons: list[str]
    author: str
    published_at: str
