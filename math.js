/* Cursed Reels — game math (shared by the browser game and the Node RTP simulator).
   All pays are multiples of the TOTAL bet. Tune here; run `node sim.js` to verify RTP. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SlotMath = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const REELS = 5, ROWS = 3;

  // 20 fixed paylines (row index per reel, 0 = top)
  const LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 2, 1, 0, 1],
    [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [1, 1, 0, 1, 1],
    [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 2, 2, 0], [2, 0, 0, 0, 2]
  ];

  // Line pays (x total bet) by count of a kind, left to right
  const PAYS = {
    J:   { 3: 0.4, 4: 1, 5: 5 },
    Q:   { 3: 0.5, 4: 1.2, 5: 6 },
    K:   { 3: 0.6, 4: 1.6, 5: 8 },
    A:   { 3: 0.7, 4: 2, 5: 10 },
    BOB: { 3: 2, 4: 8, 5: 30 },
    POT: { 3: 2, 4: 8, 5: 30 },
    BAT: { 3: 3, 4: 10, 5: 40 },
    TAK: { 3: 4, 4: 15, 5: 60 },
    PUM: { 2: 0.5, 3: 6, 4: 30, 5: 200 },
    WILD:{ 2: 0.5, 3: 6, 4: 30, 5: 200 }
  };

  // Money-fish values (x total bet) and weights
  const FISH_VALUES  = [2, 5, 10, 15, 20, 25, 50, 100, 250, 1000];
  const FISH_WEIGHTS = [300, 300, 180, 120, 50, 25, 15, 5, 1.5, 0.2];

  const SCATTER_AWARD = { 3: 10, 4: 15, 5: 20 };
  const FS_MULTS = [1, 2, 3, 10];      // multiplier levels unlocked every 4 collected wilds
  const WILDS_PER_LEVEL = 4;
  const RETRIGGER_SPINS = 10;
  const MAX_WIN = 5000;                 // x total bet
  const BUY_COST = 100;                 // x total bet

  // Base game "Hook": 4+ fish and the Haunted Fisherman may drop in to collect them
  const HOOK_MIN_FISH = 4;
  const HOOK_CHANCE = 0.08;

  const BASE_WEIGHTS = { J: 26, Q: 25, K: 23, A: 23, BOB: 6, POT: 6, BAT: 4, TAK: 3, PUM: 2.5, FISH: 6.5, SCAT: 3.15 };
  const FS_WEIGHTS   = { J: 22, Q: 21, K: 20, A: 20, BOB: 5, POT: 5, BAT: 4, TAK: 3, PUM: 2.5, FISH: 9, WILD: 2.0 };

  // Deterministic strip builder so the simulator and the browser use identical reels
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function buildStrip(weights, len, seed, spaced) {
    const r = mulberry32(seed);
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    // regular symbols are grouped in short stacks (1-3) like real reel strips; specials stay single
    const runs = [];
    for (const [s, w] of Object.entries(weights)) {
      let n = Math.max(1, Math.round((w / total) * len));
      while (n > 0) {
        let k = spaced.includes(s) ? 1 : Math.min(n, [1, 2, 2, 3][Math.floor(r() * 4)]);
        runs.push(Array(k).fill(s)); n -= k;
      }
    }
    for (let i = runs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [runs[i], runs[j]] = [runs[j], runs[i]]; }
    let strip = [].concat(...runs);
    // keep special symbols at least 3 apart so a reel never shows two of them
    for (let pass = 0; pass < 60; pass++) {
      let moved = false;
      for (let i = 0; i < strip.length; i++) {
        if (!spaced.includes(strip[i])) continue;
        for (let d = 1; d <= 2; d++) {
          const k = (i + d) % strip.length;
          if (strip[k] === strip[i]) {
            const t = Math.floor(r() * strip.length);
            if (!spaced.includes(strip[t]) && !spaced.includes(strip[(t + 1) % strip.length]) && !spaced.includes(strip[(t - 1 + strip.length) % strip.length])) {
              [strip[k], strip[t]] = [strip[t], strip[k]]; moved = true;
            }
          }
        }
      }
      if (!moved) break;
    }
    return strip;
  }
  const SCAT_PER_REEL = [3.3, 3.15, 3.3, 3.15, 3.3]; // fine-tunes free spins frequency
  const BASE_STRIPS = [0, 1, 2, 3, 4].map(i => buildStrip(Object.assign({}, BASE_WEIGHTS, { SCAT: SCAT_PER_REEL[i] }), 500, 1000 + i, ['SCAT']));
  const FS_STRIPS   = [0, 1, 2, 3, 4].map(i => buildStrip(FS_WEIGHTS, 500, 2000 + i, ['WILD']));

  function pickWeighted(values, weights, rng) {
    let t = weights.reduce((a, b) => a + b, 0) * rng();
    for (let i = 0; i < values.length; i++) { t -= weights[i]; if (t <= 0) return values[i]; }
    return values[values.length - 1];
  }
  const fishValue = rng => pickWeighted(FISH_VALUES, FISH_WEIGHTS, rng);

  function spinGrid(strips, rng) {
    const grid = [], vals = [], stops = [];
    for (let c = 0; c < REELS; c++) {
      const s = strips[c], stop = Math.floor(rng() * s.length);
      stops.push(stop);
      const col = [], v = [];
      for (let r = 0; r < ROWS; r++) {
        const sym = s[(stop + r) % s.length];
        col.push(sym); v.push(sym === 'FISH' ? fishValue(rng) : 0);
      }
      grid.push(col); vals.push(v);
    }
    return { grid, vals, stops };
  }

  function evalLines(grid) {
    const wins = [];
    LINES.forEach((line, li) => {
      const cells = line.map((r, c) => grid[c][r]);
      let best = null;
      let w = 0; while (w < REELS && cells[w] === 'WILD') w++;
      if (w > 0 && PAYS.WILD[w]) best = { sym: 'WILD', count: w, pay: PAYS.WILD[w] };
      const first = cells.find(s => s !== 'WILD');
      if (first && PAYS[first]) {
        let n = 0; while (n < REELS && (cells[n] === first || cells[n] === 'WILD')) n++;
        const p = PAYS[first][n] || 0;
        if (p > 0 && (!best || p > best.pay)) best = { sym: first, count: n, pay: p };
      }
      if (best) wins.push({ line: li, sym: best.sym, count: best.count, pay: best.pay,
        cells: line.slice(0, best.count).map((r, c) => [c, r]) });
    });
    return wins;
  }

  function cellsOf(grid, sym) {
    const out = [];
    for (let c = 0; c < REELS; c++) for (let r = 0; r < ROWS; r++) if (grid[c][r] === sym) out.push([c, r]);
    return out;
  }

  function spinBase(bet, rng, opts = {}) {
    const { grid, vals, stops } = spinGrid(BASE_STRIPS, rng);
    const lineWins = evalLines(grid);
    let lineTotal = 0; lineWins.forEach(w => { w.win = w.pay * bet; lineTotal += w.win; });
    const scat = cellsOf(grid, 'SCAT');
    const fsAwarded = SCATTER_AWARD[Math.min(scat.length, 5)] || 0;
    let hook = null;
    const fish = cellsOf(grid, 'FISH');
    if (!opts.noHook && fish.length >= HOOK_MIN_FISH && rng() < HOOK_CHANCE) {
      const free = [];
      for (let c = 0; c < REELS; c++) for (let r = 0; r < ROWS; r++)
        if (grid[c][r] !== 'FISH' && grid[c][r] !== 'SCAT') free.push([c, r]);
      if (free.length) {
        const cell = free[Math.floor(rng() * free.length)];
        const sum = fish.reduce((a, [c, r]) => a + vals[c][r], 0);
        hook = { cell, fish, win: sum * bet };
      }
    }
    const totalWin = Math.min(lineTotal + (hook ? hook.win : 0), MAX_WIN * bet);
    return { mode: 'base', grid, vals, stops, lineWins, lineTotal, scat, fsAwarded, hook, totalWin };
  }

  function newFreeState(spins) { return { left: spins, played: 0, level: 0, collected: 0, total: 0 }; }

  function spinFree(bet, st, rng) {
    st.left--; st.played++;
    const { grid, vals, stops } = spinGrid(FS_STRIPS, rng);
    const lineWins = evalLines(grid);
    let lineTotal = 0; lineWins.forEach(w => { w.win = w.pay * bet; lineTotal += w.win; });
    const wilds = cellsOf(grid, 'WILD'), fish = cellsOf(grid, 'FISH');
    const mult = FS_MULTS[st.level];
    let collect = null;
    if (wilds.length && fish.length) {
      const sum = fish.reduce((a, [c, r]) => a + vals[c][r], 0);
      collect = { wilds, fish, perWild: sum * bet * mult, mult, win: sum * bet * mult * wilds.length };
    }
    const retriggers = [];
    st.collected += wilds.length;
    while (st.level < FS_MULTS.length - 1 && st.collected >= WILDS_PER_LEVEL * (st.level + 1)) {
      st.level++; st.left += RETRIGGER_SPINS; retriggers.push({ level: st.level, mult: FS_MULTS[st.level] });
    }
    let totalWin = lineTotal + (collect ? collect.win : 0);
    const cap = MAX_WIN * bet - st.total;
    let capped = false;
    if (totalWin >= cap) { totalWin = cap; capped = true; st.left = 0; }
    st.total += totalWin;
    return { mode: 'free', grid, vals, stops, lineWins, lineTotal, wilds, fish, collect, retriggers, totalWin, capped };
  }

  // Bonus buy: spin until the scatters land (the trigger spin's own line wins are paid too)
  function spinBuy(bet, rng) {
    for (let i = 0; i < 100000; i++) {
      const r = spinBase(bet, rng, { noHook: true });
      if (r.fsAwarded) { r.bought = true; return r; }
    }
    throw new Error('buy failed');
  }

  return { REELS, ROWS, LINES, PAYS, FISH_VALUES, FISH_WEIGHTS, SCATTER_AWARD, FS_MULTS, WILDS_PER_LEVEL,
    RETRIGGER_SPINS, MAX_WIN, BUY_COST, HOOK_MIN_FISH, BASE_STRIPS, FS_STRIPS, fishValue,
    spinBase, spinFree, spinBuy, newFreeState, evalLines };
});
