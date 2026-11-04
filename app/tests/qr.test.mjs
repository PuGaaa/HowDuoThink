import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

const root = resolve(new URL('../..', import.meta.url).pathname)
const require = createRequire(import.meta.url)
const ts = require(process.env.THINK_REVIEW_TYPESCRIPT || resolve(root, 'web/node_modules/typescript'))
const appRequire = createRequire(resolve(root, 'app/package.json'))
const sourcePath = resolve(root, 'app/utils/qr.ts')
const compiled = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  fileName: sourcePath,
}).outputText
const qrModule = { exports: {} }
new vm.Script(`(function(require,module,exports){${compiled}\n})`, { filename: sourcePath })
  .runInThisContext()(appRequire, qrModule, qrModule.exports)

test('海报二维码指向可玩首关并保留 poster 来源', () => {
  const url = qrModule.exports.createPosterShareUrl('http://127.0.0.1:5173/')
  assert.equal(url, 'http://127.0.0.1:5173/pages/play/play?id=first-npe&source=poster')

  const dataUrl = qrModule.exports.createQrDataUrl(url)
  assert.match(dataUrl, /^data:image\/gif;base64,/)
  const gif = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
  assert.equal(gif.toString('ascii', 0, 6), 'GIF87a')
  assert.ok(gif.readUInt16LE(6) >= 100)
  assert.equal(gif.readUInt16LE(6), gif.readUInt16LE(8))
})
