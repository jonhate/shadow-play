const $ = (sel, root = document) => root.querySelector(sel);

const NUMBER_CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export class UI {
  constructor(root = document) {
    this.root = root.body || root;
    this.app = $('#app');
    this.captionEl = $('#caption');
    this.sceneIndexEl = $('#scene-index');
    this.sceneNameEl = $('#scene-name');
    this.sceneSubEl = $('#scene-sub');
    this.progressEl = $('#wake-progress');
    this.countdownEl = $('#countdown');
    this.toastEl = $('#toast');
    this.photoLayer = $('#photo-layer');
    this.photoImg = $('#photo-img');
    this.loadingEl = $('#loading');
    this.loadingBar = $('#loading-bar');
    this.loadingLabel = $('#loading-label');
    this.camVideo = $('#cam');
    this.lmCanvas = $('#lm');
    this.lmCtx = this.lmCanvas ? this.lmCanvas.getContext('2d') : null;
    this.sealEl = $('#seal-stamp');
    this.hintEls = [...root.querySelectorAll('[data-hint]')];
    this.fpsEl = $('#fps');
    this.statusEl = $('#status-line');
    this._captionTimer = null;
    this._typeTimer = null;
    this._countdownTimer = null;
  }

  setState(state) {
    this.app.dataset.state = state;
    const labels = {
      attract: '待客 · 举手即开演',
      tutorial: '教学关',
      arming: '启幕',
      play: '执签中',
      freeze: '定格',
      autoplay: '自动演绎 · 谢幕',
      ending: '收幕',
    };
    if (this.statusEl) this.statusEl.textContent = labels[state] || state;
    // 换状态就把“手动关掉的引导卡”重置回默认，否则收起来一次就再也不出现
    if (state === 'attract') document.body.classList.remove('help-off');
  }

  setScene(scene, index, total) {
    if (this.sceneIndexEl) {
      const cn = NUMBER_CN[index + 1];
      this.sceneIndexEl.textContent = cn ? `第${cn}出` : `第 ${index + 1} 出`;
    }
    if (this.sceneNameEl) this.sceneNameEl.textContent = scene.name;
    if (this.sceneSubEl) this.sceneSubEl.textContent = scene.subtitle || '';
    this.app.dataset.scene = scene.id;
    this.app.dataset.sceneTotal = String(total);
  }

  setCaption(text) {
    if (!this.captionEl) return;
    clearTimeout(this._typeTimer);
    this.captionEl.textContent = '';
    this.captionEl.classList.add('typing');
    let i = 0;
    const step = () => {
      i += 1;
      this.captionEl.textContent = text.slice(0, i);
      if (i < text.length) this._typeTimer = setTimeout(step, 55);
      else this.captionEl.classList.remove('typing');
    };
    step();
  }

  setProgress(v) {
    if (!this.progressEl) return;
    const p = Math.max(0, Math.min(1, v));
    this.progressEl.style.setProperty('--p', p.toFixed(3));
    this.progressEl.classList.toggle('is-active', p > 0.02);
  }

  countdown(from, done) {
    if (!this.countdownEl) return done?.();
    let n = from;
    const tick = () => {
      if (n <= 0) {
        this.countdownEl.classList.remove('is-on');
        this.countdownEl.textContent = '';
        clearInterval(this._countdownTimer);
        this._countdownTimer = null;
        done?.();
        return;
      }
      this.countdownEl.textContent = String(n);
      this.countdownEl.classList.add('is-on');
      // 重播一个缩放动画
      this.countdownEl.style.animation = 'none';
      void this.countdownEl.offsetWidth;
      this.countdownEl.style.animation = '';
      n -= 1;
    };
    clearInterval(this._countdownTimer);
    tick();
    this._countdownTimer = setInterval(tick, 750);
  }

  cancelCountdown() {
    clearInterval(this._countdownTimer);
    this._countdownTimer = null;
    if (this.countdownEl) {
      this.countdownEl.classList.remove('is-on');
      this.countdownEl.textContent = '';
    }
  }

  toast(msg, ms = 1800) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('is-on');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('is-on'), ms);
  }

  /** 双手状态牌：跟手 / 定住 / 半开 / 未见 —— 让“这只手在听谁的”一目了然 */
  setHandHud(input, fingerMode = false) {
    const hud = $('#hand-hud');
    if (!hud) return;
    const kind = (h) => {
      if (!h) return 'none';
      if (fingerMode) return h.open ? 'track' : 'hold';
      return h.fist ? 'hold' : h.open ? 'track' : 'idle';
    };
    const text = fingerMode
      ? { track: '捏住·执签', hold: '松开', idle: '—', none: '未见' }
      : { track: '跟手', hold: '定住', idle: '半开', none: '未见' };
    const L = kind(input.a && input.a.left);
    const R = kind(input.a && input.a.right);
    hud.classList.toggle('is-on', input.count > 0);
    for (const [side, v] of [
      ['left', L],
      ['right', R],
    ]) {
      const chip = $(`#chip-${side}`);
      const span = $(`#hand-${side}`);
      if (chip) chip.dataset.state = v;
      if (span) span.textContent = text[v];
    }
  }

  /** 剧情里“需要你做的动作”提示；ok=true 表示已经认出来了（变绿 + 打勾） */
  setCue(text, ok = false) {
    const el = $('#cue');
    if (!el) return;
    el.textContent = text ? (ok ? `✓ 已认出：${text}` : text) : '';
    el.classList.toggle('is-on', !!text);
    el.classList.toggle('is-ok', !!text && ok);
  }

  /** 识别到的姿态（作揖 / 亮相 / 甩袖），给观众一个“我做到了”的确认 */
  setPosture(name) {
    const el = $('#posture');
    if (!el) return;
    const label = { bow: '作揖', flourish: '亮相', swing: '甩袖' }[name];
    if (!label || this._postureName === name) {
      if (!label) {
        el.classList.remove('is-on');
        this._postureName = null;
      }
      return;
    }
    this._postureName = name;
    el.textContent = `已认出 · ${label}`;
    el.classList.add('is-on');
  }

  /** 鼠标开关同步 */
  setMouseToggle(on) {
    const btn = $('#mouse-toggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const em = $('#mouse-state');
    if (em) em.textContent = on ? '开' : '关';
  }

  /** 音乐开关同步 */
  setMusicToggle(on) {
    const btn = $('#music-toggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const em = $('#music-state');
    if (em) em.textContent = on ? '开' : '关';
  }

  /** 教学关卡片 */
  setLesson({ visible, index = 0, total = 4, title = '', tip = '', progress = 0 } = {}) {
    const el = $('#lesson');
    if (!el) return;
    el.classList.toggle('is-on', !!visible);
    document.body.classList.toggle('lesson-on', !!visible);
    if (!visible) return;
    const t = $('#lesson-title');
    const p = $('#lesson-tip');
    const bar = $('#lesson-bar');
    const dots = $('#lesson-dots');
    const idx = $('#lesson-index');
    if (t) t.textContent = title;
    if (p) p.textContent = tip;
    if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
    if (idx) idx.textContent = `第 ${index + 1} / ${total} 步`;
    if (dots) {
      dots.innerHTML = '';
      for (let i = 0; i < total; i += 1) {
        const d = document.createElement('i');
        if (i < index) d.className = 'done';
        else if (i === index) d.className = 'now';
        dots.append(d);
      }
    }
  }

  setGestureHint(name, value = 0) {
    for (const el of this.hintEls) {
      const isTarget = el.dataset.hint === name;
      el.classList.toggle('is-active', isTarget);
      el.style.setProperty('--p', isTarget ? value.toFixed(2) : '0');
    }
  }

  seal(text) {
    if (!this.sealEl) return;
    this.sealEl.textContent = text;
    this.sealEl.classList.remove('is-on');
    void this.sealEl.offsetWidth;
    this.sealEl.classList.add('is-on');
  }

  showPhoto(url) {
    if (!this.photoLayer || !this.photoImg) return;
    this.photoImg.src = url;
    this.photoLayer.classList.add('is-on');
  }

  hidePhoto() {
    this.photoLayer?.classList.remove('is-on');
  }

  setHands(input, gestureHands) {
    if (!this.lmCtx) return;
    const { width: w, height: h } = this.lmCanvas;
    this.lmCtx.clearRect(0, 0, w, h);
    if (!gestureHands || !gestureHands.length) return;
    for (const hand of gestureHands) {
      if (hand.age > 0.3) continue;
      this.lmCtx.strokeStyle = 'rgba(255, 214, 140, .9)';
      this.lmCtx.fillStyle = 'rgba(178, 46, 32, .95)';
      this.lmCtx.lineWidth = 1.6;
      const p = hand.landmarks.map((pt) => ({ x: (1 - pt.x) * w, y: pt.y * h }));
      const chains = [
        [0, 1, 2, 3, 4],
        [0, 5, 6, 7, 8],
        [0, 9, 10, 11, 12],
        [0, 13, 14, 15, 16],
        [0, 17, 18, 19, 20],
        [5, 9, 13, 17],
      ];
      for (const chain of chains) {
        this.lmCtx.beginPath();
        chain.forEach((idx, i) => {
          const pt = p[idx];
          if (i === 0) this.lmCtx.moveTo(pt.x, pt.y);
          else this.lmCtx.lineTo(pt.x, pt.y);
        });
        this.lmCtx.stroke();
      }
      for (const pt of p) {
        this.lmCtx.beginPath();
        this.lmCtx.arc(pt.x, pt.y, 1.7, 0, Math.PI * 2);
        this.lmCtx.fill();
      }
    }
  }

  setLoading(pct, label) {
    if (!this.loadingEl) return;
    if (this.loadingBar) this.loadingBar.style.width = `${Math.round(pct * 100)}%`;
    if (label && this.loadingLabel) this.loadingLabel.textContent = label;
    if (pct >= 1) {
      this.loadingEl.classList.add('is-done');
      setTimeout(() => this.loadingEl.classList.add('is-hidden'), 700);
    }
  }

  setFps(fps) {
    if (this.fpsEl) this.fpsEl.textContent = `${Math.round(fps)} fps`;
  }

  setCameraVisible(on) {
    const card = $('#camera-card');
    if (card) card.classList.toggle('is-hidden', !on);
  }

  /** 摄像头起不来时，直接把原因显示在小窗里 */
  setCameraError(text) {
    const card = $('#camera-card');
    const fb = $('#camera-fallback');
    if (fb) fb.textContent = text;
    if (!card) return;
    card.classList.remove('is-hidden');
    card.classList.add('is-error');
  }

  /** 唤醒环文字（没开摄像头时改成“点击开灯”，别让人对着“举手”干瞪眼） */
  setWakeText(text) {
    const el = $('#wake-text');
    if (el) el.textContent = text;
  }

  /** 还没申请过摄像头：邀请用户点击（点击 = 用户手势，授权框必弹） */
  setCameraIdle() {
    const card = $('#camera-card');
    const fb = $('#camera-fallback');
    if (fb) fb.textContent = '▶ 点这里开启摄像头\n（浏览器会弹出授权框）';
    if (!card) return;
    card.classList.remove('is-hidden');
    card.classList.add('is-ask');
  }

  setCameraBusy(text) {
    const card = $('#camera-card');
    const fb = $('#camera-fallback');
    if (!card) return;
    if (!text) {
      card.classList.remove('is-error', 'is-ask');
      fb && (fb.textContent = '');
      return;
    }
    card.classList.remove('is-hidden', 'is-error');
    card.classList.add('is-ask');
    if (fb) fb.textContent = text;
  }

  /** 上手引导：标题 + 副标题 + [[动词, 说明], ...] */
  setTutorial(title, sub, lines) {
    const t = $('#tut-title');
    const s = $('#tut-sub');
    const l = $('#tut-list');
    if (title && t) t.textContent = title;
    if (sub && s) s.textContent = sub;
    if (lines && l) {
      l.innerHTML = '';
      for (const [verb, desc] of lines) {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = verb;
        const span = document.createElement('span');
        span.textContent = desc;
        li.append(b, span);
        l.append(li);
      }
    }
  }

  toggleHelp(force) {
    // 手动切换（不带 force）时取消“自动收起”
    if (force === undefined) clearTimeout(this._guideTimer);
    // 以「当前是否真的看得见」为准：待机状态下引导卡默认可见，
    // 所以第一次按 H 应该是“收起来”，而不是再设一遍 help。
    const attract = document.getElementById('app')?.dataset.state === 'attract';
    const visible =
      document.body.classList.contains('help') ||
      (attract && !document.body.classList.contains('help-off'));
    const on = force === undefined ? !visible : !!force;
    document.body.classList.toggle('help', on);
    // help-off 用来压住“待机状态默认显示引导卡”的规则，这样 H 才能真正收起来
    document.body.classList.toggle('help-off', !on);
    return on;
  }

  /** 自动弹一下引导卡（教学关结束时提醒“动作总表在这”），到点自己收 */
  flashGuide(ms = 5200) {
    this.toggleHelp(true);
    clearTimeout(this._guideTimer);
    this._guideTimer = setTimeout(() => this.toggleHelp(false), ms);
  }

  setDebug(lines) {
    const el = $('#debug-panel');
    if (!el) return;
    el.textContent = lines.join('\n');
  }

  setDebugVisible(on) {
    document.body.classList.toggle('debug', !!on);
  }
}
