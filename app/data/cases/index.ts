import { DiagnosisCase } from '../../types/case'
import { sslChainCase } from './ssl-chain'
import { poolExhaustedCase } from './pool-exhausted'
import { corsCase } from './cors-101'
import { dnsHijackCase } from './dns-hijack'
import { whiteScreenCase } from './white-screen'
import { depHellCase } from './dep-hell'
import { cacheDriftCase } from './cache-drift'

/** 案例注册表：新案例入库 = 在此数组追加 */
export const ALL_CASES: DiagnosisCase[] = [
  sslChainCase,
  dnsHijackCase,
  corsCase,
  poolExhaustedCase,
  cacheDriftCase,
  whiteScreenCase,
  depHellCase,
]

export function getCaseById(id: string): DiagnosisCase | null {
  for (let i = 0; i < ALL_CASES.length; i++) {
    if (ALL_CASES[i].id === id) {
      return ALL_CASES[i]
    }
  }
  // 远端 casepack 兜底（社区同步的关卡）
  const raw = uni.getStorageSync('think_casepack_v1')
  if (raw != null && (raw as string).length > 0) {
    try {
      const arr = JSON.parse(raw as string) as DiagnosisCase[]
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] != null && arr[i].id === id) {
          return arr[i]
        }
      }
    } catch (e) {
      return null
    }
  }
  return null
}
