// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/config.js');
const R = require('../js/rules.js');

// rng that returns the given values in order, then repeats the last one
const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
const players = n => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
// rng value that lands on a letter for a given odds table
function rngFor(table, letter) {
  let acc = 0;
  for (const L of C.letters) {
    if (L === letter) return (acc + C.odds[table][L] / 2) / 100;
    acc += C.odds[table][L];
  }
}
// Spin and let the spin resolve
function spinTo(S, letter, opts = {}) {
  const grade = opts.grade || 'good';
  const table = (S.settings.mode === 'classic' || S.spinoff) ? 'classic' : grade;
  const pid = R.current(S).id;
  let t = opts.now || 1000;
  S = R.act(S, pid, { type: 'spin', wager: opts.wager || 1, grade }, t, seq(rngFor(table, letter), 0.5));
  assert.equal(S.phase, 'spinning');
  t = S.deadline;
  S = R.tick(S, t, seq(opts.triviaRoll ?? 0.99), opts.ctx || {});
  return S;
}
const finishPhase = S => R.tick(S, S.deadline, Math.random, {});

test('odds tables add up to 100', () => {
  for (const k in C.odds) assert.equal(Object.values(C.odds[k]).reduce((a, b) => a + b, 0), 100, k);
});

test('meter gets narrower and faster as the wager grows, by plain coins', () => {
  let prev = R.meterParams(1);
  for (const w of [5, 10, 20, 50, 100, 150, 250, 1000]) {
    const m = R.meterParams(w);
    assert.ok(m.width < prev.width || w > C.meter.beyondAt, `width at ${w}`);
    assert.ok(m.speed > prev.speed || w > C.meter.beyondAt, `speed at ${w}`);
    assert.ok(Math.abs(m.gold - m.width * C.meter.goldRatio) < 1e-9);
    prev = m;
  }
  assert.ok(Math.abs(R.meterParams(100).width - C.meter.width.hard) < 1e-9);
  assert.ok(Math.abs(R.meterParams(1000).width - C.meter.width.floor) < 1e-9);
});

test('tap grading', () => {
  const m = { width: 0.2, gold: 0.04 };
  assert.equal(R.gradeTap(0.5, 0.5, m), 'perfect');
  assert.equal(R.gradeTap(0.515, 0.5, m), 'perfect');
  assert.equal(R.gradeTap(0.55, 0.5, m), 'good');
  assert.equal(R.gradeTap(0.61, 0.5, m), 'miss');
});

test('marker sweeps back and forth', () => {
  assert.equal(R.markerPos(0, 1), 0);
  assert.equal(R.markerPos(1, 1), 1);
  assert.equal(R.markerPos(1.5, 1), 0.5);
  assert.equal(R.markerPos(2, 1), 0);
});

test('wager payouts: gimel doubles, hey half rounded up, nun nothing, shin loses', () => {
  assert.equal(R.wagerDelta('gimel', 10), 10);
  assert.equal(R.wagerDelta('hey', 10), 5);
  assert.equal(R.wagerDelta('hey', 5), 3);
  assert.equal(R.wagerDelta('nun', 10), 0);
  assert.equal(R.wagerDelta('shin', 10), -10);
});

test('wager turn applies payout and moves to the next player', () => {
  let S = R.create({ startCoins: 20, trivia: false }, players(3), 0);
  S = spinTo(S, 'gimel', { wager: 10 });
  assert.equal(S.phase, 'result');
  assert.equal(S.players[0].coins, 30);
  S = finishPhase(S);
  assert.equal(S.turn, 1);
  S = spinTo(S, 'shin', { wager: 20 });
  assert.equal(S.players[1].coins, 0);
});

test('wager is clamped to what the player has', () => {
  let S = R.create({ startCoins: 10, trivia: false }, players(2), 0);
  S = spinTo(S, 'shin', { wager: 999 });
  assert.equal(S.players[0].coins, 0);
});

test('only the current player can spin', () => {
  const S = R.create({}, players(2), 0);
  assert.equal(R.act(S, 'p1', { type: 'spin', wager: 1, grade: 'good' }, 0), S);
});

test('rounds run like bowling: everyone spins once per round, then the game ends', () => {
  let S = R.create({ rounds: 2, trivia: false }, players(3), 0);
  const order = [];
  while (S.phase !== 'over') {
    order.push(`${S.round}:${R.current(S).id}`);
    S = spinTo(S, 'nun');
    S = finishPhase(S);
    if (S.spinoff) break;
  }
  assert.deepEqual(order, ['1:p0', '1:p1', '1:p2', '2:p0', '2:p1', '2:p2']);
});

test('a player with no coins is skipped but the game continues', () => {
  let S = R.create({ rounds: 3, trivia: false, startCoins: 5 }, players(3), 0);
  S = spinTo(S, 'shin', { wager: 5 });       // p0 busts
  S = finishPhase(S);
  S = spinTo(S, 'nun'); S = finishPhase(S);   // p1
  S = spinTo(S, 'nun'); S = finishPhase(S);   // p2
  assert.equal(S.round, 2);
  assert.equal(R.current(S).id, 'p1');
});

test('turn timer: out of time bets 1 as a miss', () => {
  let S = R.create({ turnSeconds: 30, trivia: false }, players(2), 0);
  assert.equal(S.deadline, 30000);
  S = R.tick(S, 30000, () => 0.5);
  assert.equal(S.phase, 'spinning');
  assert.equal(S.spin.wager, 1);
  assert.equal(S.spin.grade, 'miss');
});

const ctx = { pickQuestion: () => 'q1', answerOf: () => 2 };
function toTrivia(n = 3) {
  let S = R.create({ startCoins: 20, trivia: true, triviaChance: 70 }, players(n), 0);
  S = spinTo(S, 'gimel', { wager: 10, triviaRoll: 0.1, ctx });
  assert.equal(S.phase, 'trivia');
  return S;
}
const correctIdx = S => S.trivia.order.indexOf(2);

test('trivia: spinner answers right and keeps the gimel', () => {
  let S = toTrivia();
  const c = correctIdx(S);
  S = R.act(S, 'p0', { type: 'answer', choice: c, ms: 3000 }, 5000, Math.random, ctx);
  S = R.act(S, 'p1', { type: 'answer', choice: c, ms: 1000 }, 5000, Math.random, ctx);
  S = R.act(S, 'p2', { type: 'answer', choice: (c + 1) % 4, ms: 1000 }, 5000, Math.random, ctx);
  assert.equal(S.phase, 'reveal');
  assert.equal(S.trivia.outcome, 'kept');
  assert.deepEqual(S.players.map(p => p.coins), [30, 20, 20]);
});

test('trivia: nobody right turns the gimel into nun', () => {
  let S = toTrivia();
  S = R.tick(S, S.deadline, Math.random, ctx);   // time runs out with no answers
  assert.equal(S.trivia.outcome, 'nun');
  assert.deepEqual(S.players.map(p => p.coins), [20, 20, 20]);
});

test('trivia: one other player right steals the winnings', () => {
  let S = toTrivia();
  const c = correctIdx(S);
  S = R.act(S, 'p0', { type: 'answer', choice: (c + 1) % 4, ms: 1000 }, 5000, Math.random, ctx);
  S = R.act(S, 'p2', { type: 'answer', choice: c, ms: 4000 }, 5000, Math.random, ctx);
  S = R.tick(S, S.deadline, Math.random, ctx);
  assert.equal(S.trivia.outcome, 'stolen');
  assert.deepEqual(S.players.map(p => p.coins), [20, 20, 30]);
  assert.equal(S.players[2].stats.steals, 1);
});

test('trivia: several right split it, fastest gets the leftover', () => {
  let S = toTrivia(4);
  S.spin.wager = 11;
  const c = correctIdx(S);
  S = R.act(S, 'p0', { type: 'answer', choice: null, ms: 15000 }, 5000, Math.random, ctx);
  S = R.act(S, 'p1', { type: 'answer', choice: c, ms: 4000 }, 5000, Math.random, ctx);
  S = R.act(S, 'p2', { type: 'answer', choice: c, ms: 2000 }, 5000, Math.random, ctx);
  S = R.act(S, 'p3', { type: 'answer', choice: c, ms: 6000 }, 5000, Math.random, ctx);
  assert.equal(S.trivia.outcome, 'split');
  assert.deepEqual(S.players.map(p => p.coins), [20, 23, 25, 23]);
});

test('trivia: a busted player can still steal and gets back in', () => {
  let S = R.create({ startCoins: 10, trivia: true, triviaChance: 100, rounds: 3 }, players(2), 0);
  S = spinTo(S, 'shin', { wager: 10 });   // p0 busts
  S = finishPhase(S);
  S = spinTo(S, 'gimel', { wager: 6, triviaRoll: 0.1, ctx });
  const c = correctIdx(S);
  S = R.act(S, 'p1', { type: 'answer', choice: (c + 1) % 4 }, 5000, Math.random, ctx);
  S = R.act(S, 'p0', { type: 'answer', choice: c }, 5000, Math.random, ctx);
  assert.deepEqual(S.players.map(p => p.coins), [6, 10]);
  S = finishPhase(S);
  assert.equal(S.round, 2);
  assert.equal(R.current(S).id, 'p0');   // back in from the next round
});

test('trivia only when the roll is under the chance', () => {
  let S = R.create({ trivia: true, triviaChance: 70 }, players(2), 0);
  S = spinTo(S, 'gimel', { wager: 4, triviaRoll: 0.75, ctx });
  assert.equal(S.phase, 'result');
  assert.equal(S.players[0].coins, 24);
});

test('no trivia in Classic mode, even if asked for', () => {
  const S = R.create({ mode: 'classic', trivia: true }, players(2), 0);
  assert.equal(S.settings.trivia, false);
});

test('classic: ante, gimel takes the pot, pot empty means everyone antes again', () => {
  let S = R.create({ mode: 'classic', startCoins: 10 }, players(3), 0);
  assert.equal(S.pot, 3);
  assert.deepEqual(S.players.map(p => p.coins), [9, 9, 9]);
  S = spinTo(S, 'gimel');
  assert.deepEqual(S.players.map(p => p.coins), [11, 8, 8]);   // took 3, then everyone antes 1
  assert.equal(S.pot, 3);
  assert.equal(S.result.ante.length, 3);
});

test('classic: hey takes half rounded up, shin puts one in', () => {
  let S = R.create({ mode: 'classic', startCoins: 10 }, players(3), 0);
  S = spinTo(S, 'hey');   // pot 3 → takes 2
  assert.equal(S.players[0].coins, 11);
  assert.equal(S.pot, 1);
  S = finishPhase(S);
  S = spinTo(S, 'shin');
  assert.equal(S.players[1].coins, 8);
  assert.equal(S.pot, 2);
});

test('classic: a player who cannot pay is out; last one standing wins', () => {
  let S = R.create({ mode: 'classic', startCoins: 1, rounds: 10 }, players(2), 0);
  // Both anted their only coin. p0 lands shin with 0 coins → out → p1 wins.
  S = spinTo(S, 'shin');
  assert.equal(S.players[0].out, true);
  S = finishPhase(S);
  assert.equal(S.phase, 'over');
  assert.deepEqual(S.winners, ['p1']);
});

test('ties at the end go to a spin-off; best letter wins', () => {
  let S = R.create({ rounds: 1, trivia: false }, players(3), 0);
  S = spinTo(S, 'gimel', { wager: 5 }); S = finishPhase(S);  // p0 25
  S = spinTo(S, 'gimel', { wager: 5 }); S = finishPhase(S);  // p1 25
  S = spinTo(S, 'nun'); S = finishPhase(S);                  // p2 20
  assert.ok(S.spinoff);
  assert.deepEqual(S.spinoff.ids, ['p0', 'p1']);
  assert.equal(R.current(S).id, 'p0');
  S = spinTo(S, 'hey'); S = finishPhase(S);
  S = spinTo(S, 'hey'); S = finishPhase(S);    // still tied → another spin-off
  assert.equal(S.phase, 'turn');
  assert.equal(S.spinoff.rounds, 2);
  S = spinTo(S, 'nun'); S = finishPhase(S);
  S = spinTo(S, 'gimel'); S = finishPhase(S);
  assert.equal(S.phase, 'over');
  assert.deepEqual(S.winners, ['p1']);
  assert.deepEqual(S.players.map(p => p.coins), [25, 25, 20]);   // spin-offs don't change coins
});

test('max 8 players', () => {
  const S = R.create({}, players(10), 0);
  assert.equal(S.players.length, 8);
});

test('state stays plain JSON', () => {
  let S = toTrivia();
  assert.deepEqual(JSON.parse(JSON.stringify(S)), S);
});
