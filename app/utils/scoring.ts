/**
 * 评分：S/A/B/C = 根因正确 × 预算效率 × 错误指认次数
 * 评级规则（docs/案例写作规范.md 第 3 节）：
 *   S = 答对 且 成本 ≤ expertCost×1.2 且 零次错误指认
 *   A = 答对 且 成本 ≤ expertCost×1.8 且 错误指认 ≤1
 *   B = 答对
 *   F = 两次错误指认出局
 */

export function computeGrade(solved: boolean, playerCost: number, expertCost: number, wrongIdentifies: number): string {
  if (!solved) {
    return 'F'
  }
  const base = expertCost > 0 ? expertCost : 1
  const ratio = playerCost / base
  if (ratio <= 1.2 && wrongIdentifies === 0) {
    return 'S'
  }
  if (ratio <= 1.8 && wrongIdentifies <= 1) {
    return 'A'
  }
  return 'B'
}

export function gradeTitle(grade: string): string {
  if (grade === 'S') {
    return '专家级诊断'
  }
  if (grade === 'A') {
    return '优秀的推理'
  }
  if (grade === 'B') {
    return '破案了，但走了弯路'
  }
  return '没破案'
}

/** 三星：★ 破案 / ★★ 预算 ≤1.2× / ★★★ 零错误指认（由评级映射） */
export function starsOf(grade: string): number {
  if (grade === 'S') return 3
  if (grade === 'A') return 2
  if (grade === 'B') return 1
  return 0
}

/** 评级 → '★★☆' 展示串（未评级显示 ☆☆☆） */
export function starsLabel(grade: string): string {
  const n = starsOf(grade)
  let s = ''
  for (let i = 0; i < 3; i++) {
    s += i < n ? '★' : '☆'
  }
  return s
}

export interface RankInfo {
  index: number
  name: string
  nextName: string
  remain: number
}

const RANKS = [
  { name: '瞎扫实习生', need: 0 },
  { name: '初级侦探', need: 1 },
  { name: '主治工程师', need: 3 },
  { name: '首席诊断官', need: 6 },
]

export function rankOf(solvedCount: number): RankInfo {
  let idx = 0
  for (let i = 0; i < RANKS.length; i++) {
    if (solvedCount >= RANKS[i].need) idx = i
  }
  const next = idx + 1 < RANKS.length ? RANKS[idx + 1] : null
  const info: RankInfo = {
    index: idx,
    name: RANKS[idx].name,
    nextName: next != null ? next.name : '',
    remain: next != null ? next.need - solvedCount : 0,
  }
  return info
}
