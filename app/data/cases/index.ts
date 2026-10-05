import { DiagnosisCase } from '../../types/case'
import { getCaseProgress } from '../../utils/storage'
import { getRemoteCases } from '../../utils/sync'
import { sslChainCase } from './ssl-chain'
import { poolExhaustedCase } from './pool-exhausted'
import { corsCase } from './cors-101'
import { dnsHijackCase } from './dns-hijack'
import { whiteScreenCase } from './white-screen'
import { depHellCase } from './dep-hell'
import { cacheDriftCase } from './cache-drift'
import { slowQueryCase } from './slow-query'
import { oomLeakCase } from './oom-leak'
import { msgOrderCase } from './msg-order'
import { nginxTrapCase } from './nginx-trap'
import { cacheReviewCase } from './cache-review'
import { eventLoopBlockedCase } from './event-loop-blocked'
import { timewaitCase } from './timewait-exhausted'
import { closureLeakCase } from './closure-leak'
import { ciCacheCase } from './ci-cache-pollution'
import { alertStormCase } from './alert-storm'
import { histogramCase } from './histogram-bucket'
import { leakedKeysCase } from './leaked-keys'
import { idorOrdersCase } from './idor-orders'
import { logPiiCase } from './log-pii'
import { ssrfCase } from './ssrf-internal'
import { withdrawRaceCase } from './withdraw-race'
import { supplyPoisonCase } from './supply-poison'
import { gatewayReviewCase } from './gateway-review'
import { pipelineReviewCase } from './pipeline-review'
import { containerReviewCase } from './container-review'
import { metricsReviewCase } from './metrics-review'
import { midnightRollbackCase } from './midnight-rollback'
import { canaryDecisionCase } from './canary-decision'
import { xssDecisionCase } from './xss-decision'
import { errorBudgetCase } from './error-budget'
import { doubleStrikeCase } from './double-strike'
import { falseLeadCase } from './false-lead'
import { cascadeCase } from './cascade-timeout'
import { dataScriptCase } from './data-script-accident'
import { rateLimitPassCase } from './rate-limit-passthrough'
import { fallbackDrillCase } from './fallback-drill-fail'
import { retryStormCase } from './retry-storm'
import { hpaLagCase } from './hpa-lag'
import { oversellRaceCase } from './oversell-race'
import { idempotentFailCase } from './idempotent-fail'
import { logSamplingCase } from './log-sampling'
import { avgMetricCase } from './avg-metric'
import { mqLostCase } from './mq-lost'
import { mqDuplicateCase } from './mq-duplicate'
import { mqDlqCase } from './mq-dlq'
import { mqDelayCase } from './mq-delay'

/** 案例注册表：新案例入库 = 在此数组追加 */
export const ALL_CASES: DiagnosisCase[] = [
  sslChainCase,
  dnsHijackCase,
  corsCase,
  poolExhaustedCase,
  cacheDriftCase,
  slowQueryCase,
  oomLeakCase,
  msgOrderCase,
  nginxTrapCase,
  cacheReviewCase,
  eventLoopBlockedCase,
  timewaitCase,
  closureLeakCase,
  ciCacheCase,
  alertStormCase,
  histogramCase,
  leakedKeysCase,
  idorOrdersCase,
  logPiiCase,
  ssrfCase,
  withdrawRaceCase,
  supplyPoisonCase,
  gatewayReviewCase,
  pipelineReviewCase,
  containerReviewCase,
  metricsReviewCase,
  midnightRollbackCase,
  canaryDecisionCase,
  xssDecisionCase,
  errorBudgetCase,
  doubleStrikeCase,
  falseLeadCase,
  cascadeCase,
  dataScriptCase,
  rateLimitPassCase,
  fallbackDrillCase,
  retryStormCase,
  hpaLagCase,
  whiteScreenCase,
  depHellCase,
  oversellRaceCase,
  idempotentFailCase,
  logSamplingCase,
  avgMetricCase,
  mqLostCase,
  mqDuplicateCase,
  mqDlqCase,
  mqDelayCase,
]

export function getCaseById(id: string): DiagnosisCase | null {
  for (let i = 0; i < ALL_CASES.length; i++) {
    if (ALL_CASES[i].id === id) {
      return ALL_CASES[i]
    }
  }
  // 远端 casepack 兜底（社区同步的关卡）
  const arr = getRemoteCases()
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] != null && arr[i].id === id) {
      return arr[i]
    }
  }
  return null
}

export class CollectedLesson {
  text: string = ''
  src: string = ''
}

/** 已破案案例的全部检查单（本地 + 远端 casepack），可排除当前关 */
export function getCollectedLessons(excludeCaseId: string): CollectedLesson[] {
  const out: CollectedLesson[] = []
  const merged: DiagnosisCase[] = []
  for (let i = 0; i < ALL_CASES.length; i++) merged.push(ALL_CASES[i])
  const remote = getRemoteCases()
  for (let i = 0; i < remote.length; i++) merged.push(remote[i])
  for (let i = 0; i < merged.length; i++) {
    const c = merged[i]
    if (c.id === excludeCaseId) continue
    const p = getCaseProgress(c.id)
    if (p == null || !p.solved) continue
    for (let j = 0; j < c.lessons.length; j++) {
      const item = new CollectedLesson()
      item.text = c.lessons[j].text
      item.src = '《' + c.title + '》'
      out.push(item)
    }
  }
  return out
}
