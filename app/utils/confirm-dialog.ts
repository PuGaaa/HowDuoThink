/**
 * 全站确认弹窗（uni-app x dialogPage 版）。
 * dialogPage 是背景透明的原生弹窗页面，层级覆盖导航栏与 tabBar（HBuilderX 4.31+），
 * 替代旧 confirm-dialog 组件在 tabBar 页上"遮罩盖不住原生 tabBar"的层级缺陷。
 * 传参：storage 一次性 payload（JSON 字符串）；回传：uni.$emit 字符串事件。
 */
export interface ConfirmDialogOptions {
  title: string
  message: string
  confirmText: string
  cancelText: string
  /** 危险操作：确定键变红 */
  danger: boolean
}

export type ConfirmCallback = (confirm: boolean) => void

export const CONFIRM_DIALOG_EVENT = 'confirm-dialog-result'
export const CONFIRM_DIALOG_PAYLOAD_KEY = 'think_confirm_dialog_payload'

let pendingCallback: ConfirmCallback | null = null
let inited = false

function initListener() {
  if (inited) {
    return
  }
  inited = true
  uni.$on(CONFIRM_DIALOG_EVENT, (data: any) => {
    const cb = pendingCallback
    pendingCallback = null
    if (cb != null) {
      cb((data as string) == 'true')
    }
  })
}

/**
 * 打开全站确认弹窗。callback 在用户点击任一按钮后回调一次：
 * confirm=true 点了主按钮，false 点了取消或遮罩。
 */
export function openConfirmDialog(options: ConfirmDialogOptions, callback: ConfirmCallback) {
  initListener()
  pendingCallback = callback
  uni.setStorageSync(CONFIRM_DIALOG_PAYLOAD_KEY, JSON.stringify(options))
  uni.openDialogPage({
    url: '/pages/dialog/confirm',
    animationType: 'fade-in',
    animationDuration: 120,
  })
}
