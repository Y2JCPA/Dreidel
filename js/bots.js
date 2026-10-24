/* ============================================
   MACK-A-BEE DREIDEL — Computer players
   Each bot has a betting style (careful, steady or bold) and a tap
   skill, both fixed by its id so it plays the same way all game.
   Taps are simulated the same way as a person's: a timing error that
   becomes a bigger miss when the marker is fast.
   ============================================ */
const Bots = (function () {
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  function personality(id) {
    const h = hash(id);
    const styles = ['careful', 'steady', 'bold'];
    return { style: styles[h % 3], sd: 0.045 + ((h >> 4) % 5) * 0.01 };
  }

  function chooseWager(p, S) {
    const { style } = personality(p.id);
    const c = p.coins;
    const lastRound = S.round >= S.settings.rounds;
    const leader = Math.max(...S.players.map(x => x.coins));
    let frac = style === 'careful' ? 0.12 + Math.random() * 0.1 : style === 'steady' ? 0.22 + Math.random() * 0.18 : 0.35 + Math.random() * 0.4;
    if (lastRound && c < leader) frac = Math.max(frac, 0.6 + Math.random() * 0.4);   // chase the leader at the end
    if (style === 'bold' && Math.random() < 0.12) frac = 1;
    return Math.max(1, Math.min(c, Math.round(c * frac)));
  }

  function chooseGrade(p, wager) {
    const { sd } = personality(p.id);
    const m = Rules.meterParams(wager);
    const err = Math.abs(gauss() * sd * m.speed);
    return err <= m.gold / 2 ? 'perfect' : err <= m.width / 2 ? 'good' : 'miss';
  }

  const ACCURACY = { kids: 0.8, adults: 0.55, tc: 0.38 };
  // Returns { choice (display index), ms }
  function answer(p, q, order, seconds) {
    const acc = ACCURACY[q && q.level] || 0.5;
    const correct = order.indexOf(q ? q.answer : 0);
    const right = Math.random() < acc;
    const choice = right ? correct : [0, 1, 2, 3].filter(i => i !== correct)[Math.floor(Math.random() * 3)];
    const ms = Math.min(seconds * 1000 - 400, 2200 + Math.random() * seconds * 600);
    return { choice: Math.random() < 0.06 ? null : choice, ms };
  }

  function name(i, lang) {
    const n = CONFIG.botNames[i % CONFIG.botNames.length];
    return n[lang] || n.en;
  }

  return { personality, chooseWager, chooseGrade, answer, name };
})();
