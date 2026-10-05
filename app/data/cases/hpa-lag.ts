import { DiagnosisCase } from '../../types/case'

/**
 * B6-4 · evolution L3
 * 主训思维：架构设计（反应式伸缩永远慢半拍——需要预测性伸缩或多级缓冲）
 * 次训思维：产品思维（用户体验的损失 = 缩容太激进 + 扩容太慢的双向代价）
 * 真实原型：HPA 按 CPU 70% 扩容（反应滞后 3~5 分钟），流量激增 3 倍时新 Pod 就绪前已有大量请求超时
 * 情绪兽设计：惊讶獭（惊讶）——"扩容了，但用户已经走了"
 * 检查单：思维型 3 + 知识型 1
 */
export const hpaLagCase: DiagnosisCase = {
  id: 'hpa-lag',
  title: '弹性伸缩永远慢半拍——扩容了，但用户已经走了',
  intro: '营销活动开始 5 分钟后流量 ×3，HPA 立即扩容——新 Pod 就绪用了 4 分钟。这 4 分钟里，3000 QPS 的超时请求全打到 3 个旧 Pod。',
  domain: 'runtime',
  layer: '反应式伸缩永远慢半拍：HPA 触发 → 调度 → 拉镜像 → 启动 → 就绪，每一步都有延迟——4 分钟的窗口够用户流失 3 次',
  part: 'master',
  chapterId: 'evolution',
  order: 4,
  typeTags: ['architecture', 'capacity'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」的平台工程师。营销活动开始 5 分钟后接口大面积超时——你查了 HPA：已经在扩容了，但"远水救不了近火"。',
    architecture: '营销活动 → 流量×3 → K8s HPA(触发扩容 5 个新 Pod, 就绪需 4 分钟) → 现有 3 个旧 Pod(被打爆)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '时间线',
        text: 'T+0s 营销活动开始，流量 ×3\nT+30s HPA 检测到 CPU > 70%，触发扩容（+5 Pod）\nT+60s 新 Pod 调度到节点，开始拉镜像\nT+3min 镜像拉取完成，Pod 启动中\nT+4min 新 Pod Ready，开始接流量\n→ 从触发到就绪：4 分钟。这 4 分钟里：3000 QPS 超时，P99 > 30s。',
      },
      {
        type: 'text',
        title: '现有 Pod 状态',
        text: '3 个旧 Pod：每个 2C4G → 3 个 Pod 承载 3000 QPS 超时请求。\n线程池满、连接池满、CPU 单核 100%——旧 Pod 在 4 分钟里"有心情没能力"。',
      },
    ],
    timeline: '营销活动 10:00 开始 ｜ 流量 ×3：10:00~10:05 ｜ HPA 扩容完成：10:04 ｜ 用户投诉：10:01 起 ｜ 超时请求：约 90 万次（4 分钟 × 3750 QPS 超时）',
    impactHint: 'HPA 已经在扩容了——但"扩容中"和"扩容完成"之间有一个不可避免的窗口。这个窗口怎么填？',
  },

  hypotheses: [
    { id: 'h-hpalag', text: 'HPA 反应滞后：触发→调度→拉镜像→启动→就绪 = 4 分钟不可压缩窗口', excludeActionId: 'a-hpatrace' },
    { id: 'h-replica', text: '现有副本数太少：3 个 Pod 承载峰值不够——应该提前多部署', excludeActionId: 'a-replicas' },
    { id: 'h-resource', text: '新 Pod 资源限额不够：2C4G 扛不住 3000 QPS', excludeActionId: 'a-resource' },
    { id: 'h-probe', text: '就绪探针延迟了新 Pod 接流量', excludeActionId: 'a-probe' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '量化 4 分钟窗口的业务损失',
      desc: '4 分钟里损失了多少请求和用户',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '业务损失',
        text: '4 分钟 × 3750 QPS 超时 = 90 万次失败请求。\n营销活动用户：推送带来的新用户 5 万，超时后 40% 直接离开。\n→ 2 万新用户流失：营销获客成本 × 流失率 = 真金白银的损失。',
      },
    },
    {
      id: 'a-hpatrace',
      name: '追踪 HPA 扩容全链路耗时',
      desc: '4 分钟的窗口里，每一步花了多久',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-hpalag'],
      hypotheses: [{ id: 'h-hpalag', status: 'confirmed' }],
      result: {
        type: 'text',
        title: 'HPA 扩容时间分解',
        text: 'T+30s   HPA 检测到 CPU > 70%（指标采集间隔 15s × 2 次确认）\nT+60s   调度器分配节点（含资源计算 + 亲和性匹配）\nT+3min  镜像拉取完成（1.2GB 镜像 × 5 Pod）\nT+3.5min 容器启动 + 应用初始化\nT+4min   就绪探针通过，开始接流量\n→ 4 分钟 = 指标延迟(30s) + 调度(30s) + 镜像拉取(2min) + 启动(1min)。每步都可优化。',
      },
    },
    {
      id: 'a-replicas',
      name: '评估日常副本数的余量',
      desc: '3 个 Pod 是不是太少——有没有基线余量',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: ['h-replica'],
      hypotheses: [{ id: 'h-replica', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '副本数评估',
        text: '日常 QPS 1000 / 3 Pod = 每 Pod 333 QPS。\n3000 QPS / 333 = 需要 9 个 Pod → 现有 3 个缺口 6 个。\n如果日常保持 6 个 Pod（有 100% 余量）：扩容缺口降为 3 个，就绪时间可缩短一半。\n→ 基线余量（minReplicas）过低是根因之一。',
      },
    },
    {
      id: 'a-resource',
      name: '核对新 Pod 的资源限额',
      desc: '新 Pod 的资源够不够',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-resource'],
      hypotheses: [{ id: 'h-resource', status: 'excluded' }],
      result: {
        type: 'text',
        title: '新 Pod 资源',
        text: '新 Pod 与旧 Pod 同规格 2C4G，每个可承载 ~500 QPS。\n5 个新 Pod + 3 个旧 Pod = 8 个 × 500 = 4000 QPS > 3000 ✓\n→ 资源够用：瓶颈不在 Pod 规格，在 Pod 数量的就绪时间。',
      },
    },
    {
      id: 'a-probe',
      name: '检查就绪探针的配置',
      desc: '探针是否延迟了新 Pod 的流量接入',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-probe'],
      hypotheses: [{ id: 'h-probe', status: 'excluded' }],
      result: {
        type: 'text',
        title: '探针检查',
        text: '就绪探针：启动后 30s 首次检查，间隔 10s。\n→ 探针延迟约 30~40s，占 4 分钟窗口的 12%。可优化但非主因。',
      },
    },
    {
      id: 'a-forceall',
      name: '强制全量推送不等扩容',
      desc: '【状态变更】营销团队要求全量推送，不等扩容就绪',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '强制结果',
        text: '营销团队要求全量推送：流量 ×3 在扩容完成前到达，\n现有 3 Pod 扛 3000 QPS 超时请求 = 90 万次超时 + 2 万新用户流失。\n→ 忽略扩容窗口的强制推送，以用户体验为代价。',
      },
    },
    {
      id: 'a-promoteteam',
      name: '通知业务方扩容滞后',
      desc: '通知营销团队扩容需要时间，建议推送分批发送',
      cost: 1,
      gain: 'mid',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '推送调整',
        text: '营销推送从"一次性全量"改为"分 3 批间隔 2 分钟"。\n→ 流量峰值从 ×3 降到 ×1.5，现有 3 Pod + 已扩容 Pod 可覆盖。',
      },
    },
    {
      id: 'a-fixall',
      name: '多级优化：预热+镜像加速+自定义指标',
      desc: '【状态变更】minReplicas 6→8 + 镜像预分发 + HPA 自定义指标',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '多级优化结果',
        text: '① minReplicas 6→8：基线余量翻倍\n② 镜像预分发到全部节点（DaemonSet）→ 拉镜像 2min→0s\n③ HPA 改自定义指标（event loop lag + QPS）→ 检测延迟 30s→10s\n④ 就绪探针 30s→10s\n→ 综合效果：扩容就绪时间 4min → 1.5min，窗口缩小 62%。\n⑤ 预测性扩容（定时任务：大促前 minReplicas 提前调高）。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-hpalag', text: 'HPA 反应滞后 4 分钟：指标采集延迟 30s + 调度 30s + 镜像拉取 2min + 启动 1min——反应式伸缩天然慢半拍，窗口内 90 万请求超时', correct: true },
    { id: 'rc-replica', text: '日常副本数基线太低（3 个），大促时缺口 6 个', correct: false },
    { id: 'rc-resource', text: '新 Pod 资源限额不够', correct: false },
    { id: 'rc-probe', text: '就绪探针延迟了新 Pod 的流量接入', correct: false },
  ],

  expertCost: 7,
  restartActionId: 'a-fixall',

  expertChain: [
    {
      thought: '先量化业务损失：4 分钟 = 90 万次超时 + 2 万新用户流失。这笔账决定了优化的投入级别。',
      update: '2 万新用户流失 = 营销获客成本白花——值得投入优化。',
      actionId: 'a-impact',
      why: '1⚡ 先算业务损失再决定优化投入：90 万超时 + 2 万流失不是"体验问题"，是"营销 ROI 直接损失"——优化投入有明确的 ROI 依据。',
      conclusion: '损失量化确认 → 追踪 4 分钟窗口的时间分解。',
    },
    {
      thought: 'HPA 扩容不是瞬时的：指标延迟 + 调度 + 镜像拉取 + 启动——每一步都贡献了延迟。分解才能找到可优化的步骤。',
      update: '4 分钟分解：指标 30s + 调度 30s + 镜像 2min + 启动 1min——镜像拉取占 50%，是最大的可优化项。',
      actionId: 'a-hpatrace',
      why: '2⚡ 扩容时间分解是优化的前提：不分解就不知道"4 分钟里哪步占大头"——分解后发现镜像拉取是最大瓶颈（可预分发消除）。',
      conclusion: '时间分解完成 → 评估副本数基线余量。',
    },
    {
      thought: '副本数基线：日常 3 个 Pod / 峰值需 9 个——缺口 6 个全靠 HPA 实时扩。基线提高到 8 个，缺口降为 1 个。',
      update: '基线余量翻倍后，扩容缺口从 6 降为 1——扩容时间可缩短一半以上。',
      actionId: 'a-replicas',
      why: '1⚡ 基线余量是第一道防线：minReplicas 越高，扩容的缺口越小、就绪越快。但基线过高也有成本（日常资源浪费）——需要找平衡点。',
      conclusion: '基线余量策略确定 → 排除其余假设 → 多级优化方案。',
    },
    {
      thought: '新 Pod 资源够、探针影响小、基线策略确定——多级优化方案（预热+镜像加速+自定义指标+基线提升）一次到位，停止收集。',
      update: '停止排查。多级优化全部上线。',
      actionId: '',
      why: '【停止规则】时间分解 ✓ 基线策略 ✓ 排除项 ✓ 多级优化上线 ✓——四项闭合。扩容就绪 4min→1.5min（窗口缩小 62%），下次大促不再是事故。',
      conclusion: '多级优化：基线 6→8 + 镜像预分发 + HPA 自定义指标 + 探针优化 + 预测性扩容——扩容就绪 4min→1.5min。',
    },
  ],

  lessons: [
    {
      text: '反应式伸缩永远慢半拍：HPA 触发→调度→拉镜像→启动→就绪，每一步都有不可避免的延迟——4 分钟窗口就是用户的等待。',
      principle: '架构设计：HPA 的反应式伸缩有固有滞后（指标采集+调度+镜像+启动），无法消除只能缩短——基线余量（minReplicas）是第一道防线，镜像预分发是第二道。',
    },
    {
      text: '基线余量（minReplicas）是第一道防线：3 个 Pod 缺口 6 个 vs 8 个 Pod 缺口 1 个——基线越高，扩容越快。',
      principle: '架构设计：minReplicas 的设置 = "日常成本"与"扩容速度"的平衡。大促场景下提前调高 minReplicas，比依赖 HPA 实时扩容可靠 10 倍。',
    },
    {
      text: '镜像预分发是最容易被忽略的优化：1.2GB 镜像拉取 2 分钟——占扩容总时间的 50%。',
      principle: '程序设计：DaemonSet 预分发镜像到全部节点，让新 Pod 的镜像拉取时间归零——这是"扩容提速"里投入产出比最高的单项优化。',
    },
    {
      text: '扩容时间要分解，不能只看总时间：4 分钟 = 指标 30s + 调度 30s + 镜像 2min + 启动 1min——不分解就不知道优化哪里。',
      principle: '架构设计：任何"总时间"都要分解到步骤——每步的耗时占比决定了优化的优先级。镜像拉取占 50% 就优先做镜像预分发，指标采集占 12% 就延后处理。',
    },
  ],
}
