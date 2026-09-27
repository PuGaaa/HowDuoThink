#!/usr/bin/env node
/**
 * 案例校验脚本（content/pipeline）
 *
 * 用法：node content/pipeline/validate.mjs <case.ts> [case2.ts ...]
 * 约定：案例文件只允许 type-only import（类型在运行时擦除），数据必须是纯字面量。
 *
 * 自动化覆盖的是"可机检"的红线；证据自洽性、双路径、噪声质量等仍需人工走验
 * （见 docs/案例写作规范.md 第 5 节 checklist）。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('用法：node content/pipeline/validate.mjs <case.ts> [...]')
  process.exit(1)
}

let totalFailed = 0

for (const f of files) {
  const path = resolve(f)
  const src = readFileSync(path, 'utf8')
  const errors = []
  const warns = []

  // —— 加载：剥掉 import 与 export，用 Function 求值出案例对象 ——
  const nameMatch = src.match(/export\s+const\s+(\w+)/)
  if (!nameMatch) {
    console.error(`✗ ${f}: 找不到 "export const <案例名>"`)
    totalFailed++
    continue
  }
  const constName = nameMatch[1]
  const body = src
    .replace(/^import\s+.*$/gm, '')
    .replace(/export\s+const/, 'const')
    .replace(new RegExp(`const\\s+${constName}\\s*:\\s*\\w+`), `const ${constName}`)
  let c
  try {
    c = new Function(`${body}; return ${constName};`)()
  } catch (e) {
    console.error(`✗ ${f}: 求值失败 — ${e.message}`)
    totalFailed++
    continue
  }

  const ok = (cond, msg) => { if (!cond) errors.push(msg) }
  const warn = (cond, msg) => { if (!cond) warns.push(msg) }

  // —— 元信息 ——
  for (const k of ['id', 'title', 'intro', 'domain', 'layer', 'difficulty']) {
    ok(c[k] != null && String(c[k]).length > 0, `元信息缺失：${k}`)
  }
  ok([1, 2, 3].includes(c.difficulty), `difficulty 必须为 1/2/3，现在是 ${c.difficulty}`)

  // —— 症状面 ——
  const s = c.scene || {}
  for (const k of ['role', 'architecture', 'timeline', 'impactHint']) {
    ok(String(s[k] ?? '').length > 0, `scene.${k} 缺失`)
  }
  ok(Array.isArray(s.symptoms) && s.symptoms.length >= 1, 'scene.symptoms 至少 1 条')
  ok(
    (s.symptoms ?? []).some((e) => e.type === 'error'),
    '症状面应含至少 1 条 error 类证据（恐怖蛙触发依赖它）'
  )
  for (const e of s.symptoms ?? []) {
    ok(String(e.title ?? '').length > 0 && String(e.text ?? '').length > 0, '症状证据缺 title/text')
  }

  // —— 假设空间 ——
  const hyps = c.hypotheses ?? []
  const acts = c.actions ?? []
  const actIds = new Set(acts.map((a) => a.id))
  ok(hyps.length >= 3, `假设池太薄：${hyps.length} 个（规范要求 3~8）`)
  ok(hyps.length <= 8, `假设池太大：${hyps.length} 个（规范要求 3~8）`)
  for (const h of hyps) {
    ok(String(h.text ?? '').length > 0, `假设 ${h.id} 缺 text`)
    warn(
      h.excludeActionId && actIds.has(h.excludeActionId),
      `假设「${h.text}」缺 excludeActionId 或指向不存在的动作（红线：每个干扰项必须有低成本排除路径）`
    )
  }

  // —— 动作与证据 ——
  ok(acts.length >= 8, `动作太少：${acts.length} 个（规范要求 8~15）`)
  const GAINS = new Set(['high', 'mid', 'low', 'none'])
  let highCount = 0
  let dangerCount = 0
  let impactActionId = ''
  for (const a of acts) {
    ok(String(a.id ?? '').length > 0, '动作缺 id')
    ok(String(a.name ?? '').length > 0 && String(a.desc ?? '').length > 0, `动作 ${a.id} 缺 name/desc`)
    ok(Number.isInteger(a.cost) && a.cost >= 1 && a.cost <= 10, `动作 ${a.id} 成本越界：${a.cost}（1~10）`)
    ok(GAINS.has(a.gain), `动作 ${a.id} gain 非法：${a.gain}`)
    ok(a.result != null && String(a.result.text ?? '').length > 0, `动作 ${a.id} 缺证据 result.text`)
    if (a.gain === 'high') highCount++
    if (a.danger) dangerCount++
    // 影响面动作：cost 1 + gain high
    if (a.cost === 1 && a.gain === 'high' && impactActionId === '') impactActionId = a.id
    if (a.danger && a.gain !== 'none') {
      warn(false, `危险动作 ${a.id} 的 gain 应为 none（状态变更不产生诊断信息）`)
    }
    ok(Array.isArray(a.effects), `动作 ${a.id} 缺 effects 数组（v0 恒为空）`)
    if (Array.isArray(a.effects) && a.effects.length > 0) {
      warn(false, `动作 ${a.id} 带 effects —— v0 为静态题，规范第 1⑥ 节禁止`)
    }
  }
  ok(highCount >= 2, `高增益动作仅 ${highCount} 个（至少需要影响面 + 实锤两个 high）`)
  ok(impactActionId !== '', '缺影响面动作（cost=1 且 gain=high）')
  ok(dangerCount >= 1 || c.difficulty === 1, `L${c.difficulty} 题必须含重启/回滚类危险动作`)

  // —— 根因 ——
  const causes = c.rootCauses ?? []
  const corrects = causes.filter((x) => x.correct)
  ok(corrects.length === 1, `correct 根因必须恰好 1 个，现在是 ${corrects.length}`)
  ok(causes.length === hyps.length, `根因数(${causes.length})与假设数(${hyps.length})不一致（应同池平权）`)

  // —— 成本基准 ——
  const costSum = acts.reduce((t, a) => t + a.cost, 0)
  ok(c.expertCost > 0 && c.expertCost < costSum, `expertCost=${c.expertCost} 必须小于总成本 ${costSum}`)
  // 提示：存在动作子集恰好凑出 expertCost（可行专家路径的必要条件）
  const reachable = subsetSumExists(acts.map((a) => a.cost), c.expertCost)
  warn(reachable, `没有任何动作子集成本和等于 expertCost=${c.expertCost}，检查基准是否写错`)
  warn(c.restartActionId === '' || actIds.has(c.restartActionId), 'restartActionId 指向不存在的动作')

  // —— 专家链 ——
  const chain = c.expertChain ?? []
  ok(chain.length >= 4, `专家链太短：${chain.length} 步（≥4）`)
  for (let i = 0; i < chain.length; i++) {
    const st = chain[i]
    for (const k of ['thought', 'update', 'why', 'conclusion']) {
      ok(String(st[k] ?? '').length > 0, `专家链第 ${i + 1} 步缺 ${k}（四段式红线）`)
    }
    ok(st.actionId == null || st.actionId === '' || actIds.has(st.actionId), `专家链第 ${i + 1} 步 actionId 无效`)
    ok(String(st.why ?? '').length >= 12, `专家链第 ${i + 1} 步 why 太敷衍（"为什么"是教学核心）`)
  }
  if (impactActionId !== '' && chain.length > 0) {
    ok(chain[0].actionId === impactActionId, `专家链第一步必须是影响面动作（${impactActionId}）`)
  }
  const last = chain[chain.length - 1]
  if (chain.length > 0) {
    ok(last != null && (last.actionId ?? '') === '', '专家链最后一步应是停止规则（actionId 为空的纯推理步）')
  }

  // —— 复盘沉淀 ——
  const lessons = c.lessons ?? []
  ok(lessons.length >= 2 && lessons.length <= 4, `lessons 数量 ${lessons.length}（规范 2~4 条）`)
  for (let i = 0; i < lessons.length; i++) {
    ok(String(lessons[i].text ?? '').length > 0, `lesson ${i + 1} 缺 text`)
    ok(String(lessons[i].principle ?? '').length >= 15, `lesson ${i + 1} 的 principle 没讲透层契约`)
  }

  // —— 报告 ——
  const tag = errors.length === 0 ? '✓' : '✗'
  console.log(`${tag} ${f} — ${c.id}《${c.title}》(L${c.difficulty})`)
  for (const e of errors) console.log(`   ✗ 红线: ${e}`)
  for (const w of warns) console.log(`   ⚠ 提示: ${w}`)
  if (errors.length === 0 && warns.length === 0) console.log('   机检全绿。别忘了人工走验：证据自洽 / 双路径 / 噪声质量。')
  if (errors.length > 0) totalFailed++
}

process.exit(totalFailed > 0 ? 1 : 0)

/** 是否存在某子集的和恰好等于 target（小规模爆搜即可） */
function subsetSumExists(costs, target) {
  const dp = new Set([0])
  for (const cItem of costs) {
    for (const v of [...dp]) {
      if (v + cItem <= target) dp.add(v + cItem)
    }
  }
  return dp.has(target)
}
