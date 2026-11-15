import type { Ref } from 'vue'

/** AI 排错的出参引用（案例出处），chat 与会话历史消息共用同构。 */
export interface ChatSource {
  caseId: string
  title: string
}

/** 对话区一条消息：role/content 与会话历史接口的消息同构，
 * 实时消息与 openConversation 回放的历史都归一到本形态后渲染。
 * reasoning/phase/thoughtSeconds 只由流式实时消息携带（历史回放无，类型可选故兼容）。 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  sources?: ChatSource[]
  error?: boolean
  /** 思维链增量累计（SSE reasoning 帧 text 原样拼接；不落库，历史消息无此字段）。 */
  reasoning?: string
  /** 过程态：retrieving（检索案例）→ thinking（推理中）→ answering（作答中），done 后清除。 */
  phase?: 'retrieving' | 'thinking' | 'answering'
  /** 思考耗时（秒）：首个 answer 增量到达时按 reasoning 起点结算；无 reasoning 帧则保持 undefined。 */
  thoughtSeconds?: number
}

/** 会话列表条目线格式（GET /api/ai/conversations 的 items）。 */
export interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
}

/** 会话详情线格式（GET /api/ai/conversations/{id}）。 */
interface ConversationDetail {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: Array<{ role: string; content: string; sources?: ChatSource[] | null }>
}

const ERR_NETWORK = '服务暂时不可用，请稍后再试'
const ERR_AUTH = '请先登录后再提问'

/** 在途流式请求的中断器（send 开工时置换）：视图重置（新对话/删除激活会话）
 * 与组件卸载时 abort，令 readSse 的 read() 以 AbortError 失败、流循环即刻退出。
 * 只在客户端事件链路上赋值/abort，SSR 不触达。 */
let controller: AbortController | null = null

/** AI 排错页的会话状态单文件编排：右侧对话（发问/多轮接续）与左侧会话列表。
 * 报错契约：业务错误走 SSE error 帧，气泡照显 data.error；HTTP 401 → 登录引导文案；
 * 其余异常一律「服务暂时不可用」——原始异常只进 console.warn，绝不拼进气泡。 */
export function useAiChat(): {
  messages: Ref<ChatMessage[]>
  thinking: Ref<boolean>
  conversationId: Ref<string | null>
  conversations: Ref<ConversationSummary[]>
  send: (q: string) => Promise<void>
  loadConversations: () => Promise<void>
  openConversation: (id: string) => Promise<void>
  removeConversation: (id: string) => Promise<void>
  newConversation: () => void
} {
  const api = useApi()
  const messages = ref<ChatMessage[]>([])
  const thinking = ref(false)
  /** 当前绑定的会话：null = 新对话（下一问由服务端新建）；
   * 兼作列表高亮键（打开哪个会话，右侧就在哪个会话里继续）。 */
  const conversationId = ref<string | null>(null)
  const conversations = ref<ConversationSummary[]>([])
  /** 对话视图代次：每次整体重置视图（新对话 / 回放历史 / 删除激活会话）自增。
   * 发送在途时「新对话」与「删除激活会话」不像 openConversation 那样有 thinking 守卫，
   * 是未设防的视图重置路径——发送时捕获代次快照，应答到达时比对，代次已变即整体丢弃：
   * 应答不得落进重置后的新视图，也不得把 conversationId 绑回旧会话。 */
  let viewEpoch = 0

  /** 会话列表（limit 取接口上限 50）：发送成功与删除后由调用链重拉，不做轮询。 */
  async function loadConversations(): Promise<void> {
    try {
      const r = await api.get<{ items: ConversationSummary[]; total: number }>(
        '/api/ai/conversations?limit=50',
      )
      conversations.value = Array.isArray(r.items) ? r.items : []
    } catch (e) {
      console.warn('[ai] 会话列表加载失败', e)
    }
  }

  /** 提问：fetch+SSE 流式消费（POST /api/ai/chat → text/event-stream，不走 api.post——要拿 res.body）。
   * 先推 assistant 占位消息，status/reasoning/answer/sources 各帧就地增量更新（思维链不落库，
   * 落库 content=已流出完整答案由服务端负责）；业务错误走 error 帧——已流出内容保留定格，
   * 另推现行样式错误气泡（照显 data.error，aiAvailable 只影响该文案）；流结束未收 done
   * （连接中断/坏流）以「服务暂时不可用」气泡兜底。
   * 每类事件先做 epoch 比对，视图已重置（新对话/删除激活会话）即 abort 并整体丢弃（含错误气泡）。 */
  async function send(q: string): Promise<void> {
    const text = q.trim()
    if (text.length < 2 || thinking.value) return
    messages.value.push({ role: 'user', text })
    thinking.value = true
    const epoch = viewEpoch
    messages.value.push({ role: 'assistant', text: '', phase: 'retrieving', sources: [], reasoning: '' })
    // 经 messages.value 取回响应式代理再原地改字段：直接改 push 进去的原始对象不触发渲染
    const msg = messages.value[messages.value.length - 1]
    /** 终态收尾占位消息：有流出内容（答案/思维链）则保留并清过程态，无则移除——
     * 无内容时维持现行「仅一条错误气泡」的观感，不留永久空气泡。 */
    const finalizePlaceholder = (): void => {
      if (msg.text || msg.reasoning) {
        msg.phase = undefined
      } else {
        const i = messages.value.indexOf(msg)
        if (i !== -1) messages.value.splice(i, 1)
      }
    }
    const pushErrorBubble = (t: string): void => {
      messages.value.push({ role: 'assistant', text: t, error: true })
    }
    controller = new AbortController()
    let reasoningStart: number | null = null
    let gotDone = false
    let gotError = false
    try {
      const res = await fetch(api.base + '/api/ai/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          ...(conversationId.value ? { conversationId: conversationId.value } : {}),
        }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw { status: res.status } // 401/404/500 开流前失败 → 走既有 catch 气泡路径
      await readSse(res.body.getReader(), (type, data) => {
        if (epoch !== viewEpoch) {
          controller?.abort()
          return
        }
        if (type === 'status') {
          const phase = data.phase
          if (phase === 'retrieving' || phase === 'thinking') msg.phase = phase
        } else if (type === 'reasoning') {
          if (reasoningStart === null) reasoningStart = Date.now()
          msg.reasoning = (msg.reasoning ?? '') + (typeof data.text === 'string' ? data.text : '')
          msg.phase = 'thinking'
        } else if (type === 'answer') {
          if (reasoningStart !== null && msg.thoughtSeconds === undefined) {
            msg.thoughtSeconds = Math.round((Date.now() - reasoningStart) / 1000)
          }
          msg.text += typeof data.text === 'string' ? data.text : ''
          msg.phase = 'answering'
        } else if (type === 'sources') {
          if (Array.isArray(data.sources)) msg.sources = data.sources as ChatSource[]
          const cid = data.conversationId
          if (typeof cid === 'string' && cid) conversationId.value = cid
        } else if (type === 'done') {
          gotDone = true
          msg.phase = undefined
          void loadConversations() // 服务端在 sources/done 前已落库，此时重拉可见新会话/新排序
        } else if (type === 'error') {
          gotError = true
          finalizePlaceholder()
          pushErrorBubble(typeof data.error === 'string' && data.error ? data.error : ERR_NETWORK)
        }
      })
      if (epoch !== viewEpoch) return
      if (!gotDone && !gotError) {
        // 流正常收束但没等到 done：连接中断/解析失败，兜底一条网络文案气泡（已流出内容保留）
        finalizePlaceholder()
        pushErrorBubble(ERR_NETWORK)
      }
    } catch (e: unknown) {
      if (epoch !== viewEpoch) {
        console.warn('[ai] 请求失败时对话视图已重置，丢弃本次错误提示')
        return
      }
      const status = (e as { status?: number } | null)?.status
      console.warn('[ai] 提问失败', status, e)
      if ((e as { name?: string } | null)?.name === 'AbortError') return // 主动中断（卸载/重置），不出气泡
      if (gotError) return // error 帧已收（占位收尾+错误气泡已做）：其后连接硬断不再追加第二条兜底气泡
      finalizePlaceholder()
      messages.value.push({
        role: 'assistant',
        text: status === 401 ? ERR_AUTH : ERR_NETWORK,
        error: true,
      })
    } finally {
      thinking.value = false
    }
  }

  /** 打开历史会话：详情消息与实时消息同构（role/content/sources → role/text/sources）；
   * 思考中不切换，避免在途应答串进别的会话视图。 */
  async function openConversation(id: string): Promise<void> {
    if (thinking.value) return
    try {
      const r = await api.get<ConversationDetail>('/api/ai/conversations/' + id)
      conversationId.value = r.id
      messages.value = (r.messages ?? []).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.content,
        sources: m.sources ?? [],
      }))
      viewEpoch++
    } catch (e) {
      console.warn('[ai] 会话详情加载失败', e)
    }
  }

  /** 删除会话（DELETE 走 useApi 之外的原生 fetch：useApi 暂无 delete 方法）；
   * 删的是当前会话时右侧一并清空回新对话态。 */
  async function removeConversation(id: string): Promise<void> {
    try {
      await $fetch(api.base + '/api/ai/conversations/' + id, { method: 'DELETE', credentials: 'include' })
      if (conversationId.value === id) newConversation()
      await loadConversations()
    } catch (e) {
      console.warn('[ai] 会话删除失败', e)
    }
  }

  /** 新对话：右侧清空并解绑会话，下一问由服务端新建会话（列表无需重拉）。
   * 发送在途时同样可用：abort 在途流 + 代次自增，使在途应答到达后被丢弃，不污染新视图。
   * removeConversation 删当前会话复用本函数，abort 一并覆盖。 */
  function newConversation(): void {
    controller?.abort()
    conversationId.value = null
    messages.value = []
    viewEpoch++
  }

  // 组件卸载：中断在途流式请求，避免流继续往已脱离视图的 refs 写增量
  onScopeDispose(() => {
    controller?.abort()
  })

  return {
    messages,
    thinking,
    conversationId,
    conversations,
    send,
    loadConversations,
    openConversation,
    removeConversation,
    newConversation,
  }
}
