/** 游客留存门禁的统一登录引导：章页锁定关 / 首页锁定章 / play 直入共用一个弹窗文案与跳转。 */
import { CHAPTERS, TRIAL_CASE_IDS } from '../data/chapters'
import { ConfirmDialogOptions, openConfirmDialog } from './confirm-dialog'

/** 弹出"登录解锁"引导，确认后进登录页。仅在游客态调用。 */
export function openGuestLoginDialog(targetCaseId: string = '') {
  const freeCh = CHAPTERS.find((x) => x.id === 'error-reading')
  const opt = {
    title: '登录后继续闯关',
    message: '游客可试玩「' + (freeCh != null ? freeCh.name : '第一章') + '」的 ' + TRIAL_CASE_IDS.length + ' 关，登录后可保存进度并继续解锁章节。',
    confirmText: '去登录',
    cancelText: '先逛逛',
    danger: false,
  } as ConfirmDialogOptions
  openConfirmDialog(opt, (confirm: boolean) => {
    if (confirm) {
      uni.navigateTo({ url: targetCaseId.length > 0 ? '/pages/login/login?returnCaseId=' + targetCaseId : '/pages/login/login' })
    }
  })
}
