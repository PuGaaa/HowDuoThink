/**
 * 真实客户端进度契约回归；仅 uni 的存储、网络和计时器使用内存环境。
 * 在仓库根目录运行：node --test app/tests/progress-client.test.mjs
 * THINK_REVIEW_ROOT 指定待验源码，THINK_REVIEW_REF 可固定 Git 提交。
 * 独立工作区没有依赖时，用 THINK_REVIEW_TYPESCRIPT 指定已安装的 TypeScript。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(process.env.THINK_REVIEW_ROOT || fileURLToPath(new URL('../..', import.meta.url)));
const ref = process.env.THINK_REVIEW_REF || '';
const require = createRequire(import.meta.url);
const ts = require(process.env.THINK_REVIEW_TYPESCRIPT || path.join(root, 'web/node_modules/typescript'));
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function source(file) {
  if (ref) {
    return execFileSync('git', ['-C', root, 'show', `${ref}:${path.relative(root, file).split(path.sep).join('/')}`], { encoding: 'utf8' });
  }
  return fs.readFileSync(file, 'utf8');
}

function harness() {
  const values = new Map();
  const requests = [];
  const timers = new Map();
  const modules = new Map();
  let timerId = 0;
  let serial = 0;
  const uni = {
    getStorageSync: key => values.get(key) ?? null,
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: key => values.delete(key),
    getStorageInfoSync: () => ({ keys: [...values.keys()] }),
    request: request => {
      const entry = { ...request, data: clone(request.data), taken: false, finished: false };
      requests.push(entry);
      return { abort: () => { entry.aborted = true; } };
    },
    showToast: () => {},
  };
  const context = vm.createContext({
    uni, console, Date, Math, Set, Map, URL,
    process: { env: { NODE_ENV: 'development', APP_API_BASE: 'https://api.test.invalid' } },
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearInterval: id => timers.delete(id),
  });
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const compiled = ts.transpileModule(source(file), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: file,
    }).outputText;
    const wrapper = new vm.Script(`(function(require,module,exports){\n${compiled}\n})`, { filename: file }).runInContext(context);
    wrapper(specifier => {
      if (!specifier.startsWith('.')) throw new Error(`测试未隔离的外部依赖：${specifier}`);
      const target = path.resolve(path.dirname(file), specifier);
      if (path.extname(target)) return load(target);
      if (fs.existsSync(`${target}.ts`)) return load(`${target}.ts`);
      return load(path.join(target, 'index.ts'));
    }, module, module.exports);
    return module.exports;
  }
  const storage = load(path.join(root, 'app/utils/storage.ts'));
  const auth = load(path.join(root, 'app/utils/auth.ts'));
  const sync = load(path.join(root, 'app/utils/sync-progress.ts'));
  function take(suffix, method) {
    const request = requests.find(item => !item.taken && item.url.endsWith(suffix) && (!method || item.method === method));
    if (!request) throw new Error(`没有待处理请求：${method || '*'} ${suffix}`);
    request.taken = true;
    return request;
  }
  function respond(request, data, statusCode = 200) {
    request.finished = true;
    request.success?.({ statusCode, data: clone(data), header: {} });
    request.complete?.({ statusCode });
  }
  function reject(request) {
    request.finished = true;
    request.fail?.({ errMsg: 'request:fail simulated' });
    request.complete?.({ errMsg: 'request:fail simulated' });
  }
  function login(uid) {
    let result;
    auth.login(`review-${uid}`, 'review-password', value => { result = value; });
    respond(take('/api/auth/login', 'POST'), {
      ok: true, token: `review-token-${uid}-${++serial}`, userId: uid,
      login: `review-${uid}`, name: uid, avatar: '', role: 'user',
    });
    if (result.error) throw new Error(result.error);
    sync.prepareProgressIdentity(uid);
  }
  function record(caseId = 'first-npe', solved = true, cost = 4) {
    return {
      sessionId: `review-session-${++serial}`, caseId, chapterId: 'error-reading',
      contentRevision: 1, scoringVersion: 1, occurredAt: new Date().toISOString(),
      solved, playerCost: cost, expertCost: 4, wrongIdentifies: solved ? 0 : 2,
      grade: solved ? 'S' : 'F', events: [], mascotEvents: [{ id: 'frog', emoji: '', line: '', afterEventIndex: 0 }], hStates: [],
    };
  }
  function projection(extra = {}) {
    return { schemaVersion: 2, cases: {}, mascots: {}, streak: {last: '', count: 0}, tasks: {day: '', week: '', daily: {}, weekly: {}, dailyHistory: {}, weeklyHistory: {}}, dailyDone: '', checkuse: 0, unlockedChapterIds: [], legacyBaseline: null, legacyArchives: {}, revision: 1, updatedAt: '', ...extra };
  }
  function push() {
    sync.pushProgress(() => {});
    return take('/api/me/progress/sync', 'POST');
  }
  function acknowledge(request, extra = {}) {
    respond(request, projection({ confirmedOperationIds: request.data.operations.map(op => op.opId), ...extra }));
  }
  function flushTimers() {
    const batch = [...timers.values()];
    timers.clear();
    for (const callback of batch) callback();
  }
  return { values, requests, storage, auth, sync, take, respond, reject, login, record, projection, push, acknowledge, flushTimers };
}

const sessionOps = (request, caseId) => request.data.operations.filter(op => op.kind === 'session_end' && op.payload.caseId === caseId);
const imports = request => request.data.operations.filter(op => op.kind === 'bootstrap');
const score = cost => ({ solved: true, bestGrade: 'S', bestCost: cost, plays: 1, fails: 0, contentRevision: 1, scoringVersion: 1, scores: { '1:1': { contentRevision: 1, scoringVersion: 1, bestGrade: 'S', bestCost: cost } } });

test('新游客结算事实保留原opId、sessionId与发生时间，不降为历史快照', () => {
  const h = harness();
  const record = h.record();
  h.storage.saveSession(record);
  const before = clone(h.storage.pendingProgressOperations().find(op => op.kind === 'session_end'));
  assert.equal(before.payload.sessionId, record.sessionId, '存储层先保留真实对局身份');
  h.login('A');
  const sent = sessionOps(h.push(), record.caseId);
  assert.equal(sent.length, 1, 'v2历史导入不结算新对局，必须另提交且只提交一个session_end');
  assert.equal(sent[0].opId, before.opId, '身份归入不能重新生成事实opId');
  assert.equal(sent[0].payload.sessionId, record.sessionId);
  assert.equal(sent[0].occurredAt, record.occurredAt);
});

test('A退出后新游客成果归入B，A的待传事实不泄入B', () => {
  const h = harness();
  h.login('A');
  h.acknowledge(h.push());
  h.storage.saveSession(h.record('first-npe'));
  h.auth.logout();
  const guest = h.record('caused-by');
  h.storage.saveSession(guest);
  const original = clone(h.storage.pendingProgressOperations().find(op => op.kind === 'session_end'));
  h.login('B');
  const request = h.push();
  assert.equal(sessionOps(request, 'first-npe').length, 0);
  assert.equal(sessionOps(request, 'caused-by').length, 1, '新游客局不能仅变成bootstrap');
  assert.equal(sessionOps(request, 'caused-by')[0].opId, original.opId);
  assert.equal(sessionOps(request, 'caused-by')[0].payload.sessionId, guest.sessionId);
});

test('重新登录A不会覆盖退出前未确认的操作队列', () => {
  const h = harness();
  h.login('A');
  h.acknowledge(h.push());
  h.storage.saveSession(h.record('first-npe'));
  const original = clone(h.storage.pendingProgressOperations().find(op => op.kind === 'session_end'));
  h.auth.logout();
  h.storage.saveSession(h.record('caused-by'));
  h.login('B');
  h.auth.logout();
  h.login('A');
  const sent = sessionOps(h.push(), 'first-npe');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].opId, original.opId, 'A的原事实必须以原ID继续上传');
});

test('A的晚到GET不写B空间或继续A页面回调', () => {
  const h = harness();
  h.login('A');
  let called = false;
  h.sync.pullServerProgress(() => { called = true; });
  const old = h.take('/api/me/progress', 'GET');
  h.auth.logout();
  h.login('B');
  h.respond(old, h.projection({ cases: { 'private-A-case': score(9) } }));
  assert.equal(h.storage.getCaseProgress('private-A-case'), null);
  assert.equal(called, false);
});

test('A的晚到POST不确认B的操作或标记B已同步', () => {
  const h = harness();
  h.login('A');
  h.storage.saveSession(h.record('first-npe'));
  const old = h.push();
  h.auth.logout();
  h.login('B');
  h.storage.saveSession(h.record('caused-by'));
  const ids = h.storage.pendingProgressOperations().map(op => op.opId).sort();
  const label = h.sync.lastSyncLabel();
  h.acknowledge(old);
  assert.deepEqual(h.storage.pendingProgressOperations().map(op => op.opId).sort(), ids);
  assert.equal(h.sync.lastSyncLabel(), label);
});

test('上传旧批次期间产生的新对局保留，之后可按原ID提交', () => {
  const h = harness();
  h.login('A');
  h.acknowledge(h.push());
  h.storage.saveSession(h.record('first-npe'));
  const old = h.push();
  const oldIds = new Set(old.data.operations.map(op => op.opId));
  h.storage.saveSession(h.record('caused-by'));
  const added = h.storage.pendingProgressOperations().filter(op => !oldIds.has(op.opId));
  const newSession = clone(added.find(op => op.kind === 'session_end'));
  h.acknowledge(old, { cases: { 'first-npe': score(4) } });
  assert.deepEqual(h.storage.pendingProgressOperations().map(op => op.opId).sort(), added.map(op => op.opId).sort());
  assert.equal(h.storage.getCaseProgress('caused-by').solved, true);
  assert.equal(sessionOps(h.push(), 'caused-by')[0].opId, newSession.opId);
});

function historicalImport() {
  const h = harness();
  const legacy = { solved: true, bestGrade: 'S', bestCost: 4, plays: 1, fails: 0 };
  h.values.set('think_case_first-npe', JSON.stringify(legacy));
  h.login('A');
  const request = h.push();
  const archive = imports(request).find(op => op.payload.bundle.cases['first-npe']?.solved);
  assert.ok(archive, '旧成绩以显式历史档案上传，不能伪造新session_end');
  const projection = {
    cases: { 'first-npe': { solved: true, bestGrade: '', bestCost: null, plays: 0, fails: 0, contentRevision: null, scoringVersion: null, scores: {} } },
    legacyArchives: { [archive.payload.archiveId]: clone(archive.payload.bundle) },
  };
  return { h, request, archive, projection };
}

test('同一次历史导入重试保留opId和archiveId', () => {
  const { h, request } = historicalImport();
  const retry = h.push();
  assert.deepEqual(clone(imports(retry)), clone(imports(request)));
});

test('已确认历史档案再次登录A不生成新的导入身份', () => {
  const { h, request, archive, projection } = historicalImport();
  h.acknowledge(request, projection);
  h.auth.logout();
  h.login('A');
  const again = imports(h.push()).filter(op => op.payload.bundle.cases['first-npe']?.solved);
  // 重发同ID仍可由服务端去重；不允许把同一历史材料包装成新的archive。
  for (const op of again) {
    assert.equal(op.payload.archiveId, archive.payload.archiveId);
    assert.equal(op.opId, archive.opId);
  }
});

test('已认领给A的历史材料不能重新归给B', () => {
  const { h, request, projection } = historicalImport();
  h.acknowledge(request, projection);
  h.auth.logout();
  h.login('B');
  const again = imports(h.push()).filter(op => op.payload.bundle.cases['first-npe']?.solved);
  assert.equal(again.length, 0, '不能给相同历史材料换archiveId后归属B');
});

test('低成本失败不降低最佳成功成本', () => {
  const h = harness();
  h.storage.saveSession(h.record('first-npe', true, 4));
  h.storage.saveSession(h.record('first-npe', false, 1));
  assert.equal(h.storage.getCaseProgress('first-npe').bestCost, 4);
});

test('同版本远端更高成本不覆盖本地最佳成功成本', () => {
  const h = harness();
  h.login('A');
  h.acknowledge(h.push());
  h.storage.saveSession(h.record('first-npe', true, 4));
  h.sync.pullServerProgress(() => {});
  h.respond(h.take('/api/me/progress', 'GET'), h.projection({ cases: { 'first-npe': score(15) } }));
  assert.equal(h.storage.getCaseProgress('first-npe').bestCost, 4);
});

test('成功成本0不被后续高成本成功局替换', () => {
  const h = harness();
  h.storage.saveSession(h.record('first-npe', true, 0));
  h.storage.saveSession(h.record('first-npe', true, 4));
  assert.equal(h.storage.getCaseProgress('first-npe').bestCost, 0);
});

test('同版本远端较高成本不能覆盖本地有效0成本', () => {
  const h = harness();
  h.login('A');
  h.acknowledge(h.push());
  h.storage.saveSession(h.record('first-npe', true, 0));
  h.sync.pullServerProgress(() => {});
  h.respond(h.take('/api/me/progress', 'GET'), h.projection({ cases: { 'first-npe': score(4) } }));
  assert.equal(h.storage.getCaseProgress('first-npe').bestCost, 0);
});
