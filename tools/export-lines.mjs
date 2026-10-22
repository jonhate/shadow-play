/**
 * 导出全部台词 + 生成配音目录骨架。
 *
 *   node tools/export-lines.mjs
 *
 * 产出：
 *   audio/lines.json          清单（场景 → 每句台词 → 文件名）
 *   audio/lines/<场景>/       空目录（配音 mp3 放这里，01.mp3 起）
 *   docs/台词表.md            给配音员 / AI TTS 用的台词表
 *
 * 命名规则固定为 audio/lines/<场景id>/<两位序号>.mp3，页面会自动读取；
 * 没有文件就静音跳过，不影响演出。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES, CURTAIN_LINES } from '../app/show.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const AUDIO = path.join(ROOT, 'audio');
const LINES = path.join(AUDIO, 'lines');

fs.mkdirSync(LINES, { recursive: true });

const manifest = { generated: new Date().toISOString(), scenes: {} };
const rows = [];

/** 文件是否真的存在（生成清单时顺手标好，页面就不必再探测） */
const has = (rel) => fs.existsSync(path.join(AUDIO, rel));

for (const scene of SCENES) {
  const dir = path.join(LINES, scene.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.gitkeep'), '');
  manifest.scenes[scene.id] = [];
  const beats = scene.beats || [];
  beats.forEach((beat, i) => {
    const file = `lines/${scene.id}/${String(i + 1).padStart(2, '0')}.mp3`;
    if (!beat.text) return;
    manifest.scenes[scene.id].push({ i: i + 1, text: beat.text, file, available: has(file) });
    rows.push({
      scene: `${scene.name}（${scene.id}）`,
      no: i + 1,
      cue: beat.cue || '',
      text: beat.text,
      file: `audio/${file}`,
      ready: has(file),
    });
  });
}

// 谢幕
fs.mkdirSync(path.join(LINES, 'curtain'), { recursive: true });
manifest.scenes.curtain = CURTAIN_LINES.map((text, i) => {
  const file = `lines/curtain/${String(i + 1).padStart(2, '0')}.mp3`;
  return { i: i + 1, text, file, available: has(file) };
});
CURTAIN_LINES.forEach((text, i) => {
  const file = `lines/curtain/${String(i + 1).padStart(2, '0')}.mp3`;
  rows.push({
    scene: '谢幕（curtain）',
    no: i + 1,
    cue: '',
    text,
    file: `audio/${file}`,
    ready: has(file),
  });
});

fs.writeFileSync(path.join(AUDIO, 'lines.json'), JSON.stringify(manifest, null, 2) + '\n');

// ---- BGM 文件清单（有真人录的就用文件，没有就用程序合成）
const BGM_DIR = path.join(AUDIO, 'bgm');
fs.mkdirSync(BGM_DIR, { recursive: true });
const bgmIds = [...SCENES.map((s) => s.id), 'curtain', 'attract'];
const bgmManifest = { generated: new Date().toISOString(), scenes: {} };
// 手工调过的 offset / gain 要保留
let prevBgm = {};
try {
  prevBgm = JSON.parse(fs.readFileSync(path.join(AUDIO, 'bgm.json'), 'utf8')).scenes || {};
} catch (e) {
  prevBgm = {};
}
for (const id of bgmIds) {
  const rel = `bgm/${id}.mp3`;
  const exists = fs.existsSync(path.join(AUDIO, rel));
  const prev = prevBgm[id] || {};
  bgmManifest.scenes[id] = {
    file: rel,
    available: exists,
    offset: Number(prev.offset) || 0, // 从原声第几秒开始循环
    gain: prev.gain != null ? Number(prev.gain) : 1, // 这首单独的音量系数
  };
}
fs.writeFileSync(path.join(AUDIO, 'bgm.json'), JSON.stringify(bgmManifest, null, 2) + '\n');

const md = [];
md.push('# 台词表（配音用）');
md.push('');
md.push('> 本文件由 `node tools/export-lines.mjs` 生成，改台词请改 `app/show.js` 后重新导出。');
md.push('');
md.push('## 怎么用');
md.push('');
md.push('1. 按下面的「文件名」，给每一句生成一个 mp3（任意 TTS 都行，建议 zh-CN 男声/女声分角色）；');
md.push('2. 放到对应路径（`audio/lines/<场景id>/01.mp3` …），文件名必须一模一样；');
md.push('3. 刷新页面即可。缺哪个就静音跳过，不会报错。');
md.push('');
md.push('批量生成示例（edge-tts，免费）：');
md.push('');
md.push('```bash');
md.push('pip install edge-tts');
md.push('edge-tts --voice zh-CN-YunxiNeural  --text "待月西厢下，迎风户半开。" --write-media audio/lines/xiang/01.mp3');
md.push('edge-tts --voice zh-CN-XiaoxiaoNeural --text "先生万福。"           --write-media audio/lines/xiang/03.mp3');
md.push('```');
md.push('');
md.push('播台词时背景音乐会自动压低（ducking），念完再恢复。');
md.push('');
md.push('## 台词清单');
md.push('');
md.push('| # | 场景 | 句 | 需要做的动作 | 台词 | 文件名 | 已就绪 |');
md.push('| --- | --- | --- | --- | --- | --- | --- |');
rows.forEach((r, i) => {
  const cue = { bow: '作揖', raise: '举高亮相', swing: '甩袖', fist: '双拳' }[r.cue] || '—';
  md.push(`| ${i + 1} | ${r.scene} | ${r.no} | ${cue} | ${r.text} | \`${r.file}\` | ${r.ready ? '✔' : ''} |`);
});
md.push('');
md.push('> 加完 mp3 记得 **再跑一次** `node tools/export-lines.mjs`，它会把「已就绪」标好，页面只播这些。');

fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', '台词表.md'), md.join('\n'));

console.log(`[lines] 场景 ${SCENES.length} 出 + 谢幕，共 ${rows.length} 句`);
console.log(`[lines] 清单: audio/lines.json`);
console.log(`[lines] 台词表: docs/台词表.md`);
console.log(`[lines] 目录: audio/lines/{${[...SCENES.map((s) => s.id), 'curtain'].join(',')}}`);
const bgmReady = Object.entries(bgmManifest.scenes).filter(([, v]) => v.available).map(([k]) => k);
console.log(`[bgm]   清单: audio/bgm.json（已有文件: ${bgmReady.length ? bgmReady.join(',') : '无，全部用程序合成'}）`);
