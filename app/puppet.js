import * as THREE from '../vendor/three/three.module.js';
import { A, buildRig, clamp, dampAngle, evaluateRig, lerp, solveArm, wrapPi } from './rig.js';

/** 一个皮影：负责建 three 对象、把骨架矩阵贴上去、以及“执签”的手感 */
export class Puppet {
  constructor(rig, opts = {}) {
    this.rig = rig;
    this.name = rig.name;
    this.height = rig.bounds.height; // WOOP px
    this.group = new THREE.Group();
    this.group.name = `puppet:${rig.name}`;
    this.root = new THREE.Group();
    this.group.add(this.root);
    this.rodGroup = new THREE.Group();
    this.group.add(this.rodGroup);

    this.scale = opts.scale ?? 0.45;
    this.facing = 1;
    this.floorY = opts.floorY ?? -380;
    this.baseX = opts.x ?? 0;
    this.x = this.baseX;
    this.z = opts.z ?? 0;
    this.tint = new THREE.Color(opts.tint ?? 0xffffff);
    this.opacity = opts.opacity ?? 1;
    this.still = !!opts.still; // true = 完全静止（验收对照用）

    this.partObjects = new Map();
    const maxZ = Math.max(...rig.parts.map((p) => p.zIndex));
    for (const p of rig.parts) {
      const geo = quadGeometry(p.width, p.height);
      const tex = p.texture;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
        depthWrite: true,
        color: this.tint.clone(),
        opacity: this.opacity,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = p.zIndex;
      this.root.add(mesh);
      // 备用材质 A：套色（按角色染色）
      const role = partRole(rig, p.id);
      const base = new THREE.Color(PALETTE[role]);
      // 同色相邻件之间给一点点明度差，免得糊成一片
      base.multiplyScalar(0.9 + ((p.index % 5) - 2) * 0.04);
      // 脸和手不打孔（现实里皮影的脸是阳刻线，不是筛子）
      const skinNoHole = role === 'head' || role === 'hand';
      const paint = paintMaterial(tex, base, this.opacity * 0.95, [p.width, p.height], skinNoHole ? 0.12 : 1);
      // 备用材质 B：剪影 + 镂空孔（灯箱里真实皮影就是这样透光的）
      const carved = paintMaterial(tex, this.tint.clone(), this.opacity, [p.width, p.height], skinNoHole ? 0.1 : 0.62);
      this.partObjects.set(p.id, { mesh, part: p, z: (p.zIndex - maxZ) * 0.05, mat, paint, carved });
    }
    this.skin = 'silhouette';
    this.painted = false;

    this.matrices = new Map();
    this.armTargets = {
      left: { ...rig.arms.left?.wrist, active: false, grabbed: false, weight: 0, held: false },
      right: { ...rig.arms.right?.wrist, active: false, grabbed: false, weight: 0, held: false },
    };
    this.heldPose = new Map(); // 执签时记住的姿势（握拳瞬间定住）
    this.walkPhase = 0;
    this.walkAmount = 0;
    this.time = Math.random() * 10;
    this.bodyLean = 0;
    this.bodyBob = 0;
    this.headTilt = 0;
    this.bowAmount = 0; // 作揖
    this.flourishAmount = 0; // 亮相
    this.swingAmount = 0; // 甩袖
    this.wristRoll = { left: 0, right: 0 }; // 转腕（搓签）
    this.rootPose = { x: this.x, y: this.floorY, scale: this.scale };
    this._tmp = new THREE.Matrix4();

    this.rods = [rod(0x3b2410, 0.26, 3.1), rod(0x3b2410, 0.26, 3.1), rod(0x3b2410, 0.34, 3.8)];
    this.rods.forEach((r) => this.rodGroup.add(r.mesh));

    this.update(0, { idle: true });
  }

  setFacing(f) {
    this.facing = f >= 0 ? 1 : -1;
  }

  /**
   * 舞台坐标 → 骨架 rest 坐标。
   * 组原点在「头顶」（网格 y 取负），所以骨架 y 从头顶 0 往下到 height（脚）。
   * worldY = rootY + scale * (height - rigY)  =>  rigY = height - (worldY - rootY) / scale
   */
  worldToRig(x, y) {
    const s = this.rootPose.scale * this.facing;
    return {
      x: (x - this.rootPose.x) / s,
      y: this.rig.bounds.height - (y - this.rootPose.y) / this.rootPose.scale,
    };
  }

  /** rest 坐标 → 舞台坐标 */
  rigToWorld(x, y) {
    const s = this.rootPose.scale * this.facing;
    return {
      x: this.rootPose.x + x * s,
      y: this.rootPose.y + (this.rig.bounds.height - y) * this.rootPose.scale,
    };
  }

  setHandTarget(side, stagePoint, { weight = 1 } = {}) {
    const t = this.armTargets[side];
    if (!t) return;
    const r = this.worldToRig(stagePoint.x, stagePoint.y);
    t.target = r;
    t.active = true;
    t.weight = weight;
  }

  clearHandTarget(side) {
    const t = this.armTargets[side];
    if (!t) return;
    t.active = false;
  }

  /** 握拳 = 执签：把这只手定在当前姿势（只留一点呼吸），不再跟手 */
  setHeld(side, held) {
    const t = this.armTargets[side];
    if (!t) return;
    t.held = !!held;
    // 松开拳头时，从当前姿势恢复跟手（不清目标，手不会“掉下去”）
    if (!t.held && !t.active) {
      // 恢复到当前姿势作为目标，等待下一次张手
      t.target = { ...(t.target || t.smoothed || {}) };
    }
  }

  setOpacity(o) {
    this.opacity = o;
    for (const { mat, paint, carved } of this.partObjects.values()) {
      mat.opacity = o;
      paint.opacity = o * 0.95;
      carved.opacity = o;
    }
  }

  setTint(hex) {
    this.tint.set(hex);
    for (const { mat, carved } of this.partObjects.values()) {
      mat.color.copy(this.tint);
      carved.color.copy(this.tint);
    }
  }

  /**
   * 三档皮：silhouette 纯剪影 / carved 剪影+镂空 / painted 套色
   */
  setSkin(mode) {
    this.skin = mode;
    for (const o of this.partObjects.values()) {
      o.mesh.material = mode === 'painted' ? o.paint : mode === 'carved' ? o.carved : o.mat;
    }
  }

  /** 兼容旧接口 */
  setPainted(on) {
    this.setSkin(on ? 'painted' : 'silhouette');
  }

  /**
   * @param dt 秒
   * @param ctx {move: -1..1 行走意图, idle: bool, lean, freezeArms}
   */
  update(dt, ctx = {}) {
    const rig = this.rig;
    this.time += dt;
    const t = this.time;

    // ---- 位移（舞台层）
    const move = ctx.move || 0;
    this.walkAmount = lerp(this.walkAmount, Math.abs(move) > 0.08 ? 1 : 0, 1 - Math.exp(-6 * dt));
    this.walkPhase += dt * (2.6 + 2.4 * Math.abs(move)) * (this.walkAmount > 0.02 ? 1 : 0);
    this.x = clamp(this.x + move * dt * 150, -620, 620);

    // ---- 呼吸/待机（皮影挂在竹签上本来就会轻轻晃，但要慢、要小）
    const idle = ctx.idle ?? true;
    const still = this.still || !!ctx.still;
    const breathe = still ? 0 : Math.sin(t * 0.55) * (idle ? 1 : 0.3);
    this.bodyBob = lerp(
      this.bodyBob,
      still ? 0 : breathe * 4 + Math.abs(Math.sin(this.walkPhase)) * 10 * this.walkAmount,
      1 - Math.exp(-8 * dt),
    );
    // ---- 演法：作揖 / 亮相 / 甩袖（来自手上的姿态识别）
    this.bowAmount = lerp(this.bowAmount, clamp(ctx.bow || 0, 0, 1), 1 - Math.exp(-7 * dt));
    this.flourishAmount = lerp(this.flourishAmount, clamp(ctx.flourish || 0, 0, 1), 1 - Math.exp(-7 * dt));
    this.swingAmount = lerp(this.swingAmount, clamp(ctx.swing || 0, 0, 1), 1 - Math.exp(-9 * dt));

    this.bodyLean = lerp(
      this.bodyLean,
      (ctx.lean || 0) * 0.09 + move * 0.05 + this.bowAmount * 0.16,
      1 - Math.exp(-6 * dt),
    );
    this.headTilt = lerp(
      this.headTilt,
      (still ? 0 : Math.sin(t * 0.4) * 0.018) + (ctx.headTilt || 0) - this.bowAmount * 0.05 + this.flourishAmount * 0.04,
      1 - Math.exp(-5 * dt),
    );

    this.rootPose = {
      x: this.x + (ctx.offsetX || 0),
      y: this.floorY + this.bodyBob + (ctx.offsetY || 0),
      scale: this.scale * (ctx.scaleMul || 1),
    };

    // 记下上一帧的手臂角度：下面会把 theta 全部清零，阻尼必须基于“上一帧”而不是 0，
    // 否则每帧都从 0 开始阻尼，手臂永远只能转到 IK 解的百分之二十几（不跟手）。
    const prevArm = {
      left: { u: rig.arms.left ? rig.arms.left.upper.theta : 0, l: rig.arms.left ? rig.arms.left.lower.theta : 0 },
      right: { u: rig.arms.right ? rig.arms.right.upper.theta : 0, l: rig.arms.right ? rig.arms.right.lower.theta : 0 },
    };

    // 关节角初始化
    for (const p of rig.parts) p.theta = 0;

    // ---- 手臂 IK
    for (const side of ['left', 'right']) {
      const arm = rig.arms[side];
      if (!arm) continue;
      const tgt = this.armTargets[side];
      const pa = prevArm[side];
      if (tgt.held) {
        // 执签：把这只手定在握拳那一刻的姿势（只留一点呼吸），既不跟手也不下垂
        const hold = this.heldPose.get(side) || { upper: pa.u, lower: pa.l };
        const breath = Math.sin(this.time * 0.6) * 0.004;
        arm.upper.theta = dampAngle(pa.u, hold.upper + breath, dt, 10);
        arm.lower.theta = dampAngle(pa.l, hold.lower - breath, dt, 10);
        tgt.target = hold.target || tgt.target;
        tgt.smoothed = null;
      } else if (tgt.active && tgt.weight > 0.001) {
        // 演法：作揖时两手往胸前收，亮相时举得更高，甩袖时跟得更快
        let tx = tgt.target.x;
        let ty = tgt.target.y;
        if (this.bowAmount > 0.01) {
          const cx = arm.shoulder.x;
          const cy = arm.shoulder.y + arm.L1 * 0.55;
          tx += (cx - tx) * 0.4 * this.bowAmount;
          ty += (cy - ty) * 0.4 * this.bowAmount;
        }
        if (this.flourishAmount > 0.01) ty -= 110 * this.flourishAmount;
        const raw = clampToReach(arm, { x: tx, y: ty });
        // 目标点做指数逼近 + 死区：手部关键点的微抖不该传成整条胳膊的颤
        if (!tgt.smoothed) tgt.smoothed = { ...raw };
        const k = 1 - Math.exp(-12 * dt);
        const dx = raw.x - tgt.smoothed.x;
        const dy = raw.y - tgt.smoothed.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1.2) {
          const step = dist > 60 ? 1 : k; // 大位移直接跟，小抖动慢慢靠
          tgt.smoothed.x += dx * step;
          tgt.smoothed.y += dy * step;
        }
        const sol = solveArm(arm, tgt.smoothed);
        const w = clamp(tgt.weight, 0, 1);
        // 关节角再做一次阻尼，彻底吃掉逐帧抖动（以上一帧为起点）
        const spd = 16 + this.swingAmount * 16;
        arm.upper.theta = dampAngle(pa.u, wrapPi(sol.thetaUpper * w), dt, spd);
        arm.lower.theta = dampAngle(pa.l, wrapPi(sol.thetaLower * w), dt, spd);
        // 记住当前姿势：握拳的瞬间从这里开始“执签”
        this.heldPose.set(side, { upper: arm.upper.theta, lower: arm.lower.theta, target: { ...tgt.smoothed } });
      } else {
        // 自然下垂：直接回资产本身的 rest 姿势（θ=0 就是画师画好的垂手姿态），
        // 不要用 IK 去凑一个目标点——那会把袖子拧到身前。
        arm.upper.theta = dampAngle(pa.u, 0, dt, 8);
        arm.lower.theta = dampAngle(pa.l, 0, dt, 8);
        tgt.target = null;
        tgt.smoothed = null;
        this.heldPose.set(side, { upper: arm.upper.theta, lower: arm.lower.theta, target: null });
      }

      // ---- 转腕（搓签）：把手指的搓动角加到手掌部件上
      const roll = side === 'left' ? ctx.rollL : ctx.rollR;
      if (arm.hand) {
        // 限幅：真实搓签也就 ±40° 左右，别让它转成风车
        const target = roll == null ? 0 : clamp(roll, -0.7, 0.7);
        const prevRoll = this.wristRoll[side] || 0;
        const next = prevRoll + wrapPi(target - prevRoll) * (1 - Math.exp(-10 * dt));
        this.wristRoll[side] = next;
        arm.hand.theta = next;
      }
    }

    // ---- 腿：走步循环
    for (const side of ['left', 'right']) {
      const leg = rig.legs[side];
      if (!leg) continue;
      const phase = this.walkPhase + (side === 'left' ? 0 : Math.PI);
      const amp = 0.5 * this.walkAmount;
      const hip = Math.sin(phase) * amp + (still ? 0 : Math.sin(t * 0.8) * 0.004);
      const knee = Math.max(0, Math.cos(phase + 0.6)) * amp * 1.6;
      leg.upper.theta = hip;
      leg.lower.theta = -knee;
    }

    // ---- 躯干/头
    if (rig.torsoPart) rig.torsoPart.theta = this.bodyLean;
    if (rig.headPart) rig.headPart.theta = this.headTilt;

    // ---- 求世界矩阵并贴到 mesh
    evaluateRig(rig, this.matrices);
    for (const [id, obj] of this.partObjects) {
      const rec = this.matrices.get(id);
      if (!rec) continue;
      const F = rec.F;
      this._tmp.set(
        F.a, -F.c, 0, F.tx,
        -F.b, F.d, 0, -F.ty,
        0, 0, 1, obj.z,
        0, 0, 0, 1,
      );
      obj.mesh.matrix.copy(this._tmp);
      obj.mesh.matrixWorldNeedsUpdate = true;
    }

    // ---- 竹签
    this.updateRods(ctx);

    // ---- 组变换
    // 网格空间的锚点在“头顶”（WOOP 的 y 向下，网格 y 取负），脚在 -height 处，
    // 所以把组整体抬高一个身高，脚才落在台面上。
    this.group.position.set(
      this.rootPose.x,
      this.rootPose.y + this.rootPose.scale * this.rig.bounds.height,
      this.z,
    );
    this.group.scale.set(this.rootPose.scale * this.facing, this.rootPose.scale, 1);
  }

  updateRods(ctx) {
    const show = ctx.rods !== false;
    this.rodGroup.visible = show;
    if (!show) return;

    const posed = (partId, restPoint) => {
      const rec = this.matrices.get(partId);
      if (!rec || !restPoint) return null;
      const p = A.apply(rec.T, restPoint.x, restPoint.y);
      return { x: p.x, y: -p.y };
    };

    const rig = this.rig;
    const pts = [];
    pts.push(rig.arms.left ? posed(rig.arms.left.lower.id, rig.arms.left.wrist) : null);
    pts.push(rig.arms.right ? posed(rig.arms.right.lower.id, rig.arms.right.wrist) : null);
    const torso = rig.torsoPart;
    pts.push(torso ? posed(torso.id, A.apply(torso.rest, torso.width / 2, torso.height * 0.15)) : null);

    const bottomY = -this.height * 1.02;
    for (let i = 0; i < 3; i += 1) {
      const stick = this.rods[i];
      const p = pts[i];
      if (!p) {
        stick.mesh.visible = false;
        continue;
      }
      // 只在“执签”（握拳）时画竹签，避免穿帮在部件接缝里透线
      stick.mesh.visible = i < 2 && !!this.armTargets[i === 0 ? 'left' : 'right']?.held;
      // 竹签：从手（或颈）向下斜伸到台面下方，做成细长四边形，线宽可控
      const sway = i === 0 ? 150 : i === 1 ? -150 : -40;
      const ax = p.x;
      const ay = p.y;
      const bx = p.x + sway;
      const by = bottomY;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * stick.half;
      const ny = (dx / len) * stick.half;
      const arr = stick.mesh.geometry.attributes.position.array;
      arr[0] = ax + nx; arr[1] = ay + ny; arr[2] = 0;
      arr[3] = ax - nx; arr[4] = ay - ny; arr[5] = 0;
      arr[6] = bx - nx * 0.7; arr[7] = by - ny * 0.7; arr[8] = 0;
      arr[9] = bx + nx * 0.7; arr[10] = by + ny * 0.7; arr[11] = 0;
      stick.mesh.geometry.attributes.position.needsUpdate = true;
    }
  }
}

function clampToReach(arm, target) {
  const dx = target.x - arm.shoulder.x;
  const dy = target.y - arm.shoulder.y;
  const d = Math.hypot(dx, dy);
  // 只用到臂展的 94%：肘关节永远留一点弯。
  // 顶到 100% 时（手臂完全伸直）是 IK 奇异点，目标点抖一两像素、
  // 整条胳膊就会甩十几度——这正是以前“一颤一颤”的来源。
  const max = (arm.L1 + arm.L2) * 0.94;
  const min = Math.abs(arm.L1 - arm.L2) + 2;
  if (d <= max && d >= min) return target;
  const k = clamp(d, min, max) / (d || 1);
  return { x: arm.shoulder.x + dx * k, y: arm.shoulder.y + dy * k };
}

function quadGeometry(w, h) {
  const g = new THREE.BufferGeometry();
  const positions = new Float32Array([0, 0, 0, w, 0, 0, w, -h, 0, 0, -h, 0]);
  const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------
   剪纸套色 / 彩绘皮影
   官方资产的部件贴图是纯黑剪影（RGB 全 0），直接乘颜色还是黑。
   所以染色材质在 shader 里把 map 只当 alpha 用，RGB 交给 material.color，
   这样同一套骨骼既能演“灯箱剪影”，也能一键变成“套色皮影”。
   ------------------------------------------------------------------ */

const PALETTE = {
  head: 0xd9a066, // 暖白偏赭（脸与手）
  hand: 0xd9a066,
  torso: 0xb02a1a, // 朱红
  arm: 0x1f6b52, // 石绿
  leg: 0x172238, // 墨蓝
  other: 0x8a4f24, // 皮黄
};

function partRole(rig, partId) {
  // 注意：rig.roles 已经被 resolveRoles 重排成 { head, torso, arms:{left:{upper,lower,hand}}, legs:{...} }
  const r = rig.roles || {};
  const is = (v) => !!v && v === partId;
  if (is(r.head)) return 'head';
  if (is(r.torso) || is(r.lowerTorso)) return 'torso';
  for (const side of ['left', 'right']) {
    const arm = r.arms && r.arms[side];
    if (arm) {
      if (is(arm.upper) || is(arm.lower)) return 'arm';
      if (is(arm.hand)) return 'hand';
    }
    const leg = r.legs && r.legs[side];
    if (leg && (is(leg.upper) || is(leg.lower))) return 'leg';
  }
  return 'other';
}

function paintMaterial(tex, color, opacity = 1, size = null, holeScale = 1) {
  const m = new THREE.MeshBasicMaterial({
    map: tex,
    color,
    transparent: true,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    depthWrite: true,
    opacity,
  });
  m.userData.uSize = { value: new THREE.Vector2(size ? size[0] : 200, size ? size[1] : 200) };
  m.userData.uHoles = { value: holeScale };
  m.userData.uInk = { value: 0.34 };
  m.userData.uCarve = { value: 0.33 };
  m.userData.uHoles = { value: holeScale };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSize = m.userData.uSize;
    shader.uniforms.uInk = m.userData.uInk;
    shader.uniforms.uCarve = m.userData.uCarve;
    shader.uniforms.uHoles = m.userData.uHoles;
    shader.fragmentShader = [
      'uniform vec2 uSize;',
      'uniform float uInk;',
      'uniform float uCarve;',
      'uniform float uHoles;',
      shader.fragmentShader,
    ].join('\n');
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      [
        '#ifdef USE_MAP',
        '  // 只取剪影 alpha，RGB 用 material.color',
        '  float maskA = texture2D( map, vMapUv ).a;',
        '  // 在“部件像素空间”里画纹样：不同部件间疏密一致，不随缩放变形',
        '  vec2 pp = vMapUv * uSize;',
        '  // 雕刻孔：皮影最常见的就是一排排小眼，透过去是亮的（只上在衣袍上）',
        '  float dotGrid = abs(sin(pp.x * 0.055)) * abs(sin(pp.y * 0.055));',
        '  float holes = smoothstep(0.93, 0.999, dotGrid) * uHoles;',
        '  // 斜向细纹：皮革的刀口感，压得很淡，只当质感',
        '  float hatch = smoothstep(0.90, 1.0, abs(sin((pp.x * 0.8 + pp.y * 1.6) * 0.045)));',
        '  // 大尺度云纹：极细的一条阳刻线',
        '  float cloud = 0.5 + 0.5 * sin(pp.y * 0.019 + sin(pp.x * 0.009) * 2.4);',
        '  float lineCloud = smoothstep(0.972, 0.999, cloud);',
        '  float ink = clamp(max(lineCloud * 0.66, hatch * 0.28), 0.0, 1.0);',
        '  diffuseColor.rgb *= mix(1.0, 1.0 - uInk, ink);',
        '  maskA *= mix(1.0, 1.0 - uCarve, holes);',
        '  diffuseColor.a *= maskA;',
        '#endif',
      ].join('\n'),
    );
  };
  m.customProgramCacheKey = () => 'woop-paint-v4';
  return m;
}

function rod(color, opacity, half = 2.4) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.matrixAutoUpdate = false;
  mesh.position.z = -1.2; // 竹签在皮影后面
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  mesh.updateMatrix();
  return { mesh, half };
}
