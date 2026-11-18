/* Aqua Drift — a Frutiger Aero brick-breaker side-scroller.
 * The fish rides inside a glass bubble (the ball). The platform is a
 * Windows 7 style scrollbar thumb. Left/Right scrolls the stage; the
 * screen edges push the fish along.
 */
(() => {
  'use strict';

  // ---------- Constants ----------
  const VH = 720;                // virtual world height
  const PADDLE_W = 168;
  const PADDLE_H = 26;
  const PADDLE_Y = VH - 54;      // top surface of the thumb
  const TRACK_Y = VH - 58;
  const TRACK_H = 34;
  const ARROW_W = 36;
  const FISH_R = 33;
  const SCROLL_SPEED = 420;
  const TAU = Math.PI * 2;

  const BRICK_COLORS = ['#25c4f5', '#8fe04a', '#3f8cff', '#22d6b4', '#ffb43d', '#6fe0ff'];

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const ui = {
    hud: $('hud'), menu: $('menu'), pause: $('pause'), clear: $('clear'), over: $('over'),
    score: $('score'), lives: $('lives'), progress: $('progress'), stageLabel: $('stageLabel'),
    bestMenu: $('bestMenu'), bestOver: $('bestOver'), finalScore: $('finalScore'), newBest: $('newBest'),
    clearTitle: $('clearTitle'), clearScore: $('clearScore'), clearBonus: $('clearBonus'),
    mute: $('muteBtn'), leftBtn: $('leftBtn'), rightBtn: $('rightBtn'),
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  // ---------- Helpers ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  function rng32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rrect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---------- Images (royalty-free photos, see CREDITS.md) ----------
  const img = {};
  const pat = {};
  function loadImage(key, src) {
    return new Promise((res) => {
      const i = new Image();
      i.onload = () => { img[key] = i; res(); };
      i.onerror = () => res();
      i.src = src;
    });
  }
  const ready = Promise.all([
    loadImage('bg', 'assets/bg.jpg'),
    loadImage('fish', 'assets/fish.png'),
    loadImage('glass', 'assets/glass.jpg'),
    loadImage('pillar', 'assets/pillar.jpg'),
  ]).then(() => {
    for (const k of ['glass', 'pillar']) {
      if (!img[k]) continue;
      pat[k] = ctx.createPattern(img[k], 'repeat');
      if (pat[k].setTransform) pat[k].setTransform(new DOMMatrix().scale(k === 'glass' ? 0.45 : 0.6));
    }
  });

  // ---------- Viewport ----------
  let W = 0, H = 0, DPR = 1, S = 1, VW = 1280, OY = 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    S = Math.min(H / VH, W / 640);
    VW = W / S;
    OY = H - VH * S; // anchor world to the bottom of the screen
    if (paddle) paddle.x = clamp(paddle.x, ARROW_W, VW - ARROW_W - PADDLE_W);
  }

  // ---------- Audio ----------
  let actx = null, master = null;
  let muted = store.get('aquaDrift.muted', false);
  function initAudio() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(actx.destination);
    } catch { actx = null; }
  }
  function tone(f1, f2, dur, type = 'sine', vol = 0.2, delay = 0) {
    if (!actx || muted) return;
    const t0 = actx.currentTime + delay;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
  const sfx = {
    paddle: () => tone(440, 660, 0.09, 'sine', 0.16),
    wall: () => tone(rand(700, 800), 520, 0.06, 'sine', 0.08),
    clink: () => { tone(1900, 1500, 0.12, 'sine', 0.1); tone(2800, 2600, 0.08, 'sine', 0.05); },
    shatter: () => { for (let i = 0; i < 4; i++) tone(rand(1600, 3200), rand(900, 1400), 0.16, 'triangle', 0.06, i * 0.025); },
    pearl: () => { tone(988, 1318, 0.12, 'sine', 0.13); tone(1318, 1760, 0.14, 'sine', 0.09, 0.06); },
    gate: () => [659, 784, 988].forEach((f, i) => tone(f, f, 0.22, 'sine', 0.1, i * 0.07)),
    lose: () => tone(330, 110, 0.5, 'triangle', 0.16),
    clear: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f * 1.005, 0.35, 'sine', 0.13, i * 0.09)),
    over: () => [523, 440, 349, 262].forEach((f, i) => tone(f, f * 0.98, 0.35, 'triangle', 0.14, i * 0.16)),
    launch: () => tone(330, 880, 0.18, 'sine', 0.13),
  };
  let chimeT = 0;
  function ambient(dt) {
    chimeT -= dt;
    if (chimeT <= 0) {
      chimeT = rand(0.9, 2.2);
      const f = PENTA[(Math.random() * PENTA.length) | 0] / 2;
      tone(f, f, 1.8, 'sine', 0.035);
    }
  }

  // ---------- State ----------
  let state = 'menu';            // menu | play | paused | clear | over
  let t = 0;
  let score = 0;
  let best = store.get('aquaDrift.best', 0);
  let stage = 1;
  let lives = 3;
  let level = null;
  let camX = 0;
  let paddle = { x: 400, glow: 0 };
  let fish = null;
  let particles = [];
  let texts = [];
  let ambientBubbles = [];
  let shake = 0;
  let blockedFlash = 0;
  let lastHud = '';

  function newFish() {
    return { x: 0, y: 0, vx: 0, vy: 0, r: FISH_R, speed: 470, launched: false, sq: 0, face: 1, tilt: 0, wob: 0 };
  }

  // ---------- Level generation ----------
  function buildLevel(n) {
    const r = rng32(n * 7919 + 13);
    const obs = [];
    const pearls = [];
    const gates = [];
    const gateCount = 4 + n * 2;
    const spacing = Math.max(440, 620 - n * 25);
    const PW = 62;
    let x = 980;
    for (let i = 0; i < gateCount; i++) {
      const gapH = Math.max(160, 230 - n * 9);
      const mov = n >= 2 && r() < Math.min(0.18 * n, 0.6)
        ? { amp: 30 + r() * 50, spd: 0.7 + r() * 0.8, ph: r() * TAU } : null;
      const amp = mov ? mov.amp : 0;
      const minY = 50 + amp;
      const maxY = VH - 250 - gapH - amp;
      const gapY = minY + r() * Math.max(0, maxY - minY);
      obs.push({ type: 'pillar', x, y: -600, w: PW, h: gapY + 600, mov, cap: 'bottom' });
      obs.push({ type: 'pillar', x, y: gapY + gapH, w: PW, h: VH + 600 - (gapY + gapH), mov, cap: 'top' });
      gates.push({ x: x + PW, passed: false });

      if (r() < 0.45 + n * 0.1) {
        const rows = 3;
        const bh = gapH / rows;
        for (let k = 0; k < rows; k++) {
          const hp = r() < 0.15 + n * 0.08 ? 2 : 1;
          obs.push({ type: 'brick', x: x + 5, y: gapY + k * bh + 3, w: PW - 10, h: bh - 6, hp, maxHp: hp, color: BRICK_COLORS[(r() * BRICK_COLORS.length) | 0], mov, flash: 0, seed: r() * 1000 });
        }
      } else {
        pearls.push({ x: x + PW / 2, y: gapY + gapH / 2, r: 13, mov, taken: false, ph: r() * TAU });
      }

      if (i < gateCount - 1 && r() < 0.65) {
        const cols = 2 + ((r() * 2) | 0);
        const rows = 1 + ((r() * 2) | 0);
        const bw = 58, bh = 28, g = 6;
        const cx = x + PW + (spacing - PW) / 2 - (cols * (bw + g)) / 2;
        const cy = 90 + r() * (VH - 470);
        for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
          const hp = r() < 0.2 + n * 0.06 ? 2 : 1;
          obs.push({ type: 'brick', x: cx + a * (bw + g), y: cy + b * (bh + g), w: bw, h: bh, hp, maxHp: hp, color: BRICK_COLORS[(r() * BRICK_COLORS.length) | 0], mov: null, flash: 0, seed: r() * 1000 });
        }
        for (let p = 0; p < 2; p++) {
          pearls.push({ x: x + PW + 80 + r() * (spacing - 220), y: 80 + r() * (VH - 380), r: 13, mov: null, taken: false, ph: r() * TAU });
        }
      }
      x += spacing;
    }
    const finish = { x: x + 160, y: VH * 0.42, r: 72 };
    return { obs, pearls, gates, finish, len: finish.x + 520 };
  }

  function offY(o) { return o.mov ? Math.sin(t * o.mov.spd + o.mov.ph) * o.mov.amp : 0; }

  // ---------- Input ----------
  const keys = new Set();
  const pointer = { x: 0, y: 0, seen: false };
  let holdScroll = 0;   // from on-screen / scrollbar arrow buttons

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ([' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
    if (e.repeat) { keys.add(k); return; }
    keys.add(k);
    if (k === 'p' || k === 'escape') togglePause();
    if (k === 'm') toggleMute();
    if (k === 'enter' || k === ' ') {
      if (state === 'menu') startGame();
      else if (state === 'over' && !ui.over.classList.contains('hidden')) startGame();
      else if (state === 'clear' && !ui.clear.classList.contains('hidden')) nextStage();
      else if (state === 'play') launch();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => { keys.clear(); holdScroll = 0; if (state === 'play') togglePause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });

  function toVirtual(e) {
    return { x: e.clientX / S, y: (e.clientY - OY) / S };
  }
  function arrowAt(v) {
    if (v.y < TRACK_Y || v.y > TRACK_Y + TRACK_H) return 0;
    if (v.x < ARROW_W) return -1;
    if (v.x > VW - ARROW_W) return 1;
    return 0;
  }
  canvas.addEventListener('pointermove', (e) => {
    const v = toVirtual(e);
    pointer.x = v.x; pointer.y = v.y; pointer.seen = true;
  });
  canvas.addEventListener('pointerdown', (e) => {
    initAudio();
    const v = toVirtual(e);
    pointer.x = v.x; pointer.y = v.y; pointer.seen = true;
    const a = arrowAt(v);
    if (a) { holdScroll = a; return; }
    if (state === 'play') launch();
  });
  const endHold = () => { holdScroll = 0; };
  canvas.addEventListener('pointerup', endHold);
  canvas.addEventListener('pointercancel', endHold);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function bindHold(btn, dir) {
    const on = (e) => { e.preventDefault(); initAudio(); holdScroll = dir; btn.classList.add('on'); };
    const off = () => { if (holdScroll === dir) holdScroll = 0; btn.classList.remove('on'); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  }
  bindHold(ui.leftBtn, -1);
  bindHold(ui.rightBtn, 1);

  $('playBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  $('resumeBtn').addEventListener('click', togglePause);
  $('nextBtn').addEventListener('click', nextStage);
  ui.mute.addEventListener('click', toggleMute);

  function toggleMute() {
    muted = !muted;
    store.set('aquaDrift.muted', muted);
    if (master) master.gain.value = muted ? 0 : 0.5;
    ui.mute.classList.toggle('muted', muted);
  }
  ui.mute.classList.toggle('muted', muted);

  function show(el, on) { el.classList.toggle('hidden', !on); }

  function togglePause() {
    if (state === 'play') { state = 'paused'; show(ui.pause, true); }
    else if (state === 'paused') { state = 'play'; show(ui.pause, false); last = performance.now(); }
  }

  // ---------- Flow ----------
  function startGame() {
    initAudio();
    score = 0; lives = 3; stage = 1;
    beginStage();
    sfx.launch();
  }
  function beginStage() {
    level = buildLevel(stage);
    camX = 0;
    fish = newFish();
    fish.speed = 470 + (stage - 1) * 28;
    particles = []; texts = [];
    state = 'play';
    lastHud = '';
    show(ui.menu, false); show(ui.over, false); show(ui.clear, false); show(ui.pause, false);
    show(ui.hud, true);
    addText(VW / 2, VH * 0.35, 'Stage ' + stage, '#ffffff', 46, true);
  }
  function nextStage() {
    if (state !== 'clear') return;
    stage++;
    beginStage();
  }
  function launch() {
    if (!fish || fish.launched) return;
    fish.launched = true;
    const ang = rand(-0.35, 0.35) + 0.25;
    fish.vx = Math.sin(ang) * fish.speed;
    fish.vy = -Math.cos(ang) * fish.speed;
    sfx.launch();
  }
  function loseLife() {
    lives--;
    sfx.lose();
    shake = 14;
    burst(fish.x, VH - 30, 26, ['#ffffff', '#bdf3ff', '#7fd8ff'], 'bubble');
    if (lives <= 0) {
      state = 'over';
      const isBest = score > best;
      if (isBest) { best = score; store.set('aquaDrift.best', best); }
      ui.finalScore.textContent = score;
      ui.bestOver.textContent = best;
      show(ui.newBest, isBest);
      setTimeout(() => { if (state === 'over') { show(ui.over, true); sfx.over(); } }, 650);
      return;
    }
    fish = Object.assign(newFish(), { speed: fish.speed });
  }
  function stageClear() {
    state = 'clear';
    const bonus = 500 + lives * 150 + stage * 100;
    score += bonus;
    const extra = lives < 5;
    if (extra) lives++;
    if (score > best) { best = score; store.set('aquaDrift.best', best); }
    ui.clearTitle.textContent = 'Stage ' + stage + ' clear!';
    ui.clearScore.textContent = score;
    ui.clearBonus.textContent = 'Bonus +' + bonus + (extra ? '  ·  extra life' : '');
    burst(level.finish.x, level.finish.y, 60, ['#ffffff', '#c9ff8a', '#8fe8ff', '#ffe28a'], 'spark');
    sfx.clear();
    updateHud(true);
    setTimeout(() => { if (state === 'clear') show(ui.clear, true); }, 700);
  }

  // ---------- Effects ----------
  function burst(x, y, n, colors, kind) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rand(60, kind === 'spark' ? 420 : 260);
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === 'bubble' ? 80 : 0),
        life: 0, max: rand(0.5, 1.1), size: rand(3, kind === 'shard' ? 10 : 7),
        color: colors[(Math.random() * colors.length) | 0], kind, rot: rand(0, TAU), vr: rand(-10, 10),
      });
    }
  }
  function addText(x, y, txt, color = '#ffffff', size = 24, screen = false) {
    texts.push({ x, y, txt, color, size, life: 0, max: screen ? 1.6 : 1.0, screen });
  }

  // ---------- Physics ----------
  function overlapsSolid(fx, fy, r) {
    for (const o of level.obs) {
      if (o.dead) continue;
      if (o.x > fx + r || o.x + o.w < fx - r) continue;
      const oy = o.y + offY(o);
      const cx = clamp(fx, o.x, o.x + o.w), cy = clamp(fy, oy, oy + o.h);
      const dx = fx - cx, dy = fy - cy;
      if (dx * dx + dy * dy < r * r * 0.9) return true;
    }
    return false;
  }

  function normalizeSpeed() {
    const sp = fish.speed;
    let m = Math.hypot(fish.vx, fish.vy) || 1;
    fish.vx = fish.vx / m * sp; fish.vy = fish.vy / m * sp;
    // keep some vertical motion so the fish never skims sideways forever
    const minVy = sp * 0.28;
    if (Math.abs(fish.vy) < minVy) {
      fish.vy = (fish.vy < 0 ? -1 : 1) * minVy;
      fish.vx = Math.sign(fish.vx || 1) * Math.sqrt(sp * sp - minVy * minVy);
    }
  }

  function hitRect(o) {
    const oy = o.y + offY(o);
    const f = fish;
    const cx = clamp(f.x, o.x, o.x + o.w), cy = clamp(f.y, oy, oy + o.h);
    const dx = f.x - cx, dy = f.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > f.r * f.r) return false;
    let nx, ny, pen;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = f.r - d;
    } else {
      const l = f.x - o.x, rr = o.x + o.w - f.x, tp = f.y - oy, b = oy + o.h - f.y;
      const m = Math.min(l, rr, tp, b);
      if (m === l) { nx = -1; ny = 0; pen = l + f.r; }
      else if (m === rr) { nx = 1; ny = 0; pen = rr + f.r; }
      else if (m === tp) { nx = 0; ny = -1; pen = tp + f.r; }
      else { nx = 0; ny = 1; pen = b + f.r; }
    }
    f.x += nx * pen; f.y += ny * pen;
    const vn = f.vx * nx + f.vy * ny;
    if (vn < 0) { f.vx -= 2 * vn * nx; f.vy -= 2 * vn * ny; }
    normalizeSpeed();
    f.sq = 1;

    if (o.type === 'brick') {
      o.hp--; o.flash = 1;
      if (o.hp <= 0) {
        o.dead = true;
        const pts = 50 * o.maxHp;
        score += pts;
        addText(o.x + o.w / 2, oy + o.h / 2, '+' + pts, '#ffffff', 22);
        burst(o.x + o.w / 2, oy + o.h / 2, 18, [o.color, '#ffffff', '#d8f7ff'], 'shard');
        sfx.shatter();
        shake = Math.max(shake, 4);
      } else {
        score += 10;
        sfx.clink();
      }
    } else {
      sfx.wall();
      burst(f.x - nx * f.r, f.y - ny * f.r, 5, ['#ffffff', '#c9f3ff'], 'bubble');
    }
    return true;
  }

  function stepFish(dt) {
    const f = fish;
    f.x += f.vx * dt; f.y += f.vy * dt;

    if (f.y - f.r < 0) { f.y = f.r; f.vy = Math.abs(f.vy); sfx.wall(); f.sq = 1; }
    if (f.x - f.r < camX) { f.x = camX + f.r; f.vx = Math.abs(f.vx); f.sq = 1; }
    if (f.x + f.r > camX + VW) { f.x = camX + VW - f.r; f.vx = -Math.abs(f.vx); f.sq = 1; }

    for (const o of level.obs) {
      if (o.dead) continue;
      if (o.x > f.x + f.r + 2 || o.x + o.w < f.x - f.r - 2) continue;
      hitRect(o);
    }

    // scrollbar thumb (paddle)
    const px = camX + paddle.x;
    if (f.vy > 0 && f.y + f.r >= PADDLE_Y && f.y + f.r <= PADDLE_Y + PADDLE_H + 16 &&
        f.x >= px - f.r * 0.7 && f.x <= px + PADDLE_W + f.r * 0.7) {
      const hit = clamp((f.x - (px + PADDLE_W / 2)) / (PADDLE_W / 2 + f.r * 0.4), -1, 1);
      const ang = hit * 1.0;
      f.vx = Math.sin(ang) * f.speed;
      f.vy = -Math.cos(ang) * f.speed;
      f.y = PADDLE_Y - f.r;
      f.sq = 1;
      paddle.glow = 1;
      sfx.paddle();
      burst(f.x, PADDLE_Y, 6, ['#ffffff', '#bde6fd'], 'bubble');
    }
  }

  // ---------- Update ----------
  function update(dt) {
    t += dt;
    if (state === 'play' || state === 'clear') ambient(dt);

    // ambient background bubbles (screen space, decorative)
    if (ambientBubbles.length < 26 && Math.random() < dt * 6) {
      ambientBubbles.push({ x: rand(0, VW), y: VH + 20, r: rand(2, 9), vy: rand(-30, -80), ph: rand(0, TAU), depth: rand(0.3, 1) });
    }
    for (const b of ambientBubbles) { b.y += b.vy * dt; b.x += Math.sin(t * 1.5 + b.ph) * 12 * dt; }
    ambientBubbles = ambientBubbles.filter((b) => b.y > -20);

    if (pointer.seen) paddle.x = clamp(pointer.x - PADDLE_W / 2, ARROW_W, VW - ARROW_W - PADDLE_W);
    paddle.glow = Math.max(0, paddle.glow - dt * 3);

    if (state === 'play' && level) {
      // stage scrolling
      let dir = 0;
      if (keys.has('arrowright') || keys.has('d')) dir += 1;
      if (keys.has('arrowleft') || keys.has('a')) dir -= 1;
      if (!dir) dir = holdScroll;
      if (dir) {
        const maxCam = Math.max(0, level.len - VW);
        const nc = clamp(camX + dir * SCROLL_SPEED * dt, 0, maxCam);
        if (fish.launched) {
          const ox = fish.x;
          let nx = fish.x;
          if (dir > 0 && fish.x - fish.r < nc) nx = nc + fish.r;
          if (dir < 0 && fish.x + fish.r > nc + VW) nx = nc + VW - fish.r;
          if (nx !== ox && overlapsSolid(nx, fish.y, fish.r)) {
            blockedFlash = 1;
          } else {
            fish.x = nx;
            if (dir > 0 && nx !== ox && fish.vx < 0) fish.vx = -fish.vx;
            if (dir < 0 && nx !== ox && fish.vx > 0) fish.vx = -fish.vx;
            camX = nc;
          }
        } else {
          camX = nc;
        }
      }
      blockedFlash = Math.max(0, blockedFlash - dt * 3);

      if (!fish.launched) {
        fish.x = camX + paddle.x + PADDLE_W / 2;
        fish.y = PADDLE_Y - fish.r - 2 + Math.sin(t * 3) * 3;
        fish.face = 1; fish.tilt = 0;
      } else {
        const steps = Math.ceil((fish.speed * dt) / 7);
        for (let i = 0; i < steps; i++) stepFish(dt / steps);
        if (Math.abs(fish.vx) > 20) fish.face = fish.vx > 0 ? 1 : -1;
        const target = clamp(Math.atan2(fish.vy, Math.abs(fish.vx)) * 0.55, -0.7, 0.7);
        fish.tilt = lerp(fish.tilt, target, 1 - Math.exp(-dt * 8));

        // pearls
        for (const p of level.pearls) {
          if (p.taken) continue;
          const py = p.y + offY(p);
          if (Math.hypot(p.x - fish.x, py - fish.y) < p.r + fish.r) {
            p.taken = true; score += 25; sfx.pearl();
            addText(p.x, py - 10, '+25', '#fff6b0', 20);
            burst(p.x, py, 14, ['#ffffff', '#fff3a8', '#c9f3ff'], 'spark');
          }
        }
        // gates
        for (const g of level.gates) {
          if (!g.passed && fish.x - fish.r > g.x) {
            g.passed = true; score += 100; sfx.gate();
            addText(fish.x, fish.y - 40, 'Nice! +100', '#d9ffb0', 22);
          }
        }
        // finish
        const fz = level.finish;
        if (Math.hypot(fz.x - fish.x, fz.y - fish.y) < fz.r) { stageClear(); }
        // fell
        if (fish.y - fish.r > VH + 10) loseLife();
      }
    }
    fish && (fish.sq = Math.max(0, fish.sq - dt * 5));
    if (level) for (const o of level.obs) if (o.flash) o.flash = Math.max(0, o.flash - dt * 5);

    for (const p of particles) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - dt * 2.2; p.vy *= 1 - dt * 2.2;
      if (p.kind === 'shard') p.vy += 500 * dt;
      if (p.kind === 'bubble') p.vy -= 120 * dt;
      p.rot += p.vr * dt;
    }
    particles = particles.filter((p) => p.life < p.max);
    for (const tx of texts) { tx.life += dt; tx.y -= (tx.screen ? 14 : 40) * dt; }
    texts = texts.filter((tx) => tx.life < tx.max);
    shake = Math.max(0, shake - dt * 40);

    updateHud();
  }

  function updateHud(force) {
    if (!level || !fish) return;
    const prog = clamp((fish.x - 200) / (level.finish.x - 200), 0, 1);
    const key = score + '|' + lives + '|' + stage + '|' + Math.round(prog * 200);
    if (!force && key === lastHud) return;
    lastHud = key;
    ui.score.textContent = score;
    ui.stageLabel.textContent = 'Stage ' + stage;
    ui.progress.style.width = (prog * 100).toFixed(1) + '%';
    let html = '';
    const n = Math.max(3, lives);
    for (let i = 0; i < n; i++) html += '<span class="life' + (i < lives ? '' : ' lost') + '"></span>';
    ui.lives.innerHTML = html;
  }

  // ---------- Drawing ----------
  function drawBackground() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const bg = img.bg;
    if (bg) {
      const sc = H / bg.height * 1.04;
      const iw = bg.width * sc, ih = bg.height * sc;
      const off = ((camX * S * 0.18) % (iw * 2) + iw * 2) % (iw * 2);
      for (let x = -off, k = 0; x < W; x += iw, k++) {
        ctx.save();
        if (k % 2 === 1) { ctx.translate(x + iw, 0); ctx.scale(-1, 1); ctx.drawImage(bg, 0, -ih * 0.02, iw, ih); }
        else ctx.drawImage(bg, x, -ih * 0.02, iw, ih);
        ctx.restore();
      }
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#bff1ff'); g.addColorStop(1, '#0a6aa8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // Aero colour grade: brighten + cyan/green lift
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(190,250,255,0.55)');
    g.addColorStop(0.45, 'rgba(60,190,240,0.28)');
    g.addColorStop(1, 'rgba(40,200,170,0.22)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // sun glare
    const sx = W * 0.72, sy = -H * 0.05;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.55);
    sg.addColorStop(0, 'rgba(255,255,255,0.75)');
    sg.addColorStop(0.25, 'rgba(220,255,255,0.25)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);

    // light rays
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const base = (i / 6) * W * 1.3 - W * 0.15 - ((camX * S * 0.08) % (W * 0.22));
      const sway = Math.sin(t * 0.3 + i * 1.7) * W * 0.04;
      const w0 = W * (0.03 + (i % 3) * 0.015);
      const rg = ctx.createLinearGradient(0, 0, 0, H * 0.9);
      rg.addColorStop(0, 'rgba(255,255,255,0.16)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(base + sway, 0);
      ctx.lineTo(base + sway + w0, 0);
      ctx.lineTo(base + sway * 2 + w0 * 4 - W * 0.12, H * 0.9);
      ctx.lineTo(base + sway * 2 - W * 0.12, H * 0.9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // decorative rising bubbles
    ctx.setTransform(DPR * S, 0, 0, DPR * S, 0, DPR * OY);
    for (const b of ambientBubbles) {
      ctx.globalAlpha = 0.35 + b.depth * 0.4;
      drawGlassBubble(b.x, b.y, b.r, false);
    }
    ctx.globalAlpha = 1;
  }

  function drawGlassBubble(x, y, r, strong) {
    const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.68, strong ? 'rgba(190,245,255,0.14)' : 'rgba(190,245,255,0.08)');
    g.addColorStop(0.92, 'rgba(225,252,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0.85)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    const hg = ctx.createLinearGradient(0, y - r * 0.9, 0, y - r * 0.12);
    hg.addColorStop(0, 'rgba(255,255,255,0.92)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.ellipse(x - r * 0.04, y - r * 0.5, r * 0.62, r * 0.36, 0, 0, TAU); ctx.fill();
    if (strong) {
      ctx.strokeStyle = 'rgba(150,255,230,0.55)';
      ctx.lineWidth = r * 0.07;
      ctx.beginPath(); ctx.arc(x, y, r * 0.82, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(x + r * 0.5, y + r * 0.42, r * 0.07, 0, TAU); ctx.fill();
    }
  }

  function drawPillar(o) {
    const y = o.y + offY(o), x = o.x, w = o.w, h = o.h;
    ctx.save();
    rrect(ctx, x, y, w, h, 16);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = pat.pillar || '#2fb8c8';
    ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.16)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.85, 'rgba(0,70,110,0.18)');
    g.addColorStop(1, 'rgba(0,40,80,0.4)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x + w * 0.14, y, w * 0.07, h);
    // glossy cap at the gap end
    const capY = o.cap === 'top' ? y : y + h - 34;
    const cg = ctx.createLinearGradient(0, capY, 0, capY + 34);
    if (o.cap === 'top') { cg.addColorStop(0, 'rgba(255,255,255,0.7)'); cg.addColorStop(1, 'rgba(255,255,255,0)'); }
    else { cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(255,255,255,0.45)'); }
    ctx.fillStyle = cg; ctx.fillRect(x, capY, w, 34);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    rrect(ctx, x + 3, y + 3, w - 6, h - 6, 13);
    ctx.strokeStyle = 'rgba(0,90,140,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  function drawBrick(o) {
    const y = o.y + offY(o), x = o.x, w = o.w, h = o.h;
    ctx.save();
    rrect(ctx, x, y, w, h, 8);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = pat.glass || '#8fe8ff';
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = o.color;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.48, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    g.addColorStop(1, 'rgba(255,255,255,0.35)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    if (o.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (o.flash * 0.7) + ')'; ctx.fillRect(x, y, w, h); }
    if (o.maxHp > 1 && o.hp < o.maxHp) {
      // crack
      const r = rng32(o.seed | 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      let cx = x + w * (0.3 + r() * 0.4), cy = y;
      ctx.moveTo(cx, cy);
      while (cy < y + h) { cx += (r() - 0.5) * w * 0.3; cy += h * (0.2 + r() * 0.2); ctx.lineTo(cx, cy); }
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.6; ctx.stroke();
    if (o.maxHp > 1) {
      rrect(ctx, x + 4, y + 4, w - 8, h - 8, 5);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.restore();
  }

  function drawPortal(fz) {
    const pulse = 1 + Math.sin(t * 3) * 0.04;
    const r = fz.r * pulse;
    ctx.save();
    const glow = ctx.createRadialGradient(fz.x, fz.y, r * 0.4, fz.x, fz.y, r * 1.8);
    glow.addColorStop(0, 'rgba(220,255,180,0.55)');
    glow.addColorStop(0.5, 'rgba(140,240,255,0.25)');
    glow.addColorStop(1, 'rgba(140,240,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(fz.x, fz.y, r * 1.8, 0, TAU); ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 0 ? 'rgba(255,255,255,0.95)' : i === 1 ? 'rgba(150,240,90,0.85)' : 'rgba(60,200,255,0.8)';
      ctx.lineWidth = 6 - i * 1.5;
      ctx.beginPath(); ctx.arc(fz.x, fz.y, r - i * 9, t * (i % 2 ? -1 : 1) * 0.8, t * (i % 2 ? -1 : 1) * 0.8 + TAU * 0.8); ctx.stroke();
    }
    drawGlassBubble(fz.x, fz.y, r * 0.62, true);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 18px "Segoe UI", Ubuntu, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,90,150,0.8)'; ctx.shadowBlur = 6;
    ctx.fillText('GOAL', fz.x, fz.y);
    ctx.restore();
  }

  function drawFish() {
    const f = fish;
    if (!f) return;
    if (state === 'over' && lives <= 0) return;
    const sq = f.sq * 0.12;
    ctx.save();
    ctx.translate(f.x, f.y);
    // fish sprite inside the bubble, lagging slightly behind its motion
    const sp = Math.hypot(f.vx, f.vy) || 1;
    const lagX = f.launched ? -f.vx / sp * f.r * 0.1 : 0;
    const lagY = f.launched ? -f.vy / sp * f.r * 0.1 : 0;
    if (img.fish) {
      ctx.save();
      ctx.translate(lagX, lagY + Math.sin(t * 5) * 1.2);
      ctx.scale(f.face, 1);
      ctx.rotate(f.tilt);
      const fw = f.r * 1.95;
      const fh = fw * img.fish.height / img.fish.width;
      const wig = 1 + Math.sin(t * 10) * 0.025;
      ctx.drawImage(img.fish, -fw / 2, -fh / 2, fw * wig, fh);
      ctx.restore();
    }
    ctx.scale(1 + sq, 1 - sq);
    drawGlassBubble(0, 0, f.r, true);
    ctx.restore();
  }

  function drawPearl(p) {
    const y = p.y + offY(p) + Math.sin(t * 2 + p.ph) * 4;
    ctx.save();
    const g = ctx.createRadialGradient(p.x, y, 0, p.x, y, p.r * 2.4);
    g.addColorStop(0, 'rgba(255,250,200,0.5)');
    g.addColorStop(1, 'rgba(255,250,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, y, p.r * 2.4, 0, TAU); ctx.fill();
    const b = ctx.createRadialGradient(p.x - p.r * 0.35, y - p.r * 0.4, p.r * 0.1, p.x, y, p.r);
    b.addColorStop(0, '#ffffff');
    b.addColorStop(0.5, '#fff1b8');
    b.addColorStop(1, '#f0b84a');
    ctx.fillStyle = b;
    ctx.beginPath(); ctx.arc(p.x, y, p.r, 0, TAU); ctx.fill();
    ctx.restore();
    drawGlassBubble(p.x, y, p.r, false);
  }

  function drawParticles() {
    for (const p of particles) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      if (p.kind === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.2);
        ctx.restore();
      } else if (p.kind === 'bubble') {
        drawGlassBubble(p.x, p.y, p.size * 0.8, false);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a * 0.8 + 0.5, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawText(tx) {
    const a = clamp(1 - tx.life / tx.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, a * 2);
    ctx.font = '800 ' + tx.size + 'px "Segoe UI", Ubuntu, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, tx.size / 7);
    ctx.strokeStyle = 'rgba(0,80,140,0.75)';
    ctx.strokeText(tx.txt, tx.x, tx.y);
    ctx.fillStyle = tx.color;
    ctx.fillText(tx.txt, tx.x, tx.y);
    ctx.restore();
  }

  // Windows 7 style horizontal scrollbar: track + arrow buttons + glossy thumb (the platform)
  function drawScrollbar() {
    const y = TRACK_Y, h = TRACK_H;
    ctx.save();
    // track
    const tg = ctx.createLinearGradient(0, y, 0, y + h);
    tg.addColorStop(0, 'rgba(226,232,236,0.92)');
    tg.addColorStop(0.5, 'rgba(240,243,245,0.92)');
    tg.addColorStop(1, 'rgba(250,251,252,0.92)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, y, VW, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(0, y, VW, 1);
    ctx.fillStyle = 'rgba(160,170,180,0.6)'; ctx.fillRect(0, y - 1, VW, 1);

    // arrow buttons
    const drawArrow = (x, dir, active) => {
      rrect(ctx, x + 3, y + 4, ARROW_W - 6, h - 8, 3);
      const bg = ctx.createLinearGradient(0, y + 4, 0, y + h - 4);
      if (active) {
        bg.addColorStop(0, '#e5f5fd'); bg.addColorStop(0.5, '#d1ecfb'); bg.addColorStop(0.5, '#b4def7'); bg.addColorStop(1, '#a3d4f2');
      } else {
        bg.addColorStop(0, '#f7f7f7'); bg.addColorStop(0.5, '#ececec'); bg.addColorStop(0.5, '#dcdcdc'); bg.addColorStop(1, '#d4d4d4');
      }
      ctx.fillStyle = bg; ctx.fill();
      ctx.strokeStyle = active ? '#3c7fb1' : '#a0a0a0'; ctx.lineWidth = 1; ctx.stroke();
      const cx = x + ARROW_W / 2, cy = y + h / 2;
      ctx.fillStyle = active ? '#1d4f7a' : '#4d6185';
      ctx.beginPath();
      ctx.moveTo(cx - 3 * dir, cy - 5); ctx.lineTo(cx + 3 * dir, cy); ctx.lineTo(cx - 3 * dir, cy + 5);
      ctx.closePath(); ctx.fill();
    };
    const goingL = keys.has('arrowleft') || keys.has('a') || holdScroll < 0;
    const goingR = keys.has('arrowright') || keys.has('d') || holdScroll > 0;
    drawArrow(0, -1, goingL);
    drawArrow(VW - ARROW_W, 1, goingR);

    // thumb
    const x = paddle.x, ty = PADDLE_Y, w = PADDLE_W, th = PADDLE_H;
    if (paddle.glow > 0) {
      ctx.save();
      ctx.shadowColor = 'rgba(60,190,255,' + (0.9 * paddle.glow) + ')';
      ctx.shadowBlur = 22 * paddle.glow;
      rrect(ctx, x, ty, w, th, 4);
      ctx.fillStyle = 'rgba(180,230,255,0.9)'; ctx.fill();
      ctx.restore();
    }
    rrect(ctx, x, ty, w, th, 4);
    const g = ctx.createLinearGradient(0, ty, 0, ty + th);
    g.addColorStop(0, '#eaf6fd');
    g.addColorStop(0.45, '#d9f0fc');
    g.addColorStop(0.5, '#bee6fd');
    g.addColorStop(1, '#a7d9f5');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#3c7fb1'; ctx.lineWidth = 1.2; ctx.stroke();
    rrect(ctx, x + 1.5, ty + 1.5, w - 3, th - 3, 3);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.stroke();
    // grip lines
    const gx = x + w / 2 - 6;
    for (let i = 0; i < 4; i++) {
      const lx = Math.round(gx + i * 4) + 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.moveTo(lx + 1, ty + 8); ctx.lineTo(lx + 1, ty + th - 7); ctx.stroke();
      ctx.strokeStyle = '#3c7fb1';
      ctx.beginPath(); ctx.moveTo(lx, ty + 8); ctx.lineTo(lx, ty + th - 7); ctx.stroke();
    }
    ctx.restore();
  }

  function drawHint(txt) {
    ctx.save();
    ctx.font = '700 17px "Segoe UI", Ubuntu, Arial, sans-serif';
    const tw = ctx.measureText(txt).width + 34;
    const x = VW / 2 - tw / 2, y = VH * 0.55;
    ctx.globalAlpha = 0.75 + Math.sin(t * 4) * 0.25;
    rrect(ctx, x, y, tw, 38, 19);
    const g = ctx.createLinearGradient(0, y, 0, y + 38);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.51, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0.4)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#0b4f7a';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, VW / 2, y + 20);
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();

    const sx = shake ? rand(-shake, shake) : 0;
    const sy = shake ? rand(-shake, shake) : 0;

    if (level && state !== 'menu') {
      ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * sx, DPR * (OY + sy));
      ctx.translate(-camX, 0);
      const vx0 = camX - 120, vx1 = camX + VW + 120;
      drawPortal(level.finish);
      for (const o of level.obs) {
        if (o.dead || o.x > vx1 || o.x + o.w < vx0) continue;
        if (o.type === 'pillar') drawPillar(o);
      }
      for (const o of level.obs) {
        if (o.dead || o.x > vx1 || o.x + o.w < vx0) continue;
        if (o.type === 'brick') drawBrick(o);
      }
      for (const p of level.pearls) if (!p.taken && p.x > vx0 && p.x < vx1) drawPearl(p);
      drawFish();
      drawParticles();
      for (const tx of texts) if (!tx.screen) drawText(tx);

      ctx.setTransform(DPR * S, 0, 0, DPR * S, 0, DPR * OY);
      if (blockedFlash > 0) {
        const g = ctx.createLinearGradient(0, 0, 60, 0);
        g.addColorStop(0, 'rgba(255,120,160,' + (0.45 * blockedFlash) + ')');
        g.addColorStop(1, 'rgba(255,120,160,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 60, VH);
      }
      drawScrollbar();
      for (const tx of texts) if (tx.screen) drawText(tx);
      if (state === 'play' && fish && !fish.launched) drawHint('Click or press Space to launch');
    } else {
      ctx.setTransform(DPR * S, 0, 0, DPR * S, 0, DPR * OY);
      drawScrollbar();
    }
  }

  // ---------- Loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state !== 'paused') update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // test hook (only with ?debug in the URL)
  if (/[?&]debug\b/.test(location.search)) {
    window.__aqua = { get fish() { return fish; }, get camX() { return camX; }, get S() { return S; }, get OY() { return OY; }, get state() { return state; }, get score() { return score; }, get level() { return level; } };
  }

  window.addEventListener('resize', resize);
  resize();
  paddle.x = VW / 2 - PADDLE_W / 2;
  ui.bestMenu.textContent = best;
  ready.then(() => requestAnimationFrame((n) => { last = n; frame(n); }));
})();
