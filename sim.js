// RTP simulator: node sim.js [spins]
const M = require('./math.js');
const N = +(process.argv[2] || 2000000);
const rng = Math.random;
const bet = 1;
let wagered = 0, won = 0, baseLine = 0, hookWin = 0, fsWin = 0, hits = 0, fsCount = 0, hooks = 0, maxWin = 0;
let fsSpinsTotal = 0;
function playFree(spins) {
  const st = M.newFreeState(spins);
  while (st.left > 0) M.spinFree(bet, st, rng);
  fsSpinsTotal += st.played;
  return st.total;
}
for (let i = 0; i < N; i++) {
  wagered += bet;
  const r = M.spinBase(bet, rng);
  let w = r.totalWin;
  baseLine += r.lineTotal; if (r.hook) { hooks++; hookWin += r.hook.win; }
  if (r.fsAwarded) { fsCount++; const f = playFree(r.fsAwarded); fsWin += f; w += f; }
  if (w > 0) hits++;
  won += w; if (w > maxWin) maxWin = w;
}
console.log(`spins ${N}  RTP ${(won / wagered * 100).toFixed(2)}%`);
console.log(`  lines ${(baseLine / wagered * 100).toFixed(2)}%  hook ${(hookWin / wagered * 100).toFixed(2)}% (1 in ${(N / hooks).toFixed(0)})  free spins ${(fsWin / wagered * 100).toFixed(2)}%`);
console.log(`  hit rate ${(hits / N * 100).toFixed(1)}%  FS 1 in ${(N / fsCount).toFixed(0)}  avg FS ${(fsWin / fsCount).toFixed(1)}x  avg FS length ${(fsSpinsTotal / fsCount).toFixed(1)}  max ${maxWin.toFixed(0)}x`);
// Bonus buy RTP
const B = Math.max(2000, Math.floor(N / 200));
let buyWon = 0;
for (let i = 0; i < B; i++) { const r = M.spinBuy(bet, rng); buyWon += r.totalWin + playFree(r.fsAwarded); }
console.log(`  bonus buy (${M.BUY_COST}x) RTP ${(buyWon / (B * M.BUY_COST) * 100).toFixed(2)}% over ${B} buys`);
