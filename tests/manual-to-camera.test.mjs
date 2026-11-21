/**
 * 回归：以 ?manual=1 起手、后来切到摄像头（app/main.js 里 ensureModel 的接线）。
 *
 * 修复前的写法是 `if (manualMode) return (modelPromise = Promise.resolve())`：
 * 手动模式下把「已完成」缓存进 modelPromise。之后切到摄像头，ensureModel() 直接返回
 * 那份『已完成』，gesture.ready 仍是 false —— 摄像头永远起不来，只能刷新页面。
 *
 * 这里按修复后的接线复刻 main.js：手动模式不预取、也不留下任何「已加载」缓存。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelLoader } from '../app/model-loader.js';

function wireMain({ preload = true } = {}) {
  const state = { manualMode: true, loadCalls: 0 };
  const gesture = {
    ready: false,
    async loadModel() {
      state.loadCalls += 1;
      await new Promise((r) => setTimeout(r, 5));
      gesture.ready = true;
      return gesture;
    },
    cancelModelLoad() {},
  };
  const modelGate = createModelLoader({ load: () => gesture.loadModel(), hasFallback: () => false });
  const ensureModel = () => modelGate.ensure();
  // ↓ app/main.js 的修复点：手动模式不预取（省流量），但不缓存假结果
  if (preload && !state.manualMode) ensureModel().catch(() => {});
  return {
    state,
    gesture,
    modelGate,
    ensureModel,
    switchToCamera() {
      state.manualMode = false;
      return ensureModel();
    },
  };
}

test('manual 起手不下载模型，也不留下「已就绪」的假结果', () => {
  const app = wireMain();
  assert.equal(app.state.loadCalls, 0, '手动模式下不该下 22MB');
  assert.equal(app.modelGate.status, 'idle');
  assert.equal(app.gesture.ready, false);
});

test('manual → 摄像头：真的重新加载模型并进入 ready', async () => {
  const app = wireMain();
  await app.switchToCamera();
  assert.equal(app.state.loadCalls, 1, '切到摄像头必须真的发起一次加载');
  assert.equal(app.gesture.ready, true);
  assert.equal(app.modelGate.status, 'ready');
  // 摄像头通了之后再点一次，不该重复下载
  await app.switchToCamera();
  assert.equal(app.state.loadCalls, 1);
});

test('manual → 摄像头这次失败后，再点一次能重新来（不被失败卡死）', async () => {
  const state = { manualMode: true, loadCalls: 0 };
  let failNext = true;
  const gesture = {
    ready: false,
    async loadModel() {
      state.loadCalls += 1;
      if (failNext) {
        failNext = false;
        throw new Error('CDN 挂了');
      }
      gesture.ready = true;
      return gesture;
    },
    cancelModelLoad() {},
  };
  const modelGate = createModelLoader({ load: () => gesture.loadModel(), hasFallback: () => false });
  state.manualMode = false;
  await assert.rejects(modelGate.ensure(), /CDN 挂了/);
  assert.equal(modelGate.status, 'failed');
  await modelGate.ensure();
  assert.equal(gesture.ready, true);
  assert.equal(state.loadCalls, 2);
});
