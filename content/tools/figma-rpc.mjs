#!/usr/bin/env node
/**
 * Figma 桥控制台（本仓库专属实例，避免与本会话启动早于插件安装而拿不到的官方 MCP 工具冲突）
 *
 *   node figma-rpc.mjs serve        # 持久运行：官方 server.mjs(WS 桥 :3056) + HTTP 控制(:3057)
 *   curl localhost:3057/status      # 桥与插件连接状态
 *   curl -XPOST localhost:3057/call -H 'Content-Type: application/json' \
 *        -d '{"name":"execute_figma_code","arguments":{"code":"..."}}'
 *   curl "localhost:3057/image?node_id=1:2&scale=2" -o out.png
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, 'figma-bridge-server.mjs');
const BRIDGE_PORT = 3056;
const HTTP_PORT = 3057;

const child = spawn(process.execPath, [SERVER], {
  env: { ...process.env, FIGMA_BRIDGE_PORT: String(BRIDGE_PORT) },
  stdio: ['pipe', 'pipe', 'inherit'],
});
child.on('exit', (code) => {
  console.error(`[figma-rpc] 桥进程退出(${code})，控制台随之关闭`);
  process.exit(code ?? 0);
});

let buf = '';
const pending = new Map();
child.stdout.setEncoding('utf8');
child.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        p(msg);
      }
    } catch {
      /* 忽略无法解析的行 */
    }
  }
});

function rpc(method, params, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP 调用超时(${timeoutMs}ms): ${method}`));
    }, timeoutMs);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

const callTool = (name, args) => rpc('tools/call', { name, arguments: args || {} });

function contentOf(result) {
  const c = result && result.content;
  if (!c) return { text: null, image: null, isError: true };
  const t = c.find((x) => x.type === 'text');
  const img = c.find((x) => x.type === 'image');
  return {
    text: t ? t.text : null,
    image: img ? { data: img.data, mimeType: img.mimeType } : null,
    isError: !!(result && result.isError),
  };
}

const http = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  try {
    if (u.pathname === '/status') {
      const r = await callTool('bridge_status', {});
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(contentOf(r).text);
      return;
    }
    if (u.pathname === '/call' && req.method === 'POST') {
      let body = '';
      for await (const ch of req) body += ch;
      const { name, arguments: args } = JSON.parse(body || '{}');
      const r = await callTool(name, args);
      const c = contentOf(r);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(c));
      return;
    }
    if (u.pathname === '/image') {
      const node_id = u.searchParams.get('node_id');
      const scale = Number(u.searchParams.get('scale') || 1);
      const r = await callTool('export_node_image', { node_id, scale });
      const c = contentOf(r);
      if (!c.image) throw new Error(c.text || '插件未返回图像');
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(Buffer.from(c.image.data, 'base64'));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
});

http.listen(HTTP_PORT, () => {
  console.log(`[figma-rpc] 桥 ws://localhost:${BRIDGE_PORT} · 控制 http://localhost:${HTTP_PORT}`);
});
