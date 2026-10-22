import { unzipSync, strFromU8 } from '../vendor/fflate/fflate.mjs';
import * as THREE from '../vendor/three/three.module.js';

/**
 * WOOP 是 Woooo Piying Lab 的角色包格式：一个 zip，内含 woop.json + parts/<id>/00.webp。
 * 这里只做“读”和“摆”：不依赖 Blender，浏览器里直接解析。
 */

const MIME_BY_EXT = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
};

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

function normPath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
}

function findMember(files, wanted) {
  if (!wanted) return null;
  const want = normPath(wanted);
  return Object.keys(files).find((n) => normPath(n) === want) || null;
}

function resolveImageMember(files, manifest, part) {
  const id = String(part.id);
  const assetPaths = manifest.assetPaths || manifest.asset_paths;
  const bundles = manifest.partAssets || manifest.part_assets;

  // 1) partAssets[id].items[defaultAssetId].path
  const bundle = bundles && bundles[id];
  if (bundle && bundle.items) {
    const def = bundle.defaultAssetId || bundle.default_asset_id;
    const item = bundle.items[def] || Object.values(bundle.items)[0];
    const hit = item && findMember(files, item.path || item.file);
    if (hit) return hit;
  }
  // 2) manifest.assetPaths[id]
  let explicit = assetPaths && assetPaths[id];
  if (explicit && typeof explicit === 'object') explicit = explicit.path || explicit.file || explicit.src || explicit.url;
  explicit = explicit || part.image || part.path;
  {
    const hit = findMember(files, explicit);
    if (hit) return hit;
  }
  // 3) parts/<id>/00.webp 约定
  const prefix = normPath(`parts/${id}/`);
  const byPrefix = Object.keys(files).find(
    (n) => normPath(n).startsWith(prefix) && MIME_BY_EXT[extOf(n)],
  );
  if (byPrefix) return byPrefix;
  // 4) 文件名以 part id 结尾
  return (
    Object.keys(files).find((n) => {
      if (!MIME_BY_EXT[extOf(n)]) return false;
      const stem = normPath(n).split('/').pop().replace(/\.[^.]+$/, '');
      return stem === normPath(id) || stem.endsWith(normPath(id));
    }) || null
  );
}

async function textureFromBytes(bytes, mime) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    const tex = await new THREE.TextureLoader().loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function anchorsOf(part) {
  const map = new Map();
  for (const a of part.anchors || []) {
    const px = a.partPx || a.part_px || [0, 0];
    map.set(String(a.id), [Number(px[0]), Number(px[1])]);
  }
  return map;
}

function manifestValue(obj, ...names) {
  for (const n of names) if (obj && obj[n] !== undefined && obj[n] !== null) return obj[n];
  return undefined;
}

export async function loadWoop(url, meta = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`无法读取皮影包：${url}（HTTP ${res.status}）`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));

  const manifestName =
    Object.keys(files).find((n) => normPath(n).endsWith('woop.json')) ||
    Object.keys(files).find((n) => n.toLowerCase().endsWith('.json'));
  if (!manifestName) throw new Error(`皮影包缺少 woop.json：${url}`);
  const manifest = JSON.parse(strFromU8(files[manifestName]));

  const rawParts = manifestValue(manifest, 'parts', 'layers', 'nodes') || [];
  const rawJoints = manifestValue(manifest, 'joints', 'connections', 'links') || [];
  const partAssets = manifest.partAssets || manifest.part_assets || {};

  const parts = [];
  for (let i = 0; i < rawParts.length; i += 1) {
    const p = rawParts[i];
    const id = String(p.id ?? p.partId ?? `part_${i + 1}`);
    const rest = p.rest || {};
    const matrix = (rest.matrix || p.matrix || [1, 0, 0, 1, 0, 0]).map(Number);
    const asset = partAssets[id] && partAssets[id].items
      ? partAssets[id].items[partAssets[id].defaultAssetId] || Object.values(partAssets[id].items)[0]
      : null;

    const member = resolveImageMember(files, manifest, { ...p, id });
    if (!member) {
      console.warn('[woop] 缺少贴图，跳过部件', id);
      continue;
    }
    const mime = MIME_BY_EXT[extOf(member)] || 'image/webp';
    const texture = await textureFromBytes(files[member], mime);
    const image = texture.image;
    const width = Number(p.width || asset?.width || image.width || 1);
    const height = Number(p.height || asset?.height || image.height || 1);

    parts.push({
      id,
      index: i,
      width,
      height,
      matrix,
      zIndex: Number(manifestValue(rest, 'zIndex', 'z_index') ?? i),
      anchors: anchorsOf(p),
      texture,
    });
  }

  const joints = rawJoints
    .map((j, i) => ({
      id: String(j.id ?? `joint_${i + 1}`),
      parentPart: String(j.parent?.partId ?? j.parent?.part_id ?? ''),
      parentAnchor: String(j.parent?.anchorId ?? j.parent?.anchor_id ?? ''),
      childPart: String(j.child?.partId ?? j.child?.part_id ?? ''),
      childAnchor: String(j.child?.anchorId ?? j.child?.anchor_id ?? ''),
      limits: j.limitsDeg || j.limits_deg || null,
    }))
    .filter((j) => parts.some((p) => p.id === j.childPart) && parts.some((p) => p.id === j.parentPart));

  const semantic = manifest.rigSemantics || manifest.rig_semantics || {};
  const roles = semantic.roles || {};

  return {
    url,
    name: meta.name || manifest.displayName || manifest.metadata?.displayName || url.split('/').pop(),
    meta,
    category: (manifest.metadata || {}).category || meta.category || 'unknown',
    roles,
    parts,
    joints,
    manifest,
  };
}
