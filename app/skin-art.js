/** Hand-drawn digital leather ornaments for the two non-silhouette skins.
 * The original .woop asset remains the only shape/alpha authority.
 * Canvas artwork is decorative: it never changes rigging or story logic.
 */
const ART_CACHE = new Map();
const TWO_PI = Math.PI * 2;
const COLORS = {
  gold: '#e9bd71', cream: '#f4dbb0', teal: '#376f67', jade: '#5d9381',
  vermilion: '#b9473a', aubergine: '#743a45', dark: '#55372c',
};

function stroke(ctx, color, width, draw) {
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; draw(); ctx.stroke();
}
function blossom(ctx, x, y, r, carved, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  for (let i = 0; i < 6; i++) {
    ctx.save(); ctx.rotate(i * TWO_PI / 6);
    ctx.beginPath(); ctx.ellipse(0, -r * 0.49, r * 0.24, r * 0.34, 0, 0, TWO_PI);
    ctx.fillStyle = carved ? '#ffffff' : (i % 2 ? '#d48a52' : '#f0c77d');
    ctx.fill();
    if (!carved) { ctx.strokeStyle = '#8d4139'; ctx.lineWidth = r * 0.037; ctx.stroke(); }
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(0, 0, r * 0.17, 0, TWO_PI);
  ctx.fillStyle = carved ? '#ffffff' : '#9b3b31'; ctx.fill();
  if (!carved) {
    for (let i = 0; i < 7; i++) {
      let a = i * TWO_PI / 7;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12, Math.max(0.5,r*0.02), 0, TWO_PI);
      ctx.fillStyle = '#e9c980'; ctx.fill();
    }
  }
  ctx.restore();
}
function leaf(ctx, x, y, r, rotation, carved) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
  ctx.beginPath(); ctx.moveTo(0, r * 0.55);
  ctx.bezierCurveTo(-r * 0.52, r * 0.12, -r * 0.38, -r * 0.42, 0, -r * 0.70);
  ctx.bezierCurveTo(r * 0.42, -r * 0.35, r * 0.46, r * 0.17, 0, r * 0.55);
  ctx.fillStyle = carved ? '#fff' : COLORS.jade; ctx.fill();
  if (!carved) stroke(ctx, COLORS.gold, Math.max(0.65, r * 0.044), () => {
    ctx.moveTo(0, r * 0.52); ctx.quadraticCurveTo(r * 0.06, -r * 0.08, 0, -r * 0.64);
  });
  ctx.restore();
}
function scroll(ctx, x, y, r, carved, mirror = false) {
  ctx.save(); ctx.translate(x, y); ctx.scale(mirror ? -1 : 1, 1);
  stroke(ctx, carved ? '#fff' : COLORS.gold, Math.max(1.3, r * (carved ? .12 : .07)), () => {
    ctx.moveTo(-r * .8, r * .2);
    ctx.bezierCurveTo(-r * .1, -r * .65, r * .85, -r * .65, r * .65, r * .12);
    ctx.bezierCurveTo(r * .49, r * .67, -r * .12, r * .29, r * .12, -.04 * r);
  });
  ctx.restore();
}
function hemWaves(ctx, w, y, radius, carved) {
  const col = carved ? '#fff' : COLORS.gold;
  for (let k = 0; k < 2; k++) {
    stroke(ctx, col, carved ? 2.0 : 1.3, () => {
      const yy = y + k * radius * .56;
      for (let x = -radius; x < w + radius; x += radius * 1.68) {
        ctx.moveTo(x, yy);
        ctx.bezierCurveTo(x + radius * .4, yy - radius * .77, x + radius * 1.2, yy - radius * .77, x + radius * 1.68, yy);
      }
    });
  }
}

/** Draws editable/reproducible vector-like pattern layers onto a canvas. */
export function drawSkinArtwork(ctx, w, h, role, mode, seed = 0) {
  if (role === 'head' || role === 'hand') return;
  const carved = mode === 'carved';
  const short = Math.min(w, h);
  if (short < 25) return;
  const scale = Math.max(11, Math.min(short * .065, 45));
  const drift = (seed % 3 - 1) * scale * .15;
  // The edge zone and original alpha are protected in the shader.
  if (!carved) {
    const area = ctx.createLinearGradient(0, 0, w, h);
    area.addColorStop(0, 'rgba(247,221,168,0.04)');
    area.addColorStop(.45, 'rgba(255,206,133,0.11)');
    area.addColorStop(1, 'rgba(79,28,20,0.22)');
    ctx.fillStyle = area; ctx.fillRect(0, 0, w, h);
    // Inlaid blue-green lapels and ochre hem: dyed-layer impression, not flat color blocks.
    ctx.fillStyle = 'rgba(45,110,102,0.42)';
    ctx.beginPath(); ctx.moveTo(w*.02,h*.31); ctx.lineTo(w*.32,h*.36);
    ctx.quadraticCurveTo(w*.16,h*.54,w*.08,h*.65); ctx.lineTo(0,h*.61); ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(w*.99,h*.34);ctx.lineTo(w*.72,h*.36);
    ctx.quadraticCurveTo(w*.89,h*.54,w*.98,h*.63);ctx.closePath();ctx.fill();
    ctx.fillStyle = 'rgba(199,147,71,.38)';
    ctx.beginPath();ctx.moveTo(w*.15,h*.84);ctx.quadraticCurveTo(w*.5,h*.80,w*.84,h*.84);
    ctx.lineTo(w*.87,h*.92);ctx.quadraticCurveTo(w*.5,h*.87,w*.13,h*.92);ctx.closePath();ctx.fill();
    // Narrow collar and layered silk sashes, clipped by source silhouette later.
    stroke(ctx, COLORS.gold, Math.max(1.1, scale * .065), () => {
      ctx.moveTo(w * .08, h * .14); ctx.quadraticCurveTo(w * .5, h * .21, w * .91, h * .14);
      ctx.moveTo(w * .12, h * .81); ctx.quadraticCurveTo(w * .5, h * .72, w * .89, h * .81);
    });
  }
  // Central floral medallion: real petal-shaped cutouts, not mechanical dots.
  const flowerR = Math.min(scale * .90, Math.min(w, h) * .20);
  const flowers = role === 'arm'
    ? [[.32,.32,.80],[.73,.50,.72],[.36,.76,.64]]
    : role === 'leg'
      ? [[.25,.46,.64],[.70,.60,.72],[.45,.81,.88]]
      : [[.44,.34,.64],[.68,.57,.75],[.29,.77,.72],[.70,.81,.55]];
  for (const [fx,fy,fr] of flowers) {
    blossom(ctx, w * fx + drift, h * fy, flowerR * fr, carved, (seed % 5) * .13);
  }
  // Continuous winding stems link the carved blossoms into a textile composition.
  stroke(ctx, carved ? '#ffffff' : COLORS.gold, carved ? Math.max(1.4,scale*.07) : Math.max(.9,scale*.038), () => {
    ctx.moveTo(w*.17,h*.78);
    ctx.bezierCurveTo(w*.24,h*.57,w*.35,h*.56,w*.46,h*.44);
    ctx.bezierCurveTo(w*.60,h*.30,w*.72,h*.30,w*.82,h*.19);
    ctx.moveTo(w*.80,h*.82);
    ctx.bezierCurveTo(w*.66,h*.70,w*.64,h*.58,w*.57,h*.48);
  });
  leaf(ctx, w*.37,h*.54,scale*.54,-.66,carved);
  leaf(ctx, w*.62,h*.35,scale*.52,.51,carved);
  leaf(ctx, w*.72,h*.73,scale*.49,-.35,carved);
  // Branches and leaves flank the medallion in unequal rhythm.
  scroll(ctx, w * .25, h * .39, scale * .72, carved, false);
  scroll(ctx, w * .77, h * .58, scale * .65, carved, true);
  leaf(ctx, w * .30, h * .31, scale * .70, -.45, carved);
  leaf(ctx, w * .71, h * .75, scale * .65, .45, carved);
  // Traditional wave pattern only near robe hems / leg pieces.
  if (role === 'leg' || role === 'torso' || role === 'other') {
    hemWaves(ctx, w, h * .89, Math.max(15, scale * .77), carved);
  } else if (role === 'arm') {
    // Sleeve border should remain a border, not scattered dots.
    stroke(ctx, carved ? '#fff' : COLORS.gold, carved ? 2.3 : 1.8, () => {
      ctx.moveTo(w * .09, h * .12); ctx.quadraticCurveTo(w * .21, h * .49, w * .09, h * .87);
      ctx.moveTo(w * .91, h * .12); ctx.quadraticCurveTo(w * .80, h * .49, w * .91, h * .87);
    });
  }
  if (!carved) {
    // Thin gilding / layered thread details for painted mode.
    stroke(ctx, '#f4d5a1', Math.max(.75, scale * .026), () => {
      ctx.moveTo(w * .16, h * .17);
      ctx.bezierCurveTo(w * .26, h * .27, w * .31, h * .25, w * .39, h * .22);
      ctx.moveTo(w * .62, h * .77);
      ctx.bezierCurveTo(w * .75, h * .69, w * .81, h * .75, w * .87, h * .82);
    });
  }
}

export function createSkinArtwork(THREE, width, height, role, mode, partIndex = 0) {
  if (role === 'head' || role === 'hand' || Math.min(width, height) < 25) return null;
  if (typeof document === 'undefined') return null;
  const ratio = Math.max(.2, Math.min(5, height / Math.max(width, 1)));
  const ratioBucket = Math.round(ratio * 4) / 4;
  const seedBucket = Math.abs(partIndex) % 3;
  const key = `${role}:${mode}:${ratioBucket}:${seedBucket}`;
  if (ART_CACHE.has(key)) return ART_CACHE.get(key);
  const canvas = document.createElement('canvas');
  // 512px over the long axis keeps calligraphy crisp without exploding VRAM.
  if (ratio >= 1) {
    canvas.height = 512;
    canvas.width = Math.max(96, Math.round(512 / ratioBucket));
  } else {
    canvas.width = 512;
    canvas.height = Math.max(96, Math.round(512 * ratioBucket));
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawSkinArtwork(ctx, canvas.width, canvas.height, role, mode, seedBucket);
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.ClampToEdgeWrapping; map.wrapT = THREE.ClampToEdgeWrapping;
  map.minFilter = THREE.LinearFilter; map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = false; map.needsUpdate = true;
  ART_CACHE.set(key, map);
  return map;
}
