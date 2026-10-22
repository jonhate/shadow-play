/**
 * 皮影骨架：2D 仿射（WOOP 坐标系 X 右 / Y 下）+ 关节链 + 双骨 IK。
 * 纯数学，不碰 three，方便单测。
 */

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrapPi = (a) => {
  let x = a;
  while (x > Math.PI) x -= TAU;
  while (x < -Math.PI) x += TAU;
  return x;
};

/** 仿射矩阵 {a,b,c,d,tx,ty}，作用：x' = a*x + c*y + tx ; y' = b*x + d*y + ty */
export const A = {
  identity: () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }),
  from: (m) => ({ a: m[0], b: m[1], c: m[2], d: m[3], tx: m[4] ?? 0, ty: m[5] ?? 0 }),
  apply: (M, x, y) => ({ x: M.a * x + M.c * y + M.tx, y: M.b * x + M.d * y + M.ty }),
  /** A ∘ B —— 先 B 后 A */
  mul: (P, Q) => ({
    a: P.a * Q.a + P.c * Q.b,
    b: P.b * Q.a + P.d * Q.b,
    c: P.a * Q.c + P.c * Q.d,
    d: P.b * Q.c + P.d * Q.d,
    tx: P.a * Q.tx + P.c * Q.ty + P.tx,
    ty: P.b * Q.tx + P.d * Q.ty + P.ty,
  }),
  /** 绕点 (px,py) 旋转 theta */
  rotateAbout: (theta, px, py) => {
    const cs = Math.cos(theta);
    const sn = Math.sin(theta);
    return {
      a: cs,
      b: sn,
      c: -sn,
      d: cs,
      tx: px - (cs * px - sn * py),
      ty: py - (sn * px + cs * py),
    };
  },
  translate: (dx, dy) => ({ a: 1, b: 0, c: 0, d: 1, tx: dx, ty: dy }),
  scale: (s) => ({ a: s, b: 0, c: 0, d: s, tx: 0, ty: 0 }),
  /** 绕点旋转 + 位移修正 */
};

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const angleOf = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

/** 语义角色 → 部位 id 映射，兼容 character / animal 两套 roles 命名 */
function resolveRoles(rig) {
  const r = rig.roles || {};
  const ids = new Set(rig.parts.map((p) => p.id));
  const pick = (...names) => {
    for (const n of names) {
      const v = r[n];
      if (typeof v === 'string' && ids.has(v)) return v;
    }
    return null;
  };
  const torso = pick('torso', 'upperTorso', 'upper_torso', 'body', 'lowerTorso');
  const arm = (side) => {
    const cap = side === 'left' ? 'left' : 'right';
    return {
      upper: pick(`${cap}UpperArm`, `${cap}_upper_arm`),
      lower: pick(`${cap}LowerArm`, `${cap}_lower_arm`),
      hand: pick(`${cap}Hand`, `${cap}_hand`),
    };
  };
  const leg = (side) => {
    const cap = side === 'left' ? 'left' : 'right';
    return {
      upper: pick(`${cap}UpperLeg`, `${cap}_upper_leg`, `${cap}Leg`, `${cap}_leg`),
      lower: pick(`${cap}LowerLeg`, `${cap}_lower_leg`),
    };
  };
  return {
    head: pick('head'),
    torso,
    lowerTorso: pick('lowerTorso', 'lower_torso'),
    arms: { left: arm('left'), right: arm('right') },
    legs: { left: leg('left'), right: leg('right') },
    limbs: Array.isArray(r.limbs) ? r.limbs.filter((id) => ids.has(id)) : [],
  };
}

function detectChainsByTopology(rig) {
  // 角色包没有 roles 时的兜底：按关节树深度认手臂/腿
  const kids = new Map();
  for (const j of rig.joints) {
    if (!kids.has(j.parentPart)) kids.set(j.parentPart, []);
    kids.get(j.parentPart).push(j.childPart);
  }
  const roots = rig.parts.filter((p) => !rig.joints.some((j) => j.childPart === p.id));
  const depth = new Map();
  const walk = (id, d) => {
    depth.set(id, d);
    for (const k of kids.get(id) || []) walk(k, d + 1);
  };
  roots.forEach((p) => walk(p.id, 0));
  const trunk = [...depth.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] || null;
  return { trunk, kids, depth };
}

/**
 * 构建可驱动的骨架。
 * 结果里每个 part 带 parent / pivot（rest 空间里的世界坐标）/ rest 矩阵 / 链信息。
 */
export function buildRig(woop) {
  const parts = woop.parts.map((p) => ({
    ...p,
    rest: A.from(p.matrix),
  }));
  const byId = new Map(parts.map((p) => [p.id, p]));

  // 关节 → 父子关系与枢轴点
  const jointOfChild = new Map();
  for (const j of woop.joints) {
    const parent = byId.get(j.parentPart);
    const child = byId.get(j.childPart);
    if (!parent || !child) continue;
    const parentAnchor = parent.anchors.get(j.parentAnchor);
    const childAnchor = child.anchors.get(j.childAnchor);
    if (!parentAnchor) {
      console.warn('[rig] 父锚点缺失', j.id);
      continue;
    }
    const pivot = A.apply(parent.rest, parentAnchor[0], parentAnchor[1]);
    jointOfChild.set(child.id, {
      joint: j,
      parentId: parent.id,
      pivot,
      parentAnchor,
      childAnchor,
    });
    // 若子件锚点与枢轴不重合，做一次极小的缝合，避免关节处开裂
    if (childAnchor) {
      const cw = A.apply(child.rest, childAnchor[0], childAnchor[1]);
      const dx = pivot.x - cw.x;
      const dy = pivot.y - cw.y;
      const gap = Math.hypot(dx, dy);
      if (gap > 0.01 && gap < 60) {
        child.rest = { ...child.rest, tx: child.rest.tx + dx, ty: child.rest.ty + dy };
        child.seam = gap;
      }
    }
  }

  for (const p of parts) {
    const rec = jointOfChild.get(p.id);
    p.parentId = rec ? rec.parentId : null;
    p.pivot = rec ? rec.pivot : { x: 0, y: 0 };
    p.theta = 0; // 当前关节角（相对 rest）
    p.thetaTarget = 0;
  }

  // 拓扑排序（保证父级先算）
  const order = [];
  const seen = new Set();
  const visit = (p) => {
    if (seen.has(p.id)) return;
    if (p.parentId && !seen.has(p.parentId)) visit(byId.get(p.parentId));
    seen.add(p.id);
    order.push(p);
  };
  parts.forEach(visit);

  const roles = resolveRoles(woop);
  const topo = detectChainsByTopology({ parts, joints: woop.joints });

  // 归一化：脚底中点 → 原点，方便摆到台面上
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of parts) {
    for (const [cx, cy] of [
      [0, 0],
      [p.width, 0],
      [p.width, p.height],
      [0, p.height],
    ]) {
      const w = A.apply(p.rest, cx, cy);
      minX = Math.min(minX, w.x);
      minY = Math.min(minY, w.y);
      maxX = Math.max(maxX, w.x);
      maxY = Math.max(maxY, w.y);
    }
  }
  const offset = A.translate(-(minX + maxX) / 2, -minY);
  for (const p of parts) p.rest = A.mul(offset, p.rest);
  for (const p of parts) {
    if (p.pivot) p.pivot = A.apply(offset, p.pivot.x, p.pivot.y);
  }
  const normWidth = maxX - minX;
  const normHeight = maxY - minY;

  const rig = {
    ...woop,
    parts,
    byId,
    order,
    roles,
    topo,
    // 归一化之后：脚底中点为原点；WOOP 的 y 向下，所以身高占 [−height, 0]
    bounds: {
      width: normWidth,
      height: normHeight,
      minX: -normWidth / 2,
      maxX: normWidth / 2,
      minY: -normHeight,
      maxY: 0,
    },
    arms: {},
    legs: {},
    headPart: roles.head ? byId.get(roles.head) : null,
    torsoPart: roles.torso ? byId.get(roles.torso) : topo.trunk ? byId.get(topo.trunk) : null,
  };

  for (const side of ['left', 'right']) {
    rig.arms[side] = buildArmChain(rig, roles.arms[side]);
    rig.legs[side] = buildLegChain(rig, roles.legs[side]);
  }
  return rig;
}

function buildArmChain(rig, spec) {
  const { byId } = rig;
  const upper = spec.upper && byId.get(spec.upper);
  const lower = spec.lower && byId.get(spec.lower);
  const hand = spec.hand && byId.get(spec.hand);
  if (!upper || !lower) return null;
  const shoulder = upper.pivot; // 上臂的关节枢轴 = 肩
  const elbow = lower.pivot; // 小臂的关节枢轴 = 肘
  const wrist = hand ? hand.pivot : elbow;
  const L1 = dist(shoulder, elbow);
  const L2 = hand ? dist(elbow, wrist) : dist(elbow, wrist);
  if (!(L1 > 1 && L2 > 1)) return null;
  const restUpper = angleOf(shoulder, elbow);
  const restLower = angleOf(elbow, wrist);
  const bend = Math.sign(cross(elbow.x - shoulder.x, elbow.y - shoulder.y, wrist.x - elbow.x, wrist.y - elbow.y)) || 1;
  return {
    side: spec,
    upper,
    lower,
    hand,
    shoulder,
    elbow,
    wrist,
    L1,
    L2,
    restUpper,
    restLower,
    bend,
    reach: L1 + L2,
    target: { ...wrist },
    smoothed: { ...wrist },
  };
}

function buildLegChain(rig, spec) {
  const { byId } = rig;
  const upper = spec.upper && byId.get(spec.upper);
  const lower = spec.lower && byId.get(spec.lower);
  if (!upper || !lower) return null;
  const hip = upper.pivot;
  const knee = lower.pivot;
  const ankle = A.apply(lower.rest, lower.width / 2, lower.height);
  const L1 = dist(hip, knee);
  const L2 = dist(knee, ankle);
  if (!(L1 > 1 && L2 > 1)) return null;
  return {
    upper,
    lower,
    hip,
    knee,
    L1,
    L2,
    restUpper: angleOf(hip, knee),
    restLower: angleOf(knee, ankle),
  };
}

/**
 * 双骨 IK：给定手腕在 rest 空间的目标点，解出上臂/小臂关节角。
 */
export function solveArm(arm, target) {
  const { shoulder, L1, L2, restUpper, restLower, bend } = arm;
  let dx = target.x - shoulder.x;
  let dy = target.y - shoulder.y;
  let d = Math.hypot(dx, dy);
  if (d < 1e-4) {
    dx = 0;
    dy = 1;
    d = 1e-4;
  }
  const maxReach = (L1 + L2) * 0.999;
  const minReach = Math.abs(L1 - L2) + 1;
  const dc = clamp(d, minReach, maxReach);
  const dir = Math.atan2(dy, dx);
  const cosA = clamp((dc * dc + L1 * L1 - L2 * L2) / (2 * dc * L1), -1, 1);
  const a = Math.acos(cosA);
  const thetaUpper = wrapPi(dir + bend * a - restUpper);
  const ex = shoulder.x + L1 * Math.cos(restUpper + thetaUpper);
  const ey = shoulder.y + L1 * Math.sin(restUpper + thetaUpper);
  const finalLower = Math.atan2(target.y - ey, target.x - ex);
  const thetaLower = wrapPi(finalLower - restLower) - thetaUpper;
  return { thetaUpper: wrapPi(thetaUpper), thetaLower: wrapPi(thetaLower) };
}

/** 求当前各件世界矩阵：F = T ∘ rest */
export function evaluateRig(rig, out = new Map()) {
  for (const p of rig.order) {
    let T = A.identity();
    if (p.parentId) {
      const parentT = out.get(p.parentId)?.T || A.identity();
      T = p.theta ? A.mul(parentT, A.rotateAbout(p.theta, p.pivot.x, p.pivot.y)) : parentT;
    }
    const F = A.mul(T, p.rest);
    out.set(p.id, { T, F });
  }
  return out;
}

/** 关节角阻尼，帧率无关 */
export function dampAngle(current, target, dt, speed = 14) {
  const diff = wrapPi(target - current);
  const k = 1 - Math.exp(-speed * dt);
  return wrapPi(current + diff * k);
}
