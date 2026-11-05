/** uploadBatch 批量上传编排：逐文件独立结算、互不阻断、汇总成败。 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const adminRoot = fileURLToPath(new URL('..', import.meta.url));
const ts = createRequire(import.meta.url)('typescript');

/** 与 app/tests/vite-config.test.mjs 同思路：转译 TS 后在受控模块表里加载。 */
function loadBatchModule() {
  const source = fs.readFileSync(
    path.join(adminRoot, 'src/features/assets/upload-batch.ts'),
    'utf8',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'upload-batch.ts',
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(specifier => {
    throw new Error(`unexpected import: ${specifier}`);
  }, module, module.exports);
  return module.exports;
}

function fakeFile(name) {
  return { name };
}

test('多文件全部成功：逐个回调成功并汇总计数', async () => {
  const { uploadBatch } = loadBatchModule();
  const settled = [];
  const uploaded = [];
  const upload = async file => {
    uploaded.push(file.name);
    return { id: uploaded.length, filename: file.name };
  };

  const result = await uploadBatch(
    [fakeFile('a.png'), fakeFile('b.jpg')],
    'avatar',
    upload,
    (name, ok, error) => settled.push({ name, ok, error }),
  );

  assert.deepEqual(result, {
    succeeded: [{ filename: 'a.png' }, { filename: 'b.jpg' }],
    failed: [],
  });
  assert.deepEqual(uploaded, ['a.png', 'b.jpg']);
  assert.deepEqual(settled, [
    { name: 'a.png', ok: true, error: undefined },
    { name: 'b.jpg', ok: true, error: undefined },
  ]);
});

test('部分失败：失败的带原因且不阻断其他文件', async () => {
  const { uploadBatch } = loadBatchModule();
  const attempted = [];
  const upload = async file => {
    attempted.push(file.name);
    if (file.name === 'bad.png') throw new Error('文件超过上限 10MB');
    return { id: 1, filename: file.name };
  };

  const result = await uploadBatch(
    [fakeFile('good.png'), fakeFile('bad.png'), fakeFile('last.webp')],
    'misc',
    upload,
  );

  assert.deepEqual(attempted, ['good.png', 'bad.png', 'last.webp']);
  assert.deepEqual(result.succeeded, [{ filename: 'good.png' }, { filename: 'last.webp' }]);
  assert.deepEqual(result.failed, [{ filename: 'bad.png', error: '文件超过上限 10MB' }]);
});

test('空文件列表：直接返回零计数，不触发任何回调', async () => {
  const { uploadBatch } = loadBatchModule();
  const settled = [];
  const result = await uploadBatch([], 'misc', async () => {
    throw new Error('不应被调用');
  }, (...args) => settled.push(args));

  assert.deepEqual(result, { succeeded: [], failed: [] });
  assert.equal(settled.length, 0);
});

test('同一轮选择连发的 change 事件合并为一次批量上传', async () => {
  const { createUploadQueue } = loadBatchModule();
  const runs = [];
  const queue = createUploadQueue(files => {
    runs.push(files.map(f => f.name));
    return Promise.resolve();
  });
  const tick = () => new Promise(resolve => setTimeout(resolve, 20));

  // 模拟 naive-ui 真实时序：逐文件触发 @change，每次间隔微任务边界
  // （Vue 调度器刷新），宏任务合并窗口必须吞下这些间隔
  queue.add([fakeFile('a.png')]);
  await Promise.resolve();
  queue.add([fakeFile('b.jpg')]);
  await Promise.resolve();
  queue.add([fakeFile('c.webp')]);
  assert.equal(runs.length, 0, '合并窗口内不得提前触发');
  await tick();
  assert.deepEqual(runs, [['a.png', 'b.jpg', 'c.webp']]);

  // 真正的下一轮选择（真实场景相隔数秒）独立成批
  queue.add([fakeFile('d.png')]);
  await tick();
  assert.deepEqual(runs, [['a.png', 'b.jpg', 'c.webp'], ['d.png']]);
});

test('合并后的批次执行抛错不阻断后续轮次', async () => {
  const { createUploadQueue } = loadBatchModule();
  let calls = 0;
  const queue = createUploadQueue(async () => {
    calls += 1;
    if (calls === 1) throw new Error('第一批失败');
  });
  const tick = () => new Promise(resolve => setTimeout(resolve, 20));

  queue.add([fakeFile('a.png')]);
  await tick();
  queue.add([fakeFile('b.png')]);
  await tick();
  assert.equal(calls, 2);
});
