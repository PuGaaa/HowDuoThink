/** 篇-章-关三级内容架构。
 *  篇 = 学习阶段（三篇）；章 = 层的契约（可无限加，6~12 关封顶）；
 *  关 = 案例（带 part/typeTags/order），章内容按 layerKey 动态聚合——加第 101 关只需打标，不改本章。 */
import { ALL_CASES } from './cases'
import { DiagnosisCase } from '../types/case'

export interface PartDef {
  id: string
  name: string
  desc: string
}

export interface ChapterDef {
  id: string
  part: string
  no: string
  name: string
  pact: string
}

export const PARTS: PartDef[] = [
  { id: 'apprentice', name: '侦探学徒篇', desc: '各层入门教学关，建立"假设-验证-结论"的基本功' },
  { id: 'engineer', name: '一线工兵篇', desc: '标准难度的真实故障，练习成本纪律与假设收缩' },
  { id: 'master', name: '资深值班篇', desc: '高噪声与叠加故障，练到条件反射' },
]

export const CHAPTERS: ChapterDef[] = [
  { id: 'access', part: 'apprentice', no: '第 1 章', name: '接入层之夜', pact: 'TLS 是两端协商，任何一侧校验策略的差异都会造成"部分失败"' },
  { id: 'build', part: 'apprentice', no: '第 2 章', name: '构建与依赖', pact: '构建产物与运行环境的差异，是白屏的高发地带' },
  { id: 'data', part: 'engineer', no: '第 3 章', name: '数据的脾气', pact: '缓存与数据库之间，永远隔着一致性窗口' },
  { id: 'runtime', part: 'engineer', no: '第 4 章', name: '运行时暗面', pact: '内存与连接是有生命周期的资源' },
  { id: 'concurrency', part: 'master', no: '第 5 章', name: '并发迷宫', pact: '时间与顺序是隐藏的维度：竞态只在重放时现形' },
  { id: 'observability', part: 'master', no: '第 6 章', name: '可观测性迷雾', pact: '你看到的日志和指标，本身也会说谎' },
]

/** 章内关卡：按 chapterId 动态聚合 + order 排序；含本地与远端（casepack）案例 */
export function casesInChapter(chapterId: string): DiagnosisCase[] {
  return ALL_CASES.filter((c) => c.chapterId === chapterId).sort((a, b) => a.order - b.order)
}

/** 全部可用关（本地 + 远端已同步） */
export function allPlayableCases(): DiagnosisCase[] {
  return ALL_CASES
}

/** 篇内全部章 */
export function chaptersInPart(partId: string): ChapterDef[] {
  return CHAPTERS.filter((c) => c.part === partId)
}
