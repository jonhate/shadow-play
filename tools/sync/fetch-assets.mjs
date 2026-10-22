import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://piying.woooostudio.com';
const items = JSON.parse(fs.readFileSync('D:\\lj\\inktool\\piying\\_dl\\all_items.json', 'utf8'));
const outDir = 'D:\\lj\\inktool\\piying\\shadow-play\\puppets';
fs.mkdirSync(outDir, { recursive: true });

// 手工挑选：角色 / 动物 / 建筑 / 植物（皮影戏常用行当与景片）
const WANT = [
  '翎冠武生', '持戟武将', '长辫女子', '骑鹤仙人', '踏云武生', '乌帽书生',
  '鹿', '骏马', '龙',
  '拱桥', '凉亭', '宝塔', '竹子', '牡丹', '梅花',
];

const byName = new Map(items.map((i) => [i.display_name, i]));
const index = [];
for (const name of WANT) {
  const it = byName.get(name);
  if (!it) {
    console.log('MISSING', name);
    continue;
  }
  const safe = it.id; // ascii id as filename, keep chinese in manifest
  const pkgPath = path.join(outDir, `${safe}.woop`);
  if (!fs.existsSync(pkgPath)) {
    const r = await fetch(BASE + it.package_url);
    if (!r.ok) {
      console.log('FAIL pkg', name, r.status);
      continue;
    }
    fs.writeFileSync(pkgPath, Buffer.from(await r.arrayBuffer()));
  }
  const thumbPath = path.join(outDir, `${safe}.webp`);
  if (!fs.existsSync(thumbPath)) {
    const r = await fetch(BASE + it.preview_url);
    if (r.ok) fs.writeFileSync(thumbPath, Buffer.from(await r.arrayBuffer()));
  }
  index.push({
    name,
    id: it.id,
    category: it.category,
    parts: it.part_count,
    joints: it.joint_count,
    file: `${safe}.woop`,
    thumb: `${safe}.webp`,
    source: 'https://piying.woooostudio.com/ 官方资产库',
  });
  console.log('ok', name, it.category, it.part_count);
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
console.log('total', index.length);
