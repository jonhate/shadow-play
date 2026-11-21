/**
 * 直接对真实的 app/gesture.js 做行为测试（MediaPipe 用 tests/stubs 里的假实现替换）。
 *
 *   node --test tests/
 *
 * 这里验的是「缓存」这件事本身：
 *  - 第一次彻底失败（GPU+CPU 都建不起来）之后，第二次 loadModel() 必须真的重新来一遍；
 *  - 并发调用只下一份模型字节、只建一个 recognizer；
 *  - cancelModelLoad() 要真的 abort 掉底层请求，下一份加载是新请求，
 *    而不是接着等那份悬挂的（否则就是「假切源」）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// 必须在 import app/gesture.js 之前注册钩子
register(new URL('./stub-hooks.mjs', import.meta.url));
const { GestureInput } = await import('../app/gesture.js');

const MP = { modelPath: './models/gesture_recognizer.task', wasmPath: './vendor/mediapipe/wasm' };
const okResponse = () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) });
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.__mpStub = undefined;
});

test('模型第一次彻底失败后，第二次 loadModel() 必须真的重新加载', async () => {
  const fetches = [];
  globalThis.fetch = async (url) => {
    fetches.push(url);
    return okResponse();
  };
  globalThis.__mpStub = { filesets: [], creates: [], createError: new Error('GPU/CPU 都建不起来') };

  const g = new GestureInput({}, { numHands: 2 });
  await assert.rejects(g.loadModel(MP), /都建不起来/);
  assert.equal(g.ready, false, '失败了就不能算就绪');
  assert.equal(g.loadSlot.done, false, '失败的结果不允许留在缓存里');
  assert.equal(globalThis.__mpStub.creates.length, 2, '一次尝试会先试 GPU 再试 CPU');

  // 底层恢复（例如用户换了浏览器/显卡驱动好了/点了重试）
  globalThis.__mpStub.createError = null;
  await g.loadModel(MP);
  assert.equal(g.ready, true);
  assert.equal(g.delegate, 'GPU');
  assert.equal(globalThis.__mpStub.creates.length, 3, '第二次必须是真的一次新尝试');
  assert.equal(fetches.length, 2, '第二次必须真的重新取模型字节');
});

test('并发 loadModel 只下一份模型、只建一个 recognizer', async () => {
  const fetches = [];
  globalThis.fetch = async (url) => {
    fetches.push(url);
    await tick(5);
    return okResponse();
  };
  globalThis.__mpStub = { filesets: [], creates: [], createError: null };

  const g = new GestureInput({}, { numHands: 2 });
  const [a, b] = await Promise.all([g.loadModel(MP), g.loadModel(MP)]);
  assert.equal(a, g);
  assert.equal(b, g);
  assert.equal(fetches.length, 1, '同时点两次屏幕不该把 8.4MB 下两遍');
  assert.equal(globalThis.__mpStub.creates.length, 1);
  assert.equal(globalThis.__mpStub.filesets.length, 1, 'wasm 文件集也只初始化一次');

  await g.loadModel(MP); // 已经就绪，再点不该重新下
  assert.equal(fetches.length, 1);
});

test('GPU 建不起来时退回 CPU（原有行为不能丢）', async () => {
  globalThis.fetch = async () => okResponse();
  globalThis.__mpStub = { filesets: [], creates: [], createError: null, failDelegates: new Set(['GPU']) };
  const g = new GestureInput({}, { numHands: 2 });
  await g.loadModel(MP);
  assert.equal(g.ready, true);
  assert.equal(g.delegate, 'CPU');
  assert.deepEqual(
    globalThis.__mpStub.creates.map((c) => c.delegate),
    ['GPU', 'CPU'],
  );
});

test('cancelModelLoad 之后下一份加载是真的新请求，而不是等同一份悬挂 Promise', async () => {
  const calls = [];
  globalThis.fetch = (url, opts = {}) => {
    const rec = { url, aborted: false };
    calls.push(rec);
    if (calls.length === 1) {
      // 模拟 CDN 挂起：永不返回，除非被 abort
      return new Promise((_, reject) => {
        opts.signal?.addEventListener('abort', () => {
          rec.aborted = true;
          const e = new Error('The operation was aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    }
    return Promise.resolve(okResponse());
  };
  globalThis.__mpStub = { filesets: [], creates: [], createError: null };

  const g = new GestureInput({}, { numHands: 2 });
  const first = g.loadModel(MP);
  await tick(20); // 让它跑到 await modelBytes
  g.cancelModelLoad();
  await assert.rejects(first, (e) => e.name === 'AbortError' || e.name === 'SupersededError');
  assert.equal(calls[0].aborted, true, '底层请求必须被真的 abort 掉');

  await g.loadModel(MP);
  assert.equal(calls.length, 2, '兜底/重试必须真的再发一次请求');
  assert.equal(g.ready, true);
  assert.equal(globalThis.__mpStub.creates.length, 1);
});

test('取消正在进行的加载，不会把已就绪的模型打回未就绪', async () => {
  globalThis.fetch = async () => okResponse();
  globalThis.__mpStub = { filesets: [], creates: [], createError: null };
  const g = new GestureInput({}, { numHands: 2 });
  await g.loadModel(MP);
  assert.equal(g.ready, true);
  g.cancelModelLoad(); // 已就绪时是空操作
  assert.equal(g.ready, true);
  assert.equal(g.loadSlot.done, true);
});
