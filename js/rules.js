/* ============================================
   MACK-A-BEE DREIDEL — Game rules (the referee)
   Pure functions over a plain JSON game state: no DOM, no network.
   The same code runs the game on one device and, in online rooms, on
   the host's device (the referee). Everything that needs chance takes
   an `rng` (Math.random by default) and everything that needs time
   takes `now` (ms), so the tests can control both.

   State shape (all JSON):
     settings  mode, inIsrael, startCoins, rounds, trivia, triviaLevel,
               triviaChance, triviaSeconds, turnSeconds
     players   [{ id, name, avatar, skin, bot, local, coins, out, stats }]  (seat order)
     pot       Classic pot
     round, turn (player index), phase, deadline, seq
     spin      { id, player, wager, grade, letter, upside, at, ms }
     trivia    { qid, order, at, deadline, answers: { pid: { c, ms } }, correct?, outcome? }
     result    { player, letter, wager, kind, deltas: { pid: n }, ante: [pids], outNow: [pids] }
     spinoff   { ids, spins: { pid: letter }, idx }
     winners   [pids] once the game is over
   Phases: turn → spinning → (trivia → reveal) → result → turn … → over
   ============================================ */
const Rules = (function () {
  const C = (typeof CONFIG !== 'undefined') ? CONFIG : require('./config.js');

  const GRADES = ['miss', 'good', 'perfect'];
  const RANK = { gimel: 3, hey: 2, nun: 1, shin: 0 };   // spin-off order

  const clone = o => JSON.parse(JSON.stringify(o));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- Meter ----------
  // Width/speed of the green zone for a wager (plain number of coins).
  function meterParams(wager) {
    const M = C.meter;
    const w = Math.max(1, wager | 0);
    let width, speed;
    if (w <= M.fullAt) {
      const d = Math.log2(1 + w) / Math.log2(1 + M.fullAt);
      width = lerp(M.width.easy, M.width.hard, d);
      speed = lerp(M.speed.easy, M.speed.hard, d);
    } else {
      const t = clamp((w - M.fullAt) / (M.beyondAt - M.fullAt), 0, 1);
      width = lerp(M.width.hard, M.width.floor, t);
      speed = lerp(M.speed.hard, M.speed.ceil, t);
    }
    return { width, speed, gold: width * M.goldRatio };
  }

  // Marker position (0..1) after `seconds` at `speed` sweeps/sec: a triangle wave.
  function markerPos(seconds, speed) {
    const x = (seconds * speed) % 2;
    return x <= 1 ? x : 2 - x;
  }

  // Grade a tap at `pos` for a zone centred at `center`.
  function gradeTap(pos, center, params) {
    const off = Math.abs(pos - center);
    if (off <= params.gold / 2) return 'perfect';
    if (off <= params.width / 2) return 'good';
    return 'miss';
  }

  // ---------- Letters & payouts ----------
  function drawLetter(table, rng = Math.random) {
    const odds = C.odds[table];
    let r = rng() * 100;
    for (const L of C.letters) {
      r -= odds[L];
      if (r < 0) return L;
    }
    return C.letters[C.letters.length - 1];
  }

  // Coins won or lost by the spinner in Wager mode (before trivia).
  function wagerDelta(letter, wager) {
    switch (letter) {
      case 'gimel': return wager;
      case 'hey': return Math.ceil(wager / 2);
      case 'shin': return -wager;
      default: return 0;
    }
  }

  // Who gets the Gimel's winnings after a trivia question.
  // answers: { pid: { c: chosenDisplayIndex|null, ms } }, correct: display index.
  function settleTrivia(spinnerId, wager, answers, correct) {
    const right = Object.keys(answers)
      .filter(pid => answers[pid] && answers[pid].c === correct)
      .sort((a, b) => answers[a].ms - answers[b].ms);
    const deltas = {};
    if (right.includes(spinnerId)) {
      deltas[spinnerId] = wager;
      return { outcome: 'kept', deltas, right };
    }
    const thieves = right.filter(pid => pid !== spinnerId);
    if (!thieves.length) return { outcome: 'nun', deltas, right };
    const share = Math.floor(wager / thieves.length);
    const extra = wager - share * thieves.length;
    thieves.forEach((pid, i) => { deltas[pid] = share + (i === 0 ? extra : 0); });
    for (const pid of thieves) if (!deltas[pid]) delete deltas[pid];
    return { outcome: thieves.length === 1 ? 'stolen' : 'split', deltas, right };
  }

  // ---------- Game ----------
  function normalizeSettings(s) {
    const D = C.defaults;
    const out = Object.assign({}, D, s || {});
    out.mode = out.mode === 'classic' ? 'classic' : 'wager';
    out.startCoins = clamp(out.startCoins | 0 || D.startCoins, 1, 9999);
    out.rounds = clamp(out.rounds | 0 || D.rounds, 1, 50);
    out.triviaChance = clamp(+out.triviaChance, 0, 100);
    out.triviaSeconds = clamp(out.triviaSeconds | 0 || D.triviaSeconds, 5, 60);
    out.turnSeconds = clamp(out.turnSeconds | 0, 0, 120);
    out.trivia = !!out.trivia && out.mode === 'wager';
    out.inIsrael = !!out.inIsrael;
    return out;
  }

  function create(settings, players, now = Date.now()) {
    const s = normalizeSettings(settings);
    const S = {
      v: 1,
      settings: s,
      players: players.slice(0, C.players.max).map(p => ({
        id: p.id, name: p.name, avatar: p.avatar, skin: p.skin || 'wood',
        bot: !!p.bot, local: !!p.local,
        coins: s.startCoins, out: false,
        stats: { perfect: 0, correct: 0, steals: 0, best: 0 },
      })),
      pot: 0, round: 1, turn: 0, phase: 'turn', deadline: null, seq: 0,
      spin: null, trivia: null, result: null, spinoff: null, winners: [],
      usedQ: [], spins: 0,
    };
    if (s.mode === 'classic') ante(S);
    startTurn(S, now);
    return S;
  }

  function current(S) { return S.players[S.turn]; }
  function byId(S, pid) { return S.players.find(p => p.id === pid); }

  function canSpin(S, i) {
    const p = S.players[i];
    if (S.spinoff) return S.spinoff.ids.includes(p.id);
    return S.settings.mode === 'classic' ? !p.out : p.coins > 0;
  }

  // Classic: everyone still in puts 1 in; anyone who can't pay is out.
  function ante(S) {
    const paid = [], outNow = [];
    for (const p of S.players) {
      if (p.out) continue;
      if (p.coins > 0) { p.coins -= 1; S.pot += 1; paid.push(p.id); }
      else { p.out = true; outNow.push(p.id); }
    }
    return { paid, outNow };
  }

  function startTurn(S, now) {
    S.phase = 'turn';
    S.seq++;
    const secs = S.settings.turnSeconds;
    S.deadline = secs ? now + secs * 1000 : null;
  }

  function phase(S, name, now, ms) {
    S.phase = name;
    S.seq++;
    S.deadline = ms != null ? now + ms : null;
  }

  // A player acts. Returns a new state (or the same object if the action is invalid).
  function act(S0, pid, action, now = Date.now(), rng = Math.random, ctx = {}) {
    if (!action || !S0) return S0;
    if (action.type === 'spin') return doSpin(S0, pid, action, now, rng);
    if (action.type === 'answer') return doAnswer(S0, pid, action, now, rng, ctx);
    if (action.type === 'continue' && (S0.phase === 'reveal' || S0.phase === 'result')) {
      const S = clone(S0);
      S.deadline = now;   // let the next tick move on
      return tick(S, now, rng, ctx);
    }
    return S0;
  }

  function doSpin(S0, pid, a, now, rng) {
    if (S0.phase !== 'turn') return S0;
    const p = current(S0);
    if (!p || p.id !== pid || !canSpin(S0, S0.turn)) return S0;
    const S = clone(S0);
    const me = current(S);
    const classicOdds = S.settings.mode === 'classic' || !!S.spinoff;
    let wager = 0, grade = 'classic';
    if (!classicOdds) {
      wager = clamp(Math.floor(+a.wager || 1), 1, me.coins);
      grade = GRADES.includes(a.grade) ? a.grade : 'miss';
      if (grade === 'perfect') me.stats.perfect++;
    }
    const letter = drawLetter(classicOdds ? 'classic' : grade, rng);
    const anim = C.spin[grade];
    S.spins++;
    S.spin = { id: S.spins, player: pid, wager, grade, letter, upside: !!a.upside, skin: me.skin, at: now, ms: anim.ms + C.spin.fallMs, seed: Math.floor(rng() * 1e9) };
    S.result = null;
    S.trivia = null;
    phase(S, 'spinning', now, S.spin.ms + C.timing.afterSpin);
    return S;
  }

  function doAnswer(S0, pid, a, now, rng, ctx) {
    if (S0.phase !== 'trivia' || !S0.trivia) return S0;
    if (!byId(S0, pid) || S0.trivia.answers[pid]) return S0;
    const S = clone(S0);
    const c = (a.choice === null || a.choice === undefined) ? null : clamp(a.choice | 0, 0, 3);
    S.trivia.answers[pid] = { c, ms: Math.max(0, a.ms != null ? +a.ms : now - S.trivia.at) };
    if (Object.keys(S.trivia.answers).length >= S.players.length) return closeTrivia(S, now, ctx);
    return S;
  }

  // Time passes. Moves the game on when a phase's deadline is reached.
  function tick(S0, now = Date.now(), rng = Math.random, ctx = {}) {
    if (!S0 || S0.phase === 'over' || S0.deadline == null || now < S0.deadline) return S0;
    const S = clone(S0);
    switch (S.phase) {
      case 'turn': {
        // Out of time: smallest bet, counts as a miss.
        return doSpin(S, current(S).id, { wager: 1, grade: 'miss' }, now, rng);
      }
      case 'spinning': return resolveSpin(S, now, rng, ctx);
      case 'trivia': return closeTrivia(S, now, ctx);
      case 'reveal':
      case 'result': return advance(S, now);
    }
    return S;
  }

  function resolveSpin(S, now, rng, ctx) {
    const sp = S.spin;
    const p = byId(S, sp.player);
    const res = { player: p.id, letter: sp.letter, wager: sp.wager, kind: sp.letter, deltas: {}, ante: [], outNow: [] };

    if (S.spinoff) {
      S.spinoff.spins[p.id] = sp.letter;
      S.result = res;
      phase(S, 'result', now, C.timing.result);
      return S;
    }

    if (S.settings.mode === 'classic') {
      let d = 0;
      if (sp.letter === 'gimel') d = S.pot;
      else if (sp.letter === 'hey') d = Math.ceil(S.pot / 2);
      else if (sp.letter === 'shin') {
        if (p.coins > 0) d = -1; else { p.out = true; res.outNow.push(p.id); }
      }
      p.coins += d; S.pot -= d;
      if (d) res.deltas[p.id] = d;
      if (d > p.stats.best) p.stats.best = d;
      let ms = C.timing.result;
      if (S.pot <= 0 && S.players.filter(x => !x.out).length > 1) {
        const a = ante(S);
        res.ante = a.paid; res.outNow.push(...a.outNow);
        ms += C.timing.ante;
      }
      S.result = res;
      phase(S, 'result', now, ms);
      return S;
    }

    // Wager mode
    const s = S.settings;
    if (sp.letter === 'gimel' && s.trivia && rng() * 100 < s.triviaChance && ctx.pickQuestion) {
      const qid = ctx.pickQuestion(S, rng);
      if (qid) {
        S.usedQ.push(qid);
        const order = shuffle([0, 1, 2, 3], rng);
        const humansHere = S.players.filter(x => x.local && !x.bot).length;
        // On one shared device, people answer one after another, so give each their own time.
        const secs = s.triviaSeconds * Math.max(1, humansHere);
        S.trivia = { qid, order, at: now, deadline: now + secs * 1000 + 600, answers: {} };
        phase(S, 'trivia', now, secs * 1000 + 600);
        return S;
      }
    }
    const d = wagerDelta(sp.letter, sp.wager);
    p.coins += d;
    if (d) res.deltas[p.id] = d;
    if (d > p.stats.best) p.stats.best = d;
    S.result = res;
    phase(S, 'result', now, C.timing.result);
    return S;
  }

  function closeTrivia(S, now, ctx) {
    const T = S.trivia;
    const sp = S.spin;
    const answerIdx = ctx.answerOf ? ctx.answerOf(T.qid) : 0;
    const correct = T.order.indexOf(answerIdx);
    const st = settleTrivia(sp.player, sp.wager, T.answers, correct);
    for (const pid of st.right) { const q = byId(S, pid); if (q) q.stats.correct++; }
    for (const pid in st.deltas) {
      const q = byId(S, pid);
      q.coins += st.deltas[pid];
      if (pid !== sp.player) q.stats.steals++;
      if (st.deltas[pid] > q.stats.best) q.stats.best = st.deltas[pid];
    }
    T.correct = correct;
    T.outcome = st.outcome;
    T.right = st.right;
    S.result = {
      player: sp.player, letter: st.outcome === 'nun' ? 'nun' : 'gimel', wager: sp.wager,
      kind: st.outcome === 'kept' ? 'gimel' : st.outcome === 'nun' ? 'nun-trivia' : st.outcome,
      deltas: st.deltas, ante: [], outNow: [],
    };
    phase(S, 'reveal', now, C.timing.reveal);
    return S;
  }

  // Move to the next player who can spin; handles rounds, antes, the end and spin-offs.
  // Every round runs in seat order from the first seat, like frames in bowling.
  function advance(S, now) {
    if (S.spinoff) return advanceSpinoff(S, now);
    const n = S.players.length;
    const classic = S.settings.mode === 'classic';
    const active = () => S.players.filter(p => !p.out).length;
    if (classic && active() <= 1) return finish(S, now);

    for (let j = S.turn + 1; j < n; j++) {
      if (canSpin(S, j)) { S.turn = j; startTurn(S, now); return S; }
    }
    // Round over.
    if (S.round >= S.settings.rounds) return finish(S, now);
    S.round++;
    S.lastAnte = null;
    if (classic) {
      const a = ante(S);
      S.lastAnte = { round: S.round, paid: a.paid, outNow: a.outNow };
      if (active() <= 1) return finish(S, now);
    }
    for (let j = 0; j < n; j++) {
      if (canSpin(S, j)) { S.turn = j; startTurn(S, now); return S; }
    }
    return finish(S, now);   // nobody can spin any more
  }

  function finish(S, now) {
    // In Classic, players who are out can't win (or tie the last one standing).
    let pool = S.players;
    if (S.settings.mode === 'classic' && pool.some(p => !p.out)) pool = pool.filter(p => !p.out);
    const top = Math.max(...pool.map(p => p.coins));
    const leaders = pool.filter(p => p.coins === top).map(p => p.id);
    if (leaders.length > 1) return startSpinoff(S, leaders, now);
    S.winners = leaders;
    S.spinoff = null;
    phase(S, 'over', now, null);
    return S;
  }

  function startSpinoff(S, ids, now) {
    S.spinoff = { ids, spins: {}, idx: 0, rounds: (S.spinoff ? S.spinoff.rounds + 1 : 1) };
    S.turn = S.players.findIndex(p => p.id === ids[0]);
    S.result = null;
    startTurn(S, now);
    return S;
  }

  function advanceSpinoff(S, now) {
    const so = S.spinoff;
    so.idx++;
    if (so.idx < so.ids.length) {
      S.turn = S.players.findIndex(p => p.id === so.ids[so.idx]);
      startTurn(S, now);
      return S;
    }
    const best = Math.max(...so.ids.map(id => RANK[so.spins[id]]));
    const top = so.ids.filter(id => RANK[so.spins[id]] === best);
    if (top.length === 1) {
      S.winners = top;
      phase(S, 'over', now, null);
      return S;
    }
    return startSpinoff(S, top, now);
  }

  function shuffle(a, rng) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Standings, best first.
  function standings(S) {
    return S.players.slice().sort((a, b) => b.coins - a.coins);
  }

  return {
    GRADES, RANK, meterParams, markerPos, gradeTap, drawLetter, wagerDelta, settleTrivia,
    normalizeSettings, create, act, tick, canSpin, current, byId, standings, shuffle,
  };
})();

if (typeof module !== 'undefined') module.exports = Rules;
