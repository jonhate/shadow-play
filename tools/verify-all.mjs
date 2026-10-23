/**
 * 一键回归：把关键关卡全跑一遍，打印通过/失败。
 *
 *   node tools/verify-all.mjs
 *
 * 覆盖：六出戏 25 个剧情节拍、两套教学关、自动谢幕、三档皮、音频清单、
 *       剧情提示条行为、6 种 URL 模式页面报错。
 * 需要：本机已启动 node tools/serve.mjs（端口 5173）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHOT = path.join(ROOT, 'tools', 'cdp-shot.mjs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';

const CASES = [
  { name: '六出戏 25 节拍', steps: 'steps-sweep.json', url: '/', expect: /"passed":(\d+),"fails":\[\]/g },
  { name: '教学关/谢幕/三档皮/音频', steps: 'steps-allcheck.json', url: '/', expect: /"done":true/g },
  { name: '默认模式无报错', url: '/' },
  { name: '手指模式无报错', url: '/?finger=1' },
  { name: '鼠标演示无报错', url: '/?manual=1' },
  { name: '展馆模式无报错', url: '/?kiosk=1' },
  { name: '双人模式无报错', url: '/?duo=1' },
];

const run = (args, env) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('close', (code) => resolve({ code, out }));
  });

let pass = 0;
let fail = 0;
const t0 = Date.now();

for (const c of CASES) {
  const env = { SKIP_READY: '0' };
  if (c.steps) env.STEPS_FILE = path.join(ROOT, 'tools', c.steps);
  const { code, out } = await run([SHOT, BASE + c.url], env);
  const errLine = (out.match(/page-errors: (.*)/) || [, '?'])[1];
  const noErr = errLine.trim() === '[]';
  let detail = `page-errors ${errLine.trim()}`;

  if (c.steps === 'steps-sweep.json') {
    const m = [...out.matchAll(/"passed":(\d+)/g)].map((x) => Number(x[1]));
    const fails = [...out.matchAll(/"fails":\[(.*?)\]/g)].filter((x) => x[1].trim()).length;
    detail += ` ｜ 节拍通过 ${m.reduce((a, b) => a + b, 0)}/${m.length ? 25 : 0}，失败场景 ${fails}`;
    if (fails > 0 || m.reduce((a, b) => a + b, 0) !== 25) {
      fail += 1;
      console.log(`✗ ${c.name}  ${detail}`);
      continue;
    }
  }
  if (c.steps === 'steps-allcheck.json') {
    const done = (out.match(/"done":true/g) || []).length;
    const segs = (out.match(/"segs":\[([^\]]*)\]/) || [, ''])[1];
    detail += ` ｜ 教学关完成 ${done}/2，谢幕段 ${segs}`;
    if (done < 2 || !segs.includes('5')) {
      fail += 1;
      console.log(`✗ ${c.name}  ${detail}`);
      continue;
    }
  }

  if (noErr && code === 0) {
    pass += 1;
    console.log(`✓ ${c.name}  ${detail}`);
  } else {
    fail += 1;
    console.log(`✗ ${c.name}  ${detail}  (exit ${code})`);
    if (!noErr) {
      const lines = out.split('\n').filter((l) => l.includes('page-errors') || l.includes('Error'));
      console.log('   ' + lines.slice(0, 3).join('\n   '));
    }
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\n结果：${pass} 通过 / ${fail} 失败（${secs}s）`);
if (fail > 0) {
  console.log('提示：先确认 node tools/serve.mjs 已启动；失败详情看上面每条的 page-errors。');
  process.exit(1);
}
console.log('全部通过。注意：真机手势质量仍需现场验证（阈值需按摄像头校准）。');
