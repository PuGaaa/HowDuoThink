/** 真实 TypeScript 事件队列：手动控制网络回调顺序，不替换业务实现。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(process.env.THINK_REVIEW_ROOT || fileURLToPath(new URL('../..', import.meta.url)));
const ts = createRequire(import.meta.url)(process.env.THINK_REVIEW_TYPESCRIPT || path.join(root, 'web/node_modules/typescript'));
function harness() {
  const values = new Map(), requests = [], modules = new Map();
  const uni = {
    getStorageSync: key => values.get(key) ?? null,
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: key => values.delete(key),
    getStorageInfoSync: () => ({ keys: [...values.keys()] }),
    request: request => { requests.push(request); },
  };
  const context = vm.createContext({ uni, console, Date, Math, Set, Map, process: { env: { NODE_ENV: 'development' } } });
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} }; modules.set(file, module);
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: file,
    }).outputText;
    new vm.Script(`(function(require,module,exports){${compiled}\n})`, { filename: file }).runInContext(context)(specifier => {
      return load(path.resolve(path.dirname(file), specifier + '.ts'));
    }, module, module.exports);
    return module.exports;
  }
  const events = load(path.join(root, 'app/utils/learning-events.ts'));
  const auth = load(path.join(root, 'app/utils/auth.ts'));
  const respond = (r, statusCode = 204, data = {}) => { r.success?.({ statusCode, data }); r.complete?.({ statusCode }); };
  const reject = r => { r.fail?.({ errMsg: 'offline' }); r.complete?.({ errMsg: 'offline' }); };
  function login(uid) {
    auth.login(uid, 'synthetic-password', () => {});
    respond(requests.at(-1), 200, { ok: true, token: 'token-' + uid, userId: uid, login: uid, name: uid, avatar: '', role: 'user' });
  }
  function flushClaims() {
    for (const request of [...requests]) {
      if (!request.done && request.url.endsWith('/claim')) { request.done = true; respond(request); }
    }
  }
  return { values, requests, events, auth, respond, reject, login, flushClaims };
}
const sentEvents = h => h.requests.filter(r => r.data?.eventId);

test('游客最后一条离线事件可在未登录时重试，保持原 eventId', () => {
  const h = harness();
  h.events.trackLearningEvent('session_end', 's1', 'first-npe', 'play', 1, true);
  const first = sentEvents(h).at(-1); h.reject(first);
  h.events.flushLearningEvents();
  const retry = sentEvents(h).at(-1);
  assert.notEqual(retry, first);
  assert.equal(retry.data.eventId, first.data.eventId);
  assert.equal(retry.data.solved, true);
  h.respond(retry);
  assert.equal(h.events.learningEvents().length, 0);
});

test('登录认领失败保留队列，重试认领成功后再提交原事件', () => {
  const h = harness();
  h.events.trackLearningEvent('session_start', 's1', 'first-npe', 'play');
  h.reject(sentEvents(h).at(-1));
  const anonymousId = h.events.getLearningAnonymousId();
  h.login('A'); h.events.claimLearningEvents();
  h.reject(h.requests.at(-1));
  assert.equal(sentEvents(h).filter(r => r.header.Authorization).length, 0, '认领失败前不以账号发送游客事件');
  h.events.flushLearningEvents(); h.flushClaims();
  const sent = sentEvents(h).at(-1);
  assert.equal(sent.header.Authorization, 'Bearer token-A');
  assert.equal(sent.data.anonymousId, anonymousId);
  h.respond(sent);
  assert.equal(h.events.learningEvents().length, 0);
});

test('跨账号认领409后保留原队列，不用新账号token上传', () => {
  const h = harness(); h.login('A');
  h.events.trackLearningEvent('session_start', 'a-session', 'first-npe', 'play'); h.flushClaims();
  const old = sentEvents(h).at(-1), oldAnonymous = old.data.anonymousId;
  h.reject(old);
  h.auth.logout();
  h.values.set('think_learning_owner_v1_' + oldAnonymous, 'B');
  h.login('B'); h.events.flushLearningEvents();
  const conflict = h.requests.find(r => r.url.endsWith('/claim') && r.data.anonymousId === oldAnonymous);
  assert.ok(conflict);
  h.respond(conflict, 409);
  assert.equal(JSON.parse(h.values.get('think_learning_events_v1_' + oldAnonymous)).length, 1);
  assert.equal(sentEvents(h).some(r => r.header.Authorization === 'Bearer token-B' && r.data.anonymousId === oldAnonymous), false);
});

test('直接切账号轮换匿名身份，A事件不会随B token上传，A晚回调不删B', () => {
  const h = harness(); h.login('A');
  h.events.trackLearningEvent('session_start', 'a-session', 'first-npe', 'play'); h.flushClaims();
  const old = sentEvents(h).at(-1), oldAnonymous = old.data.anonymousId;
  h.login('B');
  h.events.trackLearningEvent('session_start', 'b-session', 'first-npe', 'play'); h.flushClaims();
  const current = sentEvents(h).at(-1);
  assert.notEqual(current.data.anonymousId, oldAnonymous);
  assert.equal(sentEvents(h).filter(r => r.header.Authorization === 'Bearer token-B' && r.data.sessionId === 'a-session').length, 0);
  h.respond(old);
  assert.equal(h.events.learningEvents().length, 1);
  h.respond(current);
  assert.equal(h.events.learningEvents().length, 0);
});

test('退出后的新游客事件归B，A待传事件在重回A后仍可原样重试', () => {
  const h = harness(); h.login('A');
  h.events.trackLearningEvent('session_start', 'a-session', 'first-npe', 'play'); h.flushClaims();
  const old = sentEvents(h).at(-1); h.reject(old);
  h.auth.logout();
  h.events.trackLearningEvent('session_start', 'guest-session', 'caused-by', 'play'); h.reject(sentEvents(h).at(-1));
  h.login('B'); h.events.flushLearningEvents(); h.flushClaims();
  assert.equal(sentEvents(h).filter(r => r.header.Authorization === 'Bearer token-B' && r.data.sessionId === 'a-session').length, 0);
  assert.ok(sentEvents(h).some(r => r.header.Authorization === 'Bearer token-B' && r.data.sessionId === 'guest-session'));
  h.auth.logout(); h.login('A'); h.events.flushLearningEvents(); h.flushClaims();
  assert.ok(sentEvents(h).filter(r => r.data.eventId === old.data.eventId).length >= 2);
});

test('测试模式不排队、不发请求；同局结束重试保持唯一eventId', () => {
  const h = harness(); h.events.setLearningTestMode(true);
  h.events.trackLearningEvent('session_end', 'preview', 'first-npe', 'play', 1, true);
  assert.equal(h.requests.length, 0);
  h.events.setLearningTestMode(false);
  h.events.trackLearningEvent('session_end', 'formal', 'first-npe', 'play', 1, false);
  const sent = sentEvents(h).at(-1);
  assert.equal(sent.data.solved, false);
  assert.equal(sent.data.eventId, 'event-session-end-formal');
});
