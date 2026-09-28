/**
 * 案例类型定义 —— 唯一权威源
 *
 * 供 app 页面与 content/pipeline 校验脚本共用。
 * uni-app x 编译要求 import 不出项目根，故类型不外提为独立包；
 * 未来出现第二个消费者（如 server）时再升级为共享包。
 *
 * 写案例前必读 docs/案例写作规范.md（六部件 + 设计铁律 + 红线）。
 */

/** 证据类型：log=日志关键行 error=报错 text=陈述 code=代码/配置片段 */
export type EvidenceType = string

export interface Evidence {
  type: EvidenceType
  title: string
  text: string
}

/** 动作的信息增益四档：'high' | 'mid' | 'low' | 'none' */
export type Gain = string

export interface CaseAction {
  id: string
  /** 动作按钮文案（玩家看到的） */
  name: string
  /** 展开说明：这一步具体在做什么 */
  desc: string
  /** 验证成本 ⚡（1~10） */
  cost: number
  gain: Gain
  /** 执行后返回的证据 */
  result: Evidence
  /** 状态变更类动作（重启/回滚）：破坏现场，复盘特别点评 */
  danger: boolean
  /** 【预留】二期动态：动作对世界状态的改变，v0 恒为空数组 */
  effects: string[]
  /** 本动作对假设空间的影响（复盘揭晓答案钥匙用，玩家不可见） */
  hypotheses: HypothesisEffect[]
  /** 本动作能检验哪些假设（UI 绑定：验证 tab 按此分节过滤）；空数组 = 通用侦查 */
  tests: string[]
}

export interface HypothesisOption {
  id: string
  text: string
  /** 排除/确认该假设的最低成本动作 id（空串 = 依靠综合推理） */
  excludeActionId: string
}

/** 动作对假设空间的影响：excluded=排除 confirmed=实锤 down=降权 up=升权 */
export interface HypothesisEffect {
  id: string
  status: string
}

export interface RootCauseOption {
  id: string
  text: string
  correct: boolean
}

/** 专家链步骤：四段式 + 停止规则（规范第 1④ 节） */
export interface ExpertStep {
  /** 观察到了什么 */
  thought: string
  /** 假设如何更新（升权/降权/排除谁） */
  update: string
  /** 执行的动作 id（空串 = 纯推理/停止规则步） */
  actionId: string
  /** 为什么选这个动作：成本/信息增益的排序理由【教学核心，必写】 */
  why: string
  /** 排除了什么/确认了什么 */
  conclusion: string
}

export interface Lesson {
  /** 诊断检查单条目 */
  text: string
  /** 这层的契约 / 原理注解 */
  principle: string
}

export interface CaseScene {
  /** 玩家角色代入 */
  role: string
  /** 一句话链路图 */
  architecture: string
  /** 报错关键行 + 现场陈述（影响面信息不给，做成 1⚡ 动作） */
  symptoms: Evidence[]
  /** 何时开始、与什么变更相关 */
  timeline: string
  /** 引导第一步查影响面的提示语 */
  impactHint: string
}

/** 篇（学习阶段）：apprentice=侦探学徒 engineer=一线工兵 master=资深值班 */
export type PartId = string
/** 故障机理标签词表（初版 8 个，可扩展）：config/dependency/race/resource/capacity/cert/timing/data */
export type TypeTag = string

export interface DiagnosisCase {
  id: string
  title: string
  /** 关卡列表一句话简介 */
  intro: string
  /** 领域标签：network | deploy | data | runtime | build | concurrency */
  domain: string
  /** 本题主打的"层的契约" */
  layer: string
  /** 所属篇（学习阶段） */
  part: PartId
  /** 所属章 id（章动态聚合的 key） */
  chapterId: string
  /** 章内排序（小在前） */
  order: number
  /** 故障机理标签 */
  typeTags: TypeTag[]
  /** 1 教学关 / 2 标准 / 3 地狱 */
  difficulty: number
  scene: CaseScene
  hypotheses: HypothesisOption[]
  actions: CaseAction[]
  rootCauses: RootCauseOption[]
  /** 标准专家路径成本 ⚡（评分基准，闯关中对玩家隐藏） */
  expertCost: number
  /** 重启陷阱动作 id（可为空串） */
  restartActionId: string
  expertChain: ExpertStep[]
  lessons: Lesson[]
}
