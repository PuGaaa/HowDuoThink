import { DiagnosisCase } from '../../types/case'

/**
 * B5-3 · runtime L3
 * 主训思维：架构设计（级联雪崩：一个依赖的超时传递为全链路故障——无熔断、无背压）
 * 次训思维：验证思维（超时值配置的审计——配了等于没配）
 * 真实原型：评论服务变慢 → 订单服务线程池被拖住 → 全站雪崩
 * 情绪兽设计：恐怖蛙（恐慌）——一个服务的 500ms 变成全站的 30s
 * 检查单：思维型 3 + 知识型 1
 */
export const cascadeCase: DiagnosisCase = {
  id: 'cascade-timeout',
  title: '一个服务的 500ms 拖垮全站 30 秒',
  intro: '评论服务因为慢查询变慢（500ms→5s），订单服务和商品服务跟着超时，最终全站不可用。评论服务只占请求链路的 5%——为什么能拖垮全站？',
  domain: 'runtime',
  layer: '级联雪崩：一个依赖的超时传递为全链路故障——没有熔断、没有背压、超时值形同虚设',
  part: 'engineer',
  chapterId: 'runtime',
  order: 6,
  typeTags: ['runtime', 'architecture'],
  difficulty: 3,

  scene: {
    role: '你是「鲜到家」的平台工程师。凌晨 2:00 全站不可用，你 5 分钟内定位到了评论服务的慢查询——但修完之后全站仍然不可用。',
    architecture: 'App → 网关 → 商品服务 → 订单服务 → 评论服务(慢查询 5s) | 用户服务(独立)',
    tag: '故障现场',
    symptoms: [
      {
        type: 'error',
        title: '监控快照',
        text: '评论服务：P99 5s（慢查询）\n订单服务：P99 30s，线程池满，大量等待评论响应的线程\n商品服务：P99 25s，也在等订单服务\n网关：全部请求超时\n→ 故障从评论服务沿调用链反向传播到网关。',
      },
      {
        type: 'text',
        title: '超时配置审计',
        text: '评论服务→DB：readTimeout=30s\n订单服务→评论服务：timeout=30s\n商品服务→订单服务：timeout=30s\n网关→商品服务：timeout=30s\n→ 全链路超时全配 30s：每一层都等上一层超完才超时——层层传递，无熔断。',
      },
    ],
    timeline: '评论服务慢查询：22:00 起持续 ｜ 全站雪崩：22:05 起 ｜ 评论服务慢查询修复：22:20（DBA kill 慢查询）',
    impactHint: '评论服务修好了——为什么全站仍然不可用？修好了"根因"不等于恢复了"系统"。',
  },

  hypotheses: [
    { id: 'h-cascade', text: '级联雪崩：超时值层层传递（每层 30s），慢查询修复后已阻塞的线程池仍未释放', excludeActionId: 'a-timeout' },
    { id: 'h-pool', text: '订单服务的线程池被评论服务的慢响应占满，评论修好后线程池仍未恢复', excludeActionId: 'a-threadpool' },
    { id: 'h-nomeltdown', text: '不是级联：是评论服务和订单服务同时出了独立问题', excludeActionId: 'a-independent' },
    { id: 'h-gw', text: '网关自身故障：网关层面的问题', excludeActionId: 'a-gw' },
  ],

  actions: [
    {
      id: 'a-impact',
      name: '画调用链的故障传播图',
      desc: '评论→订单→商品→网关，每层的响应时间和线程池状态',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '故障传播图',
        text: '评论服务：P99 5s（慢查询）→ 200 线程/池\n订单服务：每请求等评论 5s，200 线程被占满 → 自身 P99 30s\n商品服务：每请求等订单，线程被占满 → P99 25s\n网关：全部请求超时\n→ 故障从评论服务沿调用链反向传播到网关：级联雪崩实锤。',
      },
    },
    {
      id: 'a-timeout',
      name: '审计全链路超时配置',
      desc: '每层的超时值、是否合理、是否形同虚设',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-cascade'],
      hypotheses: [{ id: 'h-cascade', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '超时配置审计',
        text: '评论→DB：30s（慢查询实际 5s——没熔断就等 30s）\n订单→评论：30s（等于评论的最大耗时——永远等满）\n商品→订单：30s（又一层 30s）\n网关→商品：30s（第四层 30s）\n→ 全链路超时全配 30s：无一层提前熔断，全部等满。\n→ 30s × 4 层 = 一个请求最长等 120 秒——线程池在 2 分钟内必被占满。',
      },
    },
    {
      id: 'a-threadpool',
      name: '检查订单服务的线程池恢复状态',
      desc: '评论修好了，订单服务的线程池恢复了吗',
      cost: 1,
      gain: 'high',
      danger: false,
      effects: [],
      tests: ['h-pool'],
      hypotheses: [{ id: 'h-pool', status: 'confirmed' }],
      result: {
        type: 'text',
        title: '线程池状态',
        text: '评论慢查询 kill 后：评论服务 P99 回到 30ms。\n但订单服务线程池：200/200 仍满——\n被评论服务慢响应占住的线程在等待 HTTP 响应超时（30s），\n期间新请求继续进入并占线程 → 线程池在 30s 超时后才逐步释放。\n→ "修好根因"后仍需等一层线程超时才能恢复——不是瞬时的。',
      },
    },
    {
      id: 'a-traffic',
      name: '对比故障前后的流量模式',
      desc: '排除流量激增导致',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '流量对比',
        text: '故障前后流量几乎一致（凌晨 2 点，QPS 无异常波动）。\n→ 排除流量激增；故障由评论服务慢查询引发。',
      },
    },
    {
      id: 'a-independent',
      name: '排查评论和订单是否有独立问题',
      desc: '排除"两个同时出事"的可能',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-nomeltdown'],
      hypotheses: [{ id: 'h-nomeltdown', status: 'excluded' }],
      result: {
        type: 'text',
        title: '独立问题排查',
        text: '评论服务：慢查询已 kill，恢复 30ms——无其他异常。\n订单服务：线程池被等评论的线程占满，评论恢复后逐步释放——无独立异常。\n→ 排除"同时出事"：所有异常都是级联的下游症状。',
      },
    },
    {
      id: 'a-gw',
      name: '排查网关自身',
      desc: '排除网关层问题',
      cost: 1,
      gain: 'low',
      danger: false,
      effects: [],
      tests: ['h-gw'],
      hypotheses: [{ id: 'h-gw', status: 'excluded' }],
      result: {
        type: 'text',
        title: '网关排查',
        text: '网关 CPU/内存/连接数正常，仅代理上游请求。\n→ 网关无辜：它只是忠实转发了上游的超时。',
      },
    },
    {
      id: 'a-emergency',
      name: '紧急扩容订单服务线程池',
      desc: '【状态变更】线程池 200→500 应急扩容，不等超时释放',
      cost: 1,
      gain: 'none',
      danger: true,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '应急扩容结果',
        text: '线程池扩到 500：新请求有可用线程，P99 从 30s 降到 8s。\n→ 应急缓解：但被评论阻塞的 500 个线程仍在等超时——治标，等待超时重配+熔断器上线。',
      },
    },
    {
      id: 'a-fixtimeout',
      name: '全链路超时重配 + 加熔断器',
      desc: '【状态变更】每层超时改为上游 P99×2 + 熔断器（5 次失败自动断路 30s）',
      cost: 2,
      gain: 'high',
      danger: false,
      effects: [],
      tests: [],
      hypotheses: [],
      result: {
        type: 'text',
        title: '修复结果',
        text: '超时重配：订单→评论 5s（原 30s）、商品→订单 8s、网关→商品 10s。\n熔断器：评论服务连续 5 次超时 → 自动断路 30s（期间直接返回降级响应，不等待）。\n压测复验：评论再变慢时——订单服务 5s 后熔断降级，不拖累全站。',
      },
    },
  ],

  rootCauses: [
    { id: 'rc-cascade', text: '级联雪崩：全链路超时统一配 30s（无一层提前熔断），评论服务慢查询 5s 沿调用链传播——订单和商品的线程池被等待评论响应的线程占满，修好评论后线程池仍需 30s 超时才释放', correct: true },
    { id: 'rc-pool', text: '订单服务线程池资源不足，需扩大池容量', correct: false },
    { id: 'rc-nomeltdown', text: '评论和订单服务同时出了独立问题', correct: false },
    { id: 'rc-gw', text: '网关层面自身故障', correct: false },
  ],

  expertCost: 6,
  restartActionId: 'a-fixtimeout',

  expertChain: [
    {
      thought: '画故障传播图：从评论到网关，每一层的 P99 和线程池状态——故障是"从下游往上游反向传播"的。',
      update: '评论 5s → 订单 30s → 商品 25s → 网关全部超时——级联雪崩实锤。',
      actionId: 'a-impact',
      why: '1⚡ 传播图是级联故障的核心视图：它同时展示"谁在传播"和"传播到了哪一层"——修复范围和顺序由此确定。',
      conclusion: '级联雪崩实锤 → 审计超时配置。',
    },
    {
      thought: '超时配置审计：每层都配了 30s——看起来"配了"，实际上"无一层提前断开"。修好评论后线程池仍要等 30s 超时才释放。',
      update: '全链路超时形同虚设：修好评论后，被阻塞的线程池还需要等下一轮 30s 超时才释放——这就是"修好了根因但全站仍然不可用"的原因。',
      actionId: 'a-timeout',
      why: '2⚡ 超时配置审计揭示双重缺陷：①"配了 30s"等于"配了 0s"（每层都等满才超时）②没有熔断器在等满之前主动断路。修好评论只是消除了源头，但被占住的线程池仍需等超时释放。',
      conclusion: '线程池恢复滞后根因实锤 → 检查线程池当前状态。',
    },
    {
      thought: '评论修好了但订单线程池仍满——被阻塞的线程要等 30s 超时才释放。这不是"还有问题"，这是"超时的自然衰减"。',
      update: '线程池逐步释放中（30s 超时衰减）——确认修复已生效，只是恢复有滞后。评论和订单无独立问题，网关无辜。',
      actionId: 'a-threadpool',
      why: '1⚡ 区分"还有问题"和"超时自然衰减"：线程池逐步释放 = 修复生效但恢复有滞后。如果线程池完全不释放，那才是新问题。',
      conclusion: '确认线程池自然衰减 → 无新问题，补熔断器防复发。',
    },
    {
      thought: '评论/订单/网关三个假设全部排除，修复+熔断上线——排查闭环。',
      update: '停止排查。超时重配 + 熔断器上线——下次评论再慢，订单 5s 后自动降级。',
      actionId: '',
      why: '【停止规则】级联传播图 ✓ 超时审计 ✓ 线程池衰减确认 ✓ 三假设排除 ✓ 熔断+超时重配上线 ✓——全链路闭环。',
      conclusion: '检查单：级联雪崩的三层防线 = 逐层超时递减 + 熔断器 + 背压（线程池隔离）。',
    },
  ],

  lessons: [
    {
      text: '全链路超时统一配一个值 = 超时形同虚设：每一层都等满才超时，线程池在等满的过程中被占满。',
      principle: '架构设计：逐层超时递减原则——下游超时 < 上游超时（DB 5s < 评论→订单 8s < 商品→网关 10s）。统一超时让每一层都"等满才放弃"，级联雪崩是数学必然。',
    },
    {
      text: '修好根因 ≠ 系统恢复：被阻塞的线程池要等超时才释放——恢复有滞后，不是瞬时。',
      principle: '验证思维：修复根因后要区分"根因已消除"和"系统已恢复"——线程池的释放有 30s 超时滞后。监控要能区分这两个阶段。',
    },
    {
      text: '熔断器是级联雪崩的唯一解药：评论连续 5 次超时 → 订单 5s 后自动降级（不再等评论），全站不受影响。',
      principle: '架构设计：熔断器三状态（关闭→打开→半开）是防止级联雪崩的标准模式。没有熔断器的微服务调用链，就是一个"一个倒全倒"的多米诺骨牌。',
    },
    {
      text: '评论只占请求链路的 5%——但"没有熔断"让它成为了 100% 的故障放大器。',
      principle: '架构设计：级联雪崩不看"流量占比"，看"调用链依赖"——只要在调用链上，哪怕 1% 的请求也会通过线程池阻塞传导到 100% 的请求。',
    },
  ],
}
