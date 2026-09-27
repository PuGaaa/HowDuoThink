/**
 * 内心小动物触发引擎（docs/角色设定集.md）
 *
 * 原则：动物是内心外化，不是裁判。触发逻辑全部在引擎层，案例作者零负担。
 * 语气：平时冷面吐槽；三角龙（挫败时刻）只暖不刺。
 */

export interface MascotAppearance {
  id: string // frog | snail | otter | rabbit | dino
  emoji: string
  line: string
}

const FROG_LINES: string[] = [
  '呱——好多红色！完了完了要背锅了！',
  '呱呱呱！（已经缩到屏幕边缘了）',
  '呱……心跳比上游超时还快。',
]

const SNAIL_LINES: string[] = [
  '（慢慢探出头）……这两个动作，好像啥也没查出来。',
  '（摇头慢半拍）你在用 ⚡ 换运气，不是换信息。',
  '呃……要不要先想想假设，再按按钮？',
]

const OTTER_LINES: string[] = [
  '纳尼？！证据它自己说话了！',
  '纳尼？！这条线索值回票价！',
  '纳尼？！快记下来，这就是突破口！',
]

const RABBIT_LINES: string[] = [
  '（摇头）证据还不够，你只是想结束它。',
  '（用耳朵捂住提交按钮）再咬合一下证据链？',
  '（长耳朵垂下来）过早锁定，是排错里最贵的错误。',
]

const DINO_LINES: string[] = [
  '（蹲下）这题是真难。坐一会儿，再看看现场。',
  '（用角顶顶你）挫败是排错的一部分，不是你的问题。',
  '（沉默陪你待一会儿）回现场，线索还在那里。',
]

const GREETING_LINES: string[] = [
  '🐸：呱，今天也有报错在等你。',
  '🐌：（正在爬向第一条日志）',
  '🦦：纳尼？今天想练哪一层的直觉？',
  '🐰：（竖起耳朵）记住：先画圈，再动手。',
]

function pick(lines: string[]): string {
  const idx = Math.floor(Math.random() * lines.length)
  return lines[idx]
}

/** 进入故障现场：symptoms 含报错类证据时，恐怖蛙出场（每关最多 1 次） */
export function onSceneOpen(symptomTypes: string[]): MascotAppearance | null {
  for (let i = 0; i < symptomTypes.length; i++) {
    if (symptomTypes[i] === 'error') {
      const a: MascotAppearance = { id: 'frog', emoji: '🐸', line: pick(FROG_LINES) }
      return a
    }
  }
  return null
}

/**
 * 每次动作结算后调用。
 * @param lowStreak 当前连续低增益动作数（调用方维护）
 * @param gain 本次动作的信息增益
 * @param otterCooldown 惊讶濑剩余冷却（调用方维护）
 * @returns 外观 + 更新后的 lowStreak / otterCooldown
 */
export function onActionResolved(
  lowStreak: number,
  gain: string,
  otterCooldown: number
): { appearance: MascotAppearance | null; lowStreak: number; otterCooldown: number } {
  const nextLowStreak = gain === 'low' || gain === 'none' ? lowStreak + 1 : 0
  const nextCooldown = otterCooldown > 0 ? otterCooldown - 1 : 0

  if (gain === 'high' && nextCooldown === 0) {
    const a: MascotAppearance = { id: 'otter', emoji: '🦦', line: pick(OTTER_LINES) }
    return { appearance: a, lowStreak: 0, otterCooldown: 2 }
  }
  if (nextLowStreak >= 2) {
    const a: MascotAppearance = { id: 'snail', emoji: '🐌', line: pick(SNAIL_LINES) }
    return { appearance: a, lowStreak: 0, otterCooldown: nextCooldown }
  }
  return { appearance: null, lowStreak: nextLowStreak, otterCooldown: nextCooldown }
}

/** 错误指认根因：垂耳兔出场 */
export function onWrongIdentify(): MascotAppearance {
  const a: MascotAppearance = { id: 'rabbit', emoji: '🐰', line: pick(RABBIT_LINES) }
  return a
}

/** 挫败时刻①：两次错误指认出局。三角龙只暖不刺 */
export function onEliminated(): MascotAppearance {
  const a: MascotAppearance = { id: 'dino', emoji: '🦖', line: pick(DINO_LINES) }
  return a
}

/** 挫败时刻②：花费远超专家基准（每关最多提示一次，由调用方去重） */
export function onOverspend(playerCost: number, expertCost: number): MascotAppearance | null {
  if (playerCost > expertCost * 2.5) {
    const a: MascotAppearance = { id: 'dino', emoji: '🦖', line: pick(DINO_LINES) }
    return a
  }
  return null
}

/** 首页随机问候 */
export function getGreeting(): string {
  return pick(GREETING_LINES)
}

/** 复盘页的元认知标注（心理回放用） */
export function reviewNote(mascotId: string): string {
  if (mascotId === 'frog') {
    return '这一步恐怖蛙附体了。它说得对，情况确实糟——但恐慌不产生信息。'
  }
  if (mascotId === 'snail') {
    return '不行蜗在这里爬过。你在用 ⚡ 换运气，不是换信息。'
  }
  if (mascotId === 'otter') {
    return '惊讶濑出现的次数 = 你读到关键证据的次数。意外 = 信息。'
  }
  if (mascotId === 'rabbit') {
    return '垂耳兔在这里拦了你。别急——咬合的证据链比答案本身值钱。'
  }
  return '三角龙陪了你一会儿。高手不是没有挫败，是挫败后还愿意回现场。'
}
