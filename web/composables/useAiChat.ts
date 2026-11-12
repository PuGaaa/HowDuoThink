import type { Ref } from 'vue'

/** AI 排错的出参引用（案例出处），chat 与会话历史消息共用同构。 */
export interface ChatSource {
  caseId: string
  title: string
}

/** 对话区一条消息：role/content 与会话历史接口的消息同构，
 * 实时消息与 openConversation 回放的历史都归一到本形态后渲染。 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  sources?: ChatSource[]
  error?: boolean
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

/** chat 线格式：成功带 answer/sources/conversationId；业务错误为 200 + error 字段。 */
interface ChatResponse {
  answer?: string
  sources?: ChatSource[] | null
  conversationId?: string | null
  error?: string
  aiAvailable?: boolean
}

const ERR_NETWORK = '服务暂时不可用，请稍后再试'
const ERR_AUTH = '请先登录后再提问'

/** AI 排错页的会话状态单文件编排：右侧对话（发问/多轮接续）与左侧会话列表。
 * 报错契约：业务错误照显 r.error；HTTP 401 → 登录引导文案；其余异常一律
 * 「服务暂时不可用」——原始异常只进 console.warn，绝不拼进气泡。 */
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

  /** 提问：body 带 conversationId 接前文；应答成功后重拉列表（新会话/排序更新）。
   * 在途期间视图被重置（新对话/删除激活会话）→ 应答整体丢弃（含错误气泡）。 */
  async function send(q: string): Promise<void> {
    const text = q.trim()
    if (text.length < 2 || thinking.value) return
    messages.value.push({ role: 'user', text })
    thinking.value = true
    const epoch = viewEpoch
    try {
      const r = (await api.post('/api/ai/chat', {
        question: text,
        ...(conversationId.value ? { conversationId: conversationId.value } : {}),
      })) as ChatResponse
      if (epoch !== viewEpoch) {
        console.warn('[ai] 应答到达时对话视图已重置，丢弃本次应答')
        return
      }
      if (r.answer) {
        if (typeof r.conversationId === 'string' && r.conversationId) {
          conversationId.value = r.conversationId
        }
        messages.value.push({ role: 'assistant', text: r.answer, sources: r.sources ?? [] })
        void loadConversations()
      } else {
        messages.value.push({ role: 'assistant', text: r.error ?? ERR_NETWORK, error: true })
      }
    } catch (e: unknown) {
      if (epoch !== viewEpoch) {
        console.warn('[ai] 请求失败时对话视图已重置，丢弃本次错误提示')
        return
      }
      const status = (e as { status?: number } | null)?.status
      console.warn('[ai] 提问失败', status, e)
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
   * 发送在途时同样可用：代次自增使在途应答到达后被丢弃，不污染新视图。 */
  function newConversation(): void {
    conversationId.value = null
    messages.value = []
    viewEpoch++
  }

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
