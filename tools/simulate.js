// Odds simulation: how much does a bet earn on average, and how do
// betting styles do over a game? Run: node tools/simulate.js
// Models a human tap as a timing error (normal, `sd` seconds), so a
// faster marker turns the same reaction error into a bigger miss.
const C = require('../js/config.js');
const R = require('../js/rules.js');

const SD = +(process.argv[2] || 0.06);   // tap timing error in seconds (0.04 = sharp, 0.09 = casual)
const GAMES = 20000;

function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function tapGrade(wager) {
  const m = R.meterParams(wager);
  const err = Math.abs(gauss() * SD * m.speed);   // position error in bar widths
  return err <= m.gold / 2 ? 'perfect' : err <= m.width / 2 ? 'good' : 'miss';
}

console.log(`Tap timing error: ${SD * 1000} ms\n`);
console.log('wager  green  speed  P(good+)  P(perfect)  avg result per spin (no trivia)');
for (const w of [1, 5, 10, 20, 50, 100, 200]) {
  let good = 0, perf = 0, sum = 0;
  const N = 40000;
  for (let i = 0; i < N; i++) {
    const g = tapGrade(w);
    if (g !== 'miss') good++;
    if (g === 'perfect') perf++;
    sum += R.wagerDelta(R.drawLetter(g), w);
  }
  const m = R.meterParams(w);
  console.log(`${String(w).padStart(5)}  ${(m.width * 100).toFixed(1).padStart(4)}%  ${m.speed.toFixed(2)}  ${(good / N * 100).toFixed(0).padStart(6)}%  ${(perf / N * 100).toFixed(0).padStart(8)}%   ${(sum / N >= 0 ? '+' : '') + (sum / N).toFixed(2)} (${(sum / N / w * 100).toFixed(0)}%)`);
}

const styles = {
  'always 1': c => 1,
  'quarter': c => Math.max(1, Math.round(c / 4)),
  'half': c => Math.max(1, Math.round(c / 2)),
  'all-in': c => c,
  'flat 5': c => Math.min(c, 5),
};
console.log(`\n5 rounds from ${C.defaults.startCoins} coins, no trivia (${GAMES} games each):`);
console.log('style       avg end  median  bust%   top 10%');
for (const [name, bet] of Object.entries(styles)) {
  const ends = [];
  for (let g = 0; g < GAMES; g++) {
    let c = C.defaults.startCoins;
    for (let r = 0; r < C.defaults.rounds && c > 0; r++) {
      const w = bet(c);
      c += R.wagerDelta(R.drawLetter(tapGrade(w)), w);
    }
    ends.push(c);
  }
  ends.sort((a, b) => a - b);
  const avg = ends.reduce((a, b) => a + b, 0) / GAMES;
  const bust = ends.filter(x => x <= 0).length / GAMES * 100;
  console.log(`${name.padEnd(10)}  ${avg.toFixed(1).padStart(7)}  ${String(ends[GAMES >> 1]).padStart(6)}  ${bust.toFixed(0).padStart(4)}%  ${String(ends[Math.floor(GAMES * 0.9)]).padStart(7)}`);
}
