import { CaseCatalogMeta, DiagnosisCase } from '../../types/case'
import { getCaseProgress } from '../../utils/storage'
import { getRemoteCases } from '../../utils/sync'
import { MAINLINE_CASE_IDS } from '../course'
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
import { chunkOverlapCase } from './chunk-overlap'
import { callbackMismatchCase } from './callback-mismatch'
import { deepPaginationCase } from './deep-pagination'
import { ruleSprawlCase } from './rule-sprawl'
import { mqDualWriteCase } from './mq-dualwrite'
import { probeMismatchCase } from './probe-mismatch'
import { wrongEnvCase } from './wrong-env'
import { bandwidthHogCase } from './bandwidth-hog'
import { ndotsTrapCase } from './ndots-trap'
import { envContentionCase } from './env-contention'
import { firstNpeCase } from './first-npe'
import { causedByCase } from './caused-by'
import { fieldMismatchCase } from './field-mismatch'
import { cookieLostCase } from './cookie-lost'
import { requiredFieldCase } from './required-field'
import { docDriftCase } from './doc-drift'
import { configTypoCase } from './config-typo'
import { bootOrderCase } from './boot-order'
import { logCorrelationCase } from './log-correlation'
import { waterfallReadCase } from './waterfall-read'
import { timeoutContractCase } from './timeout-contract'
import { hotReloadGapCase } from './hot-reload-gap'
import { asyncSwallowCase } from './async-swallow'
import { pollStormCase } from './poll-storm'
import { enumDriftCase } from './enum-drift'
import { priorityClashCase } from './priority-clash'
import { symptomClusterCase } from './symptom-cluster'
import { firstDominoCase } from './first-domino'
import { mockCanyonCase } from './mock-canyon'
import { triPlatformCase } from './tri-platform'
import { errorContractCase } from './error-contract'
import { contractReviewCase } from './contract-review'
import { profileMazeCase } from './profile-maze'
import { bootStormCase } from './boot-storm'
import { rollbackDriftCase } from './rollback-drift'
import { warmupStormCase } from './warmup-storm'
import { partitionSplitCase } from './partition-split'
import { replaySurgeCase } from './replay-surge'
import { mtuBlackholeCase } from './mtu-blackhole'
import { geoStaleCase } from './geo-stale'
import { envInheritCase } from './env-inherit'
import { capacityAssumptionCase } from './capacity-assumption'

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
  chunkOverlapCase,
  callbackMismatchCase,
  deepPaginationCase,
  ruleSprawlCase,
  mqDualWriteCase,
  probeMismatchCase,
  wrongEnvCase,
  bandwidthHogCase,
  ndotsTrapCase,
  envContentionCase,
  firstNpeCase,
  causedByCase,
  fieldMismatchCase,
  cookieLostCase,
  requiredFieldCase,
  docDriftCase,
  configTypoCase,
  bootOrderCase,
  logCorrelationCase,
  waterfallReadCase,
  timeoutContractCase,
  hotReloadGapCase,
  asyncSwallowCase,
  pollStormCase,
  enumDriftCase,
  priorityClashCase,
  symptomClusterCase,
  firstDominoCase,
  mockCanyonCase,
  triPlatformCase,
  errorContractCase,
  contractReviewCase,
  profileMazeCase,
  bootStormCase,
  rollbackDriftCase,
  warmupStormCase,
  partitionSplitCase,
  replaySurgeCase,
  mtuBlackholeCase,
  geoStaleCase,
  envInheritCase,
  capacityAssumptionCase,
]

/** 稳定试玩与课程主线只由目录配置决定，不依赖 ALL_CASES 的注册顺序。 */
export const TRIAL_CASE_IDS = ['first-npe', 'caused-by', 'log-correlation'] as const
export { MAINLINE_CASE_IDS }

/** 官方来源与必修属性分开；冻结目录以外的新题默认选做。 */
export const CASE_CATALOG: Record<string, CaseCatalogMeta> = {}
for (let i = 0; i < ALL_CASES.length; i++) {
  const id = ALL_CASES[i].id
  CASE_CATALOG[id] = {
    source: 'official',
    track: MAINLINE_CASE_IDS.indexOf(id) >= 0 ? 'mainline' : 'optional',
  }
}

/** 所有玩法入口共享同一有效集合；同 ID 只采用更高内容修订，游标不参与比较。 */
export function getEffectiveCases(): DiagnosisCase[] {
  const byId = new Map<string, DiagnosisCase>()
  for (const item of ALL_CASES) byId.set(item.id, item)
  for (const item of getRemoteCases()) {
    const local = byId.get(item.id)
    if (local == null || (item.contentRevision ?? 1) > (local.contentRevision ?? 1)) byId.set(item.id, item)
  }
  return [...byId.values()]
}

export function getCaseById(id: string): DiagnosisCase | null {
  const cases = getEffectiveCases()
  for (const item of cases) if (item.id === id) return item
  return null
}

export class CollectedLesson {
  text: string = ''
  src: string = ''
}

/** 已破案案例的全部检查单（本地 + 远端 casepack），可排除当前关 */
export function getCollectedLessons(excludeCaseId: string): CollectedLesson[] {
  const out: CollectedLesson[] = []
  const merged = getEffectiveCases()
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
