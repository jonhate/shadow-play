import { loadWoop } from './woop.js';
import { Stage } from './stage.js';
import { GestureInput } from './gesture.js';
import { Show, STATE, SCENES } from './show.js';
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

  const catalog = await fetch('./puppets/index.json').then((r) => r.json());
  const assets = {};
  let done = 0;
  ui.setLoading(0.02, '正在请出皮影…');
  for (const item of catalog) {
    try {
      assets[item.name] = await loadWoop(`./puppets/${item.file}`, item);
    } catch (err) {
      console.warn('[boot] 资产加载失败', item.name, err);
    }
    done += 1;
    ui.setLoading((done / catalog.length) * 0.55, `装台：${item.name}`);
  }

  const show = new Show({ stage, ui, audio, catalog, assets });
  await show.start();
  ui.setLoading(0.62, '正在燃灯…');

  // ---- 摄像头：不在页面加载时申请（浏览器对“无手势的申请”经常静默拒绝）。
  // 手势模型在后台并行加载；摄像头等用户第一次点击屏幕时再申请——
  // 那是浏览器一定会弹授权框的唯一时机。点右下角卡片也可以直接申请。
  const wantManual = params.get('manual') === '1';
  const debug = params.get('debug') === '1';
  let manualMode = wantManual;
  let cameraError = null;
  let awaitingCamera = !wantManual; // 还没申请过摄像头

  const modelPromise = wantManual
    ? Promise.resolve()
    : gesture
        .loadModel({
          modelPath: './models/gesture_recognizer.task',
          wasmPath: './vendor/mediapipe/wasm',
        })
        .catch((err) => {
          console.warn('[boot] 手势模型加载失败', err);
          const e = new Error((err && err.message) || '手势模型加载失败');
          e.name = 'ModelError';
          cameraError = cameraError || e;
        });

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
      // 2) 等模型就绪（启动时已在后台并行加载）
      await modelPromise;
      if (!gesture.ready) throw cameraError || new Error('手势模型没有就绪');
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
    show.update(dt, now);
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
      if (debug) updateDebug(fps);
    }
    requestAnimationFrame(loop);
  };

  function updateDebug(fps) {
    const hands = show.gestureHands || [];
    ui.setDebug([
      `URL      : ${location.search || '(none)'}`,
      `camera   : ${gesture.running ? 'running' : 'off'}${cameraError ? '  err=' + (cameraError.name || '') : awaitingCamera ? '  waiting-click' : ''}`,
      `model    : ${gesture.ready ? 'ready' : 'loading'}  delegate=${gesture.delegate || '-'}`,
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
  window.SHADOWPLAY = { stage, show, gesture, ui, audio, assets, SCENES, STATE, manual };
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
  // 想强制开回台词配音：?voice=1
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
