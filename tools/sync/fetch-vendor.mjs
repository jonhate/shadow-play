import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const dir = 'D:\\lj\\inktool\\piying\\shadow-play\\vendor\\_pkgs';
fs.mkdirSync(dir, { recursive: true });

async function meta(p) {
  const r = await fetch(`https://registry.npmjs.org/${p.replace('/', '%2F')}`);
  return r.json();
}

function pick(list, want) {
  if (want) return list.includes(want) ? want : null;
  // last stable non-prerelease
  const stable = list.filter((v) => !v.includes('-'));
  return stable[stable.length - 1];
}

for (const [pkg, want] of [
  ['@mediapipe/tasks-vision', '0.10.22'],
  ['three', '0.180.0'],
  ['fflate', '0.8.2'],
]) {
  const m = await meta(pkg);
  const v = pick(m.versions ? Object.keys(m.versions) : [], want) || m['dist-tags'].latest;
  const url = m.versions[v].dist.tarball;
  const file = `${dir}\\${pkg.replace('/', '_')}-${v}.tgz`;
  const r = await fetch(url);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  console.log('got', pkg, v, fs.statSync(file).size);
  const outDir = `${dir}\\${pkg.replace('/', '_')}`;
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync('tar', ['-xzf', file, '-C', outDir], { stdio: 'inherit' });
  console.log('extracted to', outDir);
}
