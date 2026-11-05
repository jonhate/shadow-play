import * as THREE from '../vendor/three/three.module.js';
import { Puppet } from './puppet.js';
import { A, buildRig, clamp } from './rig.js';

/** 舞台：正交相机 + 灯箱影幕。背景交给 CSS/SVG，WebGL 只画皮影与景片。 */
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearAlpha(0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.viewHeight = 1000;
    this.floorY = -400;
    this.camera = new THREE.OrthographicCamera(-500, 500, 500, -500, 1, 4000);
    this.camera.position.set(0, 0, 1200);
    this.camera.lookAt(0, 0, 0);

    this.puppetLayer = new THREE.Group();
    this.sceneryLayer = new THREE.Group();
    this.scene.add(this.sceneryLayer);
    this.scene.add(this.puppetLayer);

    this.puppets = [];
    this.scenery = [];
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.viewWidth = (this.viewHeight * w) / h;
    this.camera.left = -this.viewWidth / 2;
    this.camera.right = this.viewWidth / 2;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
  }

  addPuppet(woop, opts = {}) {
    const rig = buildRig(woop);
    // 用“舞台高度”换算比例：不同角色包原始像素尺寸差别很大
    const height = opts.height ?? this.viewHeight * 0.62;
    const scale = height / rig.bounds.height;
    const p = new Puppet(rig, { floorY: this.floorY, ...opts, scale });
    p.z = opts.z ?? 0;
    this.puppetLayer.add(p.group);
    this.puppets.push(p);
    return p;
  }

  /** 景片（单件资产：竹子/牡丹/拱桥…）*/
  addScenery(woop, opts = {}) {
    const rig = buildRig(woop);
    const group = new THREE.Group();
    const scale = (opts.height ?? this.viewHeight * 0.3) / rig.bounds.height;
    const tint = new THREE.Color(opts.tint ?? 0x3a2416);
    const opacity = opts.opacity ?? 0.65;
    const maxZ = Math.max(...rig.parts.map((p) => p.zIndex));
    const mats = new Map();
    for (const part of rig.parts) {
      const geo = new THREE.BufferGeometry();
      const w = part.width;
      const h = part.height;
      geo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([0, 0, 0, w, 0, 0, w, -h, 0, 0, -h, 0]), 3),
      );
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      const mat = new THREE.MeshBasicMaterial({
        map: part.texture,
        transparent: true,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
        color: tint.clone(),
        opacity,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      const F = part.rest;
      mesh.matrix.set(F.a, -F.c, 0, F.tx, -F.b, F.d, 0, -F.ty, 0, 0, 1, (part.zIndex - maxZ) * 0.02, 0, 0, 0, 1);
      mesh.renderOrder = part.zIndex;
      group.add(mesh);
      mats.set(part.id, mat);
    }
    // 网格锚点在头顶，抬一个身高让脚落在 y 上
    group.position.set(
      opts.x ?? 0,
      (opts.y ?? this.floorY) + scale * rig.bounds.height,
      opts.z ?? -60,
    );
    group.scale.set(scale * (opts.facing ?? 1), scale, 1);
    group.userData.materials = mats;
    group.userData.rig = rig;
    if (opts.flipX) group.scale.x *= -1;
    this.sceneryLayer.add(group);
    this.scenery.push(group);
    return group;
  }

  setSceneryTint(hex, opacity) {
    for (const g of this.scenery) {
      for (const mat of g.userData.materials.values()) {
        mat.color.set(hex);
        if (opacity !== undefined) mat.opacity = opacity;
      }
    }
  }

  clear() {
    for (const p of this.puppets) {
      this.puppetLayer.remove(p.group);
      disposePuppet(p);
    }
    for (const g of this.scenery) {
      this.sceneryLayer.remove(g);
      g.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
    }
    this.puppets = [];
    this.scenery = [];
  }

  removePuppet(p) {
    this.puppetLayer.remove(p.group);
    this.puppets = this.puppets.filter((x) => x !== p);
    disposePuppet(p);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  screenToStage(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const u = (clientX - r.left) / r.width;
    const v = (clientY - r.top) / r.height;
    return { x: (u - 0.5) * this.viewWidth, y: (0.5 - v) * this.viewHeight };
  }

  /**
   * 影幕（画卷）内的可行走边界：皮影**中心**允许的最大 |x|。
   * 依据是相机视野（viewWidth 映射到画布整宽）减去皮影自身半宽，
   * 这样整只皮影都在画框里，不会走出画卷。随窗口比例变化自动重算。
   */
  walkLimitFor(rigBounds, scale, pad = 26) {
    const halfW = ((rigBounds?.width || 0) * (scale || 0)) / 2;
    return Math.max(60, this.viewWidth / 2 - halfW - pad);
  }

  /** 把舞台坐标夹进影幕内部（留给手臂目标点用，避免手伸到画框外） */
  clampToScreen(x, y, pad = 18) {
    return {
      x: clamp(x, -this.viewWidth / 2 + pad, this.viewWidth / 2 - pad),
      y: clamp(y, -this.viewHeight / 2 + pad, this.viewHeight / 2 - pad),
    };
  }
}

function disposePuppet(p) {
  p.group.traverse((o) => {
    if (o.isMesh) o.geometry.dispose();
  });
  for (const o of p.partObjects.values()) o.mesh.material.dispose();
}
