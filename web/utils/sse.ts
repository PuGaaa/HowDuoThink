// SSE 帧解析：消费 fetch 的字节流，按「event/data 文本事件流」逐帧回调。
// 服务端契约（server/features/ai/router.py）：帧 = `event: <type>\ndata: <json>\n\n`。
// 调用方先判 res.ok，非流式响应不会走到这里；本工具只管流内的事：
// 坏帧（JSON 解析失败/无 data）跳过不外抛，流结束（reader.done）即正常 resolve。

/** 解析单个 SSE 帧（不含结尾空行）：逐行取 event:/data: 字段（容忍 \r 行尾，
 * data 值去掉一个前导空格），多行 data 按规范以 \n 连接后 JSON.parse——
 * 解析失败整帧跳过，绝不外抛中断流。 */
function dispatchFrame(
  frame: string,
  onEvent: (type: string, data: Record<string, unknown>) => void,
): void {
  let type = 'message'
  const dataLines: string[] = []
  for (const raw of frame.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (!line || line.startsWith(':')) continue // 空行 / SSE 注释行
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const field = line.slice(0, colon)
    let value = line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') type = value
    else if (field === 'data') dataLines.push(value)
  }
  if (dataLines.length === 0) return
  try {
    const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>
    if (data && typeof data === 'object') onEvent(type, data)
  } catch {
    // 坏帧跳过：不中断流、不外抛
  }
}

/** 逐帧消费 SSE 字节流：reader.read() 到 done 即 resolve。
 * TextDecoder 开 stream 模式解多字节 UTF-8 跨块；缓冲按 \n\n 切帧，
 * 残帧留缓冲等下一块，流收束时不足一帧的残余按 SSE 语义（事件未完结）丢弃。 */
export async function readSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (type: string, data: Record<string, unknown>) => void,
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let sep = buffer.indexOf('\n\n')
    while (sep !== -1) {
      dispatchFrame(buffer.slice(0, sep), onEvent)
      buffer = buffer.slice(sep + 2)
      sep = buffer.indexOf('\n\n')
    }
  }
}
