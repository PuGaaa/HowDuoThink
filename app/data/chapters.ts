/** 章节地图配置：按层专题 × 高频故障（docs/案例写作规范.md 第 6 节的落地）。
 *  未实现的 caseId 在关卡列表中显示为"即将上线"节点。 */
export interface ChapterDef {
  no: string
  name: string
  pact: string
  cases: string[]
}

export const CHAPTERS: ChapterDef[] = [
  {
    no: '第 1 章',
    name: '接入层之夜',
    pact: 'TLS 是两端协商，任何一侧校验策略的差异都会造成"部分失败"',
    cases: ['ssl-chain-missing', 'dns-hijack', 'cors-101', 'nginx-trap'],
  },
  {
    no: '第 2 章',
    name: '数据的脾气',
    pact: '缓存与数据库之间，永远隔着一致性窗口',
    cases: ['pool-exhausted', 'cache-drift', 'race-condition'],
  },
  {
    no: '第 3 章',
    name: '构建与依赖',
    pact: '构建产物与运行环境的差异，是白屏的高发地带',
    cases: ['white-screen', 'dep-hell'],
  },
  {
    no: '第 4 章',
    name: '运行时暗面',
    pact: '内存与连接是有生命周期的资源',
    cases: ['oom-leak'],
  },
]
