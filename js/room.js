/* ============================================
   MACK-A-BEE DREIDEL — Rooms
   Room.local(settings, players)   a game on this device (computer
                                   players and/or pass-and-play)
   Room.create(profile)            open an online room, become host
   Room.join(code, profile)        join an online room by code

   Every room gives the screens the same interface:
     onState(cb)  game state updates      send(pid, action)  play a move
     myIds        players this device controls
   Online rooms add the lobby: onLobby(cb), setSettings, addBot, start…

   Whoever is host runs the referee: it applies everyone's moves with
   Rules, keeps time, plays the computer players, and writes the state.
   If the host drops out, the next player in seat order takes over.
   ============================================ */
const Room = (function () {
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const genCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  const err = code => Object.assign(new Error(code), { code });

  // The referee applies moves and deadlines to the state.
  function Referee(initial, now, onChange) {
    let S = initial;
    const set = n => { if (n && n !== S) { S = n; onChange(S); } };
    return {
      get state() { return S; },
      reset(n) { S = n; onChange(S); },
      adopt(n) { S = n; },
      act(pid, a) { set(Rules.act(S, pid, a, now(), Math.random, Trivia.ctx)); },
      tick() { set(Rules.tick(S, now(), Math.random, Trivia.ctx)); },
    };
  }

  // Plays the computer players' turns and trivia answers.
  function BotDriver(ref) {
    const scheduled = new Set();
    let alive = true;
    function look(S) {
      if (!alive || !S) return;
      if (S.phase === 'turn') {
        const p = Rules.current(S);
        const key = 'spin' + S.seq;
        if (p && p.bot && !scheduled.has(key)) {
          scheduled.add(key);
          setTimeout(() => {
            const cur = ref.state;
            if (!alive || cur.seq !== S.seq || cur.phase !== 'turn') return;
            const classic = cur.settings.mode === 'classic' || !!cur.spinoff;
            const me = Rules.current(cur);
            const wager = classic ? 0 : Bots.chooseWager(me, cur);
            ref.act(me.id, { type: 'spin', wager, grade: classic ? 'classic' : Bots.chooseGrade(me, wager) });
          }, 1200 + Math.random() * 1400);
        }
      }
      if (S.phase === 'trivia' && S.trivia) {
        const q = Trivia.byId(S.trivia.qid);
        for (const p of S.players) {
          const key = 'ans' + S.seq + p.id;
          if (!p.bot || S.trivia.answers[p.id] || scheduled.has(key)) continue;
          scheduled.add(key);
          const a = Bots.answer(p, q, S.trivia.order, S.settings.triviaSeconds);
          setTimeout(() => {
            const cur = ref.state;
            if (!alive || cur.phase !== 'trivia' || cur.seq !== S.seq) return;
            ref.act(p.id, { type: 'answer', choice: a.choice, ms: a.ms });
          }, a.ms);
        }
      }
    }
    return { look, stop() { alive = false; } };
  }

  // ---------- A game on this device ----------
  function local(settings, players) {
    const listeners = new Set();
    let ref, bots, timer;
    function begin() {
      if (bots) bots.stop();
      ref = Referee(Rules.create(settings, players, Date.now()), Date.now, S => { listeners.forEach(cb => cb(S)); bots.look(S); });
      bots = BotDriver(ref);
      setTimeout(() => { listeners.forEach(cb => cb(ref.state)); bots.look(ref.state); }, 0);
    }
    begin();
    timer = setInterval(() => ref.tick(), 100);
    return {
      kind: 'local',
      isHost: true,
      myIds: players.filter(p => !p.bot).map(p => p.id),
      get state() { return ref.state; },
      now: Date.now,
      send(pid, a) { ref.act(pid, a); },
      onState(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      playAgain() { begin(); },
      leave() { clearInterval(timer); bots.stop(); listeners.clear(); },
    };
  }

  // ---------- Online rooms ----------
  function meEntry(profile, seat) {
    return { name: profile.name || 'Player', avatar: profile.avatar, skin: profile.skin, seat, lang: profile.lang, online: true, joined: Net.now() };
  }

  async function create(profile) {
    const uid = await Net.connect();
    for (let i = 0; i < 10; i++) {
      const code = genCode();
      const r = await Net.transaction(`rooms/${code}/meta`, cur => {
        if (cur && Net.now() - (cur.updated || cur.created || 0) < 12 * 3600e3) return undefined;   // in use
        return { host: uid, created: Net.now(), updated: Net.now(), status: 'lobby' };
      });
      if (!r.committed) continue;
      const settings = Object.assign({}, profile.settings || CONFIG.defaults, { turnSeconds: CONFIG.onlineTurnSeconds });
      await Net.set(`rooms/${code}`, {
        meta: r.value,
        settings,
        players: { [uid]: meEntry(profile, 0) },
      });
      return open(code, uid, false, profile);
    }
    throw err('nocode');
  }

  async function join(code, profile) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    const uid = await Net.connect();
    const meta = await Net.get(`rooms/${code}/meta`);
    if (!meta) throw err('notFound');
    const players = (await Net.get(`rooms/${code}/players`)) || {};
    if (players[uid]) {
      await Net.update(`rooms/${code}/players/${uid}`, { online: true });
      return open(code, uid, false, profile);
    }
    if (meta.status !== 'lobby') return open(code, uid, true, profile);   // game running: watch
    const r = await Net.transaction(`rooms/${code}/players`, cur => {
      cur = cur || {};
      if (cur[uid]) return cur;
      const list = Object.values(cur);
      if (list.length >= CONFIG.players.max) return undefined;
      const taken = new Set(list.map(p => p.seat));
      let seat = 0; while (taken.has(seat)) seat++;
      cur[uid] = meEntry(profile, seat);
      return cur;
    });
    if (!r.committed) throw err('full');
    return open(code, uid, false, profile);
  }

  function open(code, uid, spectator, profile) {
    const base = `rooms/${code}`;
    const lobbyCbs = new Set(), stateCbs = new Set();
    const subs = [];
    let meta = null, settings = null, players = {}, S = null;
    let ref = null, bots = null, tickTimer = 0, inputsSub = null, seen = {}, firstInputs = true;
    let inputN = 0, left = false, beat = null;
    const offlineSince = {};

    const lobby = () => ({ code, meta, settings, players, uid, isHost: !!meta && meta.host === uid, spectator: !players[uid] });
    const emitLobby = () => lobbyCbs.forEach(cb => cb(lobby()));

    // Presence. Whenever this device (re)connects, mark the player online again and re-arm the
    // "mark me offline if I drop" rule (the server forgets it each time it fires). Without this, a
    // phone that briefly lost its connection stayed "offline" and had its turns played for it.
    let connected = true, connCbs = new Set();
    function ensurePresence() {
      if (spectator || left) return;
      Net.onDisconnect(`${base}/players/${uid}/online`, false);
      Net.transaction(`${base}/players`, cur => {
        cur = cur || {};
        if (cur[uid]) { cur[uid].online = true; return cur; }
        // Dropped from the lobby while away: take a free seat again if the game hasn't started.
        if (!meta || meta.status !== 'lobby' || Object.keys(cur).length >= CONFIG.players.max || !profile) return undefined;
        const taken = new Set(Object.values(cur).map(p => p.seat));
        let seat = 0; while (taken.has(seat)) seat++;
        cur[uid] = meEntry(profile, seat);
        return cur;
      }).catch(() => {});
    }
    let everConnected = false;
    subs.push(Net.onConnection(c => {
      const back = c && (!connected || !everConnected);
      connected = c;
      if (back) { everConnected = true; ensurePresence(); }
      connCbs.forEach(cb => cb(c));
    }));
    const onVisible = () => { if (!document.hidden && connected) ensurePresence(); };
    document.addEventListener('visibilitychange', onVisible);

    subs.push(Net.on(`${base}/meta`, v => { meta = v; emitLobby(); checkHost(); }));
    subs.push(Net.on(`${base}/settings`, v => { settings = v; emitLobby(); }));
    subs.push(Net.on(`${base}/beat`, v => { beat = v; }));
    subs.push(Net.on(`${base}/players`, v => { players = v || {}; emitLobby(); checkHost(); }));
    subs.push(Net.on(`${base}/state`, v => {
      if (!v || !v.json) { S = null; if (ref) ref.adopt(null); stateCbs.forEach(cb => cb(null)); return; }
      if (ref) return;   // the host is the source of truth; ignore the echo of its own writes
      S = JSON.parse(v.json);
      stateCbs.forEach(cb => cb(S));
    }));
    const hostCheck = setInterval(checkHost, 2000);

    function writeState(n) {
      S = n;
      // Never overwrite a newer copy of this game (e.g. a phone waking up after someone else
      // took over as referee).
      const rec = { json: JSON.stringify(n), seq: n.seq, gid: n.gid, by: uid };
      Net.transaction(`${base}/state`, cur => (cur && cur.gid === n.gid && cur.seq > n.seq && cur.by !== uid ? undefined : rec))
        .then(r => { if (!r.committed) stopHost(); })
        .catch(() => {});
      Net.update(`${base}/meta`, { updated: Net.now() });
      stateCbs.forEach(cb => cb(S));
      if (bots) bots.look(n);
    }

    // Become the referee: process everyone's moves, keep time, play bots.
    function becomeHost() {
      if (ref || left) return;
      ref = Referee(S, Net.now, writeState);
      bots = BotDriver(ref);
      firstInputs = true;
      inputsSub = Net.on(`${base}/inputs`, v => {
        v = v || {};
        for (const pid in v) {
          const e = v[pid];
          if (!e) continue;
          if (firstInputs) { seen[pid] = e.n; continue; }   // ignore moves sent before we took over
          if (seen[pid] === e.n) continue;
          seen[pid] = e.n;
          if (ref.state) ref.act(pid, e.a);
        }
        firstInputs = false;
      });
      let lastBeat = 0;
      tickTimer = setInterval(() => {
        if (meta && meta.host !== uid) { stopHost(); return; }   // someone else is referee now
        // Heartbeat: lets the others notice if this phone freezes (e.g. it went to sleep).
        if (Date.now() - lastBeat > 2000) { lastBeat = Date.now(); Net.set(`${base}/beat`, { by: uid, t: Net.now() }); }
        if (ref && ref.state && ref.state.phase !== 'over') ref.tick();
      }, 150);
      if (ref.state) bots.look(ref.state);
    }
    function stopHost() {
      if (!ref) return;
      clearInterval(tickTimer); inputsSub && inputsSub(); bots.stop();
      ref = null; bots = null; inputsSub = null;
    }

    // Host housekeeping for people who closed their tab or lost connection:
    // in the lobby they're removed after 8 s; in a game their turn is played after 12 s
    // (long enough for a page refresh or a phone waking up).
    const goneSince = {};
    function housekeeping() {
      const now = Date.now();
      for (const [pid, p] of Object.entries(players)) {
        if (p.bot || p.online !== false) { delete goneSince[pid]; continue; }
        goneSince[pid] = goneSince[pid] || now;
      }
      if (meta.status === 'lobby') {
        for (const pid in goneSince) if (now - goneSince[pid] > 8000 && pid !== uid) Net.remove(`${base}/players/${pid}`);
      } else if (ref && ref.state && ref.state.phase === 'turn') {
        const cur = Rules.current(ref.state);
        if (cur && !cur.bot && goneSince[cur.id] && now - goneSince[cur.id] > 12000) ref.act(cur.id, { type: 'spin', wager: 1, grade: 'miss' });
      }
    }

    function checkHost() {
      if (left || !meta) return;
      if (meta.host === uid) { if (S || meta.status === 'lobby') becomeHost(); housekeeping(); return; }
      stopHost();
      const host = players[meta.host];
      // Gone = marked offline, or its heartbeat stopped (a frozen phone can stay "online").
      const frozen = beat && beat.by === meta.host && Net.now() - beat.t > 8000;
      const hostGone = !host || host.online === false || frozen;
      if (!hostGone) { delete offlineSince[meta.host]; return; }
      offlineSince[meta.host] = offlineSince[meta.host] || Date.now();
      if (Date.now() - offlineSince[meta.host] < 5000) return;
      // The online person in the lowest seat takes over.
      const next = Object.entries(players).filter(([id, p]) => !p.bot && p.online !== false && id !== meta.host).sort((a, b) => a[1].seat - b[1].seat)[0];
      if (!next || next[0] !== uid) return;
      const oldHost = meta.host;
      Net.transaction(`${base}/meta`, cur => (cur && cur.host === oldHost ? Object.assign(cur, { host: uid }) : undefined));
    }

    const api = {
      kind: 'online',
      code,
      get uid() { return uid; },
      get isHost() { return !!meta && meta.host === uid; },
      get myIds() { return players[uid] ? [uid] : []; },
      get state() { return S; },
      get lobby() { return lobby(); },
      now: Net.now,
      onLobby(cb) { lobbyCbs.add(cb); if (meta) cb(lobby()); return () => lobbyCbs.delete(cb); },
      onState(cb) { stateCbs.add(cb); if (S) cb(S); return () => stateCbs.delete(cb); },
      onConnection(cb) { connCbs.add(cb); cb(connected); return () => connCbs.delete(cb); },
      get connected() { return connected; },
      send(pid, a) {
        if (ref) { ref.act(pid, a); return; }
        Net.set(`${base}/inputs/${uid}`, { n: Date.now() * 10 + (inputN++ % 10), a });
      },
      updateMe(patch) { if (players[uid]) Net.update(`${base}/players/${uid}`, patch); },
      setSettings(patch) { if (api.isHost) Net.update(`${base}/settings`, patch); },
      addBot(lang) {
        if (!api.isHost) return;
        const list = Object.values(players);
        if (list.length >= CONFIG.players.max) return;
        const taken = new Set(list.map(p => p.seat));
        let seat = 0; while (taken.has(seat)) seat++;
        const nBots = list.filter(p => p.bot).length;
        const free = CONFIG.skins.filter(s => !s.unlock);
        Net.set(`${base}/players/bot_${Date.now().toString(36)}`, {
          name: Bots.name(nBots, lang), avatar: '🐝', skin: free[(nBots + 1) % free.length].id, seat, bot: true, online: true, joined: Net.now(),
        });
      },
      removePlayer(pid) { if (api.isHost && pid !== uid) Net.remove(`${base}/players/${pid}`); },
      start() {
        if (!api.isHost) return;
        const list = Object.entries(players).filter(([, p]) => p.bot || p.online !== false).sort((a, b) => a[1].seat - b[1].seat)
          .map(([id, p]) => ({ id, name: p.name, avatar: p.avatar, skin: p.skin, bot: !!p.bot }));
        if (list.length < CONFIG.players.min) return;
        const first = Rules.create(settings, list, Net.now());
        Net.remove(`${base}/inputs`);
        seen = {};
        if (!ref) becomeHost();
        ref.reset(first);
        Net.update(`${base}/meta`, { status: 'playing', updated: Net.now() });
      },
      backToLobby() {
        if (!api.isHost) return;
        Net.remove(`${base}/state`);
        Net.update(`${base}/meta`, { status: 'lobby', updated: Net.now() });
      },
      leave() {
        left = true;
        document.removeEventListener('visibilitychange', onVisible);
        stopHost();
        clearInterval(hostCheck);
        subs.forEach(u => u());
        if (players[uid]) {
          if (meta && meta.status === 'lobby') Net.remove(`${base}/players/${uid}`);
          else Net.update(`${base}/players/${uid}`, { online: false });
        }
      },
    };
    return api;
  }

  return { local, create, join };
})();
