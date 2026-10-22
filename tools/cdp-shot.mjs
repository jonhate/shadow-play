/**
 * 用无头 Edge + CDP 截图验证渲染（无需人工开浏览器）。
 * 用法： node tools/cdp-shot.mjs [url] [outDir]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.argv[2] || 'http://127.0.0.1:5173/?manual=1&autostart=1';
const outDir = process.argv[3] || 'D:\\lj\\inktool\\piying\\shadow-play\\shots';
const port = 9333;
fs.mkdirSync(outDir, { recursive: true });

const profile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `edge-cdp-${Date.now()}`);
const args = [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu-sandbox',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--hide-scrollbars',
  `--window-size=${process.env.WIN_SIZE || '1920,1080'}`,
  '--force-device-scale-factor=1',
  ...(process.env.FAKE_CAM
    ? [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--allow-file-access-from-files',
      ]
    : []),
  // 允许无人手势起音频，便于自动化测“到底有没有出声”
  ...(process.env.AUDIO_OK === '1' ? ['--autoplay-policy=no-user-gesture-required'] : []),
  'about:blank',
];
const child = spawn(EDGE, args, { stdio: 'ignore', detached: false });
const logs = [];

async function waitForDevtools(timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('devtools 未就绪\n' + logs.join(''));
}

const version = await waitForDevtools();
console.log('browser:', version['Browser']);

const tabRes = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, {
  method: 'PUT',
});
const tab = await tabRes.json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const consoleLines = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || [])
      .map((a) => a.value ?? a.description ?? a.type)
      .join(' ');
    consoleLines.push(`[${msg.params.type}] ${text}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    consoleLines.push(`[exception] ${d.text} ${d.exception?.description || ''}`);
  }
  if (msg.method === 'Log.entryAdded') {
    consoleLines.push(`[log:${msg.params.entry.level}] ${msg.params.entry.text}`);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
// 在页面脚本之前注入错误钩子，拿到 stack
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__errs = [];
    window.addEventListener('error', (e) => {
      window.__errs.push(String((e.error && e.error.stack) || e.message || e));
    });
    window.addEventListener('unhandledrejection', (e) => {
      window.__errs.push('rejection: ' + String((e.reason && e.reason.stack) || e.reason));
    });`,
});
// 视口：默认 1920x1080，可用 SET_VP=1366x768 覆盖（验证小屏布局）
const [vw, vh] = (process.env.SET_VP || '1920x1080').split('x').map(Number);
await send('Emulation.setDeviceMetricsOverride', {
  width: vw || 1920,
  height: vh || 1080,
  deviceScaleFactor: 1,
  mobile: false,
});

await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 1500));

async function evalJs(expression, awaitPromise = true) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}

// 等 SHADOWPLAY 就绪（非展项页面可以用 SKIP_READY=1 跳过）
const t0 = Date.now();
let ready = process.env.SKIP_READY === '1' ? true : false;
if (process.env.SKIP_READY === '1') console.log('ready: skipped');
while (!ready && Date.now() - t0 < 30000) {
  ready = await evalJs('!!window.SHADOWPLAY').catch(() => false);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 500));
}
console.log('ready:', ready);
if (!ready) {
  const label = await evalJs(`document.getElementById('loading-label')?.textContent || ''`).catch(() => '');
  console.log('loading-label:', label);
  console.log('--- console ---');
  console.log(consoleLines.join('\n') || '(empty)');
  await send('Page.captureScreenshot', { format: 'png' }).then(({ data }) => {
    fs.writeFileSync(path.join(outDir, 'fail.png'), Buffer.from(data, 'base64'));
    console.log('shot', path.join(outDir, 'fail.png'));
  });
  ws.close();
  child.kill();
  process.exit(1);
}

async function shot(name, waitMs = 600) {
  await new Promise((r) => setTimeout(r, waitMs));
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  console.log('shot', file);
  return file;
}

// 场景/状态序列
const stepsRaw = process.env.STEPS_FILE
  ? fs.readFileSync(process.env.STEPS_FILE, 'utf8')
  : process.env.STEPS || '[]';
const steps = JSON.parse(stepsRaw);
if (steps.length) {
  for (const s of steps) {
    if (s.js) await evalJs(s.js);
    if (s.name) await shot(s.name, s.wait ?? 700);
  }
} else {
  await shot('01-attract', 1200);
  await evalJs(
    `window.SHADOWPLAY.manual.moved = true; window.SHADOWPLAY.show.setState('play'); window.SHADOWPLAY.manual.left.fist=false; window.SHADOWPLAY.manual.right.fist=false;`,
  );
  await shot('02-play', 1200);
  await evalJs(`window.SHADOWPLAY.show.nextScene();`);
  await shot('03-scene2', 1200);
  await evalJs(`window.SHADOWPLAY.show.nextScene();`);
  await shot('04-scene3', 1200);
  await evalJs(`window.SHADOWPLAY.show.enterFreeze();`);
  await shot('05-freeze', 1400);
}

const stats = await evalJs(`JSON.stringify(window.SHADOWPLAY ? {
  puppets: window.SHADOWPLAY.stage.puppets.length,
  state: window.SHADOWPLAY.show.state,
  scene: window.SHADOWPLAY.show.scene && window.SHADOWPLAY.show.scene.name,
  leadParts: window.SHADOWPLAY.show.lead ? window.SHADOWPLAY.show.lead.rig.parts.length : null,
  arms: window.SHADOWPLAY.show.lead ? Object.keys(window.SHADOWPLAY.show.lead.rig.arms).filter(k=>window.SHADOWPLAY.show.lead.rig.arms[k]) : null,
  legs: window.SHADOWPLAY.show.lead ? Object.keys(window.SHADOWPLAY.show.lead.rig.legs).filter(k=>window.SHADOWPLAY.show.lead.rig.legs[k]) : null,
  callbacks: 'ok'
} : { page: (document.title || '') })`);
console.log('stats:', stats);
const errs = await evalJs('JSON.stringify(window.__errs || [])').catch(() => '[]');
console.log('page-errors:', errs);
console.log('--- console ---');
console.log(consoleLines.join('\n') || '(empty)');

ws.close();
child.kill();
try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {}
process.exit(0);
