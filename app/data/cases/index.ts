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
import { bgSplitCase } from './bg-split'
import { flagLeakCase } from './flag-leak'
import { mixVersionCase } from './mixversion'
import { cdnStaleCase } from './cdn-stale'
import { tcpRetransCase } from './tcp-retrans'
import { h2HolCase } from './h2-hol'
import { cdnPenetrationCase } from './cdn-penetration'
import { proxyHeadersCase } from './proxy-headers'
import { coverageIllusionCase } from './coverage-illusion'
import { mockLeakCase } from './mock-leak'
import { flakyTestCase } from './flaky-test'
import { envDriftCase } from './env-drift'
import { mqSlowPartCase } from './mq-slowpart'
import { deployMigrationCase } from './deploy-migration'
import { poolDeadlockCase } from './pool-deadlock'
import { lockExpiryCase } from './lock-expiry'
import { idleResetCase } from './idle-reset'
import { mqBusReviewCase } from './mq-bus-review'
import { threadlocalLeakCase } from './threadlocal-leak'
import { imageTagDriftCase } from './image-tag-drift'
import { regexCatastropheCase } from './regex-catastrophe'
import { cardinalityBlastCase } from './cardinality-blast'
import { distributedMonolithCase } from './distributed-monolith'
import { loadtestIllusionCase } from './loadtest-illusion'
import { wsUpgradeCase } from './ws-upgrade'
import { replicaLagCase } from './replica-lag'
import { sqliSortCase } from './sqli-sort'
import { rebalanceStormCase } from './rebalance-storm'
import { gracefulShutdownCase } from './graceful-shutdown'
import { nagleAckCase } from './nagle-ack'
import { buildtimeInjectCase } from './buildtime-inject'
import { poolRejectionCase } from './pool-rejection'
import { traceBreakCase } from './trace-break'
import { apiSunsetCase } from './api-sunset'
import { implicitCastCase } from './implicit-cast'
import { capacityReviewCase } from './capacity-review'
import { certSniCase } from './cert-sni'
import { testingReviewCase } from './testing-review'
import { configDriftCase } from './config-drift'
import { happyEyeballsCase } from './happy-eyeballs'
import { mqDiskCase } from './mq-disk'

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
  bgSplitCase,
  flagLeakCase,
  mixVersionCase,
  cdnStaleCase,
  tcpRetransCase,
  h2HolCase,
  cdnPenetrationCase,
  proxyHeadersCase,
  coverageIllusionCase,
  mockLeakCase,
  flakyTestCase,
  envDriftCase,
  mqSlowPartCase,
  deployMigrationCase,
  poolDeadlockCase,
  lockExpiryCase,
  idleResetCase,
  mqBusReviewCase,
  threadlocalLeakCase,
  imageTagDriftCase,
  regexCatastropheCase,
  cardinalityBlastCase,
  distributedMonolithCase,
  loadtestIllusionCase,
  wsUpgradeCase,
  replicaLagCase,
  sqliSortCase,
  rebalanceStormCase,
  gracefulShutdownCase,
  nagleAckCase,
  buildtimeInjectCase,
  poolRejectionCase,
  traceBreakCase,
  apiSunsetCase,
  implicitCastCase,
  capacityReviewCase,
  certSniCase,
  testingReviewCase,
  configDriftCase,
  happyEyeballsCase,
  mqDiskCase,
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
