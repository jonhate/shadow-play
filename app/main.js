import { loadWoop } from './woop.js?release=art36-20261124b';
import { Stage } from './stage.js?release=art36-20261124d';
import { GestureInput } from './gesture.js';
import { createModelLoader } from './model-loader.js';
import { Show, STATE, SCENES } from './show.js?release=art36-20261124b';
import { UI } from './ui.js';
import { Audio } from './audio.js';

const params = new URLSearchParams(location.search);
const isKiosk = params.get('kiosk') === '1';

// 展馆模式：藏起鼠标、屏蔽右键菜单、出错自动重载
if (isKiosk) {
  document.body.classList.add('kiosk');
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (['F5', 'F11', 'F12'].includes(e.key)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) e.preventDefault();
  });
  const reloadLater = () => setTimeout(() => location.reload(), 4000);
  window.addEventListener('error', (e) => {
    console.error('[kiosk] 未捕获错误', e.error || e.message);
    if (e.target && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK')) reloadLater();
  });
  window.addEventListener('unhandledrejection', (e) => console.error('[kiosk] 未处理拒绝', e.reason));
  // 自动全屏（需要一次用户手势）
  const fs = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    window.removeEventListener('pointerdown', fs);
    window.removeEventListener('keydown', fs);
  };
  window.addEventListener('pointerdown', fs);
  window.addEventListener('keydown', fs);
}

async function boot() {
  const ui = new UI();
  const audio = new Audio();
  const stage = new Stage(document.getElementById('gl'));
  const video = document.getElementById('cam');
  // ?duo=1 允许同屏 4 只手（两位观众各站一边）
  const duo = params.get('duo') === '1';
  const gesture = new GestureInput(video, { numHands: duo ? 4 : 2 });

  // ---- 资源前缀：把"大文件"（皮影/模型/wasm）放到国内能跑满速的 CDN 上，
  // 页面本身仍然在 GitHub Pages，评委点的网址一个字都不用改。
  //
  // 默认源 = jsDelivr 对素材镜像仓库 jonhate/shadow-play-assets 的加速域名。
  // 为什么另建一个仓库：jsDelivr 对 gh 仓库有「整包 50MB」上限，主仓库 130MB 会直接 403。
  // 实测（2026-11-21，本机国内直连）：手势模型 8.4MB 2.8MB/s、wasm 13.5MB 3.0MB/s，
  // 而同一个文件走 GitHub Pages 只有 6–38KB/s——差两个数量级。
  //
  // 换成自己的 OSS/COS 就改这一行（结尾不要带斜杠）；
  // 临时验证用 ?assets=https://... 覆盖，?assets=0 强制走同源。
  const ASSET_BASE_DEFAULT = 'https://cdn.jsdelivr.net/gh/jonhate/shadow-play-assets@main';
  const assetsParam = params.get('assets');
  let ASSET_BASE =
    assetsParam === '0' ? '' : assetsParam ? assetsParam.replace(/\/$/, '') : ASSET_BASE_DEFAULT;
  const assetUrl = (p) => (ASSET_BASE ? `${ASSET_BASE}/${String(p).replace(/^\.?\//, '')}` : `./${String(p).replace(/^\.?\//, '')}`);
  // 回退是静默的：不把"资源到底来自哪个源"记下来，就会误以为加速生效了
  // （水墨金陵梦踩过同一个坑）。诊断面板与 window.SHADOWPLAY.assetSource 都能看到。
  let assetFellBack = false;
  const assetSource = () => (ASSET_BASE ? ASSET_BASE : assetFellBack ? '同源（CDN 不可用，已回退）' : '同源');

  // 出目美术包（每出戏专属皮影 × silhouette/carved/painted 三档贴图）另放一个镜像仓库：
  // 单包 2–8MB，走 GitHub Pages 国内直连实测 2–10KB/s（8MB 要几十分钟），只能走 jsDelivr。
  // 取不到就依次退同源、退「本出目没有美术包」（用基础皮影照常演）——美术包永远不许把演卡死。
  // ?art=<url> 可临时换源，?art=0 强制走同源。
  const ART_BASE_DEFAULT = 'https://cdn.jsdelivr.net/gh/jonhate/shadow-play-art@main';
  const artParam = params.get('art');
  let ART_BASE = artParam === '0' ? '' : artParam ? artParam.replace(/\/$/, '') : ART_BASE_DEFAULT;
  const artSource = () => (ART_BASE ? ART_BASE : '同源');

  // 资源索引：优先走 ASSET_BASE（国内存储/CDN）；连不上或没配 CORS 就自动回退同源，
  // 绝不因为"加速"把整站搞成白屏。
  // 必须带超时：CDN 被墙时的典型表现不是快速报错，而是长时间挂起（DNS 卡住或
  // 代理无响应），不设上限页面会一直停在"正在请出皮影…"。实测挂死超过 30 秒。
  const fetchWithTimeout = async (url, ms = 8000) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      return await fetch(url, { signal: ctl.signal });
    } finally {
      clearTimeout(timer);
    }
  };
  let catalog;
  try {
    const r = await fetchWithTimeout(assetUrl('puppets/index.json?release=art36-20261124b'));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    catalog = await r.json();
  } catch (err) {
    if (!ASSET_BASE) throw err;
    console.warn('[boot] 资源前缀不可用，回退同源（检查 CDN/对象存储的 CORS 是否允许本站）', err);
    ASSET_BASE = '';
    assetFellBack = true;
    catalog = await fetch('./puppets/index.json?release=art36-20261124b').then((r) => r.json());
  }
  // The CDN may still publish an older catalog. Artwork annotations belong to
  // this application release, while the legacy large files can keep using CDN.
  const artworkCatalog = ASSET_BASE
    ? await fetchWithTimeout('./puppets/index.json?release=art36-20261124b').then(response => {
      if (!response.ok) throw new Error(`美术索引读取失败（HTTP ${response.status}）`);
      return response.json();
    }) : catalog;
  const sceneArtById = new Map(artworkCatalog.map(item => [item.id, item.sceneArt || {}]));
  // 出目包的三条硬规矩（都是踩过的坑）：
  //  ① 取不到不许把演卡死：最多等 ART_WAIT_BUDGET，到点先演基础皮影；
  //  ② 到点之后下载不取消：包一落地就进缓存，下一次进这一出直接换装（不白下那几 MB）；
  //  ③ 只有主源"连不上"才摘主源；超时只判这一个包，HTTP 4xx 只说明这个包漏传。
  const ART_WAIT_BUDGET = 20000; // 开演前最多为美术包等这么久，到点先演基础皮影
  const PACK_FETCH_BUDGET = { cdn: 90000, same: 20000 };
  const artMisses = new Set();
  const artInflight = new Map();
  let artHealthy = Boolean(ART_BASE);

  const fetchScenePack = async (file, item) => {
    const sources = [...(ART_BASE ? [ART_BASE] : []), ''];
    let lastError = null;
    for (const base of sources) {
      const url = base ? `${base}/puppets/${file}` : `./puppets/${file}`;
      const budget = base ? PACK_FETCH_BUDGET.cdn : PACK_FETCH_BUDGET.same;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), budget);
      try {
        return await loadWoop(url, item, { signal: ctl.signal });
      } catch (error) {
        lastError = error;
        const message = String((error && error.message) || error);
        console.warn(`[boot] 出目包读取失败（${base ? 'CDN' : '同源'}，上限 ${budget / 1000}s）`, file, message);
        // 连不上（DNS/连接被拒/网络中断）才摘掉主源；HTTP 报错与超时都只算这一个包
        if (base && !/HTTP \d{3}/.test(message) && !/abort/i.test(message)) ART_BASE = '';
      } finally {
        clearTimeout(timer);
      }
    }
    artMisses.add(file);
    artHealthy = Boolean(ART_BASE);
    throw lastError;
  };

  // 同一个包只下一次（观众连着切出目不会重复下载）
  const loadScenePack = (file, item) => {
    if (!artInflight.has(file)) {
      artInflight.set(file, fetchScenePack(file, item).catch((error) => {
        artInflight.delete(file);
        throw error;
      }));
    }
    return artInflight.get(file);
  };

  const assets = {};
  const loadAsset = async (item) => {
    const asset = await loadWoop(assetUrl(`puppets/${item.file}`), item);
    // Scene-specific packs share one loader/cache. Switching a visual mode only
    // swaps materials on the live rig; loading another scene may select a pack.
    const pending = new Map();
    asset.sceneArtwork = {};
    asset.loadSceneArtwork = (sceneId, { wait = ART_WAIT_BUDGET } = {}) => {
      const file = sceneArtById.get(item.id)?.[sceneId]?.file;
      if (!file) return Promise.resolve(null);
      if (artMisses.has(file)) return Promise.resolve(null);
      if (!pending.has(sceneId)) {
        pending.set(sceneId, loadScenePack(file, item).then((pack) => {
          asset.sceneArtwork[sceneId] = pack; // 落地的包给下一次进这一出用
          return pack;
        }).catch((error) => {
          pending.delete(sceneId);
          throw error;
        }));
      }
      const ready = pending.get(sceneId);
      if (!wait) return ready; // 后台预取：不设等待上限，慢慢下
      // 到点就先演基础皮影，下载继续跑（ready 不会被取消）
      return Promise.race([ready, new Promise((resolve) => setTimeout(() => resolve(null), wait))])
        .then((value) => {
          if (value === null) console.info('[boot] 出目包还没下完，先演基础皮影，下完自动进缓存', file);
          return value;
        })
        .catch((error) => {
          console.warn('[show] 出目包取不到，先演基础皮影', file, error);
          return null;
        });
    };
    return asset;
  };

  // 首屏只等第一出戏要用的皮影（原来是把 15 个资产全部串行下完才开演，
  // 弱网下要多花十几秒）；其余资产在开演后后台补齐，切出目不会卡。
  const firstNames = new Set();
  for (const p of SCENES[0].props || []) if (p.asset) firstNames.add(p.asset);
  for (const c of SCENES[0].cast || []) if (c.asset) firstNames.add(c.asset);
  const firstBatch = catalog.filter((x) => firstNames.has(x.name));

  ui.setLoading(0.02, '正在请出皮影…');
  for (let i = 0; i < firstBatch.length; i += 1) {
    const item = firstBatch[i];
    try {
      assets[item.name] = await loadAsset(item);
    } catch (err) {
      console.warn('[boot] 资产加载失败', item.name, err);
    }
    ui.setLoading(((i + 1) / Math.max(1, firstBatch.length)) * 0.5, `装台：${item.name}`);
  }

  const show = new Show({ stage, ui, audio, catalog, assets, loadAsset });
  await show.start();

  // 后台把剩下的皮影补进来（不阻塞开演；切出目时 ensureAssets 也会兜底）
  (async () => {
    for (const item of catalog) {
      if (assets[item.name]) continue;
      try {
        assets[item.name] = await loadAsset(item);
      } catch (err) {
        console.warn('[boot] 资产加载失败', item.name, err);
      }
    }
    // 皮影都补齐了再预取出目美术包（串行，别抢第一出戏的带宽）：
    // 等真演到那一出时包已经在缓存里，切出目就不会站在「装台」上等下载。
    // 开演时没赶上的包在这里再试一次（后台，观众看不到等待）。
    artMisses.clear();
    for (const scene of SCENES) {
      if (!ART_BASE && !artHealthy) break;
      for (const c of scene.cast || []) {
        if (!assets[c.asset]) continue;
        try {
          await assets[c.asset].loadSceneArtwork(scene.id, { wait: 0 });
        } catch {
          /* 取不到就继续用基础皮影，loadScenePack 已经记过日志 */
        }
      }
    }
  })();

  ui.setLoading(0.62, '正在燃灯…');

  // ---- 摄像头：不在页面加载时申请（浏览器对“无手势的申请”经常静默拒绝）。
  // 手势模型在后台并行加载；摄像头等用户第一次点击屏幕时再申请——
  // 那是浏览器一定会弹授权框的唯一时机。点右下角卡片也可以直接申请。
  const wantManual = params.get('manual') === '1';
  const debug = params.get('debug') === '1';
  let debugOn = debug; // 运行时可被「工具 → 诊断面板」切换
  let manualMode = wantManual;
  let cameraError = null;
  let awaitingCamera = !wantManual; // 还没申请过摄像头

  // 手势模型（8.2MB→gzip 6.4MB）+ wasm（13.2MB→gzip 4MB）不在页面加载时下，
  // 等观众第一次点屏幕（也就是浏览器一定会弹摄像头授权的那一刻）再开始下。
  // 这样首屏只需要 HTML+JS+第一出的皮影（约 1MB），画幕马上能出现。
  // ?preload=1 可恢复成"后台预取"（展馆本地部署时用，反正不花流量）。
  //
  // 加载闸门在 app/model-loader.js，它负责三件容易做错的事：
  //  - 失败不进缓存 → 「点这里重试」/按 R 真的会重新开始；
  //  - 并发合并 → 连点屏幕不会把 22MB 下两遍；
  //  - 主源超时先真的取消底层那次，再走同源兜底 → 不会等到同一份悬挂的 Promise（假切源）。
  const modelGate = createModelLoader({
    // 每个源都拼成完整地址：主源走 ASSET_BASE，兜底走 ./ 同源
    load: (kind) => {
      const base = kind === 'fallback' ? '' : ASSET_BASE;
      const u = (p) => (base ? `${base}/${p}` : `./${p}`);
      return gesture.loadModel({
        modelPath: u('models/gesture_recognizer.task'),
        wasmPath: u('vendor/mediapipe/wasm'),
      });
    },
    // ?assets=0 本来就走同源，那就别假装切源
    hasFallback: () => Boolean(ASSET_BASE),
    primaryTimeoutMs: 40000, // CDN 冻结时的等待上限（实测能挂死 >30s）
    fallbackTimeoutMs: 240000, // 同源可能只有几十 KB/s，给足时间
    // 超时/失败后先 abort 底层下载，再兜底：否则兜底复用同一份悬挂 Promise（假切源）
    cancel: () => gesture.cancelModelLoad(),
    onFallback: (err) => {
      // CDN 被墙/超时/证书出错时，别把整个手势功能报废——退回同源再试一次。
      // 慢是慢，但展馆里"能玩"比"快"重要。
      console.warn('[boot] 手势模型从 CDN 加载失败，回退同源重试', err);
      assetFellBack = true;
    },
    onError: (err) => console.warn('[boot] 手势模型加载失败', err),
  });
  // 唯一入口：失败把错误抛给调用方（armCamera 转成 ModelError 显示），
  // 但绝不把这次失败缓存下来——下一次调用会真的重新开始。
  const ensureModel = () => modelGate.ensure();
  // 手动模式不预取（省流量），但也绝不再缓存一个「已加载」的假结果：
  // 原来这里 `return (modelPromise = Promise.resolve())`，从 ?manual=1 切到摄像头时
  // 就会认为模型已经就绪，于是摄像头永远起不来、只能刷新页面。
  if (params.get('preload') === '1' && !manualMode) {
    ensureModel().catch((err) => console.warn('[boot] 预取手势模型失败（点屏幕时会重试）', err));
  }

  // ---- 键鼠演示 / 兜底
  const manual = {
    left: { x: -120, y: 120, fist: false, vx: 0 },
    right: { x: 120, y: 60, fist: false, vx: 0 },
    moved: false, // 用户真的动过鼠标/键盘之后才算“有人操作”
  };
  let pointer = { x: 0, y: 120 };
  // 双人 + 无摄像头时：第二双手镜像第一双，用来演示/自测“两位观众各控一个”
  const toPalm = (x, y) => ({
    x: Math.min(1, Math.max(0, 1 - (0.5 + x / (stage.viewWidth * 1.9)))),
    y: Math.min(1, Math.max(0, 0.54 - y / (stage.viewHeight * 1.75))),
  });
  const virtualHand = (player, side, x, y, fist) => {
    const p = toPalm(x, y);
    const lm = Array.from({ length: 21 }, (_, i) => ({
      x: p.x + Math.cos(i * 1.7) * 0.02,
      y: p.y + Math.sin(i * 2.1) * 0.03,
      z: 0,
    }));
    return {
      label: `P${player}${side === 'left' ? 'Left' : 'Right'}`,
      player,
      side,
      palm: { x: p.x, y: p.y, z: 0 },
      palmRaw: { ...p },
      gesture: fist ? 'Closed_Fist' : 'Open_Palm',
      gestureScore: 0.9,
      openness: fist ? 1.1 : 1.9,
      extended: fist ? 0 : 4,
      pinch: 0.9,
      vx: 0,
      vy: 0,
      age: 0,
      landmarks: lm,
      ts: performance.now(),
    };
  };
  const setManual = (on) => {
    manualMode = on;
    if (!on) {
      show.manual = null;
      show.readHands = (now) => gesture.update(now).hands;
    } else if (duo) {
      show.manual = null;
      show.readHands = () => [
        virtualHand(0, 'left', manual.left.x, manual.left.y, manual.left.fist),
        virtualHand(0, 'right', manual.right.x, manual.right.y, manual.right.fist),
        virtualHand(1, 'left', -manual.left.x * 0.8, manual.left.y + 30, false),
        virtualHand(1, 'right', -manual.right.x * 0.8, manual.right.y + 30, false),
      ];
    } else {
      show.manual = manual;
      if (typeof show.readHands === 'function') show.readHands = () => [];
    }
    ui.setMouseToggle(on);
    if (on) ui.toast('鼠标模式已开 · 关掉它才用手势', 2400);
    // 摄像头没跑起来时不要藏掉右下角的“开启摄像头”入口
    if (gesture.running) ui.setCameraVisible(true);
  };
  setManual(manualMode);
  if (cameraError) {
    ui.setCameraError(cameraErrorText(cameraError));
  } else if (awaitingCamera) {
    ui.setCameraIdle();
  }
  if (debug) {
    ui.setDebugVisible(true);
    ui.setCameraVisible(true);
  }

  // ---- 上手引导：没开摄像头时先教“点一下开灯”，别让人对着“举手”干瞪眼
  if (manualMode) {
    ui.setTutorial('鼠标演示模式', '没拿到摄像头画面，用鼠标也能玩这套皮影', [
      ['移动鼠标', '你的手，皮影双手跟着走'],
      ['空格', '握拳 / 张手'],
      ['1 2 3', '直接换出目'],
      ['F', '定格拍照'],
    ]);
    ui.setWakeText('动鼠标 · 开演');
  } else if (awaitingCamera) {
    // 关键：浏览器不允许“页面一加载就静默开摄像头”，必须有一次真实的点击。
    ui.setTutorial('点一下屏幕，灯就亮了', '浏览器会问「使用摄像头？」，选“允许”', [
      ['点击屏幕', '或点右下角小窗'],
      ['允许之后', '小窗出现你的画面'],
      ['然后举手', '皮影就跟着你动'],
      ['按 H', '随时看这张说明'],
    ]);
    ui.setWakeText('点击 · 开灯');
  } else {
    ui.setTutorial('把手举起来，皮影就听你的', '站到屏幕前 1.5 米，双手入镜即开演', [
      ['张手移动', '指挥皮影的两只手'],
      ['握拳', '执签，把这只手定住'],
      ['双手举高', '换一出戏'],
      ['双手握拳', '定格，落印拍照'],
      ['比耶', '转身：让这只手管的皮影换朝向'],
    ]);
    ui.setWakeText('举手 · 开演');
  }

  // 鼠标目标点（舞台坐标），每帧再缓动过去，别直接赋值（否则皮影跟着光标一抖一抖）
  let pointerGoal = { x: -70, y: -80 };

  // 函数声明，会被提升：上面 boot 早期的 catch 里也要用
  function cameraErrorText(err) {
    const name = err && err.name;
    if (name === 'NotAllowedError')
      return '摄像头被拒绝\n点地址栏左侧的摄像头图标→允许，再点这里重试';
    if (name === 'NotFoundError') return '找不到摄像头\n检查设备是否插好，再点这里重试';
    if (name === 'NotReadableError') return '摄像头被占用\n关掉其他用摄像头的程序再重试';
    if (name === 'SecurityError') return '需要 https 或 localhost 才能开摄像头';
    if (name === 'TimeoutError') return '摄像头没有响应\n看是否弹了授权框没点，点这里重试';
    if (name === 'ModelError') return '手势模型没加载成功\n点这里重试，还不行就刷新页面';
    return `摄像头打不开（${name || 'Error'}）\n点这里重试`;
  }

  function gestureTutorial() {
    ui.setTutorial('把手举起来，皮影就听你的', '站到屏幕前 1.5 米，双手入镜即开演', [
      ['张手移动', '指挥皮影的两只手'],
      ['握拳', '执签，把这只手定住'],
      ['双手举高', '换一出戏'],
      ['双手握拳', '定格，落印拍照'],
      ['比耶', '转身：让这只手管的皮影换朝向'],
    ]);
    ui.setWakeText('举手 · 开演');
  }

  function mouseTutorial() {
    ui.setTutorial('鼠标演示模式', '摄像头没开起来，用鼠标也能玩这套皮影', [
      ['移动鼠标', '你的手，皮影双手跟着走'],
      ['空格', '握拳 / 张手'],
      ['点右下角小窗', '再试一次摄像头'],
      ['按 H', '随时看这张说明'],
    ]);
    ui.setWakeText('动鼠标 · 开演');
  }

  let cameraBusy = false;
  let cameraTries = 0;
  async function armCamera({ silent = false } = {}) {
    if (cameraBusy || gesture.running) {
      if (gesture.running) ui.setCameraVisible(true);
      return;
    }
    cameraBusy = true;
    const card = document.getElementById('camera-card');
    card?.classList.remove('is-error');
    ui.setCameraBusy('正在申请摄像头…\n浏览器会弹出授权框，请点「允许」');
    try {
      // 1) 先枚举设备：这一步不弹权限框，能提前发现“根本没有摄像头”
      const devices = await (navigator.mediaDevices?.enumerateDevices?.() ?? []);
      const cams = devices.filter((d) => d.kind === 'videoinput');
      if (cams.length === 0) {
        const e = new Error('电脑上没有找到摄像头设备');
        e.name = 'NotFoundError';
        throw e;
      }
      // 2) 等模型就绪：现在才真正开始下载（约 10MB，gzip 后），给个明确提示；
      //    超过 18 秒还没好就提示可以改用鼠标演示，别让人对着转圈干等。
      ui.setCameraBusy('正在下载手势模型（约 22MB，只需一次）…\n下载完会自动打开摄像头');
      const slowTimer = setTimeout(() => {
        if (manualMode) return;
        ui.setCameraBusy('下载较慢…\n可先点下面金色按钮「用鼠标试玩」，或再等一会');
      }, 18000);
      try {
        // 模型这次没成就把错误抛上来（不要在半路吞掉）：外面那层 catch 会显示成
        // "手势模型没加载成功 · 点这里重试"，而闸门本身已经把这次失败从缓存里清掉了，
        // 所以再点一次是真的从头再来，不会复用上一次的失败。
        await ensureModel().catch((err) => {
          const e = new Error((err && err.message) || '手势模型加载失败');
          e.name = 'ModelError'; // cameraErrorText() 靠这个名字给中文提示
          e.cause = err;
          throw e;
        });
      } finally {
        clearTimeout(slowTimer);
      }
      // 等待期间用户已经切到鼠标演示了：不要再抢回摄像头
      if (manualMode) {
        cameraBusy = false;
        return;
      }
      if (!gesture.ready) throw new Error('手势模型没有就绪，请再点一次重试');
      // 3) 在用户手势里申请摄像头——浏览器此时一定会弹授权框
      await gesture.startCamera();
      cameraError = null;
      awaitingCamera = false;
      manualMode = false;
      show.manual = null;
      show.readHands = (now) => gesture.update(now).hands;
      ui.setCameraVisible(true);
      ui.setCameraBusy(null);
      if (manualMode) setManual(false); // 摄像头通了就交回给手势
      gestureTutorial();
      ui.toast('摄像头已连接');
      // 教学关：每种模式各自记一次（手指模式有自己的一套动作要教）
      let lessonDone = false;
      try {
        lessonDone = sessionStorage.getItem(show.lessonKey) === 'done';
      } catch (e) {
        /* 无痕模式忽略 */
      }
      if (!lessonDone || params.get('tutorial') === '1') show.startTutorial();
    } catch (err) {
      console.warn('[camera] 申请失败', err);
      cameraError = err;
      // 不自动切鼠标了：要不要鼠标由右下角那个开关决定
      show.readHands = () => [];
      ui.setCameraBusy(null);
      ui.setCameraError(cameraErrorText(err));
      mouseTutorial();
      // 连续失败两次就别再每次点击都骚扰用户，改成点小窗/按 R 重试
      cameraTries += 1;
      if (cameraTries >= 2) awaitingCamera = false;
      if (!silent) ui.toast('摄像头没起来 · 想先玩可以打开右下角「鼠标」', 4200);
    } finally {
      cameraBusy = false;
    }
  }

  // 点摄像头卡片 → 直接申请（用户手势，授权框一定会弹）
  document.getElementById('camera-card')?.addEventListener('click', () => armCamera());

  // 卡片里的兜底按钮：没摄像头 / 网络慢 / 不想授权，直接进鼠标演示（不下载手势模型）
  document.getElementById('mouse-demo')?.addEventListener('click', (e) => {
    e.stopPropagation();
    awaitingCamera = false;
    cameraBusy = false;
    setManual(true);
    ui.setCameraBusy(null);
    ui.setWakeText('动鼠标 · 开演');
    ui.toast('已切到鼠标演示：移动鼠标带动皮影（按 M 可切回手势）', 3200);
  });

  // 第一次点击屏幕任意处 → 申请摄像头。
  // 这是浏览器 100% 会弹授权框的时机；页面加载时申请经常被静默拒绝。
  window.addEventListener('pointerdown', () => {
    if (awaitingCamera && !cameraBusy && !gesture.running) armCamera();
  });

  window.addEventListener('pointermove', (e) => {
    const p = stage.screenToStage(e.clientX, e.clientY);
    pointerGoal = { x: p.x * 0.72, y: Math.min(150, Math.max(-150, p.y * 0.28)) };
    pointer = { x: p.x * 0.75, y: p.y * 0.5 + 120 };
    manual.moved = true;
  });

  // 右下角「鼠标」开关：开 = 鼠标驱动皮影，关 = 只认手势
  document.getElementById('mouse-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setManual(!manualMode);
  });

  // 「?」按钮：触摸屏/展馆也能调出引导（不用记快捷键）
  document.getElementById('help-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    ui.toggleHelp();
  });

  // 「教学」按钮：随时重看教学关
  document.getElementById('lesson-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    show.startTutorial();
  });

  // 「音乐」开关
  document.getElementById('music-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = audio.toggleBgm();
    ui.setMusicToggle(on);
    if (on) audio.startBgm(show.scene ? show.scene.id : 'attract');
  });

  // ---- 工具面板：给不懂技术的人用，所有自检与模式切换都收在这
  const toolsPanel = document.getElementById('tools-panel');
  const setTools = (on) => toolsPanel?.classList.toggle('is-on', on);
  document.getElementById('tools-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setTools(!toolsPanel.classList.contains('is-on'));
  });
  document.getElementById('tools-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setTools(false);
  });

  const withParam = (kv) => {
    const p = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(kv)) p.set(k, v);
    return `${location.pathname}?${p.toString()}`;
  };

  toolsPanel?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tool]');
    if (!btn) return;
    e.stopPropagation();
    const tool = btn.dataset.tool;
    switch (tool) {
      case 'camtest':
        window.open('./camtest.html', '_blank');
        break;
      case 'audiotest':
        window.open('./audiotest.html', '_blank');
        break;
      case 'debug': {
        const on = !document.body.classList.contains('debug');
        debugOn = on;
        document.body.classList.toggle('debug', on);
        ui.setDebugVisible(on);
        btn.classList.toggle('is-on', on);
        ui.toast(on ? '诊断面板已打开' : '诊断面板已关闭', 1600);
        break;
      }
      case 'fullscreen':
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.().catch(() => {});
        break;
      case 'kiosk':
        location.href = withParam({ kiosk: '1' });
        break;
      case 'duo':
        location.href = withParam({ duo: '1' });
        break;
      case 'finger': {
        show.fingerMode = !show.fingerMode;
        btn.classList.toggle('is-on', show.fingerMode);
        document.body.classList.toggle('finger-mode', show.fingerMode);
        ui.toast(show.fingerMode ? '手指模式：捏住＝执签，搓动＝转腕' : '已回到基础模式', 2600);
        if (show.fingerMode) {
          let done = false;
          try {
            done = sessionStorage.getItem(show.lessonKey) === 'done';
          } catch (err) {
            /* ignore */
          }
          if (!done) show.startTutorial();
        }
        break;
      }
      case 'lesson':
        show.startTutorial();
        setTools(false);
        break;
      case 'guide':
        ui.toggleHelp();
        break;
      case 'reset':
        try {
          ['shadowplay:lesson', 'shadowplay:lesson:finger', 'shadowplay:bgm'].forEach((k) => {
            sessionStorage.removeItem(k);
            localStorage.removeItem(k);
          });
        } catch (err) {
          /* ignore */
        }
        ui.toast('已清除记忆，正在重载…', 1600);
        setTimeout(() => location.reload(), 700);
        break;
      default:
        break;
    }
  });
  window.addEventListener('keydown', (e) => {
    manual.moved = true;
    if (e.code === 'Space') {
      e.preventDefault();
      manual.left.fist = !manual.left.fist;
      manual.right.fist = manual.left.fist;
      audio.clack(0.5);
    }
    if (e.key === 'n' || e.key === 'N') show.nextScene();
    if (e.key === 'f' || e.key === 'F') {
      if (show.state === STATE.PLAY) show.enterFreeze();
    }
    if (e.key === '1' || e.key === '2' || e.key === '3') show.loadScene(Number(e.key) - 1);
    if (e.key === 'm' || e.key === 'M') setManual(!manualMode);
    if (e.key === 'a' || e.key === 'A') audio.setEnabled(!audio.enabled);
    if (e.key === 'b' || e.key === 'B') {
      const on = audio.toggleBgm();
      ui.toast(on ? '背景音乐：开' : '背景音乐：关', 1600);
    }
    if (e.key === 'k' || e.key === 'K') {
      const mode = show.cycleSkin();
      ui.toast({ silhouette: '灯箱剪影', carved: '剪影 · 镂空', painted: '套色皮影' }[mode] || mode);
      audio.clack(0.4);
    }
    if (e.key === 'c' || e.key === 'C') ui.setCameraVisible(document.getElementById('camera-card').classList.contains('is-hidden'));
    if (e.key === 'h' || e.key === 'H') ui.toggleHelp();
    if (e.key === 't' || e.key === 'T') {
      if (show.state === STATE.TUTORIAL) show.skipLesson();
      else show.startTutorial();
    }
    if (e.key === 'r' || e.key === 'R') armCamera();
    if (e.key === 'p' || e.key === 'P') show.startAutoplay(); // 手动看谢幕
    if (e.key === 'g' || e.key === 'G') {
      show.fingerMode = !show.fingerMode;
      ui.toast(
        show.fingerMode ? '手指模式：拇指食指捏住=执签，搓动=转腕' : '手指模式关闭 · 回到张手跟手',
        3200,
      );
      // 切到手指模式就自动教一遍（这套动作不一样，不教不会）
      if (show.fingerMode) {
        let done = false;
        try {
          done = sessionStorage.getItem(show.lessonKey) === 'done';
        } catch (err) {
          /* ignore */
        }
        if (!done) show.startTutorial();
      }
    }
  });

  // 第一次交互再解锁音频
  const unlock = () => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // ---- 自适应
  const ro = new ResizeObserver(() => stage.resize());
  ro.observe(document.getElementById('stage-inner'));

  // ---- 主循环
  let last = performance.now();
  let acc = 0;
  let frames = 0;
  let bodyFinger = null;
  const loop = (now) => {
    // 窗口被切到后台（或展馆的屏幕被系统遮住）就不要再空转：
    // 一天开十几个小时，白烧的电和热量最后都会变成"卡"。
    if (document.hidden) {
      last = now;
      requestAnimationFrame(loop);
      return;
    }
    const dt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000));
    last = now;
    if (manualMode) {
      // 虚拟双手：指数缓动跟向鼠标目标，速度差用来自动迈步
      const k = 1 - Math.exp(-7 * dt);
      const spread = 105;
      // 手别跑到主角身体另一边去（会让胳膊拧在胸前），限制在身侧 ±240
      const lead = show.lead;
      const lx = lead ? lead.x : 0;
      const hx = Math.min(lx + 240, Math.max(lx - 240, pointerGoal.x));
      // 高度以“肩”为基准做上下偏移，鼠标上下移动才像真的抬手/放手
      let sy = -120;
      if (lead && lead.rig && lead.rig.arms && lead.rig.arms.left) {
        sy = lead.rigToWorld(0, lead.rig.arms.left.shoulder.y).y;
      }
      const hy = sy + pointerGoal.y;
      const goals = {
        left: { x: hx - spread, y: hy + 45 },
        right: { x: hx + spread, y: hy - 35 },
      };
      for (const side of ['left', 'right']) {
        const m = manual[side];
        const g = goals[side];
        const nx = m.x + (g.x - m.x) * k;
        const ny = m.y + (g.y - m.y) * k;
        m.vx = dt > 0 ? (nx - m.x) / dt : 0;
        m.x = nx;
        m.y = ny;
      }
    }
    if (!(params.get('qa') === '1' && window.SHADOWPLAY_QA_PAUSED)) show.update(dt, now);
    if (bodyFinger !== show.fingerMode) {
      bodyFinger = show.fingerMode;
      document.body.classList.toggle('finger-mode', bodyFinger);
    }
    frames += 1;
    acc += dt;
    if (acc > 0.5) {
      const fps = frames / acc;
      ui.setFps(fps);
      frames = 0;
      acc = 0;
      if (debugOn) updateDebug(fps);
    }
    requestAnimationFrame(loop);
  };

  function updateDebug(fps) {
    const hands = show.gestureHands || [];
    ui.setDebug([
      `URL      : ${location.search || '(none)'}`,
      `assets   : ${assetSource()}`,
      `artwork  : ${artSource()}${artHealthy ? '' : '  (拿不到美术包，用基础皮影)'}${artMisses.size ? `  取不到: ${[...artMisses].join(', ')}` : ''}`,
      `camera   : ${gesture.running ? 'running' : 'off'}${cameraError ? '  err=' + (cameraError.name || '') : awaitingCamera ? '  waiting-click' : ''}`,
      `model    : ${gesture.ready ? 'ready' : modelGate.status}  delegate=${gesture.delegate || '-'}${modelGate.fallbackUsed ? '  (已回退同源)' : ''}`,
      `inference: ${gesture.frameMs ? Math.round(gesture.frameMs) + ' ms/frame' : '-'}`,
      `hands    : ${hands.length}  ${hands.map((h) => `${h.label}(${h.openness?.toFixed(2)})`).join(' ')}`,
      `mode     : ${manualMode ? 'mouse-fallback' : 'gesture'}  duo=${duo}`,
      `skin     : ${show.skin}`,
      `state    : ${show.state}  scene=${show.scene ? show.scene.name : '-'}`,
      `puppets  : ${show.stage.puppets.length}  view=${Math.round(stage.viewWidth)}x${stage.viewHeight}`,
      `render   : ${Math.round(fps)} fps`,
    ]);
  }

  ui.setLoading(1, '开演');
  requestAnimationFrame(loop);

  // 调试/集成用
  window.SHADOWPLAY = { stage, show, gesture, ui, audio, assets, SCENES, STATE, manual, assetSource, modelGate };
  if (params.get('qa') === '1') import('../qa/runner.js?release=art36-20261124b').then((m) => m.installQA(window.SHADOWPLAY));
  if (params.get('still') === '1') show.still = true;
  if (params.get('skin')) show.applySkin(params.get('skin'));
  else if (params.get('paint') === '1') show.applySkin('painted');
  if (params.get('scene')) show.loadScene(Math.max(0, Number(params.get('scene')) - 1));
  if (params.get('tutorial') === '1') setTimeout(() => show.startTutorial(), 400);
  // 方案一：手指控制（捏合执签 + 搓动转腕）
  if (params.get('finger') === '1') {
    show.fingerMode = true;
    ui.toast('手指模式 · 拇指食指捏住=执签，搓动=转腕', 4200);
  }
  // 一只手管一个皮影（默认开）；?split=0 回到“两只手都控主角”
  if (params.get('split') === '0') show.splitHands = false;
  audio.loadLines?.(); // 有配置台词配音就加载清单
  audio.loadBgmFiles?.(); // 有戏剧原声文件就优先用它
  // 有戏剧原声（自带唱词/音乐）时默认不念 TTS 台词，避免两层人声打架；
  // 想强制开回台词配音：?voice=1（forceVoice 让 31 个 mp3 仍会预取）
  if (params.get('voice') === '1') audio.forceVoice = true;
  audio.loadBgmFiles?.().then?.((files) => {
    if (params.get('voice') === '1') {
      audio.voiceEnabled = true;
    } else if (params.get('voice') === '0') {
      audio.voiceEnabled = false;
    } else if (files && files.size > 0) {
      audio.voiceEnabled = false;
    }
  });
  // 记住上次的 BGM 开关
  try {
    if (localStorage.getItem('shadowplay:bgm') === '0') {
      audio.bgmEnabled = false;
    }
  } catch (e) {
    /* ignore */
  }
  ui.setMusicToggle(audio.bgmEnabled);
  if (params.get('autostart') === '1') {
    setTimeout(() => {
      show.setState(STATE.PLAY);
      ui.toast('执签 · 开演');
    }, 900);
  }
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading-label');
  if (el) el.textContent = `启幕失败：${err.message}`;
});
