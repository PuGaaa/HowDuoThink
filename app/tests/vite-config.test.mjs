/** vite.config 在 HBuilderX 场景（进程 cwd 不在项目根）下仍能读到 app/.env.*。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const ts = createRequire(import.meta.url)(
  process.env.THINK_REVIEW_TYPESCRIPT || path.join(repoRoot, 'web/node_modules/typescript'),
);

/** 与 learning-events.test.mjs 同思路：转译 TS 后在受控模块表里加载。 */
function loadConfig(stubs) {
  const source = fs.readFileSync(path.join(appRoot, 'vite.config.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'vite.config.ts',
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(specifier => {
    if (stubs[specifier]) return stubs[specifier];
    throw new Error(`unexpected import: ${specifier}`);
  }, module, module.exports);
  return module.exports.default ?? module.exports;
}

test('vite.config 以 UNI_INPUT_DIR 解析 .env，不依赖 process.cwd()', () => {
  const originalCwd = process.cwd();
  const originalInputDir = process.env.UNI_INPUT_DIR;
  const fakePluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hbx-cwd-'));
  const seenDirs = [];
  process.chdir(fakePluginDir); // 模拟 HBuilderX：cwd 在其插件目录
  process.env.UNI_INPUT_DIR = appRoot;
  try {
    const stubVite = {
      defineConfig: fn => fn,
      loadEnv: (_mode, dir) => {
        seenDirs.push(dir);
        return { APP_API_BASE: 'https://from-env-file.invalid' };
      },
    };
    const config = loadConfig({
      vite: stubVite,
      '@dcloudio/vite-plugin-uni': () => ({}),
    });
    const result = config({ mode: 'development' });
    assert.equal(seenDirs[0], appRoot, 'loadEnv 应从项目根（UNI_INPUT_DIR）读 .env');
    assert.equal(
      JSON.parse(result.define['process.env.APP_API_BASE']),
      'https://from-env-file.invalid',
      'APP_API_BASE 应取自 .env 文件而非空串',
    );
  } finally {
    process.chdir(originalCwd);
    if (originalInputDir === undefined) delete process.env.UNI_INPUT_DIR;
    else process.env.UNI_INPUT_DIR = originalInputDir;
    fs.rmSync(fakePluginDir, { recursive: true, force: true });
  }
});
