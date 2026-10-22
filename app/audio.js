/** 极简合成音效：锣、鼓、梆子 + 六幕 BGM（全部程序合成，零素材、零版权）。 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.unlocked = false; // 必须等一次用户手势才能创建 AudioContext
    this.masterGain = null;

    // ---- BGM
    this.bgmEnabled = true;
    this.bgmId = null;
    this.bgmGain = null;
    this.bgmBase = 0.16; // 背景音乐基准音量
    this.timer = null;
    this.step = 0;
    this.nextNote = 0;
    this.voiceEl = null;
    this.voiceSrc = null;
    this.voiceEnabled = true; // 用戏剧原声（自带唱词）时可以关掉 TTS 台词
    this.buffers = new Map(); // url → AudioBuffer（台词走 WebAudio，避免自动播放被拦）
    this.voiceReady = undefined;
    this.missing = new Set();
  }

  unlock() {
    this.unlocked = true;
    this.ensure();
    // 解锁后把台词预解码成 AudioBuffer（WebAudio 播放不受自动播放策略限制）
    this.preloadLines();
    // 进页面时就想放 BGM 但还没解锁手势 → 现在补上
    if (this.pendingBgm) {
      const id = this.pendingBgm;
      this.pendingBgm = null;
      this.bgmId = null;
      this.startBgm(id);
    }
  }

  ensure() {
    if (!this.enabled || !this.unlocked) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);
      // 一点点厅堂混响
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = this.impulse(1.4, 2.4);
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.value = 0.28;
      this.reverb.connect(this.reverbGain).connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch += 1) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i += 1) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
      }
    }
    return buf;
  }

  noise(duration) {
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * duration));
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  /** 锣：低频金属 + 噪声泛音，长衰减 */
  gong(level = 0.8) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.9 * level, t + 0.012);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    out.connect(this.masterGain);
    out.connect(this.reverb);
    const partials = [146.8, 233.1, 349.2, 466.2, 587.3, 933.1];
    partials.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f * 1.01, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.985, t + 2.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.24 / (i + 1), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4 / (1 + i * 0.35));
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 2.7);
    });
    const n = this.noise(0.09);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.28 * level, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    n.connect(bp).connect(ng).connect(out);
    n.start(t);
  }

  /** 鼓 */
  drum(level = 0.7, freq = 110) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.7 * level, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    out.connect(this.masterGain);
    out.connect(this.reverb);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.6, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.22);
    osc.connect(out);
    osc.start(t);
    osc.stop(t + 0.55);
    const n = this.noise(0.02);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.3 * level, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(lp).connect(ng).connect(out);
    n.start(t);
  }

  /** 梆子/板，短促 */
  clack(level = 0.5) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.noise(0.04);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25 * level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(bp).connect(g).connect(this.masterGain);
    n.start(t);
  }

  step(level = 0.22) {
    const ctx = this.ensure();
    if (!ctx) return;
    this.drum(level, 78);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on && this.ctx) this.ctx.suspend();
    if (on) this.ensure();
  }

  // ============================================================
  //  BGM：六幕各一首，程序合成（五声音阶 + 不同配器/速度）
  // ============================================================

  /**
   * 六幕 BGM 的配方。
   * 设计原则（重要）：**只做“氛围铺底”，不做旋律**。
   * 上一版用了随机跳进的旋律 + 锯齿波低音，听起来又糊又怪；
   * 现在改成：一根长音主和弦（根音 + 五度）持续铺底 + 五声音阶里偶尔一两颗单音点缀。
   * 五声音阶内部任意两音都不会撞出难听的音程，所以“怎么写都不会难听”。
   */
  static BGM = {
    // 月上柳梢：柔和，慢
    moon: { bpm: 56, root: 261.63, scale: [0, 2, 4, 7, 9], bell: 'pluck', drums: 'none', level: 0.085, drone: 0.55 },
    // 沙场点兵：低沉、有鼓点
    battle: { bpm: 104, root: 196.0, scale: [0, 3, 5, 7, 10], bell: 'pluck', drums: 'war', level: 0.1, drone: 0.4 },
    // 仙翁跨鹤：空灵
    crane: { bpm: 62, root: 293.66, scale: [0, 2, 5, 7, 9], bell: 'flute', drums: 'none', level: 0.08, drone: 0.6 },
    // 西厢：清雅
    xiang: { bpm: 60, root: 246.94, scale: [0, 2, 3, 7, 8], bell: 'pluck', drums: 'none', level: 0.085, drone: 0.5 },
    // 霸王别姬：低沉悲凉（用羽调五声，避开三全音）
    bawang: { bpm: 50, root: 174.61, scale: [0, 3, 5, 7, 10], bell: 'flute', drums: 'soft', level: 0.09, drone: 0.7 },
    // 八仙过海：明快
    baxian: { bpm: 92, root: 329.63, scale: [0, 2, 4, 7, 9], bell: 'pluck', drums: 'light', level: 0.09, drone: 0.35 },
    // 谢幕 / 待客
    curtain: { bpm: 54, root: 220.0, scale: [0, 2, 4, 7, 9], bell: 'pluck', drums: 'none', level: 0.085, drone: 0.6 },
    attract: { bpm: 48, root: 196.0, scale: [0, 2, 5, 7, 9], bell: 'flute', drums: 'none', level: 0.07, drone: 0.45 },
  };

  bgmVolume(v) {
    this.bgmBase = v;
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
    }
    if (this.bgmEl) this.bgmEl.volume = Math.min(1, v * 3);
  }

  /** 扫描一次 audio/bgm.json：哪些出目有人工 BGM 就用文件，没有就用合成 */
  async loadBgmFiles() {
    if (this.bgmFiles !== undefined) return this.bgmFiles;
    try {
      const r = await fetch('./audio/bgm.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('no bgm manifest');
      const m = await r.json();
      this.bgmFiles = new Map();
      for (const [id, info] of Object.entries(m.scenes || {})) {
        if (info && info.available && info.file) {
          this.bgmFiles.set(id, {
            url: `./audio/${info.file}`,
            offset: Number(info.offset) || 0, // 从原声的第几秒开始
            gain: info.gain != null ? Number(info.gain) : 1, // 该曲单独的音量系数
          });
        }
      }
    } catch (e) {
      this.bgmFiles = new Map();
    }
    return this.bgmFiles;
  }

  /** 切背景音乐（同一首不会重启） */
  startBgm(id) {
    if (!this.bgmEnabled || !this.enabled) return;
    if (this.bgmId === id) return;
    const ctx = this.ensure();
    if (!ctx) {
      this.pendingBgm = id; // 还没解锁，等第一次点击
      return;
    }
    this.stopBgm(true);
    // BGM 总线（合成音与文件都挂在它下面，ducking 也作用在它上面）
    if (!this.bgmGain) {
      this.bgmGain = ctx.createGain();
      this.bgmGain.gain.value = this.bgmBase;
      this.bgmGain.connect(this.masterGain);
      this.bgmGain.connect(this.reverb);
    }
    this.bgmGain.gain.setTargetAtTime(this.bgmBase, ctx.currentTime, 0.4);
    this.bgmId = id;

    // 1) 有戏剧原声文件 → 播文件（循环 + 淡入，切换时与旧曲交叉淡化）
    const file = this.bgmFiles && this.bgmFiles.get(id);
    if (file) {
      this.bgmCfg = null;
      if (!this.bgmBuffers) this.bgmBuffers = new Map();
      this.startBgmFile(id, file);
      return;
    }

    // 2) 没有文件 → 用程序合成的氛围铺底
    const cfg = Audio.BGM[id];
    if (!cfg) return;
    this.bgmCfg = cfg;
    this.step = 0;
    this.nextNote = ctx.currentTime + 0.15;
    this.startDrone(cfg);
    clearInterval(this.timer);
    this.timer = setInterval(() => this.pump(), 120);
  }

  /** 播戏剧原声：解码（缓存）→ 循环 → 淡入；旧的淡出 */
  async startBgmFile(id, info) {
    const url = typeof info === 'string' ? info : info.url;
    const offset = (typeof info === 'object' && Number(info.offset)) || 0;
    const trim = (typeof info === 'object' && info.gain != null ? Number(info.gain) : 1) || 1;
    const ctx = this.ensure();
    if (!ctx) return;
    let buf = this.bgmBuffers.get(url);
    if (!buf) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('404');
        buf = await ctx.decodeAudioData(await r.arrayBuffer());
        this.bgmBuffers.set(url, buf);
      } catch (e) {
        // 文件坏了/不存在 → 退回合成版，别静音
        if (this.bgmId === id) {
          this.bgmId = null;
          this.startBgm(id);
        }
        return;
      }
    }
    if (this.bgmId !== id) return; // 解码期间又切走了
    const fade = 1.8;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    // 原声已经做过响度归一（-18 LUFS），这里再抬一档，保证展厅里听得见
    g.gain.linearRampToValueAtTime(trim * 2.2, t + fade);
    g.connect(this.bgmGain);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(g);
    // offset：从原声的第几秒开始播（配合 loop，相当于“取其中一段循环”）
    const startAt = Math.min(offset, Math.max(0, buf.duration - 0.5));
    src.start(t, startAt);
    this.bgmFile = { src, gain: g };
  }

  stopBgmFile() {
    if (!this.bgmFile) return;
    const { src, gain } = this.bgmFile;
    const t = this.ctx ? this.ctx.currentTime : 0;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0.0001, t + 0.9);
      src.stop(t + 1.0);
    } catch (e) {
      /* ignore */
    }
    this.bgmFile = null;
  }

  stopBgm(keepId = false) {
    clearInterval(this.timer);
    this.timer = null;
    this.stopBgmElement();
    this.stopDrone();
    this.stopBgmFile();
    if (!keepId) this.bgmId = null;
    // 只有真正停止时才把总线压下去（切换时 keepId=true，避免中间出现断音）
    if (!keepId && this.bgmGain && this.ctx) {
      this.bgmGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
    }
  }

  stopBgmElement() {
    if (this.bgmEl) {
      try {
        this.bgmEl.pause();
      } catch (e) {
        /* ignore */
      }
      this.bgmEl = null;
    }
  }

  toggleBgm() {
    this.bgmEnabled = !this.bgmEnabled;
    if (!this.bgmEnabled) {
      this.stopBgm();
    } else if (this.bgmId === null) {
      this.startBgm('attract');
    }
    try {
      localStorage.setItem('shadowplay:bgm', this.bgmEnabled ? '1' : '0');
    } catch (e) {
      /* ignore */
    }
    return this.bgmEnabled;
  }

  /** 动作音效：作揖/亮相/甩袖/定住，各有不同手感 */
  cueSfx(kind) {
    if (!this.enabled) return;
    switch (kind) {
      case 'bow': // 作揖：一记闷鼓 + 板
        this.drum(0.5, 88);
        this.clack(0.4);
        break;
      case 'flourish': // 亮相：锣
        this.gong(0.65);
        break;
      case 'swing': // 甩袖：连板
        this.clack(0.5);
        setTimeout(() => this.clack(0.32), 90);
        setTimeout(() => this.clack(0.2), 180);
        break;
      case 'hold': // 执签：一声轻板
        this.clack(0.3);
        break;
      default:
        break;
    }
  }

  /** 前瞻调度：每 120ms 把未来 0.5s 的音符排进去 */
  pump() {
    const ctx = this.ctx;
    if (!ctx || !this.bgmCfg) return;
    const beat = 60 / this.bgmCfg.bpm;
    while (this.nextNote < ctx.currentTime + 0.5) {
      this.scheduleBeat(this.step, this.nextNote, beat);
      this.step += 1;
      this.nextNote += beat;
    }
  }

  /**
   * 一拍（四分音符）的织体。刻意做得极简：
   * 第 1 拍：主和弦单音；第 3 拍：音阶里走一步的单音。
   * 旋律固定为 0→2→4→3 循环（级进、无跳进），五声音阶内任意组合都不刺耳。
   */
  scheduleBeat(step, t, beatDur) {
    const cfg = this.bgmCfg;
    const bar = step % 4;
    const phrase = [0, 2, 4, 3][step % 4];
    const semi = cfg.scale[phrase % cfg.scale.length];
    const f = cfg.root * 2 ** (semi / 12);

    if (bar === 0) {
      // 主音，稍长
      if (cfg.bell === 'flute') this.flute(f, t, beatDur * 1.6, 0.2);
      else this.pluck(f, t, 0.32);
    } else if (bar === 2) {
      // 五度或三度，短一点
      const s2 = cfg.scale[(phrase + 2) % cfg.scale.length];
      const f2 = cfg.root * 2 ** (s2 / 12);
      if (cfg.bell === 'flute') this.flute(f2, t, beatDur * 1.1, 0.15);
      else this.pluck(f2, t, 0.22);
    }

    // 鼓：只在需要的出目出现，且很轻
    const d = cfg.drums;
    if (d === 'war') {
      if (bar === 0 || bar === 2) this.drum(0.22, 88);
    } else if (d === 'light') {
      if (bar === 0) this.drum(0.12, 96);
    } else if (d === 'soft') {
      if (bar === 0) this.drum(0.1, 70);
    }
  }

  /** 长音铺底：一根持续的根音 + 五度，带缓慢呼吸（这是“氛围”的主体） */
  startDrone(cfg) {
    const ctx = this.ctx;
    this.stopDrone();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(cfg.drone * 0.55, ctx.currentTime + 2.5);
    g.connect(this.bgmGain);
    g.connect(this.reverb);
    const oscs = [];
    for (const [mul, amt] of [
      [1, 1],
      [1.5, 0.5],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = cfg.root * mul;
      const og = ctx.createGain();
      og.gain.value = amt;
      o.connect(og).connect(g);
      o.start();
      oscs.push(o);
    }
    // 极慢的音量呼吸，避免“死板电子味”
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = ctx.createGain();
    lg.gain.value = cfg.drone * 0.12;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    oscs.push(lfo);
    this.drone = { gain: g, oscs };
  }

  stopDrone() {
    if (!this.drone) return;
    const { gain, oscs } = this.drone;
    const t = this.ctx ? this.ctx.currentTime : 0;
    try {
      gain.gain.setTargetAtTime(0.0001, t, 0.3);
      oscs.forEach((o) => o.stop(t + 1.2));
    } catch (e) {
      /* ignore */
    }
    this.drone = null;
  }

  pluck(freq, t, level = 0.2) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    g.connect(this.bgmGain);
    g.connect(this.reverb);
    // 只有基频 + 一个柔和的二次泛音，音色干净（上一版加三次泛音 + 锯齿，才发糊）
    for (const [mul, amt] of [
      [1, 1],
      [2, 0.18],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq * mul;
      const gg = ctx.createGain();
      gg.gain.value = amt;
      o.connect(gg).connect(g);
      o.start(t);
      o.stop(t + 2.3);
    }
  }

  flute(freq, t, dur = 0.8, level = 0.1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.25);
    g.gain.setValueAtTime(level, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.bgmGain);
    g.connect(this.reverb);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const vib = ctx.createOscillator();
    vib.frequency.value = 4.6;
    const vg = ctx.createGain();
    vg.gain.value = freq * 0.004;
    vib.connect(vg).connect(o.frequency);
    o.connect(g);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }

  /** 旧接口保留（有些地方还调用），改成长音单音 */
  padNote(freq, t, dur = 2, level = 0.12) {
    this.flute(freq, t, dur, level);
  }

  // ============================================================
  //  台词语音：优先用 AI 合成好的 mp3（audio/lines/<场景>/01.mp3）
  //  没有文件就静音跳过，不影响演出
  // ============================================================

  /** 读一次台词清单（清单里已经标好哪些 mp3 真的存在，运行时不探测、不刷 404） */
  async loadLines() {
    if (this.voiceReady !== undefined) return this.voiceReady;
    try {
      const r = await fetch('./audio/lines.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('no manifest');
      const manifest = await r.json();
      this.linesManifest = manifest;
      this.available = new Set();
      const scenes = manifest.scenes || manifest; // 兼容旧格式
      for (const list of Object.values(scenes)) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
          if (item && item.available) this.available.add(`./audio/${item.file}`);
        }
      }
      this.voiceReady = this.available.size > 0;
      // 如果音频已经解锁，立刻把台词解码好（WebAudio 播放不受自动播放策略限制）
      this.preloadLines();
    } catch (e) {
      this.voiceReady = false;
      this.linesManifest = null;
    }
    return this.voiceReady;
  }

  /** 把台词 mp3 解码进内存（一次性，31 句约 0.6MB） */
  async preloadLines() {
    if (!this.available || this.available.size === 0) return;
    const ctx = this.ensure();
    if (!ctx) return; // 还没解锁，等 unlock() 再调
    if (this.preloading) return;
    this.preloading = true;
    for (const url of this.available) {
      if (this.buffers.has(url)) continue;
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('404');
        const ab = await r.arrayBuffer();
        const buf = await ctx.decodeAudioData(ab);
        this.buffers.set(url, buf);
      } catch (e) {
        this.missing.add(url);
      }
    }
    this.preloading = false;
    this.voiceLoaded = this.buffers.size;
  }

  /** 播放一句台词（会顺手把 BGM 压低，念完恢复） */
  sayLine(sceneId, index) {
    if (!this.enabled || !this.voiceEnabled || !sceneId) return;
    if (this.voiceReady === false) return; // 没配配音
    const url = `./audio/lines/${sceneId}/${String(index + 1).padStart(2, '0')}.mp3`;
    if (this.available && !this.available.has(url)) return;
    if (this.missing && this.missing.has(url)) return;
    this.say(url);
  }

  /**
   * 播一句话。优先走 WebAudio（AudioContext 在首次点击时已解锁，不会被自动播放策略拦），
   * 解码还没完成时退回 <audio> 元素兜底。
   */
  say(url, { gain = 1 } = {}) {
    if (!this.enabled) return;
    this.stopVoice();
    const buf = this.buffers.get(url);
    if (buf && this.ctx) {
      this.playBuffer(buf, gain);
      return;
    }
    // 还没解码好：现解现播（不阻塞）
    if (!buf && this.available && this.available.has(url) && this.ctx) {
      this.decodeOne(url).then(() => {
        const b = this.buffers.get(url);
        if (b) this.playBuffer(b, gain);
      });
      return;
    }
    // 兜底：<audio>（可能被自动播放策略拦，但至少能试一次）
    try {
      const el = new window.Audio(url);
      el.volume = Math.min(1, 0.9 * gain);
      this.voiceEl = el;
      el.addEventListener('playing', () => this.duck(true));
      el.addEventListener('ended', () => this.duck(false));
      el.addEventListener('error', () => {
        this.missing?.add(url);
        this.duck(false);
      });
      el.play().catch(() => this.duck(false));
    } catch (e) {
      /* 语音不可用不影响演出 */
    }
  }

  playBuffer(buf, gain = 1) {
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = Math.min(1, 0.95 * gain);
      src.connect(g).connect(this.masterGain);
      this.duck(true);
      src.onended = () => this.duck(false);
      src.start();
      this.voiceSrc = src;
      return true;
    } catch (e) {
      return false;
    }
  }

  async decodeOne(url) {
    if (this.buffers.has(url) || this.missing.has(url)) return;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('404');
      const ab = await r.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(ab);
      this.buffers.set(url, buf);
    } catch (e) {
      this.missing.add(url);
    }
  }

  /** 念台词时把 BGM 压到 30% */
  duck(on) {
    if (!this.bgmGain || !this.ctx) return;
    const target = on ? this.bgmBase * 0.3 : this.bgmBase;
    this.bgmGain.gain.setTargetAtTime(target, this.ctx.currentTime, on ? 0.12 : 0.5);
  }

  stopVoice() {
    if (this.voiceSrc) {
      try {
        this.voiceSrc.stop();
      } catch (e) {
        /* ignore */
      }
      this.voiceSrc = null;
      this.duck(false);
    }
    if (this.voiceEl) {
      try {
        this.voiceEl.pause();
      } catch (e) {
        /* ignore */
      }
      this.voiceEl = null;
    }
  }
}
