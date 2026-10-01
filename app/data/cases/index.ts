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
import { oversellRaceCase } from './oversell-race'
import { idempotentFailCase } from './idempotent-fail'
import { logSamplingCase } from './log-sampling'
import { avgMetricCase } from './avg-metric'

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
  whiteScreenCase,
  depHellCase,
  oversellRaceCase,
  idempotentFailCase,
  logSamplingCase,
  avgMetricCase,
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
