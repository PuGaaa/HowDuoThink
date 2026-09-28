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
  return null
}
