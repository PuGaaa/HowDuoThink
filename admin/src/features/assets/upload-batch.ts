// 素材批量上传编排：逐文件独立结算（成功/失败互不阻断），全部结束后返回汇总。
// 只依赖 file.name，便于在无 DOM 的 node:test（admin/tests/）里直接验证。
import type { AssetItem } from '../../api/assets'

export interface BatchResult {
  succeeded: { filename: string }[]
  failed: { filename: string; error: string }[]
}

type UploadFn = (file: File, category: string) => Promise<AssetItem>

type Outcome =
  | { ok: true; item: AssetItem }
  | { ok: false; filename: string; error: string }

export async function uploadBatch(
  files: File[],
  category: string,
  upload: UploadFn,
  onSettled?: (filename: string, ok: boolean, error?: string) => void,
): Promise<BatchResult> {
  const outcomes: Outcome[] = await Promise.all(
    files.map(async file => {
      try {
        const item = await upload(file, category)
        onSettled?.(file.name, true)
        return { ok: true, item }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        onSettled?.(file.name, false, error)
        return { ok: false, filename: file.name, error }
      }
    }),
  )
  const succeeded: { filename: string }[] = []
  const failed: { filename: string; error: string }[] = []
  for (const o of outcomes) {
    if (o.ok) succeeded.push({ filename: o.item.filename })
    else failed.push({ filename: o.filename, error: o.error })
  }
  return { succeeded, failed }
}

// NUpload 多选时对每个文件各触发一次 @change，同一轮选择会被拆成多批。
// createUploadQueue 用宏任务窗口合并连发的文件：naive-ui 的逐文件事件之间隔着
// 微任务边界（Vue 调度器刷新），queueMicrotask 的窗口会提前 flush 拆批，
// 必须等一个 setTimeout 才能吞下整轮选择，汇总提示才完整。
export function createUploadQueue(run: (files: File[]) => Promise<unknown>) {
  let pending: File[] = []
  let scheduled = false
  return {
    add(files: File[]) {
      pending.push(...files)
      if (scheduled) return
      scheduled = true
      setTimeout(() => {
        scheduled = false
        const batch = pending
        pending = []
        if (batch.length > 0) void run(batch).catch(() => {})
      }, 0)
    },
  }
}
