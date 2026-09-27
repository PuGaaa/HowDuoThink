import { DiagnosisCase } from '../../types/case'
import { sslChainCase } from './ssl-chain'

/** 案例注册表：新案例入库 = 在此数组追加 */
export const ALL_CASES: DiagnosisCase[] = [sslChainCase]

export function getCaseById(id: string): DiagnosisCase | null {
  for (let i = 0; i < ALL_CASES.length; i++) {
    if (ALL_CASES[i].id === id) {
      return ALL_CASES[i]
    }
  }
  return null
}
