import { FilesetResolver, GestureRecognizer } from '../vendor/mediapipe/vision_bundle.mjs';

/**
 * 手势输入：MediaPipe Gesture Recognizer（Google 官方，VIDEO 模式，单模型同时给
 * 21 点手部关键点 + 手势分类），外面套一层稳定化：EMA 平滑、左右手身份保持、
 * 张开度/捏合度等工程化指标。
 */

const TIP = [4, 8, 12, 16, 20];
const MCP = [2, 5, 9, 13, 17];

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const wrapPi = (a) => {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
};

export class GestureInput {
  constructor(video, opts = {}) {
    this.video = video;
    this.opts = opts;
    this.recognizer = null;
    this.ready = false;
    this.running = false;
    this.lastVideoTime = -1;
    this.stream = null;
    this.hands = new Map(); // 'P0Left' | 'P0Right' | 'P1Left' | 'P1Right'
    this.numHands = opts.numHands === 4 ? 4 : 2;
    this.delegate = null;
    this.lastResult = null;
    this.frameMs = 0;
    this.error = null;
  }

  async loadModel({ modelPath = './models/gesture_recognizer.task', wasmPath = './vendor/mediapipe/wasm' } = {}) {
    if (this.modelLoading) return this.modelLoading;
    this.modelLoading = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(wasmPath);
      const tryCreate = async (delegate) =>
        GestureRecognizer.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelPath, delegate },
          runningMode: 'VIDEO',
          numHands: this.numHands,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      try {
        this.recognizer = await tryCreate('GPU');
        this.delegate = 'GPU';
      } catch (err) {
        console.warn('[gesture] GPU 初始化失败，退回 CPU', err);
        this.recognizer = await tryCreate('CPU');
        this.delegate = 'CPU';
      }
      this.ready = true;
      return this;
    })();
    return this.modelLoading;
  }

  async startCamera(constraints = {}) {
    // 不是 https/localhost 时 mediaDevices 根本不存在——这也要给出明确错误，
    // 而不是一个神秘的 TypeError
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      const e = new Error('当前页面环境不支持摄像头（必须用 http://127.0.0.1 或 https 打开，不能 file://）');
      e.name = 'SecurityError';
      throw e;
    }
    const c = {
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 960 },
        height: { ideal: 540 },
        frameRate: { ideal: 30, max: 30 },
        ...constraints,
      },
    };
    // 授权弹窗亮着时 getUserMedia 会一直挂起。这里是用户手势触发的申请，
    // 给足 30 秒让用户点“允许”，超时才报 TimeoutError。
    const timeout = new Promise((_, reject) =>
      setTimeout(() => {
        const e = new Error('摄像头授权框一直没有回应');
        e.name = 'TimeoutError';
        reject(e);
      }, 30000),
    );
    this.stream = await Promise.race([navigator.mediaDevices.getUserMedia(c), timeout]);
    this.video.srcObject = this.stream;
    this.video.playsInline = true;
    this.video.muted = true;
    await this.video.play();
    await waitForVideo(this.video);
    this.running = true;
    return this.stream;
  }

  stopCamera() {
    this.running = false;
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
  }

  /** 每帧调用；返回 { hands: [...], hasHands, ts } */
  update(now = performance.now()) {
    const empty = { hands: [], hasHands: false, ts: now };
    if (!this.ready || !this.running || this.video.readyState < 2) return empty;
    const t0 = performance.now();
    let result = null;
    try {
      if (this.video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.video.currentTime;
        result = this.recognizer.recognizeForVideo(this.video, now);
        this.lastResult = result;
      } else {
        result = this.lastResult;
      }
    } catch (err) {
      this.error = err;
      return empty;
    }
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    if (!result) return empty;

    const vw = this.video.videoWidth || 1280;
    const vh = this.video.videoHeight || 720;
    const aspect = vw / vh;
    const seen = new Set();
    const out = [];
    const raw = [];

    const n = result.landmarks ? result.landmarks.length : 0;
    for (let i = 0; i < n; i += 1) {
      raw.push({
        lm: result.landmarks[i],
        handed: result.handedness?.[i]?.[0],
        gesture: result.gestures?.[i]?.[0],
      });
    }
    // 左右手身份：按“镜像后的画面横向顺序”分配，符合照镜子的直觉，
    // 也避免 MediaPipe handedness 在非镜像输入下的歧义。
    // 4 只手（双人）时：最左两只 → 观众 A，最右两只 → 观众 B。
    raw.sort((a, b) => b.lm[0].x - a.lm[0].x); // 镜像后 x 小的排前面 => 原始 x 大的排前面
    for (let i = 0; i < raw.length && i < this.numHands; i += 1) {
      const { lm, handed, gesture } = raw[i];
      const player = i < 2 ? 0 : 1;
      const cap = i % 2 === 0 ? 'Left' : 'Right';
      const side = cap.toLowerCase(); // 'left' | 'right'，与 show.js 的键一致
      const label = `P${player}${cap}`;
      seen.add(label);

      const palmRaw = palmCenter(lm);
      const size = Math.max(1e-4, d2(lm[0], lm[9]));
      const metrics = handMetrics(lm, size);

      const prev = this.hands.get(label);
      // 自适应平滑：手不动时压得更狠（防抖），手快速移动时跟得更紧（防拖影）
      const gap = prev?.palm ? Math.hypot(palmRaw.x - prev.palm.x, palmRaw.y - prev.palm.y) : 0;
      const alpha = Math.min(0.62, Math.max(0.08, 0.08 + gap * 9));
      const palm = prev?.palm && prev.age < 0.25
        ? { x: prev.palm.x + (palmRaw.x - prev.palm.x) * alpha, y: prev.palm.y + (palmRaw.y - prev.palm.y) * alpha, z: palmRaw.z }
        : { ...palmRaw };
      const state = {
        label,
        player,
        side,
        handedness: handed?.categoryName ?? '?',
        confidence: handed?.score ?? 0,
        gesture: gesture?.categoryName ?? 'None',
        gestureScore: gesture?.score ?? 0,
        palm,
        palmRaw,
        size,
        aspect,
        openness: prev ? prev.openness + (metrics.openness - prev.openness) * alpha : metrics.openness,
        pinch: prev ? prev.pinch + (metrics.pinch - prev.pinch) * alpha : metrics.pinch,
        // ---- 方案一（手指控制）要用的量
        pinchMid: prev ? prev.pinchMid + (metrics.pinchMid - prev.pinchMid) * alpha : metrics.pinchMid,
        pinchPinky: prev ? prev.pinchPinky + (metrics.pinchPinky - prev.pinchPinky) * alpha : metrics.pinchPinky,
        pinchPoint: metrics.pinchPoint, // 拇指-食指中点（归一化画面坐标）
        gripPoint: metrics.gripPoint, // 拇指-小指中点（另一根签）
        roll: prev && prev.roll != null ? prev.roll + wrapPi(metrics.roll - prev.roll) * Math.min(0.5, alpha + 0.1) : metrics.roll,
        extended: metrics.extended,
        fps: 1000 / (this.frameMs || 33),
        frameMs: this.frameMs,
        age: 0,
        vx: prev ? (palm.x - prev.palm.x) / Math.max(0.008, (now - prev.ts) / 1000) : 0,
        vy: prev ? (palm.y - prev.palm.y) / Math.max(0.008, (now - prev.ts) / 1000) : 0,
        ts: now,
        landmarks: lm,
      };
      this.hands.set(label, state);
      out.push(state);
    }

    for (const [k, v] of [...this.hands]) {
      if (seen.has(k)) continue;
      const age = (now - v.ts) / 1000;
      v.age = age;
      if (age > 0.45) this.hands.delete(k);
      else out.push(v);
    }

    return { hands: out, hasHands: out.length > 0, ts: now, delegate: this.delegate };
  }

  getHand(label) {
    const h = this.hands.get(label);
    if (!h) return null;
    return h.age > 0.45 ? null : h;
  }
}

function palmCenter(lm) {
  const ids = [0, 5, 9, 13, 17];
  let x = 0;
  let y = 0;
  let z = 0;
  for (const i of ids) {
    x += lm[i].x;
    y += lm[i].y;
    z += lm[i].z;
  }
  return { x: x / ids.length, y: y / ids.length, z: z / ids.length };
}

function handMetrics(lm, size) {
  const wrist = lm[0];
  const fingerIds = [8, 12, 16, 20];
  const mcpIds = [5, 9, 13, 17];
  let extSum = 0;
  let extCount = 0;
  for (let i = 0; i < fingerIds.length; i += 1) {
    const tipRatio = d2(lm[fingerIds[i]], wrist) / size;
    const mcpRatio = d2(lm[mcpIds[i]], wrist) / size;
    const ext = tipRatio / Math.max(1e-4, mcpRatio);
    extSum += ext;
    if (ext > 1.12) extCount += 1;
  }
  const openness = extSum / fingerIds.length;
  const pinch = d2(lm[4], lm[8]) / size;

  // ---- 方案一：捏合（拇指-食指 / 拇指-小指）+ 搓动角
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const pinchPoint = mid(lm[4], lm[8]); // 拇指尖与食指尖的中点 = 一根签的"握点"
  const gripPoint = mid(lm[4], lm[20]); // 拇指尖与小指尖的中点 = 另一根签
  // 搓动角：用食指根(5)到小指根(17)这条线。
  // 不能用"拇指尖→食指尖"——捏住时两指尖几乎重合，向量长度趋近 0，角度会乱跳；
  // 掌指关节这条基线长、稳定，能真实反映手腕的转动。
  const roll = Math.atan2(lm[17].y - lm[5].y, lm[17].x - lm[5].x);

  return {
    openness,
    extended: extCount,
    pinch,
    pinchMid: d2(lm[4], lm[12]) / size,
    pinchPinky: d2(lm[4], lm[20]) / size,
    pinchPoint,
    gripPoint,
    roll,
  };
}

function waitForVideo(video, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const tick = () => {
      if (video.videoWidth > 0 && video.readyState >= 2) return resolve(video);
      if (performance.now() - t0 > timeout) return reject(new Error('摄像头画面超时'));
      requestAnimationFrame(tick);
    };
    tick();
  });
}
