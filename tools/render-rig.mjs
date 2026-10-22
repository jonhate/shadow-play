/**
 * 离线校验：用 rig.js 的同款数学摆一个姿势，把每个部件的仿射矩阵导出，
 * 交给 Python/Pillow 合成 PNG，用来肉眼验证骨架装配与 IK 是否正确。
 */
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'file:///D:/lj/inktool/piying/shadow-play/vendor/fflate/fflate.mjs';
import { buildRig, evaluateRig, solveArm, A } from 'file:///D:/lj/inktool/piying/shadow-play/app/rig.js';

const root = 'D:\\lj\\inktool\\piying\\shadow-play';
const file = process.argv[2] || path.join(root, 'puppets', 'woop_import_bc989d9f56f94f4295aa755f620414fe.woop');
const outDir = path.join(root, 'shots', 'rig');
fs.mkdirSync(outDir, { recursive: true });

const files = unzipSync(new Uint8Array(fs.readFileSync(file)));
const manifest = JSON.parse(strFromU8(files[Object.keys(files).find((n) => n.endsWith('woop.json'))]));

const parts = [];
for (const p of manifest.parts) {
  const id = String(p.id);
  const bundle = manifest.partAssets?.[id];
  const member = bundle?.items?.[bundle.defaultAssetId]?.path || `parts/${id}/00.webp`;
  const anchors = new Map((p.anchors || []).map((a) => [String(a.id), a.partPx]));
  const bytes = files[member];
  const outImg = path.join(outDir, `${id}.webp`);
  fs.writeFileSync(outImg, bytes);
  parts.push({
    id,
    width: Number(p.width),
    height: Number(p.height),
    matrix: p.rest.matrix,
    zIndex: Number(p.rest.zIndex ?? 0),
    anchors,
    image: outImg,
  });
}
const joints = manifest.joints.map((j) => ({
  id: j.id,
  parentPart: j.parent.partId,
  parentAnchor: j.parent.anchorId,
  childPart: j.child.partId,
  childAnchor: j.child.anchorId,
}));

const rig = buildRig({ name: 'test', parts, joints, roles: manifest.rigSemantics.roles, manifest });
console.log('bounds', rig.bounds);
for (const side of ['left', 'right']) {
  const a = rig.arms[side];
  console.log(side, a ? { L1: a.L1.toFixed(1), L2: a.L2.toFixed(1), bend: a.bend, rest: [a.restUpper.toFixed(3), a.restLower.toFixed(3)] } : 'none');
}

// 姿势：双手抬起（模拟用户双手）
const armL = rig.arms.left;
const armR = rig.arms.right;
const poses = {
  rest: null,
  hands: {
    left: { x: armL.wrist.x - 120, y: armL.wrist.y - 420 },
    right: { x: armR.wrist.x + 120, y: armR.wrist.y - 420 },
  },
};

const report = { file, bounds: rig.bounds, poses: {} };
for (const [name, pose] of Object.entries(poses)) {
  for (const p of rig.parts) p.theta = 0;
  if (pose) {
    for (const side of ['left', 'right']) {
      const arm = rig.arms[side];
      const t = pose[side];
      const sol = solveArm(arm, t);
      arm.upper.theta = sol.thetaUpper;
      arm.lower.theta = sol.thetaLower;
      console.log(name, side, 'target', t, 'angles', sol);
    }
  }
  const mats = evaluateRig(rig, new Map());
  const list = [];
  for (const p of rig.parts) {
    const F = mats.get(p.id).F;
    const origin = A.apply(F, 0, 0);
    const bottom = A.apply(F, p.width, p.height);
    list.push({
      id: p.id,
      image: p.image,
      w: p.width,
      h: p.height,
      matrix: [F.a, F.b, F.c, F.d, F.tx, F.ty],
      zIndex: p.zIndex,
      origin: [origin.x, origin.y],
      corner: [bottom.x, bottom.y],
    });
  }
  report.poses[name] = list;
}

const reportPath = path.join(outDir, 'pose.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log('wrote', reportPath);
