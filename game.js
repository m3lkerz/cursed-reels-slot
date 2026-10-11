/* Cursed Reels — Haunted Bass. HTML5 canvas slot engine (no dependencies).
   Game math lives in math.js; this file handles rendering, animation, audio and UI. */
(() => {
  'use strict';
  const M = window.SlotMath;

  // ------------------------------------------------------------------ CONFIG
  const CONFIG = {
    currency: '$',
    startBalance: 1000,
    betLevels: [0.2, 0.4, 0.6, 1, 2, 4, 6, 10, 20, 50, 100],
    defaultBetIndex: 3,
    storageKey: 'cursedReels.v2',
    bigWinTiers: [ // x total bet
      { at: 10, title: 'BIG WIN' },
      { at: 25, title: 'MEGA WIN' },
      { at: 50, title: 'EPIC WIN' },
      { at: 100, title: 'CURSED WIN' }
    ],
    lowSymbols: {
      J: { c1: '#d4ff9a', c2: '#2f7a12', glow: '#7CFC00' },
      Q: { c1: '#f0d4ff', c2: '#6b21a8', glow: '#c084fc' },
      K: { c1: '#c8e6ff', c2: '#1d4ed8', glow: '#60a5fa' },
      A: { c1: '#ffd0c2', c2: '#b91c1c', glow: '#ff5a3c' }
    },
    lineColors: ['#ffd700', '#ff8c00', '#7CFC00', '#00e5ff', '#ff4fd8', '#ffef5a', '#a78bfa', '#ff6b6b', '#4ade80', '#f472b6',
      '#fde047', '#fb923c', '#86efac', '#67e8f9', '#f0abfc', '#fcd34d', '#c4b5fd', '#fca5a5', '#bbf7d0', '#f9a8d4']
  };
  const SYMBOL_NAMES = {
    WILD: 'Haunted Fisherman', FISH: 'Golden Bass', PUM: 'Jack-o\'-Lantern', TAK: 'Cursed Tackle Box', BAT: 'Vampire Bat',
    BOB: 'Grinning Gourd', POT: 'Witch\'s Brew', SCAT: 'Blood Moon', A: 'A', K: 'K', Q: 'Q', J: 'J'
  };

  // ------------------------------------------------------------------ helpers
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t, c1 = 0.9) => { const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const EASE_BACK_V0 = 3 * 1.9 - 2 * 0.9; // initial slope of easeOutBack(c1=0.9)
  const rng = () => {
    if (window.crypto && crypto.getRandomValues) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
    return Math.random();
  };
  const money = n => CONFIG.currency + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const short = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K' : (Math.round(n * 100) / 100).toFixed(n % 1 ? 2 : 0);

  // ------------------------------------------------------------------ state
  const saved = (() => { try { return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || {}; } catch (e) { return {}; } })();
  const G = {
    balance: typeof saved.balance === 'number' ? saved.balance : CONFIG.startBalance,
    betIdx: typeof saved.betIdx === 'number' ? saved.betIdx : CONFIG.defaultBetIndex,
    sound: saved.sound !== false,
    turbo: !!saved.turbo,
    busy: false, spinning: false, slam: false, skip: false,
    auto: 0, mode: 'base',
    fs: null, fsView: null, fsWin: 0,
    winCells: null, dim: false, lineShow: [], lineCycleStart: 0,
    anticip: [false, false, false, false, false],
    landPulse: {}, cellAnim: {}, wildLabels: {}, hookLines: [],
    banner: null, flash: 0, shake: 0, lightning: 0, nextLightning: 8 + Math.random() * 12,
    waits: [], tweens: [], particles: [], bats: [], fireflies: [], mouse: { x: 0, y: 0 },
    winDisplay: 0
  };
  const bet = () => CONFIG.betLevels[G.betIdx];
  const save = () => { try { localStorage.setItem(CONFIG.storageKey, JSON.stringify({ balance: G.balance, betIdx: G.betIdx, sound: G.sound, turbo: G.turbo })); } catch (e) {} };

  // ------------------------------------------------------------------ timing primitives
  let NOW = performance.now() / 1000;
  function wait(sec, skippable = true) {
    return new Promise(res => {
      if ((skippable && (G.slam || G.skip)) || sec <= 0) return res();
      G.waits.push({ until: NOW + sec, res, skippable });
    });
  }
  function releaseSkippable() { G.waits = G.waits.filter(w => { if (w.skippable) { w.res(); return false; } return true; }); }
  function tween(dur, fn, ease = t => t, skippable = true) {
    return new Promise(res => { G.tweens.push({ t0: NOW, dur, fn, ease, res, skippable }); });
  }
  function waitForClickOr(sec) {
    return new Promise(res => { G.clickWaiter = res; G.waits.push({ until: NOW + sec, res: () => { if (G.clickWaiter === res) { G.clickWaiter = null; res(); } }, skippable: false }); });
  }

  // ------------------------------------------------------------------ audio (all synthesized, no files)
  const S = {
    ctx: null,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4;
      this.master = c.createGain(); this.master.gain.value = G.sound ? 0.85 : 0;
      this.master.connect(this.comp); this.comp.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.mus = c.createGain(); this.mus.gain.value = 0.32; this.mus.connect(this.master);
      // reverb
      const len = c.sampleRate * 2.6, ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      this.rev = c.createConvolver(); this.rev.buffer = ir;
      this.revSend = c.createGain(); this.revSend.gain.value = 0.35; this.revSend.connect(this.rev); this.rev.connect(this.master);
      const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.noiseBuf = nb;
    },
    setOn(on) { if (this.master) this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.05); },
    get t() { return this.ctx ? this.ctx.currentTime : 0; },
    ok() { return !!this.ctx && G.sound; },
    tone(type, f, t, dur, vol, o = {}) {
      const c = this.ctx, osc = c.createOscillator(), g = c.createGain();
      osc.type = type; osc.frequency.setValueAtTime(f, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
      if (o.detune) osc.detune.value = o.detune;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (o.a || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = g;
      if (o.lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; g.connect(fl); node = fl; }
      osc.connect(g); node.connect(o.dest || this.sfx); if (o.rev) node.connect(this.revSend);
      osc.start(t); osc.stop(t + dur + 0.05);
    },
    noise(t, dur, vol, type = 'lowpass', freq = 1000, q = 0.7, o = {}) {
      const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noiseBuf; src.loop = true; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (o.a || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(o.dest || this.sfx); if (o.rev) g.connect(this.revSend);
      src.start(t); src.stop(t + dur + 0.05);
    },
    midi: n => 440 * Math.pow(2, (n - 69) / 12),
    // --- effects
    click() { if (!this.ok()) return; this.tone('square', 1400, this.t, 0.03, 0.04); },
    spinStart() {
      if (!this.ok()) return; const t = this.t;
      this.noise(t, 0.25, 0.12, 'bandpass', 900, 1, { to: 2500 });
      this.stopLoop();
      const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      src.buffer = this.noiseBuf; src.loop = true; f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.8;
      g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.05, t + 0.15);
      lfo.frequency.value = 15; lg.gain.value = 0.025; lfo.connect(lg); lg.connect(g.gain);
      src.connect(f); f.connect(g); g.connect(this.sfx); src.start(t); lfo.start(t);
      this.loop = { src, g, lfo };
    },
    stopLoop() {
      if (!this.loop || !this.ctx) return; const { src, g, lfo } = this.loop, t = this.t;
      g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.05); src.stop(t + 0.3); lfo.stop(t + 0.3); this.loop = null;
    },
    thump(i = 0) {
      if (!this.ok()) return; const t = this.t;
      this.tone('sine', 150 - i * 6, t, 0.2, 0.45, { to: 42 });
      this.noise(t, 0.06, 0.18, 'lowpass', 1800);
    },
    scatter(n) {
      if (!this.ok()) return; const t = this.t, f = [659, 784, 988, 1175, 1319][clamp(n - 1, 0, 4)];
      this.tone('sine', f, t, 1.6, 0.28, { rev: true });
      this.tone('sine', f * 2.01, t, 0.9, 0.1, { rev: true });
      this.tone('triangle', f * 3, t, 0.4, 0.05, { rev: true });
    },
    anticipation(dur) {
      if (!this.ok()) return; const t = this.t;
      this.tone('sawtooth', 98, t, dur, 0.07, { to: 392, glide: dur, lp: 900, a: 0.2 });
      this.tone('sawtooth', 147, t, dur, 0.05, { to: 588, glide: dur, lp: 1200, a: 0.2, detune: 8 });
      this.noise(t, dur, 0.06, 'bandpass', 300, 2, { to: 3000, a: 0.3 });
    },
    win(level) { // 0 small .. 2 big
      if (!this.ok()) return; const t = this.t;
      const notes = [62, 65, 69, 72, 74, 77, 81, 86].slice(0, 3 + level * 2);
      notes.forEach((n, i) => this.tone('triangle', this.midi(n), t + i * 0.07, 0.35, 0.16, { rev: true }));
      if (level > 0) [62, 69, 74].forEach(n => this.tone('sawtooth', this.midi(n), t + notes.length * 0.07, 0.8, 0.05, { lp: 2200, rev: true }));
    },
    coin() { if (!this.ok()) return; const t = this.t; this.tone('sine', 2093, t, 0.08, 0.1); this.tone('sine', 2794, t + 0.05, 0.18, 0.09, { rev: true }); },
    tick() { if (!this.ok() || NOW - (this._tk || 0) < 0.055) return; this._tk = NOW; this.tone('square', 1760 + Math.random() * 200, this.t, 0.025, 0.025); },
    collect(i) {
      if (!this.ok()) return; const t = this.t, f = 330 * Math.pow(2, Math.min(i, 14) / 12);
      this.tone('sine', f, t, 0.18, 0.22, { to: f * 2.2, glide: 0.12 });
      this.tone('sine', f * 4, t + 0.08, 0.2, 0.07, { rev: true });
    },
    splash() { if (!this.ok()) return; const t = this.t; this.noise(t, 0.5, 0.35, 'highpass', 900, 0.5); this.tone('sine', 380, t, 0.3, 0.25, { to: 70 }); },
    wildLand() {
      if (!this.ok()) return; const t = this.t;
      this.tone('sine', 98, t, 1.1, 0.4, { rev: true }); this.tone('sine', 196.5, t, 0.8, 0.18, { rev: true });
      this.tone('triangle', 523, t + 0.02, 0.6, 0.08, { rev: true });
    },
    thunder() {
      if (!this.ok()) return; const t = this.t;
      this.noise(t, 2.8, 0.5, 'lowpass', 400, 0.6, { to: 80, a: 0.03, rev: true });
      this.noise(t + 0.05, 0.4, 0.25, 'bandpass', 1500, 0.8);
    },
    fanfare(tier) {
      if (!this.ok()) return; const t = this.t;
      const prog = [[62, 65, 69], [58, 62, 65], [60, 64, 67], [62, 66, 69]];
      prog.slice(0, 2 + Math.min(tier, 2)).forEach((ch, k) => ch.forEach(n => {
        this.tone('sawtooth', this.midi(n), t + k * 0.22, 0.5, 0.06, { lp: 2600, rev: true });
        this.tone('sawtooth', this.midi(n + 12), t + k * 0.22, 0.4, 0.03, { lp: 3200, detune: 6 });
      }));
      this.tone('sine', 73.4, t, 1.6, 0.35, { rev: true });
    },
    gong() {
      if (!this.ok()) return; const t = this.t;
      [1, 2.4, 3.9, 5.3].forEach((m, i) => this.tone('sine', 82 * m, t, 3 - i * 0.5, 0.25 / (i + 1), { rev: true }));
      this.noise(t, 1.5, 0.15, 'bandpass', 400, 3, { to: 120, rev: true });
    },
    // --- music
    startMusic() {
      if (!this.ctx || this.musicTimer) return;
      this.step = 0; this.nextNote = this.t + 0.1;
      this.musicTimer = setInterval(() => this.schedule(), 40);
    },
    schedule() {
      if (!this.ctx) return;
      const free = G.mode === 'free', bpm = free ? 124 : 82, sp = 60 / bpm / 4;
      const chords = free ? [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64]] : [[62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]];
      while (this.nextNote < this.t + 0.2) {
        const t = this.nextNote, st = this.step % 64, bar = Math.floor(st / 16), ch = chords[bar], s16 = st % 16;
        if (G.sound) {
          if (free) {
            if (s16 % 4 === 0) this.tone('sine', 150, t, 0.25, 0.3, { to: 45, dest: this.mus });
            if (s16 % 8 === 4) this.noise(t, 0.12, 0.08, 'highpass', 2500, 0.7, { dest: this.mus });
            if (s16 % 2 === 0) this.tone('sawtooth', this.midi(ch[0] - 24), t, sp * 1.8, 0.09, { lp: 500, dest: this.mus });
            this.tone('triangle', this.midi(ch[s16 % 3] + 12 + (s16 % 6 === 5 ? 12 : 0)), t, sp * 1.6, 0.045, { dest: this.mus, rev: true });
          } else {
            if (s16 === 0 || s16 === 10) this.tone('sine', this.midi(ch[0] - 24), t, sp * 7, 0.22, { dest: this.mus, a: 0.04 });
            if (s16 % 2 === 0) {
              const n = ch[(s16 / 2) % 3] + 12;
              this.tone('sine', this.midi(n), t, sp * 3, 0.06, { dest: this.mus, rev: true });
              this.tone('sine', this.midi(n) * 2.005, t, sp * 1.5, 0.015, { dest: this.mus });
            }
            if (s16 === 0) ch.forEach(n => this.tone('sawtooth', this.midi(n - 12), t, sp * 15, 0.012, { dest: this.mus, lp: 700, a: 0.5 }));
          }
        }
        this.nextNote += sp; this.step++;
      }
    }
  };

  // ------------------------------------------------------------------ canvas + assets
  const canvas = $('stage'), ctx = canvas.getContext('2d'), wrap = $('stageWrap');
  let DPR = 1, L = {};
  const IMG = {};
  const SYMS = ['WILD', 'FISH', 'PUM', 'TAK', 'BAT', 'BOB', 'POT', 'SCAT'];
  function loadImg(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

  let symCache = new Map();
  function symbolCanvas(sym, px) {
    const key = sym + '|' + px;
    let e = symCache.get(key);
    if (e) return e;
    const c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d');
    const low = CONFIG.lowSymbols[sym];
    if (low) {
      let fs = px * 0.6; const cx = px / 2, cy = px * 0.52;
      g.font = `900 ${fs}px Cinzel, Georgia, serif`;
      const mw = g.measureText(sym).width; if (mw > px * 0.7) fs *= px * 0.7 / mw;
      g.font = `900 ${fs}px Cinzel, Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = low.glow; g.shadowBlur = px * 0.14;
      g.lineWidth = px * 0.07; g.strokeStyle = '#12061c'; g.strokeText(sym, cx, cy);
      g.shadowBlur = 0;
      const gr = g.createLinearGradient(0, cy - fs / 2, 0, cy + fs / 2);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, low.c1); gr.addColorStop(1, low.c2);
      g.fillStyle = gr; g.fillText(sym, cx, cy);
      g.lineWidth = px * 0.012; g.strokeStyle = 'rgba(255,240,200,0.55)'; g.strokeText(sym, cx, cy);
    } else if (IMG[sym]) {
      const k = sym === 'WILD' || sym === 'SCAT' ? 1.06 : 1.0, d = px * k;
      g.drawImage(IMG[sym], (px - d) / 2, (px - d) / 2, d, d);
    } else {
      g.fillStyle = '#fff'; g.font = `bold ${px * 0.2}px sans-serif`; g.textAlign = 'center'; g.fillText(sym, px / 2, px / 2);
    }
    // motion-blurred variant for spinning
    const b = document.createElement('canvas'); b.width = b.height = px;
    const bg = b.getContext('2d');
    for (let k = -4; k <= 4; k++) { bg.globalAlpha = 0.16; bg.drawImage(c, 0, k * px * 0.045); }
    e = { n: c, b };
    symCache.set(key, e);
    return e;
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const W = wrap.clientWidth, H = wrap.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const portrait = H > W * 1.05;
    const topH = portrait ? clamp(H * 0.17, 70, 150) : clamp(H * 0.17, 56, 130);
    const availH = H - topH - (portrait ? 24 : 18);
    const s = Math.floor(Math.min(availH / 3.4, (W * (portrait ? 0.97 : 0.9)) / (portrait ? 5.25 : 5.4), 220));
    const f = Math.max(10, s * (portrait ? 0.13 : 0.2));
    // portrait phones: taller cells so the reels use the screen height
    const ch = portrait ? Math.floor(clamp((availH * 0.62 - 2 * f) / 3, s, s * 1.45)) : s;
    const rw = s * 5, rh = ch * 3, x = Math.round((W - rw) / 2);
    let y = Math.round(topH + (portrait ? Math.min((availH - rh - 2 * f) * 0.25, 50) : (availH - rh - 2 * f) / 2) + f);
    L = { W, H, portrait, s, ch, f, x, y, rw, rh, topH };
    symCache = new Map();
    // buy button placement
    const bb = $('buyBtn'), side = x - f;
    if (!portrait && side > 150) {
      const bw = Math.min(150, side - 30);
      Object.assign(bb.style, { left: (side - bw) / 2 + 'px', top: (y + rh / 2 - bw * 0.55) + 'px', width: bw + 'px', height: bw * 1.1 + 'px' });
      bb.classList.remove('compact');
    } else {
      const below = H - (y + rh + f);
      bb.classList.add('compact');
      if (below > 64) Object.assign(bb.style, { left: (W / 2 - 110) + 'px', top: (y + rh + f + (below - 54) / 2) + 'px', width: '220px', height: '54px' });
      else Object.assign(bb.style, { left: '10px', top: '10px', width: '120px', height: '46px' });
    }
  }

  // ------------------------------------------------------------------ reels
  class Reel {
    constructor(i) { this.i = i; this.syms = []; this.pos = 3; this.state = 'idle'; this.speed = 0; this.onLand = null; }
    strip() { return G.mode === 'free' ? M.FS_STRIPS[this.i] : M.BASE_STRIPS[this.i]; }
    randomEntry() {
      const st = this.strip(); let s = st[Math.floor(Math.random() * st.length)];
      if (s === 'SCAT' && G.mode === 'free') s = 'FISH';
      return { s, v: s === 'FISH' ? M.fishValue(Math.random) : 0 };
    }
    setColumn(col, vals) {
      this.syms = [this.randomEntry(), { s: col[2], v: vals[2] }, { s: col[1], v: vals[1] }, { s: col[0], v: vals[0] }, this.randomEntry()];
      this.pos = 3;
    }
    at(i) { while (this.syms.length <= i) this.syms.push(this.randomEntry()); return this.syms[i]; }
    cell(r) { return this.syms[3 - r]; }
    start(delay) { this.state = 'wait'; this.t = -delay; this.speed = 0; }
    stop(col, vals, quick) {
      if (this.state === 'idle' || this.state === 'stopping') return;
      if (this.state !== 'spin') { this.state = 'spin'; this.speed = Math.max(this.speed, 18); }
      const P = Math.ceil(this.pos) + (quick ? 3 : 4);
      this.at(P + 2);
      this.syms[P] = { s: col[0], v: vals[0] }; this.syms[P - 1] = { s: col[1], v: vals[1] }; this.syms[P - 2] = { s: col[2], v: vals[2] };
      this.from = this.pos; this.target = P; this.t = 0;
      this.dur = clamp((P - this.pos) * EASE_BACK_V0 / Math.max(this.speed, 10), 0.18, 0.9);
      this.state = 'stopping';
    }
    update(dt) {
      const maxV = G.turbo ? 38 : 27;
      switch (this.state) {
        case 'wait': this.t += dt; if (this.t >= 0) { this.state = 'windup'; this.t = 0; this.p0 = this.pos; } break;
        case 'windup': this.t += dt; this.pos = this.p0 - 0.22 * Math.sin(Math.min(this.t / 0.14, 1) * Math.PI / 2);
          if (this.t >= 0.14) { this.state = 'spin'; this.speed = 2; } break;
        case 'spin': this.speed = Math.min(maxV, this.speed + 140 * dt); this.pos += this.speed * dt; break;
        case 'stopping': {
          this.t += dt; const k = Math.min(this.t / this.dur, 1);
          const prev = this.pos;
          this.pos = this.from + (this.target - this.from) * easeOutBack(k);
          this.speed = Math.abs(this.pos - prev) / Math.max(dt, 1e-3);
          if (k >= 1) {
            const P = this.target; this.syms = this.syms.slice(P - 3, P + 2); this.pos = 3; this.state = 'idle'; this.speed = 0;
            const cb = this.onLand; this.onLand = null; if (cb) cb();
          }
          break;
        }
      }
    }
  }
  const reels = [0, 1, 2, 3, 4].map(i => new Reel(i));

  // ------------------------------------------------------------------ particles & ambience
  function spawnCoins(n, x, y, spread = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.85, -Math.PI * 0.15);
      const v = rand(380, 900) * spread * (L.s / 160 + 0.4);
      G.particles.push({ type: 'coin', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1300, life: rand(1.6, 2.6), age: 0, r: rand(0.07, 0.12) * L.s, spin: rand(4, 10), ph: rand(0, 6) });
    }
  }
  function spawnSparks(n, x, y, color = '#ffd27a', speed = 260) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(speed * 0.3, speed);
      G.particles.push({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 120, life: rand(0.4, 0.9), age: 0, r: rand(1.5, 3.5), color });
    }
  }
  function flyText(text, x0, y0, x1, y1, dur, color = '#ffe08a', size = 0.22) {
    return new Promise(res => G.particles.push({ type: 'fly', text, x0, y0, x1, y1, age: 0, life: dur, color, size, res }));
  }
  function initAmbience() {
    G.fireflies = Array.from({ length: 34 }, () => ({ x: Math.random(), y: rand(0.35, 1), ph: rand(0, 6), sp: rand(0.2, 0.6), r: rand(1, 2.4) }));
  }

  // ------------------------------------------------------------------ geometry helpers
  const cellCenter = (c, r) => ({ x: L.x + c * L.s + L.s / 2, y: L.y + r * L.ch + L.ch / 2 });
  const key = (c, r) => c + ',' + r;

  // ------------------------------------------------------------------ drawing
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function goldGrad(y0, y1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#fff3b0'); g.addColorStop(0.35, '#ffd24a'); g.addColorStop(0.6, '#c98a12'); g.addColorStop(1, '#ffe27a');
    return g;
  }

  function drawBackground(t) {
    const { W, H } = L, img = IMG.bg;
    ctx.fillStyle = '#07030d'; ctx.fillRect(0, 0, W, H);
    if (img) {
      const sc = Math.max(W / img.width, H / img.height) * 1.06;
      const iw = img.width * sc, ih = img.height * sc;
      const px = (G.mouse.x - 0.5) * -14, py = (G.mouse.y - 0.5) * -8;
      ctx.drawImage(img, (W - iw) / 2 + px, (H - ih) / 2 + py, iw, ih);
    }
    // grade
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(8,3,18,0.35)'); g.addColorStop(0.5, 'rgba(8,3,18,0.2)'); g.addColorStop(1, 'rgba(5,2,10,0.75)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (G.mode === 'free') { ctx.fillStyle = 'rgba(40,120,60,0.16)'; ctx.globalCompositeOperation = 'overlay'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    // fog
    for (let i = 0; i < 5; i++) {
      const fx = ((t * (0.012 + i * 0.006) + i * 0.27) % 1.4 - 0.2) * W, fy = H * (0.62 + i * 0.08);
      const r = W * (0.35 + i * 0.05);
      const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
      const col = G.mode === 'free' ? '90,200,120' : (i % 2 ? '140,90,200' : '110,120,170');
      fg.addColorStop(0, `rgba(${col},0.10)`); fg.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = fg; ctx.fillRect(fx - r, fy - r, r * 2, r * 2);
    }
    // fireflies
    for (const f of G.fireflies) {
      const x = ((f.x + Math.sin(t * f.sp + f.ph) * 0.03 + t * 0.004) % 1) * W, y = (f.y + Math.cos(t * f.sp * 1.3 + f.ph) * 0.02) * H;
      const a = 0.35 + 0.35 * Math.sin(t * 3 + f.ph);
      ctx.fillStyle = G.mode === 'free' ? `rgba(160,255,140,${a})` : `rgba(255,200,110,${a})`;
      ctx.beginPath(); ctx.arc(x, y, f.r, 0, Math.PI * 2); ctx.fill();
    }
    // bats
    if (Math.random() < 0.004 && G.bats.length < 4) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      for (let k = 0; k < 1 + Math.floor(Math.random() * 3); k++)
        G.bats.push({ x: dir > 0 ? -40 - k * 30 : W + 40 + k * 30, y: rand(H * 0.04, H * 0.3) + k * 12, vx: dir * rand(110, 190), ph: rand(0, 6), s: rand(0.6, 1.1) });
    }
    ctx.fillStyle = 'rgba(10,4,16,0.85)';
    G.bats = G.bats.filter(b => b.x > -80 && b.x < W + 80);
    for (const b of G.bats) {
      const flap = Math.sin(t * 18 + b.ph), sz = 10 * b.s * (L.s / 140 + 0.5);
      ctx.save(); ctx.translate(b.x, b.y + Math.sin(t * 3 + b.ph) * 6); ctx.scale(sz, sz);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-0.8, -0.6 * flap - 0.2, -1.8, -0.2 * flap); ctx.quadraticCurveTo(-1.2, 0.1, -0.9, 0.35); ctx.quadraticCurveTo(-0.5, 0.15, 0, 0.3);
      ctx.quadraticCurveTo(0.5, 0.15, 0.9, 0.35); ctx.quadraticCurveTo(1.2, 0.1, 1.8, -0.2 * flap); ctx.quadraticCurveTo(0.8, -0.6 * flap - 0.2, 0, 0);
      ctx.fill(); ctx.restore();
    }
  }

  function drawLogo(t) {
    const { W, topH, s } = L;
    if (G.mode === 'free') return drawFsHud(t);
    const size = clamp(Math.min(topH * 0.55, W * (L.portrait ? 0.12 : 0.085)), 26, 86);
    const cy = topH * 0.48;
    const flick = 0.85 + 0.15 * Math.sin(t * 7) * Math.sin(t * 2.3);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${size}px Creepster, Impact, sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${size * 0.04}px`;
    ctx.shadowColor = `rgba(255,110,0,${0.8 * flick})`; ctx.shadowBlur = size * 0.45;
    ctx.lineWidth = size * 0.13; ctx.strokeStyle = '#1a0500'; ctx.strokeText('CURSED REELS', W / 2, cy);
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
    g.addColorStop(0, '#fff6c2'); g.addColorStop(0.35, '#ffb21a'); g.addColorStop(0.75, '#ff5a00'); g.addColorStop(1, '#8a1c00');
    ctx.fillStyle = g; ctx.fillText('CURSED REELS', W / 2, cy);
    ctx.font = `700 ${size * 0.26}px Cinzel, Georgia, serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${size * 0.09}px`;
    ctx.fillStyle = '#e9cf86'; ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6;
    ctx.fillText('— HAUNTED BASS —', W / 2, cy + size * 0.68);
    ctx.font = `${size}px Creepster, Impact, sans-serif`;
    const tw = ctx.measureText('CURSED REELS').width;
    ctx.restore();
    // lanterns either side
    const p = IMG.PUM ? symbolCanvas('PUM', Math.round(size * 1.3 * DPR)).n : null;
    if (p) {
      const d = size * 1.25;
      [-1, 1].forEach(sd => {
        const x = W / 2 + sd * (tw / 2 + d * 0.65), y = cy + Math.sin(t * 2 + sd) * 4;
        if (x - d / 2 < 0 || x + d / 2 > W) return;
        ctx.globalAlpha = 0.95; ctx.drawImage(p, x - d / 2, y - d / 2, d, d); ctx.globalAlpha = 1;
      });
    }
  }

  function drawFsHud(t) {
    const { W, topH } = L, v = G.fsView; if (!v) return;
    const h = clamp(topH * 0.7, 46, 96), cy = topH * 0.5, unit = h / 80;
    const boxW = Math.min(W * 0.28, 230 * unit);
    const drawBox = (cx, label, value, color) => {
      ctx.save();
      roundRect(cx - boxW / 2, cy - h / 2, boxW, h, h * 0.2);
      const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2); g.addColorStop(0, 'rgba(30,14,46,0.92)'); g.addColorStop(1, 'rgba(10,4,18,0.92)');
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = goldGrad(cy - h / 2, cy + h / 2); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 ${h * 0.2}px Oswald, sans-serif`; ctx.fillStyle = '#d9c38a'; ctx.fillText(label, cx, cy - h * 0.22, boxW * 0.9);
      ctx.font = `700 ${h * 0.42}px Oswald, sans-serif`; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.fillText(value, cx, cy + h * 0.15, boxW * 0.9);
      ctx.restore();
    };
    const gap = W * 0.02;
    drawBox(W / 2 - boxW - gap, 'FREE SPINS LEFT', String(v.left), '#ffffff');
    drawBox(W / 2 + boxW + gap, 'MULTIPLIER', 'x' + M.FS_MULTS[v.level], '#7CFC00');
    // wild meter
    const cx = W / 2;
    ctx.save();
    roundRect(cx - boxW / 2, cy - h / 2, boxW, h, h * 0.2);
    ctx.fillStyle = 'rgba(12,6,20,0.9)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = goldGrad(cy - h / 2, cy + h / 2); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${h * 0.18}px Oswald, sans-serif`; ctx.fillStyle = '#d9c38a';
    const maxed = v.level >= M.FS_MULTS.length - 1;
    ctx.fillText(maxed ? 'MAX MULTIPLIER' : `4 FISHERMEN → +10 SPINS x${M.FS_MULTS[v.level + 1]}`, cx, cy - h * 0.26, boxW * 0.92);
    const filled = maxed ? 4 : v.collected - v.level * M.WILDS_PER_LEVEL;
    const pr = h * 0.17, pg = boxW / 5.4;
    for (let i = 0; i < 4; i++) {
      const x = cx + (i - 1.5) * pg, y = cy + h * 0.14, on = i < filled;
      ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#ffd24a' : 'rgba(255,255,255,0.08)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = on ? '#fff3b0' : 'rgba(255,210,74,0.4)'; ctx.stroke();
      if (on && IMG.WILD) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, pr * 0.92, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(symbolCanvas('WILD', Math.round(pr * 2.4 * DPR)).n, x - pr * 1.2, y - pr * 1.2, pr * 2.4, pr * 2.4); ctx.restore(); }
    }
    ctx.restore();
  }

  function drawFrame(t) {
    const { x, y, rw, rh, f, s } = L;
    const fx = x - f, fy = y - f, fw = rw + 2 * f, fh = rh + 2 * f;
    ctx.save();
    // outer glow
    ctx.shadowColor = G.mode === 'free' ? 'rgba(120,255,140,0.45)' : 'rgba(255,140,0,0.4)'; ctx.shadowBlur = f * 2.2;
    roundRect(fx, fy, fw, fh, f * 0.9); ctx.fillStyle = '#1a0f08'; ctx.fill();
    ctx.shadowBlur = 0;
    // carved bronze body
    let g = ctx.createLinearGradient(fx, fy, fx, fy + fh);
    g.addColorStop(0, '#5a3a1e'); g.addColorStop(0.5, '#2b1a0c'); g.addColorStop(1, '#4e321a');
    ctx.fillStyle = g; ctx.fill();
    // texture stripes
    ctx.globalAlpha = 0.08; ctx.fillStyle = '#000';
    for (let i = 0; i < fw; i += 6) ctx.fillRect(fx + i, fy, 2, fh);
    ctx.globalAlpha = 1;
    // gold rims
    ctx.lineWidth = f * 0.22; ctx.strokeStyle = goldGrad(fy, fy + fh); roundRect(fx + f * 0.11, fy + f * 0.11, fw - f * 0.22, fh - f * 0.22, f * 0.8); ctx.stroke();
    ctx.lineWidth = Math.max(1.5, f * 0.08); roundRect(x - f * 0.18, y - f * 0.18, rw + f * 0.36, rh + f * 0.36, f * 0.3); ctx.stroke();
    // rivets
    ctx.fillStyle = '#ffd96a';
    const riv = (px, py) => { ctx.beginPath(); ctx.arc(px, py, f * 0.12, 0, Math.PI * 2); ctx.fill(); };
    for (let i = 1; i < 10; i++) { riv(fx + fw * i / 10, fy + f * 0.55); riv(fx + fw * i / 10, fy + fh - f * 0.55); }
    // reel window
    g = ctx.createLinearGradient(0, y, 0, y + rh);
    if (G.mode === 'free') { g.addColorStop(0, '#08160f'); g.addColorStop(0.5, '#10261a'); g.addColorStop(1, '#06110b'); }
    else { g.addColorStop(0, '#0b0614'); g.addColorStop(0.5, '#1a0d2b'); g.addColorStop(1, '#090410'); }
    ctx.fillStyle = g; ctx.fillRect(x, y, rw, rh);
    // column separators
    for (let c = 1; c < 5; c++) {
      const sx = x + c * s;
      const sg = ctx.createLinearGradient(0, y, 0, y + rh); sg.addColorStop(0, 'rgba(255,210,74,0)'); sg.addColorStop(0.5, 'rgba(255,210,74,0.45)'); sg.addColorStop(1, 'rgba(255,210,74,0)');
      ctx.fillStyle = sg; ctx.fillRect(sx - 1, y, 2, rh);
    }
    ctx.restore();
  }

  function drawReels(t) {
    const { x, y, s, ch, rh } = L;
    const d = Math.min(s, ch) * (L.portrait ? 0.98 : 0.9), px = Math.round(d * DPR);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, s * 5, rh); ctx.clip();
    for (const reel of reels) {
      const c = reel.i, cx = x + c * s;
      // anticipation glow
      if (G.anticip[c]) {
        const a = 0.45 + 0.3 * Math.sin(t * 16);
        const ag = ctx.createLinearGradient(cx, 0, cx + s, 0);
        ag.addColorStop(0, `rgba(255,120,0,${a})`); ag.addColorStop(0.5, `rgba(255,200,60,${a * 0.25})`); ag.addColorStop(1, `rgba(255,120,0,${a})`);
        ctx.fillStyle = ag; ctx.fillRect(cx, y, s, rh);
        if (Math.random() < 0.6) spawnSparks(1, cx + rand(0, s), y + rh, '#ffb347', 180);
      }
      const blur = reel.speed > 9;
      const lo = Math.floor(reel.pos - 3), hi = Math.ceil(reel.pos + 1);
      for (let i = Math.max(0, lo); i <= hi; i++) {
        const e = reel.at(i), rowF = reel.pos - i, sy = y + rowF * ch;
        if (sy <= -ch + y - 1 || sy >= y + rh) continue;
        const idle = reel.state === 'idle', r = idle ? 3 - i : -1;
        const k = idle && r >= 0 && r < 3 ? key(c, r) : null;
        let scale = 1, alpha = 1, glow = 0, oy = 0;
        if (k) {
          if (G.dim && G.winCells && !G.winCells.has(k)) alpha = 0.32;
          if (G.winCells && G.winCells.has(k)) { scale = 1 + 0.07 * (0.5 + 0.5 * Math.sin(t * 9)); glow = 1; }
          const lp = G.landPulse[k]; if (lp) { const q = (NOW - lp) / 0.5; if (q < 1) { scale *= 1 + 0.25 * Math.sin(q * Math.PI); glow = Math.max(glow, 1 - q); } }
          const an = G.cellAnim[k];
          if (an && an.type === 'drop') { const q = clamp((NOW - an.t0) / 0.45, 0, 1); oy = -(1 - easeOutCubic(q)) * L.y * 1.2; scale *= 1 + (1 - q) * 0.8; }
          if (e.s === 'SCAT' && G.mode === 'base' && G.scatGlow) glow = Math.max(glow, 0.6 + 0.4 * Math.sin(t * 10));
        }
        const img = symbolCanvas(e.s, px);
        const dd = d * scale, cxs = cx + s / 2, cys = sy + ch / 2 + oy;
        ctx.save(); ctx.globalAlpha = alpha;
        if (glow > 0) {
          ctx.save(); ctx.globalAlpha = alpha * glow * 0.9;
          const gg = ctx.createRadialGradient(cxs, cys, 0, cxs, cys, s * 0.6);
          gg.addColorStop(0, e.s === 'SCAT' ? 'rgba(255,60,60,0.75)' : 'rgba(255,215,90,0.7)'); gg.addColorStop(1, 'rgba(255,170,0,0)');
          ctx.fillStyle = gg; ctx.fillRect(cxs - s * 0.6, cys - s * 0.6, s * 1.2, s * 1.2); ctx.restore();
        }
        ctx.drawImage(blur ? img.b : img.n, cxs - dd / 2, cys - dd / 2, dd, dd);
        if (e.s === 'FISH' && e.v) drawFishValue(cxs, cys, dd, e.v, blur);
        if (k && G.wildLabels[k] > 0 && e.s === 'WILD') drawPill(cxs, cys + dd * 0.36, money(G.wildLabels[k]), '#7CFC00', s * 0.17);
        ctx.restore();
      }
    }
    ctx.restore();
    // inner vignette top/bottom
    const vg = ctx.createLinearGradient(0, y, 0, y + rh);
    vg.addColorStop(0, 'rgba(0,0,0,0.55)'); vg.addColorStop(0.12, 'rgba(0,0,0,0)'); vg.addColorStop(0.88, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(x, y, s * 5, rh);
  }

  function drawFishValue(cx, cy, d, v, blur) {
    const amt = v * bet(), big = v >= 50;
    const fs = d * 0.2;
    ctx.save();
    ctx.font = `700 ${fs}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const txt = short(amt), ty = cy + d * 0.3;
    ctx.lineWidth = fs * 0.28; ctx.strokeStyle = '#1a0800'; ctx.strokeText(txt, cx, ty);
    const g = ctx.createLinearGradient(0, ty - fs / 2, 0, ty + fs / 2);
    if (big) { g.addColorStop(0, '#ffe1ff'); g.addColorStop(1, '#ff3df0'); } else { g.addColorStop(0, '#fffbe0'); g.addColorStop(0.5, '#ffd24a'); g.addColorStop(1, '#d08a00'); }
    ctx.fillStyle = g; if (!blur) { ctx.shadowColor = big ? '#ff3df0' : '#ffb000'; ctx.shadowBlur = fs * 0.5; }
    ctx.fillText(txt, cx, ty);
    ctx.restore();
  }

  function drawPill(cx, cy, text, color, fs) {
    ctx.save();
    ctx.font = `700 ${fs}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + fs * 1.1, h = fs * 1.5;
    roundRect(cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fillStyle = 'rgba(10,4,16,0.88)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.fillText(text, cx, cy + 1);
    ctx.restore();
  }

  function drawWinLines(t) {
    if (!G.lineShow.length) return;
    const all = NOW - G.lineCycleStart < 1.4 || G.lineShow.length === 1;
    const list = all ? G.lineShow : [G.lineShow[Math.floor((NOW - G.lineCycleStart - 1.4) / 1.3) % G.lineShow.length]];
    for (const w of list) {
      const pts = M.LINES[w.line].map((r, c) => cellCenter(c, r));
      const col = CONFIG.lineColors[w.line % CONFIG.lineColors.length];
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(L.x - L.f * 0.4, pts[0].y); pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.lineTo(L.x + L.rw + L.f * 0.4, pts[4].y);
      ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = L.s * 0.075; ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = L.s * 0.04; ctx.stroke();
      ctx.restore();
      if (!all) {
        const last = w.cells[w.cells.length - 1], p = cellCenter(last[0], last[1]);
        drawPill(p.x, p.y + L.s * 0.36, money(w.win), col, L.s * 0.16);
        // cell boxes
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.shadowColor = col; ctx.shadowBlur = 10;
        w.cells.forEach(([c, r]) => { roundRect(L.x + c * L.s + 4, L.y + r * L.ch + 4, L.s - 8, L.ch - 8, L.s * 0.12); ctx.stroke(); });
        ctx.restore();
      }
    }
  }

  function drawHookLines() {
    for (const h of G.hookLines) {
      const q = clamp((NOW - h.t0) / h.dur, 0, 1);
      const ex = lerp(h.x0, h.x1, Math.min(q * 1.6, 1)), ey = lerp(h.y0, h.y1, Math.min(q * 1.6, 1));
      ctx.save(); ctx.strokeStyle = 'rgba(230,230,255,0.9)'; ctx.lineWidth = 2; ctx.shadowColor = '#b8f'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(h.x0, h.y0); ctx.quadraticCurveTo((h.x0 + ex) / 2, Math.min(h.y0, ey) - L.s * 0.6, ex, ey); ctx.stroke();
      // hook
      ctx.lineWidth = 3; ctx.strokeStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(ex, ey + 6, 6, 0, Math.PI); ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles(dt) {
    const keep = [];
    for (const p of G.particles) {
      p.age += dt;
      if (p.type === 'fly') {
        const q = clamp(p.age / p.life, 0, 1), e = easeOutCubic(q);
        const x = lerp(p.x0, p.x1, e), y = lerp(p.y0, p.y1, e) - Math.sin(q * Math.PI) * L.s * 0.8;
        ctx.save(); ctx.font = `700 ${L.s * p.size}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = L.s * 0.05; ctx.strokeStyle = '#140600'; ctx.strokeText(p.text, x, y);
        ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 12; ctx.fillText(p.text, x, y); ctx.restore();
        if (q >= 1) { p.res && p.res(); continue; }
        keep.push(p); continue;
      }
      if (p.age >= p.life) continue;
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.age / p.life;
      if (p.type === 'coin') {
        const w = Math.abs(Math.cos(p.age * p.spin + p.ph)) * p.r + 1;
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 2);
        const g = ctx.createLinearGradient(p.x - w, p.y - p.r, p.x + w, p.y + p.r); g.addColorStop(0, '#fff6b0'); g.addColorStop(0.5, '#ffc21a'); g.addColorStop(1, '#a86b00');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x, p.y, w, p.r, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      } else {
        ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
      keep.push(p);
    }
    G.particles = keep;
  }

  function drawBanner(t) {
    const b = G.banner; if (!b) return;
    const { W, H } = L, m = Math.min(W, H), q = clamp((NOW - b.t0) / 0.35, 0, 1);
    ctx.save();
    ctx.fillStyle = `rgba(4,1,8,${0.72 * q})`; ctx.fillRect(0, 0, W, H);
    // rays
    ctx.save(); ctx.translate(W / 2, H * 0.45); ctx.rotate(t * 0.25); ctx.globalAlpha = q;
    const green = b.type === 'fsintro' || b.type === 'retrigger';
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, m * 0.75);
    rg.addColorStop(0, green ? 'rgba(124,252,0,0.22)' : 'rgba(255,210,74,0.22)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    for (let i = 0; i < 16; i++) {
      ctx.rotate(Math.PI * 2 / 16); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-m * 0.07, -m * 0.75); ctx.lineTo(m * 0.07, -m * 0.75); ctx.closePath(); ctx.fill();
    }
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, m * 0.4);
    glow.addColorStop(0, green ? 'rgba(60,255,106,0.25)' : 'rgba(255,150,0,0.28)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, m * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const pop = easeOutBack(clamp((NOW - (b.popT || b.t0)) / 0.45, 0, 1), 2.2);
    const title = b.title, sub = b.sub;
    ctx.translate(W / 2, H * 0.42); ctx.scale(pop, pop);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ts = clamp(m * 0.16, 34, 150) * (title.length > 12 ? 0.75 : 1);
    ctx.font = `${ts}px Creepster, Impact, sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${ts * 0.03}px`;
    ctx.shadowColor = b.type === 'fsintro' || b.type === 'retrigger' ? '#3cff6a' : '#ff7a00'; ctx.shadowBlur = ts * 0.4;
    ctx.lineWidth = ts * 0.12; ctx.strokeStyle = '#1a0500'; ctx.strokeText(title, 0, 0);
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(0, -ts / 2, 0, ts / 2);
    if (b.type === 'fsintro' || b.type === 'retrigger') { g.addColorStop(0, '#f2ffe0'); g.addColorStop(0.5, '#7CFC00'); g.addColorStop(1, '#1f7a12'); }
    else { g.addColorStop(0, '#fffbe0'); g.addColorStop(0.4, '#ffd24a'); g.addColorStop(0.8, '#ff8c00'); g.addColorStop(1, '#a33a00'); }
    ctx.fillStyle = g; ctx.fillText(title, 0, 0);
    if (b.amount != null) {
      const as = ts * 0.62;
      ctx.font = `700 ${as}px Oswald, sans-serif`; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.lineWidth = as * 0.14; ctx.strokeStyle = '#140600'; ctx.strokeText(money(b.amount), 0, ts * 0.95);
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 20; ctx.fillText(money(b.amount), 0, ts * 0.95);
    }
    if (sub) {
      ctx.shadowBlur = 0; ctx.font = `700 ${ts * 0.24}px Cinzel, Georgia, serif`; if ('letterSpacing' in ctx) ctx.letterSpacing = `${ts * 0.02}px`;
      ctx.fillStyle = '#e9cf86'; ctx.fillText(sub, 0, ts * (b.amount != null ? 1.6 : 0.9));
    }
    if (b.hint) {
      ctx.font = `600 ${ts * 0.17}px Oswald, sans-serif`; ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(t * 4)})`;
      ctx.fillText(b.hint, 0, ts * (b.amount != null ? 2.15 : 1.5));
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ main loop
  let last = performance.now() / 1000;
  function frame() {
    const now = performance.now() / 1000, dt = Math.min(0.05, now - last); last = now; NOW = now;
    // timers
    if (G.waits.length) G.waits = G.waits.filter(w => { if (NOW >= w.until) { w.res(); return false; } return true; });
    if (G.tweens.length) G.tweens = G.tweens.filter(tw => {
      const q = (G.skip && tw.skippable) ? 1 : clamp((NOW - tw.t0) / tw.dur, 0, 1);
      tw.fn(tw.ease(q)); if (q >= 1) { tw.res(); return false; } return true;
    });
    reels.forEach(r => r.update(dt));
    // lightning
    if (G.mode === 'base' && !G.banner) { G.nextLightning -= dt; if (G.nextLightning <= 0) { G.lightning = 1; G.nextLightning = rand(18, 40); S.thunder(); } }
    G.lightning = Math.max(0, G.lightning - dt * 2.2); G.flash = Math.max(0, G.flash - dt * 2.5); G.shake = Math.max(0, G.shake - dt * 1.5);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.save();
    if (G.shake > 0) ctx.translate(rand(-1, 1) * G.shake * 8, rand(-1, 1) * G.shake * 8);
    drawBackground(now);
    if (G.lightning > 0) { const a = G.lightning > 0.8 ? 0.55 : G.lightning * (0.3 + 0.3 * Math.sin(now * 60)); ctx.fillStyle = `rgba(200,210,255,${a})`; ctx.fillRect(0, 0, L.W, L.H); }
    drawLogo(now);
    drawFrame(now);
    drawReels(now);
    drawWinLines(now);
    drawHookLines();
    drawBanner(now);
    drawParticles(dt);
    if (G.flash > 0) { ctx.fillStyle = `rgba(255,240,200,${G.flash * 0.6})`; ctx.fillRect(0, 0, L.W, L.H); }
    ctx.restore();
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ UI binding
  const ui = {
    balance: $('balance'), bet: $('bet'), win: $('win'), spin: $('spinBtn'), auto: $('autoBtn'), autoCount: $('autoCount'),
    turbo: $('turboBtn'), sound: $('soundBtn'), buy: $('buyBtn'), buyPrice: $('buyPrice'), toast: $('toast'), winLbl: $('winLbl')
  };
  function setBalance(v) { G.balance = Math.round(v * 100) / 100; ui.balance.textContent = money(G.balance); save(); }
  function setWin(v) { G.winDisplay = v; ui.win.textContent = money(v); ui.win.classList.toggle('lit', v > 0); }
  function refreshUi() {
    ui.bet.textContent = money(bet());
    ui.buyPrice.textContent = money(bet() * M.BUY_COST);
    const lock = G.busy || G.auto > 0;
    $('betDown').disabled = lock || G.betIdx === 0; $('betUp').disabled = lock || G.betIdx === CONFIG.betLevels.length - 1;
    ui.buy.disabled = lock; ui.buy.classList.toggle('hidden', G.mode === 'free');
    ui.turbo.classList.toggle('on', G.turbo); ui.sound.classList.toggle('off', !G.sound);
    ui.spin.classList.toggle('busy', G.busy); ui.spin.classList.toggle('auto', G.auto > 0);
    ui.autoCount.textContent = G.auto > 0 ? (G.auto === Infinity ? '∞' : G.auto) : '';
    ui.winLbl.textContent = G.mode === 'free' ? 'FREE SPINS WIN' : 'WIN';
  }
  let toastT;
  function toast(msg, ms = 2200) { ui.toast.innerHTML = msg; ui.toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => ui.toast.classList.remove('show'), ms); }

  function countUp(from, to, dur, onEach) {
    return tween(dur, q => { const v = lerp(from, to, q); setWin(v); onEach && onEach(v); if (q < 1) S.tick(); }, easeOutCubic);
  }

  // ------------------------------------------------------------------ game flow
  function clearPresentation() { G.winCells = null; G.dim = false; G.lineShow = []; G.landPulse = {}; G.cellAnim = {}; G.wildLabels = {}; G.hookLines = []; G.scatGlow = false; }

  async function runReels(res) {
    G.spinning = true; G.slam = false;
    reels.forEach((r, i) => r.start(G.turbo ? 0 : i * 0.06));
    S.spinStart();
    await wait(G.turbo ? 0.28 : 0.62);
    const landed = [];
    let scatSeen = 0;
    for (let i = 0; i < 5; i++) {
      const col = res.grid[i], vals = res.vals[i];
      const anticip = res.mode === 'base' && scatSeen >= 2 && !G.slam;
      if (anticip) {
        G.anticip[i] = true; S.anticipation(1.25);
        await wait(1.25, false);
      }
      landed.push(new Promise(done => {
        reels[i].onLand = () => {
          G.anticip[i] = false;
          S.thump(i);
          col.forEach((s, r) => {
            if (s === 'SCAT') { G.landPulse[key(i, r)] = NOW; S.scatter(res.grid.slice(0, i + 1).flat().filter(x => x === 'SCAT').length); spawnSparks(16, cellCenter(i, r).x, cellCenter(i, r).y, '#ff5050'); }
            if (s === 'WILD') { G.landPulse[key(i, r)] = NOW; S.wildLand(); spawnSparks(20, cellCenter(i, r).x, cellCenter(i, r).y, '#b6ff8a'); }
            if (s === 'FISH' && res.mode === 'free') G.landPulse[key(i, r)] = NOW;
          });
          if (i === 4) S.stopLoop();
          done();
        };
      }));
      reels[i].stop(col, vals, G.slam || G.turbo);
      scatSeen += col.filter(s => s === 'SCAT').length;
      if (i < 4) await wait(G.turbo ? 0.05 : 0.16);
    }
    await Promise.all(landed);
    G.anticip = [false, false, false, false, false];
    G.spinning = false; G.slam = false;
  }

  async function presentLines(res) {
    if (!res.lineWins.length) return 0;
    G.winCells = new Set(); res.lineWins.forEach(w => w.cells.forEach(([c, r]) => G.winCells.add(key(c, r))));
    G.dim = true; G.lineShow = res.lineWins; G.lineCycleStart = NOW;
    const x = res.lineTotal / bet();
    S.win(x >= 5 ? 2 : x >= 1.5 ? 1 : 0);
    if (x >= 3) { res.lineWins.forEach(w => w.cells.forEach(([c, r]) => { const p = cellCenter(c, r); spawnSparks(6, p.x, p.y); })); }
    const base = G.winDisplay;
    await countUp(base, base + res.lineTotal, G.turbo ? 0.3 : clamp(0.45 + x * 0.08, 0.5, 1.6));
    return res.lineTotal;
  }

  async function collectFrom(wildCell, fish, valsGrid, mult, startIndex) {
    const [wc, wr] = wildCell, wp = cellCenter(wc, wr), k = key(wc, wr);
    G.wildLabels[k] = G.wildLabels[k] || 0;
    let i = startIndex;
    const step = G.turbo ? 0.12 : 0.26;
    for (const [c, r] of fish) {
      const fp = cellCenter(c, r), amt = valsGrid[c][r] * bet() * mult;
      G.hookLines.push({ x0: wp.x, y0: wp.y - L.s * 0.3, x1: fp.x, y1: fp.y, t0: NOW, dur: step });
      G.landPulse[key(c, r)] = NOW;
      S.collect(i++);
      await flyText((mult > 1 ? `${short(amt / mult)} x${mult}` : short(amt)), fp.x, fp.y, wp.x, wp.y, step * 1.4);
      G.hookLines = [];
      G.wildLabels[k] += amt; G.landPulse[k] = NOW; spawnSparks(10, wp.x, wp.y, '#ffd24a');
    }
    return i;
  }

  async function presentHook(res) {
    const [c, r] = res.hook.cell;
    G.dim = false; G.winCells = null;
    G.flash = 1; G.shake = 0.6; S.splash();
    G.banner = { type: 'hook', title: 'THE HOOK!', sub: 'The Haunted Fisherman rises…', t0: NOW };
    await wait(G.turbo ? 0.6 : 1.3, false);
    G.banner = null;
    reels[c].syms[3 - r] = { s: 'WILD', v: 0 };
    G.cellAnim[key(c, r)] = { type: 'drop', t0: NOW };
    await wait(0.45, false);
    S.wildLand(); G.shake = 0.5; spawnSparks(30, cellCenter(c, r).x, cellCenter(c, r).y, '#b6ff8a', 360);
    await wait(0.25, false);
    await collectFrom(res.hook.cell, res.hook.fish, res.vals, 1, 0);
    S.coin();
    const base = G.winDisplay;
    await countUp(base, base + res.hook.win, G.turbo ? 0.4 : 1.0);
    return res.hook.win;
  }

  async function bigWin(amount) {
    const x = amount / bet(), tiers = CONFIG.bigWinTiers;
    if (x < tiers[0].at) return;
    let tier = 0;
    G.banner = { type: 'bigwin', title: tiers[0].title, amount: 0, t0: NOW, popT: NOW, hint: 'TAP TO SKIP' };
    S.fanfare(0);
    G.skip = false;
    const dur = clamp(2.2 + Math.log2(x / 10 + 1) * 2.2, 2.5, 9);
    const coinTimer = setInterval(() => { if (G.banner) spawnCoins(4, L.W / 2 + rand(-60, 60), L.H * 0.95); }, 70);
    await tween(dur, q => {
      const v = amount * q; G.banner.amount = v; S.tick();
      while (tier < tiers.length - 1 && v / bet() >= tiers[tier + 1].at) {
        tier++; G.banner.title = tiers[tier].title; G.banner.popT = NOW; G.shake = 0.8; S.fanfare(tier); spawnCoins(40, L.W / 2, L.H * 0.6, 1.2);
      }
    }, t => t);
    G.banner.amount = amount; G.banner.hint = null; G.skip = false;
    spawnCoins(60, L.W / 2, L.H * 0.7, 1.3); S.coin();
    await wait(1.6);
    clearInterval(coinTimer);
    G.banner = null; G.skip = false;
  }

  async function freeSpins(spins, b) {
    // scatter celebration
    G.scatGlow = true; S.gong(); G.shake = 0.5;
    await wait(1.4, false);
    G.mode = 'free';
    G.fs = M.newFreeState(spins);
    G.fsView = { left: spins, level: 0, collected: 0 };
    G.fsWin = 0; setWin(0);
    clearPresentation(); refreshUi();
    reels.forEach(r => {
      const e = [0, 1, 2].map(() => { let x = r.randomEntry(); while (x.s === 'WILD') x = r.randomEntry(); return x; });
      r.setColumn(e.map(x => x.s), e.map(x => x.v));
    });
    G.banner = { type: 'fsintro', title: `${spins} FREE SPINS`, sub: 'Every Haunted Fisherman reels in all Golden Bass', t0: NOW, hint: 'TAP TO START' };
    S.fanfare(2);
    await waitForClickOr(G.auto > 0 ? 2.5 : 30);
    G.banner = null;

    while (G.fs.left > 0) {
      clearPresentation();
      const res = M.spinFree(b, G.fs, rng);
      G.fsView.left = G.fs.left - res.retriggers.length * M.RETRIGGER_SPINS; // retriggers are revealed after the spin
      await runReels(res);
      let w = await presentLines(res);
      if (res.collect) {
        G.dim = false; G.winCells = null; G.lineShow = [];
        let idx = 0;
        for (const wc of res.collect.wilds) {
          idx = await collectFrom(wc, res.collect.fish, res.vals, res.collect.mult, idx);
          G.fsView.collected++;
          S.coin();
        }
        const base = G.winDisplay;
        await countUp(base, base + res.collect.win, G.turbo ? 0.4 : clamp(0.6 + res.collect.win / b * 0.03, 0.8, 2.2));
        w += res.collect.win;
      } else if (res.wilds.length) {
        G.fsView.collected += res.wilds.length;
      }
      if (res.collect && res.collect.win / b >= 20) { const keepWin = G.winDisplay; await bigWin(res.collect.win); setWin(keepWin); }
      for (const rt of res.retriggers) {
        G.fsView.level = rt.level; G.fsView.left += M.RETRIGGER_SPINS;
        G.banner = { type: 'retrigger', title: `+${M.RETRIGGER_SPINS} SPINS`, sub: `Multiplier now x${rt.mult}`, t0: NOW };
        S.fanfare(1); G.shake = 0.6;
        await wait(G.turbo ? 1 : 2, false);
        G.banner = null;
      }
      G.fsView.left = G.fs.left; G.fsView.level = G.fs.level; G.fsView.collected = G.fs.collected;
      G.fsWin += w;
      if (res.capped) toast('MAX WIN REACHED!');
      await wait(G.turbo ? 0.15 : (w > 0 ? 0.7 : 0.35));
    }
    const total = G.fs.total;
    clearPresentation();
    G.banner = { type: 'fsoutro', title: 'FEATURE WIN', amount: total, sub: `${G.fs.played} free spins played`, t0: NOW, hint: 'TAP TO CONTINUE' };
    S.fanfare(2); if (total > 0) spawnCoins(80, L.W / 2, L.H * 0.8, 1.2);
    await waitForClickOr(G.auto > 0 ? 3 : 30);
    G.banner = null;
    G.mode = 'base'; G.fsView = null;
    reels.forEach(r => { r.syms = r.syms.map(e => (e.s === 'WILD' ? r.randomEntry() : e)); });
    return total;
  }

  async function spin(buy = false) {
    if (G.busy) return;
    const b = bet(), cost = buy ? b * M.BUY_COST : b;
    if (G.balance + 1e-9 < cost) {
      G.auto = 0; refreshUi();
      toast(`Not enough credit. <button class="link" id="refill">Refill demo credit</button>`, 5000);
      const rf = $('refill'); if (rf) rf.onclick = () => { setBalance(CONFIG.startBalance); toast('Demo credit refilled'); };
      return;
    }
    G.busy = true; G.skip = false; refreshUi();
    clearPresentation();
    setBalance(G.balance - cost); setWin(0);
    const res = buy ? M.spinBuy(b, rng) : M.spinBase(b, rng);
    if (buy) { G.flash = 0.6; S.gong(); }
    await runReels(res);
    let win = 0;
    win += await presentLines(res);
    if (res.hook) win += await presentHook(res);
    if (res.fsAwarded) {
      if (win > 0) setBalance(G.balance + win);
      const pre = win;
      const fsTotal = await freeSpins(res.fsAwarded, b);
      setBalance(G.balance + fsTotal);
      win = pre + fsTotal;
      setWin(win);
      refreshUi();
      if (fsTotal / b >= CONFIG.bigWinTiers[0].at) await bigWin(fsTotal);
    } else {
      if (win > 0) setBalance(G.balance + win);
      if (win / b >= CONFIG.bigWinTiers[0].at) await bigWin(win);
    }
    setWin(win);
    G.busy = false; G.skip = false;
    if (G.auto > 0) {
      if (G.auto !== Infinity) G.auto--;
      refreshUi();
      if (G.auto > 0) { await wait(G.turbo ? 0.15 : 0.45, false); if (G.auto > 0 && !G.busy) return spin(false); }
    }
    refreshUi();
  }

  function onSpinPress() {
    S.init();
    if (G.clickWaiter) { const w = G.clickWaiter; G.clickWaiter = null; w(); return; }
    if (G.auto > 0) { G.auto = 0; refreshUi(); toast('Autoplay stopped'); if (G.busy) return; return; }
    if (G.busy) {
      if (G.spinning) { G.slam = true; releaseSkippable(); reels.forEach(r => { if (r.state === 'stopping') r.dur = Math.min(r.dur, r.t + 0.12); }); }
      else { G.skip = true; releaseSkippable(); setTimeout(() => { G.skip = false; }, 60); }
      return;
    }
    S.click();
    spin(false);
  }

  // ------------------------------------------------------------------ modals
  function openModal(id) { $(id).classList.add('open'); }
  function closeModals() { document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')); }
  function buildPaytable() {
    const b = bet(), rows = ['WILD', 'PUM', 'TAK', 'BAT', 'BOB', 'POT', 'A', 'K', 'Q', 'J'];
    const img = s => `<canvas class="ptc" data-sym="${s}" width="120" height="120"></canvas>`;
    let html = `<div class="pt-grid">`;
    for (const s of rows) {
      const p = M.PAYS[s]; if (!p) continue;
      html += `<div class="pt-item">${img(s)}<div><div class="pt-name">${SYMBOL_NAMES[s]}</div>` +
        Object.keys(p).sort((a, c) => c - a).map(n => `<div class="pt-pay"><span>${n}x</span>${money(p[n] * b)}</div>`).join('') + `</div></div>`;
    }
    html += `</div>`;
    html += `<div class="pt-feature">${img('SCAT')}<div><h3>Blood Moon — Free Spins</h3><p>3, 4 or 5 Blood Moons anywhere award <b>10, 15 or 20 free spins</b>.</p></div></div>`;
    html += `<div class="pt-feature">${img('FISH')}<div><h3>Golden Bass — Money Symbol</h3><p>Each Golden Bass carries a cash value from <b>${money(M.FISH_VALUES[0] * b)}</b> up to <b>${money(M.FISH_VALUES[M.FISH_VALUES.length - 1] * b)}</b>. During free spins, every Haunted Fisherman collects <b>all</b> Golden Bass on screen.</p></div></div>`;
    html += `<div class="pt-feature">${img('WILD')}<div><h3>Haunted Fisherman — Wild</h3><p>Appears during free spins, substitutes for all paying symbols and reels in every Golden Bass. Every 4th Fisherman collected retriggers <b>+10 spins</b> and raises the multiplier <b>x2 → x3 → x10</b>.</p></div></div>`;
    html += `<div class="pt-feature"><div class="pt-ico">🪝</div><div><h3>The Hook</h3><p>When ${M.HOOK_MIN_FISH}+ Golden Bass land in the base game, the Fisherman may rise from the lake and collect them all.</p></div></div>`;
    html += `<p class="pt-rules">20 fixed paylines, pays left to right. Line wins are multiplied by the total bet. Max win ${M.MAX_WIN.toLocaleString()}x bet. Theoretical RTP 96.3% (simulated over 8M spins). Bonus buy costs ${M.BUY_COST}x bet. Malfunction voids all pays and plays. <br><b>Demo mode — play money only.</b></p>`;
    $('ptBody').innerHTML = html;
    $('ptBody').querySelectorAll('canvas.ptc').forEach(cv => cv.getContext('2d').drawImage(symbolCanvas(cv.dataset.sym, 120).n, 0, 0));
    // paylines diagram
    $('ptLines').innerHTML = M.LINES.map((ln, i) => `<div class="pl"><span>${i + 1}</span><svg viewBox="0 0 50 30">${[0, 1, 2].map(r => [0, 1, 2, 3, 4].map(c => `<rect x="${c * 10 + 1}" y="${r * 10 + 1}" width="8" height="8" rx="1.5" fill="${ln[c] === r ? CONFIG.lineColors[i] : 'rgba(255,255,255,.12)'}"/>`).join('')).join('')}</svg></div>`).join('');
  }

  // ------------------------------------------------------------------ boot
  async function boot() {
    const prog = $('loadBar');
    const files = SYMS.map(s => ['assets/cut/' + s + '.png', s]).concat([['assets/cut/bg.jpg', 'bg']]);
    let done = 0;
    await Promise.all(files.map(([src, k]) => loadImg(src).then(img => { IMG[k] = img; done++; prog.style.width = (done / files.length * 100) + '%'; })));
    try { await Promise.race([Promise.all(['40px Creepster', '700 40px Cinzel', '900 40px Cinzel', '700 20px Oswald', '600 20px Oswald'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 2500))]); } catch (e) {}
    resize(); initAmbience();
    // initial screen
    const r0 = M.spinBase(bet(), rng, { noHook: true });
    reels.forEach((r, i) => r.setColumn(r0.grid[i], r0.vals[i]));
    setBalance(G.balance); setWin(0); refreshUi();
    requestAnimationFrame(frame);
    $('splashGo').classList.add('ready'); $('splashGo').textContent = 'TAP TO PLAY';
    $('splashGo').onclick = () => { S.init(); S.startMusic(); $('splash').classList.add('gone'); setTimeout(() => $('splash').remove(), 700); };
  }

  window.addEventListener('resize', resize);
  wrap.addEventListener('pointermove', e => { const r = wrap.getBoundingClientRect(); G.mouse.x = (e.clientX - r.left) / r.width; G.mouse.y = (e.clientY - r.top) / r.height; });
  canvas.addEventListener('pointerdown', () => {
    S.init();
    if (G.clickWaiter) { const w = G.clickWaiter; G.clickWaiter = null; w(); return; }
    if (G.banner || (G.busy && !G.spinning)) { G.skip = true; releaseSkippable(); setTimeout(() => { G.skip = false; }, 60); }
    else if (G.busy && G.spinning) onSpinPress();
  });
  ui.spin.addEventListener('click', onSpinPress);
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') { if (document.querySelector('.modal.open') || $('splash')) return; e.preventDefault(); onSpinPress(); }
    if (e.code === 'Escape') closeModals();
  });
  $('betUp').onclick = () => { S.init(); S.click(); G.betIdx = Math.min(G.betIdx + 1, CONFIG.betLevels.length - 1); save(); refreshUi(); };
  $('betDown').onclick = () => { S.init(); S.click(); G.betIdx = Math.max(G.betIdx - 1, 0); save(); refreshUi(); };
  ui.turbo.onclick = () => { S.init(); G.turbo = !G.turbo; save(); refreshUi(); toast(G.turbo ? 'Turbo spin ON' : 'Turbo spin OFF', 1200); };
  ui.sound.onclick = () => { S.init(); G.sound = !G.sound; S.setOn(G.sound); if (G.sound) S.startMusic(); save(); refreshUi(); };
  ui.auto.onclick = () => { S.init(); if (G.auto > 0) { G.auto = 0; refreshUi(); return; } openModal('autoModal'); };
  document.querySelectorAll('[data-auto]').forEach(btn => btn.onclick = () => {
    const n = btn.dataset.auto === 'inf' ? Infinity : +btn.dataset.auto; closeModals(); G.auto = n; refreshUi(); if (!G.busy) spin(false);
  });
  $('infoBtn').onclick = () => { S.init(); buildPaytable(); openModal('ptModal'); };
  ui.buy.onclick = () => { S.init(); if (G.busy) return; $('buyCost').textContent = money(bet() * M.BUY_COST); openModal('buyModal'); };
  $('buyConfirm').onclick = () => { closeModals(); spin(true); };
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) closeModals(); }));

  // expose a tiny API for QA / embedding
  window.CursedReels = { G, spin, setBalance, bet, M, forceBuy: () => spin(true) };
  boot();
})();
