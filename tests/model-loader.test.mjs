/**
 * 手势模型加载闸门的回归用例（node 内置测试，无需装任何依赖）：
 *
 *   node --test tests/
 *
 * 覆盖四个真实踩过的坑：
 *  1. 失败被缓存 —— GPU/CPU 都失败后，下一次重试还复用那次失败；
 *  2. 并发重复下载 —— 连点两次屏幕就把 22MB 下两遍；
 *  3. 主源（CDN）挂了没有兜底，或兜底等到的是同一份悬挂 Promise（假切源）；
 *  4. 超时只让「等的人」放弃，底层还在挂着 —— 重试等于没重试。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoadSlot, createModelLoader, withTimeout, SupersededError } from '../app/model-loader.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

test('并发调用只加载一次：同时点两次屏幕不会把模型下两遍', async () => {
  let calls = 0;
  const d = deferred();
  const gate = createModelLoader({
    load: () => {
      calls += 1;
      return d.promise;
    },
  });
  const p1 = gate.ensure();
  const p2 = gate.ensure();
  await tick(); // 槽是异步启动的：让 load() 真的跑起来再断言只跑了一次
  assert.equal(calls, 1);
  assert.equal(gate.status, 'loading');
  d.resolve('model');
  assert.equal(await p1, 'model');
  assert.equal(await p2, 'model');
  assert.equal(gate.status, 'ready');
  // 就绪之后再点，也不该重新下载
  assert.equal(await gate.ensure(), 'model');
  assert.equal(calls, 1);
});

test('首次失败、第二次重试成功：失败绝不允许进缓存', async () => {
  let calls = 0;
  const gate = createModelLoader({
    load: async () => {
      calls += 1;
      if (calls === 1) throw new Error('第一次就失败');
      return 'model';
    },
    hasFallback: () => false,
  });
  await assert.rejects(gate.ensure(), /第一次就失败/);
  assert.equal(gate.status, 'failed');
  assert.equal(await gate.ensure(), 'model', '第二次必须真的重新加载');
  assert.equal(calls, 2);
  assert.equal(gate.status, 'ready');
});

test('主源失败走同源兜底，且切源之前先取消底层那次', async () => {
  const order = [];
  const gate = createModelLoader({
    load: async (kind) => {
      order.push(kind);
      if (kind === 'primary') throw new Error('CDN 404');
      return 'from-fallback';
    },
    cancel: () => order.push('cancel'),
  });
  assert.equal(await gate.ensure(), 'from-fallback');
  assert.deepEqual(order, ['primary', 'cancel', 'fallback']);
  assert.equal(gate.fallbackUsed, true);
});

test('主源悬挂超时：不等同一份 Promise，先取消再兜底', async () => {
  const hanging = deferred(); // 永远不 settle，模拟 CDN 挂死
  const order = [];
  const gate = createModelLoader({
    primaryTimeoutMs: 30,
    fallbackTimeoutMs: 500,
    load: (kind) => {
      order.push(kind);
      return kind === 'primary' ? hanging.promise : Promise.resolve('from-fallback');
    },
    cancel: () => order.push('cancel'),
  });
  const t0 = Date.now();
  assert.equal(await gate.ensure(), 'from-fallback');
  assert.ok(Date.now() - t0 < 1000, '不能等悬挂的主源，否则就是无限挂起');
  assert.deepEqual(order, ['primary', 'cancel', 'fallback']);
});

test('主源超时且兜底也失败：报错，而且下一次重试能真的重新开始', async () => {
  let round = 0;
  const gate = createModelLoader({
    primaryTimeoutMs: 20,
    fallbackTimeoutMs: 20,
    load: () => {
      round += 1;
      if (round <= 2) return new Promise(() => {}); // 前两次都悬挂 => 都超时
      return Promise.resolve('model');
    },
    cancel: () => {},
  });
  await assert.rejects(gate.ensure(), (e) => e.name === 'TimeoutError');
  assert.equal(gate.status, 'failed');
  assert.equal(await gate.ensure(), 'model');
  assert.equal(round, 3);
});

test('没有兜底源时不假装切源', async () => {
  const order = [];
  const gate = createModelLoader({
    load: async (kind) => {
      order.push(kind);
      throw new Error('boom');
    },
    hasFallback: () => false,
    cancel: () => order.push('cancel'),
  });
  await assert.rejects(gate.ensure(), /boom/);
  assert.deepEqual(order, ['primary']);
  assert.equal(gate.fallbackUsed, false);
});

test('加载槽作废后：旧尝试的迟到结果不算数，新尝试立刻开始', async () => {
  const slot = createLoadSlot();
  const first = deferred();
  const p1 = slot.start(() => first.promise);
  slot.invalidate(); // 超时后换源那一刻做的事
  const p2 = slot.start(async () => 'second');
  assert.equal(await p2, 'second');
  first.resolve('stale'); // 旧的那次现在才回来
  await assert.rejects(p1, (e) => e instanceof SupersededError);
  assert.equal(slot.value, 'second');
  assert.equal(slot.done, true);
});

test('成功结果会被留在槽里（不重复下载），失败则清空', async () => {
  const slot = createLoadSlot();
  let calls = 0;
  assert.equal(await slot.start(async () => (calls += 1)), 1);
  assert.equal(await slot.start(async () => (calls += 1)), 1);
  assert.equal(calls, 1);
  const bad = createLoadSlot();
  await assert.rejects(bad.start(async () => {
    throw new Error('nope');
  }), /nope/);
  assert.equal(bad.done, false);
  assert.equal(bad.inflight, null);
});

test('超时后底层迟到的拒绝不会变成未处理拒绝', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const d = deferred();
    await assert.rejects(withTimeout(d.promise, 10, '模型下载超时'), (e) => e.name === 'TimeoutError' && /超时/.test(e.message));
    d.reject(new Error('迟到的失败'));
    await new Promise((r) => setTimeout(r, 40));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled, []);
});
