/**
 * 真实浏览器探针：验证「手势模型加载」的容错路径（不用人眼看，输出可复算的数据）。
 *
 *   node tools/serve.mjs                     # 另开一个窗口
 *   node tools/probe-model-load.mjs manual-camera
 *   node tools/probe-model-load.mjs retry
 *   node tools/probe-model-load.mjs fallback
 *
 * 用法要点：
 *  - 走的是真实用户路径（点右下角摄像头卡片 / 首屏预取），不是直接调内部函数；
 *  - 摄像头权限用 CDP 的 Browser.grantPermissions 给（真机真摄像头，不用假设备）；
 *  - 网络统计来自 CDP Network 域，按 URL 里是否含 gesture_recognizer.task 计数；
 *  - 期望不满足时退出码 1，方便当成回归脚本挂到流水线里。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const scenario = process.argv[2] || 'manual-camera';
const BASE = (process.argv[3] || process.env.BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const EDGE = process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = Number(process.env.CDP_PORT || 9341);
// 本机 Edge 的 DevTools 端口只答某一个回环地址（127.0.0.1 / localhost 视启动参数而定），
// 所以下面探测时两个都试，哪个通用哪个。
let CDP_HOST = process.env.CDP_HOST || '127.0.0.1';
const MODEL = 'gesture_recognizer.task';

const attach = process.env.ATTACH === '1'; // 复用已经在跑的浏览器（调试探针自身时用）
const profile = path.join(
  process.env.PROFILE_DIR || process.env.TEMP || os.tmpdir(),
  `probe-model-${Date.now()}`,
);
const child = attach
  ? null
  : spawn(
  EDGE,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--window-size=1280,720',
    '--force-device-scale-factor=1',
    ...(process.env.PROBE_NO_SANDBOX ? ['--no-sandbox', '--disable-features=NetworkServiceSandbox'] : []),
    ...(process.env.NO_PROXY ? ['--no-proxy-server'] : []),
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitDevtools(timeout = 25000) {
  const t0 = Date.now();
  const hosts = process.env.CDP_HOST ? [process.env.CDP_HOST] : ['127.0.0.1', 'localhost'];
  while (Date.now() - t0 < timeout) {
    for (const host of hosts) {
      try {
        const r = await fetch(`http://${host}:${port}/json/version`, { signal: AbortSignal.timeout(4000) });
        if (r.ok) {
          CDP_HOST = host;
          return r.json();
        }
      } catch {}
    }
    await sleep(250);
  }
  throw new Error('devtools 未就绪');
}

const cleanup = () => {
  if (!child) return;
  try {
    child.kill();
  } catch {}
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {}
};

let ws;
let msgId = 0;
const pending = new Map();
const consoleLines = [];
const requests = []; // 模型相关请求（含被拦下的）
const blocked = { on: false };

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

const evalJs = async (expression, awaitPromise = true) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

const modelRequests = () => requests.filter((r) => r.url.includes(MODEL));

async function waitFor(fn, timeout, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true;
    await sleep(400);
  }
  console.log(`timeout: ${label} (${timeout}ms)`);
  return false;
}

const state = () =>
  evalJs(`JSON.stringify({
    ready: !!(window.SHADOWPLAY && window.SHADOWPLAY.gesture.ready),
    delegate: window.SHADOWPLAY ? window.SHADOWPLAY.gesture.delegate : null,
    running: !!(window.SHADOWPLAY && window.SHADOWPLAY.gesture.running),
    gate: window.SHADOWPLAY && window.SHADOWPLAY.modelGate ? window.SHADOWPLAY.modelGate.status : 'n/a',
    fallbackUsed: window.SHADOWPLAY && window.SHADOWPLAY.modelGate ? window.SHADOWPLAY.modelGate.fallbackUsed : null,
    manual: !!(window.SHADOWPLAY && window.SHADOWPLAY.show && window.SHADOWPLAY.show.manual),
    card: (document.getElementById('camera-card') || {}).className || null,
    cardText: ((document.getElementById('camera-card') || {}).innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 160)
  })`).then((s) => JSON.parse(s));

async function main() {
  const version = await waitDevtools();
  console.log('browser:', version.Browser);
  const tab = await (await fetch(`http://${CDP_HOST}:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Network.requestWillBeSent' && msg.params.request.url.includes(MODEL)) {
      requests.push({ url: msg.params.request.url, t: Date.now(), blocked: blocked.on });
    }
    if (msg.method === 'Network.loadingFailed' && requests.length) {
      const last = requests[requests.length - 1];
      if (msg.params.requestId === last.requestId) last.failed = msg.params.errorText;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
      consoleLines.push(`[${msg.params.type}] ${text}`);
    }
    if (msg.method === 'Log.entryAdded') consoleLines.push(`[log:${msg.params.entry.level}] ${msg.params.entry.text}`);
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Log.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__errs=[];addEventListener('error',(e)=>window.__errs.push(String((e.error&&e.error.stack)||e.message)));addEventListener('unhandledrejection',(e)=>window.__errs.push('rejection: '+String((e.reason&&e.reason.stack)||e.reason)));`,
  });
  await send('Browser.grantPermissions', {
    origin: BASE,
    permissions: ['videoCapture', 'audioCapture'],
  });

  const result = { scenario, base: BASE };

  if (scenario === 'manual-camera') {
    // ?manual=1 起手：模型不该被预取，也不该留下「已加载」的假缓存
    await send('Page.navigate', { url: `${BASE}/?manual=1&assets=0` });
    if (!(await waitFor(async () => evalJs('!!window.SHADOWPLAY'), 120000, 'SHADOWPLAY ready'))) throw new Error('页面没起来');
    await sleep(1500);
    result.beforeClick = await state();
    result.requestsBeforeClick = modelRequests().length;
    // 真实用户路径：点右下角摄像头卡片
    await evalJs(`document.getElementById('camera-card').click(), true`);
    const ready = await waitFor(async () => (await state()).ready, 120000, '模型就绪');
    await sleep(1500);
    result.afterClick = await state();
    result.requests = modelRequests();
    result.readyAfterClick = ready;
    result.ok = ready && result.requests.length > 0;

  } else if (scenario === 'retry') {
    // 先让模型请求全挂（模拟 CDN 挂/内网断），再放开——第二次点必须真的重新下
    await send('Network.setBlockedURLs', { urls: [`*${MODEL}*`] });
    blocked.on = true;
    await send('Page.navigate', { url: `${BASE}/?manual=1&assets=0` });
    if (!(await waitFor(async () => evalJs('!!window.SHADOWPLAY'), 120000, 'SHADOWPLAY ready'))) throw new Error('页面没起来');
    await send('Network.setBlockedURLs', { urls: [`*${MODEL}*`] }); // 页面起来后再确保拦截生效
    await evalJs(`document.getElementById('camera-card').click(), true`);
    // 等第一次尝试彻底失败（卡片进入错误态）
    await waitFor(async () => {
      const s = await state();
      return s.gate === 'failed' || /没起来|失败|重试/.test(s.cardText);
    }, 90000, '第一次尝试失败');
    await sleep(1200);
    result.firstAttempt = await state();
    result.requestsAfterFirst = modelRequests().length;

    // 放开网络，再点一次
    blocked.on = false;
    await send('Network.setBlockedURLs', { urls: [] });
    await evalJs(`document.getElementById('camera-card').click(), true`);
    const ready = await waitFor(async () => (await state()).ready, 180000, '重试后模型就绪');
    await sleep(1500);
    result.secondAttempt = await state();
    result.requestsAfterSecond = modelRequests().length;
    result.requests = modelRequests();
    result.readyAfterRetry = ready;
    result.ok = ready && result.requestsAfterSecond > result.requestsAfterFirst;

  } else if (scenario === 'fallback') {
    // 主源直接指向一个必然连不上的地址：应自动退同源，且不是「假切源」
    const dead = 'https://127.0.0.1:1';
    await send('Page.navigate', { url: `${BASE}/?assets=${encodeURIComponent(dead)}&preload=1` });
    if (!(await waitFor(async () => evalJs('!!window.SHADOWPLAY'), 180000, 'SHADOWPLAY ready'))) throw new Error('页面没起来');
    const ready = await waitFor(async () => (await state()).ready, 180000, '兜底后模型就绪');
    await sleep(1000);
    result.final = await state();
    result.requests = modelRequests().map((r) => ({ url: r.url, blocked: r.blocked, failed: r.failed || null }));
    result.assetSource = await evalJs(`window.SHADOWPLAY.assetSource()`);
    result.readyAfterFallback = ready;
    result.ok = ready && result.requests.some((r) => r.url.includes('127.0.0.1:1')) && result.requests.some((r) => !r.url.includes('127.0.0.1:1'));

  } else {
    throw new Error(`未知 scenario: ${scenario}`);
  }

  result.pageErrors = JSON.parse((await evalJs('JSON.stringify(window.__errs||[])')) || '[]');
  result.console = consoleLines.filter((l) => /gesture|boot|camera|模型|ModelError/i.test(l)).slice(0, 25);
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}

main()
  .then((code) => {
    try {
      ws?.close();
    } catch {}
    cleanup();
    process.exit(code);
  })
  .catch((err) => {
    console.error('probe failed:', err && err.message);
    try {
      ws?.close();
    } catch {}
    cleanup();
    process.exit(2);
  });
