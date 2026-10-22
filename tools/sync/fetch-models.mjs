import fs from 'node:fs';
const out = 'D:\\lj\\inktool\\piying\\shadow-play\\models';
fs.mkdirSync(out, { recursive: true });
for (const name of ['gesture_recognizer', 'hand_landmarker']) {
  const u = `https://storage.googleapis.com/mediapipe-models/${name}/${name}/float16/1/${name}.task`;
  const r = await fetch(u);
  if (!r.ok) {
    console.log('ERR', name, r.status);
    continue;
  }
  const b = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(`${out}\\${name}.task`, b);
  console.log('ok', name, b.length);
}
