import type { Ref } from 'vue'

/** 登录弹窗开关的全局单例：app.vue 据 visible 渲染登录弹窗；
 * 后续拆出的登录弹窗组件与其它页面（如投稿）也走同一入口。 */
export function useLoginPrompt(): { visible: Ref<boolean>; open: () => void; close: () => void } {
  const visible = useState<boolean>('login-prompt-visible', () => false)

  function open(): void {
    visible.value = true
  }

  function close(): void {
    visible.value = false
  }

  return { visible, open, close }
}
