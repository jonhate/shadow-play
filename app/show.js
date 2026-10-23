import { clamp, lerp } from './rig.js';

/** 剧目：六出戏。每出可以带 beats（剧情节拍），节拍里能要求观众做某个动作才继续。 */
export const SCENES = [
  {
    id: 'moon',
    name: '月上柳梢',
    subtitle: '才子佳人 · 庭院景',
    caption: '一盏灯，一张皮。两手执签，便有了悲欢。',
    hint: '两手一合 = 作揖，剧情才往下走',
    cast: [
      { asset: '长辫女子', x: -190, facing: 1, height: 590, lead: true },
      { asset: '乌帽书生', x: 210, facing: -1, height: 560 },
    ],
    props: [
      { asset: '凉亭', x: -390, y: -320, height: 290, opacity: 0.52 },
      { asset: '梅花', x: 430, y: -352, height: 215, opacity: 0.56 },
      { asset: '牡丹', x: -560, y: -378, height: 130, opacity: 0.58 },
    ],
    beats: [
      { text: '月上柳梢头，人约黄昏后。', wait: 2.4 },
      { text: '（作揖）小生这厢有礼了。', cue: 'bow' },
      { text: '佳人还礼，低头不语，脸先红了。', cue: 'bow' },
      { text: '一盏灯，两张皮，一段情。', wait: 3.2 },
    ],
  },
  {
    id: 'battle',
    name: '沙场点兵',
    subtitle: '武生武将 · 校场景',
    caption: '鞭为马，枪作阵。三根竹签，也能走遍千军万马。',
    hint: '双手举高 = 亮相，再举一次换出目',
    duet: true,
    cast: [
      { asset: '翎冠武生', x: -210, facing: 1, height: 600, lead: true },
      { asset: '持戟武将', x: 230, facing: -1, height: 580 },
    ],
    props: [
      { asset: '宝塔', x: -480, y: -330, height: 355, opacity: 0.5 },
      { asset: '竹子', x: 490, y: -360, height: 400, opacity: 0.54 },
    ],
    beats: [
      { text: '帐下点兵，鼓声三通。', wait: 2.2 },
      { text: '（亮相）好一员虎将！', cue: 'raise' },
      { text: '刀枪并举，杀声震天。', cue: 'swing' },
      { text: '鞭为马，枪作阵——千军万马，只在一双手。', wait: 3.2 },
    ],
  },
  {
    id: 'crane',
    name: '仙翁跨鹤',
    subtitle: '神仙道化 · 云山景',
    caption: '鹤背清风，一管竹签，也能腾云。',
    hint: '双手举高 = 腾云，双拳 = 定格留影',
    cast: [
      { asset: '骑鹤仙人', x: -220, facing: 1, height: 540, lead: true },
      { asset: '鹿', x: 300, facing: -1, height: 400 },
    ],
    props: [
      { asset: '拱桥', x: 40, y: -372, height: 225, opacity: 0.46 },
      { asset: '竹子', x: -560, y: -355, height: 385, opacity: 0.54 },
      { asset: '梅花', x: 520, y: -372, height: 190, opacity: 0.54 },
    ],
    beats: [
      { text: '云深不知处，一鹤自天来。', wait: 2.4 },
      { text: '（举高）仙翁跨鹤，腾云而起。', cue: 'raise' },
      { text: '人间千年，不过一梦。', wait: 3 },
    ],
  },
  {
    id: 'xiang',
    name: '西厢 · 月下相会',
    subtitle: '改编自《西厢记》· 庭院景',
    caption: '待月西厢下，迎风户半开。',
    hint: '两手一合 = 作揖，两人见礼',
    cast: [
      { asset: '乌帽书生', x: -200, facing: 1, height: 570, lead: true },
      { asset: '长辫女子', x: 200, facing: -1, height: 580 },
    ],
    props: [
      { asset: '凉亭', x: 0, y: -330, height: 320, opacity: 0.45 },
      { asset: '梅花', x: -520, y: -356, height: 210, opacity: 0.55 },
      { asset: '竹子', x: 520, y: -352, height: 330, opacity: 0.5 },
    ],
    beats: [
      { text: '（张生上）待月西厢下，迎风户半开。', wait: 2.6 },
      { text: '（作揖）小生张珙，久慕小姐才名。', cue: 'bow' },
      { text: '（莺莺还礼）先生万福。', cue: 'bow' },
      { text: '（举高）隔墙花影动，疑是玉人来。', cue: 'raise' },
      { text: '月下相会，一诺千金。', wait: 3.2 },
    ],
  },
  {
    id: 'bawang',
    name: '霸王别姬',
    subtitle: '改编自《千金记》· 帐中景',
    caption: '力拔山兮气盖世，时不利兮骓不逝。',
    hint: '作揖 = 辞别，举高 = 起势',
    cast: [
      { asset: '持戟武将', x: -190, facing: 1, height: 600, lead: true },
      { asset: '长辫女子', x: 210, facing: -1, height: 570 },
    ],
    props: [
      { asset: '宝塔', x: 470, y: -336, height: 330, opacity: 0.44 },
      { asset: '竹子', x: -500, y: -358, height: 360, opacity: 0.5 },
    ],
    beats: [
      { text: '（帐中）四面楚歌，大王且饮酒。', wait: 2.6 },
      { text: '（作揖）虞姬，这一拜，便是永别。', cue: 'bow' },
      { text: '（举高）力拔山兮气盖世！', cue: 'raise' },
      { text: '（舞剑）汉兵已略地，四面楚歌声。', cue: 'swing' },
      { text: '大王意气尽，贱妾何聊生。', wait: 3.4 },
    ],
  },
  {
    id: 'baxian',
    name: '八仙 · 过海',
    subtitle: '改编自《八仙过海》· 海岛景',
    caption: '八仙过海，各显神通。',
    hint: '举高 = 腾云，甩手 = 显神通',
    cast: [
      { asset: '骑鹤仙人', x: -210, facing: 1, height: 560, lead: true },
      { asset: '龙', x: 260, facing: -1, height: 360 },
    ],
    props: [
      { asset: '拱桥', x: -30, y: -368, height: 240, opacity: 0.46 },
      { asset: '竹子', x: -560, y: -352, height: 340, opacity: 0.5 },
      { asset: '牡丹', x: 520, y: -374, height: 140, opacity: 0.55 },
    ],
    beats: [
      { text: '东海茫茫，八仙赴会。', wait: 2.4 },
      { text: '（举高）各显神通，腾云过海！', cue: 'raise' },
      { text: '（甩手）龙王现身，浪高三丈。', cue: 'swing' },
      { text: '八仙过海，各显神通。', wait: 3 },
    ],
  },
];


/** 谢幕（自动演绎）六段台词，导出给配音用 */
export const CURTAIN_LINES = [
  '六出已尽 · 灯未灭，戏未散',
  '两位角儿，向台下作揖',
  '亮相——一亮相，满堂彩',
  '换位，走一个圆场',
  '再拜，谢幕',
  '一盏灯，一张皮，谢谢观看',
];

export const STATE = {
  ATTRACT: 'attract',
  TUTORIAL: 'tutorial',
  ARMING: 'arming',
  PLAY: 'play',
  FREEZE: 'freeze',
  AUTOPLAY: 'autoplay', // 六幕演完后的自动演绎（谢幕）
  ENDING: 'ending',
};

/** 教学关：每一步都要“真的做出来”才过 */
export const LESSON = [
  {
    id: 'raise',
    title: '举起一只手',
    tip: '手掌张开，抬到胸口高度，看着屏幕里的小窗',
    hold: 0.6,
    test: (input) => input.count >= 1 && input.anyOpen,
  },
  {
    id: 'move',
    title: '左右移动手掌',
    tip: '手掌左右平移，皮影的那只手会跟着你走',
    hold: 0.5,
    travel: 0.22, // 累计横向位移（归一化坐标）
    test: (input) => input.count >= 1 && input.anyOpen,
  },
  {
    id: 'fist',
    title: '握拳，把它定住',
    tip: '握紧拳头——这只手就不再跟你，停在原地（这就是“执签”）',
    hold: 0.8,
    test: (input) => !!(input.a.left?.fist || input.a.right?.fist),
  },
  {
    id: 'bow',
    title: '两手一合，作揖',
    tip: '两只手掌心相对、靠近到一拃宽——这就是作揖，剧情要靠它往下走',
    hold: 0.7,
    test: (input) =>
      !!(
        input.a.left &&
        input.a.right &&
        input.a.left.open &&
        input.a.right.open &&
        input.pairDist != null &&
        input.pairDist < 0.14
      ),
  },
  {
    id: 'both',
    title: '双手举高，亮相',
    tip: '两只手一起举过头顶，皮影会亮相',
    hold: 0.7,
    test: (input) => input.bothRaised,
  },
];

/** 手指模式（方案一）的教学关：教“捏住 = 执签 / 松开 = 放签 / 搓动 = 转腕” */
export const LESSON_FINGER = [
  {
    id: 'f-raise',
    title: '把手放进画面',
    tip: '手掌张开抬到胸前，让小窗里看得到你的手（先让它认出你）',
    hold: 0.6,
    test: (input) => input.count >= 1,
  },
  {
    id: 'f-pinch',
    title: '拇指食指捏住',
    tip: '像捏住一根竹签：拇指和食指指尖碰在一起——皮影那只手就被“签”带起来了',
    hold: 0.7,
    test: (input) => !!(input.a.left?.open || input.a.right?.open),
  },
  {
    id: 'f-release',
    title: '松开，手臂就落下',
    tip: '把拇指和食指分开——签松了，皮影的手自然垂下去',
    hold: 0.5,
    test: (input) => {
      const h = input.a.left || input.a.right;
      return !!(h && h.released);
    },
  },
  {
    id: 'f-roll',
    title: '搓动，让手腕转起来',
    tip: '捏住的同时，把拇指食指这条线转一转——这就是传统里的“搓签”，皮影手腕会跟着转',
    hold: 0.6,
    roll: 0.7, // 累计搓动角（弧度）
    test: (input) => !!(input.a.left?.open || input.a.right?.open),
  },
  {
    id: 'f-bow',
    title: '两手捏住，靠近作揖',
    tip: '两只手都捏住，再合到一拃宽——这就是作揖。剧情要靠它往下走一句',
    hold: 0.8,
    test: (input) =>
      !!(
        input.a.left &&
        input.a.right &&
        input.a.left.open &&
        input.a.right.open &&
        input.pairDist != null &&
        input.pairDist < 0.14
      ),
  },
  {
    id: 'f-walk',
    title: '把手挪到左右',
    tip: '手移到画面左边或右边，皮影跟着走位；回到中间就站住',
    hold: 0.5,
    travel: 0.2,
    test: (input) => input.count >= 1,
  },
];


export class Show {
  constructor({ stage, ui, audio, catalog, assets }) {
    this.stage = stage;
    this.ui = ui;
    this.audio = audio;
    this.catalog = catalog; // 资产索引
    this.assets = assets; // 名称 → 已解析的 woop 数据
    this.state = STATE.ATTRACT;
    this.sceneIndex = 0;
    this.scene = null;
    this.stateTime = 0;
    this.clock = 0;
    this.lead = null;
    this.support = null;
    this.manual = null; // 键鼠演示：{left:{x,y,fist}, right:{...}}
    this.gestureHands = null;
    this.readHands = null;
    this.lastHandsTime = -999;
    this.armingProgress = 0;
    this.raiseTimer = 0;
    this.fistTimer = 0;
    this.moveIntent = 0;
    this.armSideByScreen = { left: 'left', right: 'right' };
    this.stats = { hands: 0, fps: 0 };
    this.skin = 'silhouette'; // silhouette | carved | painted
    this.still = false; // true = 皮影完全静止（验收对照用）
    this.handModes = new Map(); // label → 'fist' | 'open' | 'rest'（滞回用）

    // 方案一：手指控制（捏合执签 + 搓动转腕）
    this.fingerMode = false;
    this.gripThreshold = 0.55; // 拇指-食指距离 / 手掌尺寸，小于它算“捏住”
    this.rollScale = 0.55; // 搓动角 → 转腕幅度

    // 一只手管一个皮影：左手管左边那个，右手管右边那个
    this.splitHands = true;
    this.walkGain = 0.95; // 手掌横向位置 → 皮影目标 x 的比例
    this.leadMove = 0;
    this.supportMove = 0;

    // 教学关
    this.lessonIndex = 0;
    this.lessonHold = 0;
    this.lessonTravel = 0;
    this.lessonLastX = null;
    this.lessonRoll = 0;
    this.lessonLastRoll = null;
    this.lessonDone = false;

    // 剧情节拍
    this.beatIndex = -1;
    this.beatTimer = 0;
    this.beatHold = 0;
    this.posture = null; // 'bow' | 'flourish' | 'swing' | null
    this.lastPosture = null;
    this.postureTimer = 0;
    this.prevPalmX = null;
    // 自动演绎
    this.autoTime = 0;
    this.autoSeg = -1;
  }

  async start() {
    await this.loadScene(0, { silent: true });
    this.setState(STATE.ATTRACT, { silent: true });
  }

  setState(next, { silent = false } = {}) {
    const prev = this.state;
    this.state = next;
    this.stateTime = 0;
    this.ui?.setState(next);
    if (next !== STATE.ATTRACT) this.ui?.setProgress(0);
    if (next === STATE.PLAY && prev !== STATE.PLAY) {
      // 刚换出目（beatIndex = -1）才从头讲故事；定格/教学结束后继续演
      if (this.beatIndex < 0) this.startBeats();
      // 刚开演时不要因为“暂时没手”立刻收幕
      this.lastHandsTime = this.clock;
      if (!silent) this.audio?.gong(0.5);
    }
    if (next === STATE.ATTRACT) {
      this.ui?.setCue(null);
      this.ui?.setLesson({ visible: false });
      this.audio?.stopVoice?.();
      this.audio?.startBgm?.('attract');
    }
    if (silent) return;
    if (next === STATE.FREEZE) this.audio?.gong(0.85);
  }

  async loadScene(index, { silent = false } = {}) {
    const scene = SCENES[index % SCENES.length];
    this.sceneIndex = index % SCENES.length;
    this.scene = scene;
    this.stage.clear();
    this.lead = null;
    this.support = null;

    for (const p of scene.props) {
      const a = this.assets[p.asset];
      if (!a) continue;
      this.stage.addScenery(a, {
        x: p.x ?? 0,
        y: p.y ?? this.stage.floorY,
        height: p.height ?? this.stage.viewHeight * 0.3,
        opacity: p.opacity ?? 0.5,
        z: -120,
      });
    }
    for (const c of scene.cast) {
      const a = this.assets[c.asset];
      if (!a) continue;
      const puppet = this.stage.addPuppet(a, {
        x: c.x ?? 0,
        height: c.height ?? this.stage.viewHeight * 0.6,
        facing: c.facing ?? 1,
        z: c.lead ? 20 : 0,
      });
      // 主角近黑（灯箱剪影），配角稍浅，拉开前后层次
      puppet.setTint(c.lead ? 0x1a1108 : 0x3a2718);
      if (this.skin !== 'silhouette') puppet.setSkin(this.skin);
      if (c.lead || !this.lead) this.lead = puppet;
      else this.support = puppet;
    }
    if (this.lead) this.lead.x = this.lead.baseX;
    this.ui?.setScene(scene, this.sceneIndex, SCENES.length);
    this.ui?.setCaption(scene.caption);
    // 换了出目就从头讲故事
    this.beatIndex = -1;
    this.beatHold = 0;
    this.beatTimer = 0;
    this.ui?.setCue(null);
    // 每幕一首 BGM（程序合成，见 audio.js 的 BGM 表）
    this.audio?.stopVoice?.();
    this.audio?.startBgm?.(scene.id);
    if (this.state === STATE.PLAY) this.startBeats();
    if (!silent) this.audio?.gong(0.7);
  }

  nextScene() {
    // 六幕演完 → 自动演绎一段（谢幕），再回到第一出
    if (this.sceneIndex >= SCENES.length - 1) {
      this.startAutoplay();
      return Promise.resolve();
    }
    return this.loadScene(this.sceneIndex + 1, { silent: false });
  }

  // ---------------------------------------------------------- 自动演绎（谢幕）

  startAutoplay() {
    this.autoTime = 0;
    this.autoSeg = -1;
    this.setState(STATE.AUTOPLAY);
    this.ui?.setCue(null);
    this.audio?.stopVoice?.();
    this.audio?.startBgm?.('curtain');
  }

  /** 时间轴：返回当前段落的意图 */
  get autoPlan() {
    const t = this.autoTime;
    const L = CURTAIN_LINES;
    if (t < 4) return { seg: 0, text: L[0], bow: 0.25, hands: 'stand', lx: -140, sx: 140 };
    if (t < 8) return { seg: 1, text: L[1], bow: 1, hands: 'chest', lx: -140, sx: 140 };
    if (t < 12) return { seg: 2, text: L[2], bow: 0, flourish: 1, hands: 'up', lx: -140, sx: 140 };
    if (t < 16.5) return { seg: 3, text: L[3], bow: 0, hands: 'walk', lx: 150, sx: -150 };
    if (t < 20.5) return { seg: 4, text: L[4], bow: 1, hands: 'chest', lx: 150, sx: -150 };
    return { seg: 5, text: L[5], bow: 0.45, hands: 'stand', lx: 0, sx: 0 };
  }

  updateAutoplay(dt) {
    this.autoTime += dt;
    const plan = this.autoPlan;
    if (plan.seg !== this.autoSeg) {
      this.autoSeg = plan.seg;
      this.ui?.setCaption(plan.text);
      this.audio?.sayLine?.('curtain', plan.seg);
      if (plan.seg === 2) this.audio?.gong?.(0.6);
    }
    // 24 秒演完 → 回待客，从第一出重新开始
    if (this.autoTime > 24) {
      this.autoTime = 0;
      this.loadScene(0, { silent: true }).then(() => this.setState(STATE.ATTRACT));
    }
  }

  /** 自动演绎时，直接用程序给皮影派活（不走手势） */
  driveAutoPose(puppet, targetX, plan) {
    if (!puppet) return 0;
    const fy = this.stage.floorY;
    const dx = targetX - puppet.x;
    const move = clamp(dx / 90, -1, 1);
    const armsUp = plan.hands === 'up';
    const armsChest = plan.hands === 'chest';
    const armsStand = plan.hands === 'stand';
    const map = this.armSideFor(puppet, 'left');
    const other = map === 'left' ? 'right' : 'left';
    if (armsUp) {
      puppet.setHeld(map, false);
      puppet.setHeld(other, false);
      puppet.setHandTarget(map, { x: puppet.x - 285, y: fy + 505 }, { weight: 1 });
      puppet.setHandTarget(other, { x: puppet.x + 285, y: fy + 505 }, { weight: 1 });
    } else if (armsChest || armsStand) {
      puppet.setHeld(map, false);
      puppet.setHeld(other, false);
      const w = armsChest ? 55 : 150;
      const h = armsChest ? 380 : 300;
      puppet.setHandTarget(map, { x: puppet.x - w, y: fy + h }, { weight: 1 });
      puppet.setHandTarget(other, { x: puppet.x + w, y: fy + h }, { weight: 1 });
    } else {
      puppet.clearHandTarget(map);
      puppet.clearHandTarget(other);
    }
    return move;
  }

  /** 屏幕左右 → 该皮影自己的左/右臂（不同角色包的朝向不一样） */
  armSideFor(puppet, screenSide) {
    const arms = puppet?.rig?.arms;
    if (!arms || !arms.left || !arms.right) return screenSide;
    const lw = arms.left.wrist?.x ?? -100;
    const rw = arms.right.wrist?.x ?? 100;
    // 朝向翻转（scale.x = -1）时，屏幕左右也会跟着翻
    const leftArmOnScreenLeft = (lw <= rw) !== (puppet.facing < 0);
    return screenSide === 'left' ? (leftArmOnScreenLeft ? 'left' : 'right') : leftArmOnScreenLeft ? 'right' : 'left';
  }

  /** 三档皮：silhouette 纯剪影 → carved 剪影+镂空 → painted 套色 */
  applySkin(mode) {
    this.skin = mode;
    for (const p of this.stage.puppets) p.setSkin(mode);
    return mode;
  }

  cycleSkin() {
    const order = ['silhouette', 'carved', 'painted'];
    const next = order[(order.indexOf(this.skin) + 1) % order.length];
    return this.applySkin(next);
  }

  /** 兼容旧接口：true → 套色，false → 剪影 */
  togglePaint(force) {
    return this.applySkin(force === undefined || force ? 'painted' : 'silhouette') === 'painted';
  }

  /** 手势 → 舞台坐标（镜像，符合照镜子的直觉） */
  handToStage(hand) {
    const st = this.stage;
    const nx = 1 - hand.palm.x;
    const ny = hand.palm.y;
    return {
      x: clamp((nx - 0.5) * st.viewWidth * 1.9, -st.viewWidth * 0.55, st.viewWidth * 0.55),
      y: clamp((0.54 - ny) * st.viewHeight * 1.75, -st.viewHeight * 0.62, st.viewHeight * 0.64),
    };
  }

  isFist(hand) {
    if (!hand) return false;
    if (hand.gesture === 'Closed_Fist' && hand.gestureScore > 0.45) return true;
    return hand.extended <= 1 && hand.openness < 1.28;
  }

  isOpen(hand) {
    if (!hand) return false;
    if (hand.gesture === 'Open_Palm' && hand.gestureScore > 0.45) return true;
    return hand.extended >= 3 && hand.openness > 1.42;
  }

  /**
   * 带滞回的手型判断：open → fist 需要更确定的拳，fist → open 需要更确定的掌。
   * 防止手在阈值附近抖动时皮影在“跟手/执签”之间疯狂切换。
   */
  handMode(hand) {
    if (!hand) return 'none';
    const key = hand.label || '?';
    const prev = this.handModes.get(key) || 'none';
    let next = 'rest';
    if (hand.gesture === 'Closed_Fist' && hand.gestureScore > 0.4) next = 'fist';
    else if (hand.gesture === 'Open_Palm' && hand.gestureScore > 0.4) next = 'open';
    else if (hand.extended <= 1 && hand.openness < 1.22) next = 'fist';
    else if (hand.extended >= 3 && hand.openness > 1.52) next = 'open';
    // 滞回：只有“非常确定”的切换才生效
    if (prev === 'fist' && next === 'open') {
      if (hand.openness < 1.55) next = 'fist';
    } else if (prev === 'open' && next === 'fist') {
      if (hand.openness > 1.25) next = 'open';
    }
    this.handModes.set(key, next);
    return next;
  }

  /** 单个观众的一双手 → 舞台目标 */
  playerFromHands(playerHands) {
    const p = { left: null, right: null };
    for (const side of ['left', 'right']) {
      const h = playerHands[side];
      if (!h || h.age > 0.35) continue;
      if (this.fingerMode) {
        // ---- 方案一：捏合即执签。拇指-食指捏住 = 签被夹住 → 手臂跟"握点"走；
        //      松开 = 放签 → 手臂自然垂落。搓动角驱动转腕。
        const gripped = h.pinch != null && h.pinch < this.gripThreshold;
        const pt = h.pinchPoint || h.palm;
        const mode = this.handMode(h);
        p[side] = {
          stage: this.handToStage({ palm: pt }),
          // fist 仍然取手势分类：手指模式里"双拳定格"这类全局动作还要能用
          fist: mode === 'fist',
          open: gripped, // 手指模式里 open = 捏住（驱动手臂用）
          released: !gripped,
          roll: h.roll || 0,
          pinch: h.pinch,
          vx: h.vx,
          vy: h.vy,
          hand: h,
        };
        continue;
      }
      const mode = this.handMode(h);
      p[side] = {
        stage: this.handToStage(h),
        fist: mode === 'fist',
        open: mode === 'open',
        vx: h.vx,
        vy: h.vy,
        hand: h,
      };
    }
    return p;
  }

  gatherInput(dt, now) {
    // 手按 player 分组：0 = 观众 A（左），1 = 观众 B（右）
    const players = [{ left: null, right: null }, { left: null, right: null }];

    if (this.manual) {
      // 键鼠兜底：manual 里已经是“舞台目标”，不再过 handToStage
      // moved=false 时视为没人操作，避免一进页面就自动开演
      for (const side of ['left', 'right']) {
        if (!this.manual.moved) break;
        const m = this.manual[side];
        if (!m) continue;
        players[0][side] = { stage: { x: m.x, y: m.y }, fist: !!m.fist, open: !m.fist, vx: m.vx || 0 };
      }
    } else if (this.gestureHands) {
      const byPlayer = [{}, {}];
      for (const h of this.gestureHands) {
        const p = h.player ?? 0;
        if (!byPlayer[p]) continue;
        byPlayer[p][h.side ?? (String(h.label).endsWith('Left') ? 'left' : 'right')] = h;
      }
      players[0] = this.playerFromHands(byPlayer[0]);
      players[1] = this.playerFromHands(byPlayer[1]);
    }

    const count = [players[0].left, players[0].right, players[1].left, players[1].right].filter(Boolean).length;

    // ---- 双手几何：作揖（两手靠近）、举高、甩、同向平移
    const L = players[0].left;
    const R = players[0].right;
    let pairDist = null;
    let sway = 0;
    let sameDir = 0;
    if (L && R && L.hand && R.hand) {
      const lh = L.hand.palm || L.hand;
      const rh = R.hand.palm || R.hand;
      pairDist = Math.hypot(lh.x - rh.x, lh.y - rh.y);
      // 两手横向速度同向且够快 → 一起挥（走路/甩袖）
      const vl = L.hand.vx || 0;
      const vr = R.hand.vx || 0;
      if (vl * vr > 0 && Math.abs(vl) + Math.abs(vr) > 260) {
        sameDir = Math.sign(vl) * Math.min(1, (Math.abs(vl) + Math.abs(vr)) / 1400);
      }
    }
    const hv = (p) => (p ? (p.hand ? p.hand.vx || 0 : p.vx || 0) : 0);
    sway = Math.max(Math.abs(hv(L)), Math.abs(hv(R)));

    const bothRaised = !!(L && R) && L.stage.y > 200 && R.stage.y > 200;

    const result = {
      players,
      a: players[0],
      b: players[1],
      count,
      activePlayers: players.filter((p) => p.left || p.right).length,
      anyOpen: !!(players[0].left?.open || players[0].right?.open || players[1].left?.open || players[1].right?.open),
      anyFist: !!(players[0].left?.fist || players[0].right?.fist),
      bothFist: !!(players[0].left?.fist && players[0].right?.fist),
      bothRaised,
      pairDist,
      sway,
      sameDir,
    };
    return result;
  }

  /** 姿态：把双手几何翻译成“皮影在演什么” */
  detectPosture(input) {
    const L = input.a.left;
    const R = input.a.right;
    if (input.bothRaised) return 'flourish'; // 亮相 / 腾云
    if (L && R && L.open && R.open && input.pairDist != null && input.pairDist < 0.14) return 'bow'; // 作揖
    if (Math.abs(input.sameDir) > 0.35) return 'swing'; // 甩袖 / 一起挥
    return null;
  }

  update(dt, now = performance.now()) {
    this.clock += dt;
    this.stateTime += dt;
    this.gestureHands = this.readHands ? this.readHands(now) : null;
    const input = this.gatherInput(dt, now);
    if (input.count > 0) this.lastHandsTime = this.clock;
    const sinceHands = this.clock - this.lastHandsTime;
    this.posture = this.detectPosture(input);
    // 认出动作就“响一下”，手上和耳朵上都有反馈
    if (this.posture && this.posture !== this.lastPosture && this.state !== STATE.ATTRACT) {
      this.audio?.cueSfx?.(this.posture);
    }
    this.lastPosture = this.posture;

    this.ui?.setHands(input, this.gestureHands);
    this.ui?.setHandHud(input, this.fingerMode);
    this.ui?.setPosture(this.posture);

    switch (this.state) {
      case STATE.ATTRACT:
        this.updateAttract(dt, input);
        break;
      case STATE.TUTORIAL:
        this.updateTutorial(dt, input);
        break;
      case STATE.ARMING:
        this.updateArming(dt, input, sinceHands);
        break;
      case STATE.PLAY:
        this.updatePlay(dt, input, sinceHands);
        break;
      case STATE.FREEZE:
        this.updateFreeze(dt);
        break;
      case STATE.AUTOPLAY:
        this.updateAutoplay(dt);
        break;
      case STATE.ENDING:
        this.updateEnding(dt, input, sinceHands);
        break;
      default:
        break;
    }

    this.updatePuppets(dt, input);
    this.stage.render();
  }

  updateAttract(dt, input) {
    if (input.anyOpen || input.count >= 2) {
      this.armingProgress += dt / 0.9;
      this.ui?.setProgress(this.armingProgress);
      if (this.armingProgress >= 1) {
        this.armingProgress = 0;
        this.ui?.setProgress(0);
        this.setState(STATE.ARMING);
        this.ui?.countdown(3, () => {
          this.setState(STATE.PLAY);
          this.ui?.toast('执签 · 开演');
        });
      }
    } else {
      this.armingProgress = Math.max(0, this.armingProgress - dt * 0.8);
      this.ui?.setProgress(this.armingProgress * 0.6);
    }
  }

  updateArming(dt, input, sinceHands) {
    if (input.count === 0 && sinceHands > 3) {
      this.setState(STATE.ATTRACT);
      this.ui?.cancelCountdown();
    }
  }

  // ---------------------------------------------------------------- 教学关

  startTutorial() {
    this.lessonIndex = 0;
    this.lessonHold = 0;
    this.lessonTravel = 0;
    this.lessonLastX = null;
    this.lessonRoll = 0;
    this.lessonLastRoll = null;
    this.setState(STATE.TUTORIAL);
    this.showLesson();
  }

  /** 当前模式对应的教学步骤表 */
  get lessonSteps() {
    return this.fingerMode ? LESSON_FINGER : LESSON;
  }

  /** 教学完成的记忆键：手指模式单独记，别互相顶掉 */
  get lessonKey() {
    return this.fingerMode ? 'shadowplay:lesson:finger' : 'shadowplay:lesson';
  }

  get lesson() {
    const list = this.lessonSteps;
    return list[Math.min(this.lessonIndex, list.length - 1)];
  }

  showLesson() {
    const step = this.lesson;
    this.ui?.setLesson({
      visible: true,
      index: this.lessonIndex,
      total: this.lessonSteps.length,
      title: step.title,
      tip: step.tip,
      progress: 0,
    });
  }

  skipLesson() {
    this.ui?.setLesson({ visible: false });
    this.lessonDone = true;
    try {
      sessionStorage.setItem(this.lessonKey, 'done');
    } catch (e) {
      /* 无痕模式忽略 */
    }
    this.beatIndex = -1;
    this.setState(STATE.PLAY);
    this.ui?.toast('跳过教学 · 直接开演');
  }

  updateTutorial(dt, input) {
    const step = this.lesson;

    // 第二步要的是“真的移动了”：累计掌心横向位移（太小的是抖动，不算）
    if (step.travel) {
      const h = input.a.left || input.a.right;
      const x = h && h.hand && h.hand.palm ? h.hand.palm.x : null;
      if (x != null) {
        if (this.lessonLastX != null) {
          const dx = Math.abs(x - this.lessonLastX);
          if (dx > 0.005 && dx < 0.5) this.lessonTravel += dx;
        }
        this.lessonLastX = x;
      }
    }

    // 搓动那一步：累计拇指-食指连线转过的角度
    if (step.roll) {
      const h = input.a.left || input.a.right;
      const r = h && h.hand && typeof h.hand.roll === 'number' ? h.hand.roll : null;
      if (r != null) {
        if (this.lessonLastRoll != null) {
          let d = Math.abs(r - this.lessonLastRoll);
          if (d > Math.PI) d = Math.PI * 2 - d;
          if (d > 0.03 && d < 1.6) this.lessonRoll += d;
        }
        this.lessonLastRoll = r;
      }
    }

    const moved = !step.travel || this.lessonTravel >= step.travel;
    const rolled = !step.roll || this.lessonRoll >= step.roll;
    const ok = step.test(input) && moved && rolled;
    this.lessonHold = ok ? this.lessonHold + dt : Math.max(0, this.lessonHold - dt * 2);
    const p = Math.min(1, this.lessonHold / step.hold);

    this.ui?.setLesson({
      visible: true,
      index: this.lessonIndex,
      total: this.lessonSteps.length,
      title: step.title,
      tip: step.tip,
      progress: p,
    });

    if (p >= 1) {
      this.audio?.clack ? this.audio.clack(0.7) : this.audio?.gong?.(0.3);
      this.ui?.seal('好');
      this.lessonIndex += 1;
      this.lessonHold = 0;
      this.lessonTravel = 0;
      this.lessonLastX = null;
      this.lessonRoll = 0;
      this.lessonLastRoll = null;
      if (this.lessonIndex >= this.lessonSteps.length) {
        this.ui?.setLesson({ visible: false });
        this.lessonDone = true;
        try {
          // 用 sessionStorage：关掉浏览器再打开，还会再教一遍（展馆换了一批观众）
          sessionStorage.setItem(this.lessonKey, 'done');
        } catch (e) {
          /* 无痕模式忽略 */
        }
        this.beatIndex = -1;
        this.setState(STATE.PLAY);
        this.ui?.toast('教学完成 · 开演');
        this.ui?.flashGuide(5600);
      } else {
        this.showLesson();
      }
    }
  }

  // ---------------------------------------------------------------- 剧情节拍

  startBeats() {
    this.beatIndex = -1;
    this.beatTimer = 0;
    this.beatHold = 0;
    this.nextBeat();
  }

  nextBeat() {
    const beats = this.scene?.beats;
    this.beatHold = 0;
    this.beatTimer = 0;
    this.beatIndex += 1;
    if (!beats || this.beatIndex >= beats.length) {
      this.ui?.setCue(null);
      return;
    }
    const beat = beats[this.beatIndex];
    if (beat.text) {
      this.ui?.setCaption(beat.text);
      // 有 AI 配音就念，没有文件就静音跳过（不影响演出）
      this.audio?.sayLine?.(this.scene?.id, this.beatIndex);
    }
    this.ui?.setCue(beat.cue ? this.cueText(beat.cue) : null);
  }

  cueText(cue) {
    // 手指模式的提示要换说法，否则观众不知道"两手一合"在捏合模式下怎么做
    if (this.fingerMode) {
      return (
        {
          bow: '两手捏住 · 靠近作揖',
          raise: '捏住举高 · 亮相',
          swing: '两手同挥 · 甩袖',
          fist: '双手握拳 · 定格',
        }[cue] || ''
      );
    }
    return { bow: '两手一合 · 作揖', raise: '双手举高 · 亮相', swing: '双手同挥 · 甩袖', fist: '双手握拳 · 定格' }[cue] || '';
  }

  updateBeats(dt, input) {
    const beats = this.scene?.beats;
    if (!beats || this.beatIndex < 0 || this.beatIndex >= beats.length) return;
    const beat = beats[this.beatIndex];
    this.beatTimer += dt;
    if (!beat.cue) {
      if (this.beatTimer >= (beat.wait || 2.6)) this.nextBeat();
      return;
    }
    // 等着观众做出对应动作
    const hit =
      (beat.cue === 'bow' && this.posture === 'bow') ||
      (beat.cue === 'raise' && this.posture === 'flourish') ||
      (beat.cue === 'swing' && this.posture === 'swing') ||
      (beat.cue === 'fist' && input.bothFist);
    // 一次动作只推进一步：动作不松开就不再计数
    if (!hit) this.cueLatch = false;
    // 立刻反馈：认出来了就把提示变成「✓ 已认出」
    this.ui?.setCue(this.cueText(beat.cue), hit && !this.cueLatch);
    if (hit && this.cueLatch) return;
    this.beatHold = hit ? this.beatHold + dt : Math.max(0, this.beatHold - dt * 3);
    if (this.beatHold > 0.45) {
      this.cueLatch = true;
      this.nextBeat();
    }
  }

  updatePlay(dt, input, sinceHands) {
    // 剧情：先走节拍（作揖/举高/甩袖会推进剧情）
    this.updateBeats(dt, input);

    // 亮相：双手举高先演“亮相”，持续 2.5 秒才换出目
    if (input.bothRaised) {
      this.raiseTimer += dt;
      this.ui?.setGestureHint('raise', Math.min(1, this.raiseTimer / 2.5));
      if (this.raiseTimer > 2.5) {
        this.raiseTimer = 0;
        this.ui?.setGestureHint(null, 0);
        this.nextScene();
      }
    } else {
      this.raiseTimer = Math.max(0, this.raiseTimer - dt * 2);
      this.ui?.setGestureHint(null, 0);
    }

    // 定格：双手握拳
    if (input.bothFist) {
      this.fistTimer += dt;
      this.ui?.setGestureHint('freeze', Math.min(1, this.fistTimer / 1.1));
      if (this.fistTimer > 1.1) {
        this.fistTimer = 0;
        this.ui?.setGestureHint(null, 0);
        this.enterFreeze();
      }
    } else {
      this.fistTimer = Math.max(0, this.fistTimer - dt * 3);
    }

    if (sinceHands > 6) this.setState(STATE.ENDING);
  }

  enterFreeze() {
    this.setState(STATE.FREEZE);
    this.ui?.seal('留影');
    const url = this.capturePhoto();
    if (url) this.ui?.showPhoto(url);
  }

  updateFreeze(dt) {
    if (this.stateTime > 4.2) {
      this.ui?.hidePhoto();
      this.setState(STATE.PLAY);
    }
  }

  updateEnding(dt, input, sinceHands) {
    if (input.count > 0 && sinceHands < 0.4) {
      this.setState(STATE.PLAY);
      return;
    }
    if (this.stateTime > 2.6) this.setState(STATE.ATTRACT);
  }

  /** 一只手指一个皮影：同侧手臂跟手 + 手掌横移带动走位。返回该皮影的迈步意图 */
  drivePuppetWithHand(puppet, hand, screenSide) {
    const armSide = this.armSideFor(puppet, screenSide);
    const other = armSide === 'left' ? 'right' : 'left';
    // 每只手只管这个皮影的一侧，另一侧自然垂落
    puppet.setHeld(other, false);
    puppet.clearHandTarget(other);

    if (this.fingerMode) {
      puppet.setHeld(armSide, false);
      if (hand.open) puppet.setHandTarget(armSide, hand.stage, { weight: 1 });
      else puppet.clearHandTarget(armSide);
      const r = (hand.roll || 0) * this.rollScale;
      if (armSide === 'left') puppet.rollL = r;
      else puppet.rollR = r;
    } else {
      const wasHeld = !!(puppet.armTargets && puppet.armTargets[armSide] && puppet.armTargets[armSide].held);
      puppet.setHeld(armSide, !!hand.fist);
      if (hand.fist) {
        if (!wasHeld) this.audio?.cueSfx?.('hold');
      } else if (hand.open) {
        puppet.setHandTarget(armSide, hand.stage, { weight: 1 });
      }
    }

    // 手掌左右移动 → 这个皮影跟着走（握拳/松手时站住）
    if (this.fingerMode) {
      if (!hand.open) return 0; // 松开签就不走
    } else if (hand.fist) {
      return 0;
    }
    const targetX = clamp(hand.stage.x * this.walkGain, -480, 480);
    const dx = targetX - puppet.x;
    if (Math.abs(dx) < 70) return 0; // 死区，免得手抖就乱走
    return clamp(dx / 130, -0.95, 0.95);
  }

  updatePuppets(dt, input) {
    const lead = this.lead;
    if (!lead) return;
    const playing =
      this.state === STATE.PLAY || this.state === STATE.FREEZE || this.state === STATE.TUTORIAL;
    const idle = this.state === STATE.ATTRACT || this.state === STATE.ENDING;
    const a = input.a;
    const b = input.b;
    // 观众 B 也在画面里 → 双人对戏
    const duo = !!(b && (b.left || b.right));

    // 姿态 → 皮影的“演法”
    let bow = this.posture === 'bow' ? 1 : 0;
    let flourish = this.posture === 'flourish' ? 1 : 0;
    const swing = this.posture === 'swing' ? 1 : 0;

    let move = 0;
    const auto = this.state === STATE.AUTOPLAY;
    if (auto) {
      // 自动演绎：程序派活，完全不听手势
      const plan = this.autoPlan;
      bow = plan.bow || 0;
      flourish = plan.flourish || 0;
      move = this.driveAutoPose(lead, plan.lx, plan);
      if (this.support) {
        this.support.setFacing(plan.sx >= plan.lx ? 1 : -1);
        this.driveAutoPose(this.support, plan.sx, plan);
      }
    } else if (this.splitHands && this.support && !duo && !idle) {
      // ---- 左手管左边那个皮影，右手管右边那个皮影
      const hands = [];
      if (a.left) hands.push({ side: 'left', h: a.left });
      if (a.right) hands.push({ side: 'right', h: a.right });
      hands.sort((p, q) => p.h.stage.x - q.h.stage.x);
      const pups = [lead, this.support].sort((p, q) => p.x - q.x);
      // 先全部复位，没手的那只就自然垂着
      for (const p of [lead, this.support]) {
        p.clearHandTarget('left');
        p.clearHandTarget('right');
        p.setHeld('left', false);
        p.setHeld('right', false);
        p.rollL = null;
        p.rollR = null;
      }
      this.leadMove = 0;
      this.supportMove = 0;
      if (hands.length >= 2) {
        const m0 = this.drivePuppetWithHand(pups[0], hands[0].h, hands[0].side);
        const m1 = this.drivePuppetWithHand(pups[1], hands[1].h, hands[1].side);
        if (pups[0] === lead) {
          this.leadMove = m0;
          this.supportMove = m1;
        } else {
          this.leadMove = m1;
          this.supportMove = m0;
        }
      } else if (hands.length === 1) {
        // 只有一只手：手在画面哪半边，就管那半边的皮影
        const h = hands[0];
        const target = h.h.stage.x < 0 ? pups[0] : pups[1];
        const mv = this.drivePuppetWithHand(target, h.h, h.side);
        if (target === lead) this.leadMove = mv;
        else this.supportMove = mv;
      }
      move = this.leadMove;
    } else {
      let rollL = null;
      let rollR = null;
      for (const side of ['left', 'right']) {
        const h = a[side];
        const armSide = this.armSideFor(lead, side);
        if (!h) {
          // 这只手不在画面里：松开执签，让皮影手自然下垂
          lead.setHeld(armSide, false);
          lead.clearHandTarget(armSide);
          continue;
        }
        if (this.fingerMode) {
          // 方案一：捏住 → 跟握点走 + 转腕；松开 → 放签下垂
          if (h.open) {
            lead.setHeld(armSide, false);
            lead.setHandTarget(armSide, h.stage, { weight: 1 });
          } else {
            lead.setHeld(armSide, false);
            lead.clearHandTarget(armSide);
          }
          const r = (h.roll || 0) * this.rollScale;
          if (armSide === 'left') rollL = r;
          else rollR = r;
          continue;
        }
        // 握拳 = 执签：定住（puppet 内部会记住当前姿势，既不跟手也不下垂）
        const wasHeld = !!(lead.armTargets && lead.armTargets[armSide] && lead.armTargets[armSide].held);
        lead.setHeld(armSide, !!h.fist);
        if (h.fist) {
          if (!wasHeld) this.audio?.cueSfx?.('hold');
          continue;
        }
        if (h.open) lead.setHandTarget(armSide, h.stage, { weight: 1 });
        // 半开不合（既不是拳也不是掌）：保持上一帧目标，不乱动
      }
      lead.rollL = rollL;
      lead.rollR = rollR;

      // ---- 水平移动：皮影跟着“双手的中心”走，手往右挪它就往右走
      if (!idle) {
        const L = a.left;
        const R = a.right;
        const anyFist = (L && L.fist) || (R && R.fist);
        let cx = null;
        if (L && R) cx = (L.stage.x + R.stage.x) / 2;
        else if (L) cx = L.stage.x;
        else if (R) cx = R.stage.x;
        if (cx != null && !anyFist) {
          const targetX = clamp(cx * 0.6, -430, 430);
          const dx = targetX - lead.x;
          // 死区：手只是稍微偏一点不算“要走”，免得抬手就把人带跑
          move = Math.abs(dx) < 130 ? 0 : clamp(dx / 150, -0.9, 0.9);
        }
      }

      if (idle) {
        lead.clearHandTarget('left');
        lead.clearHandTarget('right');
        lead.setHeld('left', false);
        lead.setHeld('right', false);
      }
    }

    this.moveIntent = lerp(
      this.moveIntent,
      idle ? 0 : this.splitHands && !auto ? this.leadMove : move,
      1 - Math.exp(-8 * dt),
    );

    // 走到台边就回身
    if (!auto) {
      if (lead.x > 330) lead.setFacing(-1);
      else if (lead.x < -330) lead.setFacing(1);
      if (this.support) {
        if (this.support.x > 330) this.support.setFacing(-1);
        else if (this.support.x < -330) this.support.setFacing(1);
      }
    }

    lead.update(dt, {
      idle,
      still: this.still,
      move: this.moveIntent,      lean: clamp(-this.moveIntent * 0.4, -0.5, 0.5),
      bow,
      flourish,
      swing,
      rollL: lead.rollL,
      rollR: lead.rollR,
      rods: this.state === STATE.PLAY || this.state === STATE.TUTORIAL || auto,
    });

    if (this.support) {
      const mirrorDuet = !!this.scene?.duet && playing && !duo;
      const split = this.splitHands && !duo && !idle && !auto;
      if (!auto && !split) this.support.setFacing(this.support.x > lead.x ? -1 : 1);

      if (auto) {
        // 自动演绎：走位由 driveAutoPose 已经写过，这里只负责把 move 交给 update
      } else if (split) {
        // 左右手各管一个：手臂目标已经在 drivePuppetWithHand 里设好
      } else if (duo) {
        // 双人：观众 B 直接控配角
        for (const side of ['left', 'right']) {
          const h = b[side];
          const armSide = this.armSideFor(this.support, side);
          this.support.setHeld(armSide, !!(h && h.fist));
          if (h && h.open) {
            this.support.setHandTarget(armSide, h.stage, { weight: 1 });
          } else {
            this.support.clearHandTarget(armSide);
          }
        }
      } else if (mirrorDuet) {
        // 单人对戏：对手“反着来”，像在接招
        for (const side of ['left', 'right']) {
          const h = a[side];
          const armSide = this.armSideFor(this.support, side);
          if (h && h.open) {
            this.support.setHandTarget(armSide, { x: 2 * this.support.x - h.stage.x, y: h.stage.y }, { weight: 0.85 });
          } else {
            this.support.clearHandTarget(armSide);
          }
        }
      }

      this.support.update(dt, {
        idle: auto ? false : split ? false : !duo,
        still: this.still,
        move: auto
          ? clamp((this.autoPlan.sx - this.support.x) / 90, -1, 1)
          : split
            ? this.supportMove
            : idle || duo
              ? 0
              : clamp(-this.moveIntent * 0.5, -0.4, 0.4),
        lean: this.support.x > lead.x ? -0.06 : 0.06,
        headTilt: this.still ? 0 : Math.sin(this.clock * 0.4) * 0.018,
        bow: auto ? this.autoPlan.bow || 0 : 0,
        flourish: auto ? this.autoPlan.flourish || 0 : 0,
        rollL: this.support.rollL,
        rollR: this.support.rollR,
        rods: auto || (duo && this.state === STATE.PLAY) || (split && this.state === STATE.PLAY),
      });

      // 单人不演戏时，配角偶尔向主角“搭话”
      if (!auto && !split && !duo && !mirrorDuet && playing && input.count) {
        const side = this.support.x > lead.x ? 'right' : 'left';
        const h = a[side];
        const armSide = this.armSideFor(this.support, side) === 'left' ? 'right' : 'left';
        if (h && h.open) {
          this.support.setHandTarget(armSide, {
            x: this.support.x + (this.support.x > lead.x ? -130 : 130),
            y: this.stage.floorY + 260 + Math.sin(this.clock * 1.7) * 26,
          }, { weight: 0.8 });
        } else {
          this.support.clearHandTarget(armSide);
        }
      }
    }

    // 双人时两边皮影互相面向，谁都不许出界
    if (duo) {
      lead.setFacing(this.support && this.support.x < lead.x ? -1 : 1);
      this.support.setFacing(this.support.x > lead.x ? -1 : 1);
    }
  }

  capturePhoto() {
    try {
      this.stage.render();
      return this.stage.renderer.domElement.toDataURL('image/png');
    } catch (err) {
      console.warn('[show] 截图失败', err);
      return null;
    }
  }
}
