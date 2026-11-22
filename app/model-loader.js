/**
 * 手势模型加载闸门：把「失败会咬人」的三处坑关掉（回归用例见 tests/model-loader.test.mjs）。
 *
 * 1) 失败不能进缓存。原先 `if (this.modelLoading) return this.modelLoading` 会把一次被拒绝的
 *    Promise 永久缓存下来：GPU/CPU 都失败之后，下一次重试拿到的还是上一次的失败。
 * 2) 并发要合并。同时点两次屏幕不该把 22MB 下两遍；加载未完成时第二次调用等同一份结果。
 * 3) 超时必须能真取消。`Promise.race` 只是让「等的人」放弃，底层那次下载还挂在原地；
 *    兜底再走一次时若复用同一份悬挂 Promise，就等于没切源，还可能一直挂着（看起来像假切源）。
 *
 * 这里不碰 DOM、不碰 MediaPipe，是纯逻辑，所以能用 `node --test` 直接跑。
 */

/** 上一次尝试被作废（超时后切源、或主动取消）后，它迟到的结果统一抛这个，调用方据此忽略。 */
export class SupersededError extends Error {
  constructor(message = '上一次加载已被作废') {
    super(message);
    this.name = 'SupersededError';
  }
}

/**
 * 一个「同一时间只跑一份」的加载槽。
 *  - 成功：结果留在槽里，后续调用直接拿（不会重复下载）；
 *  - 失败：清空缓存，下一次调用真的重新开始 —— 这是「点这里重试」能好使的前提；
 *  - invalidate()：把当前这份作废（超时后真要切源/取消时用），迟到结果不再算数。
 */
export function createLoadSlot() {
  let generation = 0;
  let inflight = null;
  let value;
  let done = false;

  return {
    get inflight() {
      return inflight;
    },
    get done() {
      return done;
    },
    get value() {
      return value;
    },
    start(run) {
      if (done) return Promise.resolve(value);
      if (inflight) return inflight; // 并发去重：大家等同一份结果
      const mine = ++generation;
      inflight = Promise.resolve()
        .then(run)
        .then((v) => {
          if (mine !== generation) throw new SupersededError();
          done = true;
          value = v;
          inflight = null;
          return v;
        })
        .catch((err) => {
          // 只清自己那一份：作废之后新起的尝试不能被旧结果碰掉
          if (mine === generation && !done) inflight = null;
          throw err;
        });
      return inflight;
    },
    invalidate() {
      generation += 1;
      inflight = null;
      done = false;
      value = undefined;
    },
  };
}

/**
 * 给 Promise 加超时。注意：超时只是「不再等」，底层那次并没有被取消 ——
 * 真正的取消要调用方在超时后自己 abort（见 createModelLoader 的 cancel）。
 * 这里顺手吞掉底层迟到的拒绝：否则 Node 会把它当未处理拒绝，
 * 浏览器控制台也会多一条吓人的告警。
 */
export function withTimeout(promise, ms, message) {
  const p = Promise.resolve(promise);
  p.then(
    () => {},
    () => {},
  );
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(message);
      e.name = 'TimeoutError';
      reject(e);
    }, ms);
  });
  if (timer && typeof timer.unref === 'function') timer.unref();
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 主源 → 兜底源的模型加载器。
 *   load(kind)   kind 为 'primary' | 'fallback'，返回底层加载 Promise
 *   hasFallback  没有兜底源时（例如 ?assets=0 本来就走同源）不要假装切源
 *   cancel       必须在开始兜底之前调用：真的 abort 掉底层那次下载
 */
export function createModelLoader({
  load,
  hasFallback = () => true,
  primaryTimeoutMs = 40000,
  fallbackTimeoutMs = 240000,
  cancel = () => {},
  onFallback = () => {},
  onError = () => {},
} = {}) {
  const slot = createLoadSlot();
  let lastError = null;
  let fallbackUsed = false;

  const attempt = (kind, ms, message) => withTimeout(load(kind), ms, message);

  async function run() {
    fallbackUsed = false;
    try {
      return await attempt('primary', primaryTimeoutMs, '手势模型从主源下载超时');
    } catch (err) {
      if (!hasFallback()) {
        lastError = err;
        onError(err);
        throw err;
      }
      onFallback(err);
      // 关键：先作废并取消底层那次（它可能正悬挂着），再去兜底；
      // 否则兜底 await 到的是同一份悬挂 Promise —— 就是「假切源」。
      cancel();
      fallbackUsed = true;
      try {
        return await attempt('fallback', fallbackTimeoutMs, '手势模型从备用源下载超时');
      } catch (err2) {
        lastError = err2;
        onError(err2);
        throw err2;
      }
    }
  }

  return {
    /** 唯一入口。失败不会留下缓存：下一次调用会真的重新开始。 */
    ensure() {
      return slot.start(run);
    },
    /** 手动清空（调试/测试用）。 */
    reset() {
      slot.invalidate();
      lastError = null;
      fallbackUsed = false;
    },
    get status() {
      if (slot.done) return 'ready';
      if (slot.inflight) return 'loading';
      return lastError ? 'failed' : 'idle';
    },
    get value() {
      return slot.value;
    },
    get fallbackUsed() {
      return fallbackUsed;
    },
    get lastError() {
      return lastError;
    },
  };
}
