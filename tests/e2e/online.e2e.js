// Online rooms over the local test network (?net=local): tabs in one browser share it.
const H = require('./helpers');

// NET=emulator runs these against the Firebase emulators; each player then needs their own
// browser context, because Firebase keeps one signed-in user per browser.
const EMU = process.env.NET === 'emulator';
async function player(ctx, url, slot, name, extra = '') {
  if (EMU) ctx = await ctx.browser().newContext({ viewport: { width: 390, height: 844 } });
  const p = await H.page(ctx, `${url}?${EMU ? 'emulator=127.0.0.1' : 'net=local'}&p=${slot}${extra}`, name);
  await H.profile(p, name);
  return p;
}
async function hostRoom(p) {
  await p.waitForSelector('#scr-home:not([hidden])');
  await p.click('#btn-create');
  await p.waitForSelector('#room-box:not([hidden])', { timeout: 15000 });
  await H.skipIntro(p);
  return (await p.textContent('#room-code')).trim();
}
async function joinRoom(ctx, url, slot, name, code) {
  const p = await player(ctx, url, slot, name, `&room=${code}`);
  await p.waitForSelector('#scr-setup:not([hidden]), #scr-game:not([hidden])', { timeout: 40000 });
  await H.skipIntro(p);
  return p;
}
const lobbyCount = p => p.$$eval('#player-list li', l => l.length);
async function sameCoins(ck, pages, label) {
  const all = [];
  for (const p of pages) all.push(JSON.stringify((await H.state(p)).players.map(x => x.coins)));
  ck.ok(all.every(x => x === all[0]), `${label}: every screen shows the same coins ${all.join(' / ')}`);
  for (const p of pages) await H.seatsMatch(p, ck, `${label} [${p.label}]`);
}
// Play whatever this page is asked to do; returns true if it acted.
async function act(p, how = 'random') {
  if (p.isClosed()) return false;
  if (await p.$('#ov-trivia:not([hidden]) button.q-opt:not([disabled])')) { await H.answer(p, how === 'random' ? (Math.random() < 0.5 ? 'right' : 'wrong') : how).catch(() => {}); return true; }
  if (await p.isVisible('#spin-btn')) { await H.spin(p, 3).catch(() => {}); return true; }
  return false;
}

module.exports = [
  {
    name: 'online: 3 people + computer player, trivia across screens, play again',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const host = await player(ctx, url, 'h', 'Hannah');
      const code = await hostRoom(host);
      ck.ok(/^[A-Z2-9]{4}$/.test(code), 'room code looks right: ' + code);
      ck.ok(await host.$eval('#room-qr', e => !!e.querySelector('svg')), 'QR code drawn');
      const a = await joinRoom(ctx, url, 'a', 'Avi', code);
      const b = await joinRoom(ctx, url, 'b', 'Batya', code);
      await host.click('#add-bot');
      await host.click('[data-set="rounds"] [data-v="3"]');
      await host.click('[data-set="triviaChance"] [data-v="100"]');
      await host.click('[data-set="triviaSeconds"] [data-v="10"]');
      await host.waitForTimeout(600);
      for (const g of [a, b]) {
        ck.eq(await lobbyCount(g), 4, `${g.label} sees 4 players`);
        ck.eq(await g.$eval('[data-set="rounds"] [aria-pressed="true"]', e => e.dataset.v), '3', `${g.label} sees rounds = 3`);
        ck.ok(await g.isHidden('#btn-start'), `${g.label} has no Start button`);
        ck.ok(await g.isVisible('#host-only'), `${g.label} is told the host chooses`);
        // Guests can't change settings
        await g.click('[data-set="rounds"] [data-v="7"]', { force: true }).catch(() => {});
      }
      await host.waitForTimeout(400);
      ck.eq(await host.$eval('[data-set="rounds"] [aria-pressed="true"]', e => e.dataset.v), '3', 'guest click did not change settings');
      await H.shot(a, 'online-lobby-guest');
      await host.click('#btn-start');
      for (const p of [host, a, b]) await p.waitForSelector('#scr-game:not([hidden])', { timeout: 10000 });
      for (const p of [host, a, b]) {
        const meBottom = await p.evaluate(() => {
          const me = document.querySelector('.seat.me');
          const all = [...document.querySelectorAll('.seat')];
          return me && all.every(s => parseFloat(s.style.top) <= parseFloat(me.style.top) + 1);
        });
        ck.ok(meBottom, `${p.label}: own seat is at the bottom`);
      }

      // Turn 1 — Hannah (host): gimel → quiz. Hannah right → keeps it.
      await H.force(host, ['gimel']);
      await H.spin(host, 10);
      for (const p of [host, a, b]) await H.waitState(p, S => S.phase === 'trivia');
      await H.answer(host, 'right'); await H.answer(a, 'right'); await H.answer(b, 'wrong');
      for (const p of [host, a, b]) await H.waitState(p, S => S.phase === 'reveal', null, 15000);
      ck.eq((await H.state(a)).trivia.outcome, 'kept', 'Hannah keeps her gimel (seen by Avi)');
      ck.ok(await a.isHidden('#q-continue'), 'only the host gets Continue');
      await H.shot(b, 'online-reveal-guest');
      await sameCoins(ck, [host, a, b], 'after kept');
      await H.cont(host);

      // Turn 2 — Avi: gimel, Avi wrong, Batya right → stolen (or split with the computer player).
      await H.waitState(a, S => S.phase === 'turn' && S.turn === 1);
      await H.force(host, ['gimel']);
      await H.spin(a, 8);
      for (const p of [host, a, b]) await H.waitState(p, S => S.phase === 'trivia');
      await H.answer(a, 'wrong'); await H.answer(b, 'right'); await H.answer(host, 'wrong');
      for (const p of [host, a, b]) await H.waitState(p, S => S.phase === 'reveal', null, 15000);
      const out = (await H.state(b)).trivia.outcome;
      ck.ok(out === 'stolen' || out === 'split', 'Batya steals (maybe with the bot): ' + out);
      await sameCoins(ck, [host, a, b], 'after steal');
      await H.cont(host);

      // Rest of the game: everyone plays their own turns.
      const t0 = Date.now();
      while (Date.now() - t0 < 180000) {
        const S = await H.state(host);
        if (S.phase === 'over') break;
        if (await host.isVisible('#q-continue')) await host.click('#q-continue').catch(() => {});
        let acted = false;
        for (const p of [host, a, b]) acted = (await act(p)) || acted;
        if (!acted) await host.waitForTimeout(250);
      }
      for (const p of [host, a, b]) await p.waitForSelector('#ov-over:not([hidden])', { timeout: 20000 });
      const winners = [];
      for (const p of [host, a, b]) winners.push(await p.textContent('.podium .who'));
      ck.ok(new Set(winners.map(w => (w.match(/(Hannah|Avi|Batya|\S+) wins|You win, (\S+)!/) || [])[0])).size >= 1, 'everyone sees a winner');
      await sameCoins(ck, [host, a, b], 'at the end');
      ck.ok(await a.isHidden('#over-again'), 'guests can’t restart');

      // Play again → everyone back in the lobby → start again.
      await host.click('#over-again');
      for (const p of [host, a, b]) await p.waitForSelector('#scr-setup:not([hidden])', { timeout: 10000 });
      ck.eq(await lobbyCount(a), 4, 'same players back in the lobby');
      await host.click('#btn-start');
      for (const p of [host, a, b]) await H.waitState(p, S => S.round === 1 && S.phase === 'turn', null, 10000);
      ck.ok(await a.isVisible('#scr-game'), 'second game started for guests');
      ck.errors(host, a, b);
      await ctx.close();
      return ck;
    },
  },

  {
    name: 'online: wrong code, full room',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const g = await player(ctx, url, 'x', 'Guest');
      await g.waitForSelector('#scr-home:not([hidden])');
      await g.fill('#join-code', 'zzzz');
      ck.eq(await g.inputValue('#join-code'), 'ZZZZ', 'code is upper-cased as you type');
      await g.click('#join-form button[type=submit]');
      await g.waitForSelector('#toast:not([hidden])');
      await g.waitForFunction(() => /ZZZZ/.test(document.getElementById('toast').textContent), null, { timeout: 8000 });
      ck.ok(/No room/.test(await g.textContent('#toast')), 'unknown code explained');
      const host = await player(ctx, url, 'h2', 'Host');
      const code = await hostRoom(host);
      for (let i = 0; i < 7; i++) await host.click('#add-bot');
      await host.waitForTimeout(300);
      ck.eq(await lobbyCount(host), 8, '8 players');
      ck.ok(await host.isHidden('#add-row'), 'no more adding at 8');
      await g.fill('#join-code', code);
      await g.click('#join-form button[type=submit]');
      await g.waitForFunction(() => /full/.test(document.getElementById('toast').textContent), null, { timeout: 8000 });
      ck.ok(true, 'full room explained');
      ck.ok(await g.isVisible('#scr-home'), 'stays on home');
      ck.errors(host, g);
      await ctx.close();
      return ck;
    },
  },

  {
    name: 'online: spectator, reload rejoin, turn timer, trivia timeout, host leaves mid-game',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const host = await player(ctx, url, 'h3', 'Hannah');
      const code = await hostRoom(host);
      let a = await joinRoom(ctx, url, 'a3', 'Avi', code);
      await host.click('#add-bot');
      await host.click('[data-set="rounds"] [data-v="5"]');
      await host.click('[data-set="triviaChance"] [data-v="100"]');
      await host.click('[data-set="triviaSeconds"] [data-v="10"]');
      await host.waitForTimeout(400);
      await host.click('#btn-start');
      await a.waitForSelector('#scr-game:not([hidden])');

      // Host's turn: gimel, nobody answers → after 10 s it turns into nun.
      await H.force(host, ['gimel']);
      await H.spin(host, 4);
      for (const p of [host, a]) await H.waitState(p, S => S.phase === 'trivia');
      ck.ok(await a.$eval('#ov-trivia', e => !e.hidden), 'Avi sees the question');
      await H.waitState(host, S => S.phase === 'reveal', null, 20000);
      const T = (await H.state(host)).trivia;
      const Sx = await H.state(host);
      const humans = Sx.players.filter(x => !x.bot).map(x => x.id);
      ck.ok(humans.every(id => !T.answers[id] || T.answers[id].c === null), 'people who ran out of time count as no answer');
      const botRight = Sx.players.some(x => x.bot && T.right && T.right.includes(x.id));
      ck.eq(T.outcome, botRight ? 'stolen' : 'nun', 'clock closed it: nun, unless the computer player got it right');
      await host.click('#q-continue', { timeout: 3000 }).catch(() => {});

      // Avi reloads during his turn and comes back to the same seat.
      await H.waitState(a, S => S.phase === 'turn' && S.turn === 1, null, 20000);
      const before = (await H.state(a)).players[1];
      await a.reload();
      try { await a.waitForSelector('#scr-game:not([hidden])', { timeout: 30000 }); }
      catch (e) {
        const st = await a.evaluate(() => ({ screens: [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id), toast: document.getElementById('toast').textContent, overlays: [...document.querySelectorAll('.overlay')].filter(o => !o.hidden).map(o => o.id), room: !!(window.MackTest && MackTest.room) }));
        throw new Error('after reload Avi sees ' + JSON.stringify(st));
      }
      await H.waitState(a, S => true);
      const after = (await H.state(a)).players[1];
      ck.eq([after.id, after.coins], [before.id, before.coins], 'Avi back in his seat with his coins');
      ck.ok((await H.state(a)).turn === 1 && await a.isVisible('#spin-btn'), 'still his turn after reload');

      // Avi doesn't play: after 30 s the host bets 1 for him (a miss).
      const t0 = Date.now();
      await H.waitState(host, S => S.spin && S.spin.player === S.players[1].id, null, 40000);
      const sp = (await H.state(host)).spin;
      ck.eq([sp.wager, sp.grade], [1, 'miss'], 'timed-out turn bets 1 as a miss');
      ck.ok(Date.now() - t0 > 15000, `timer waited (${((Date.now() - t0) / 1000).toFixed(0)} s after reload)`);

      // A latecomer watches.
      const spec = await joinRoom(ctx, url, 's3', 'Watcher', code);
      await spec.waitForSelector('#scr-game:not([hidden])', { timeout: 10000 });
      ck.ok(/Watching/.test(await spec.textContent('#g-banner')), 'latecomer sees "Watching"');
      ck.eq((await H.state(spec)).players.length, 3, 'watcher is not added as a player');
      ck.ok(await spec.isHidden('#spin-btn'), 'watcher has no Spin button');
      await H.waitState(spec, (S, n) => S.spins >= n, (await H.state(host)).spins, 10000);
      ck.ok(true, 'watcher is in sync with the host');

      // Host leaves mid-game: Avi takes over as referee and the game goes on.
      await H.waitState(a, S => S.phase === 'turn', null, 20000);
      await host.close();
      const t1 = Date.now();
      await a.waitForFunction(() => MackTest.room && MackTest.room.isHost, null, { timeout: 15000 });
      ck.note(`Avi became host after ${((Date.now() - t1) / 1000).toFixed(1)} s`);
      const spinsBefore = (await H.state(a)).spins;
      const t2 = Date.now();
      while (Date.now() - t2 < 60000) {
        if ((await H.state(a)).spins >= spinsBefore + 3) break;
        if (await a.isVisible('#q-continue')) await a.click('#q-continue').catch(() => {});
        await act(a);
        await a.waitForTimeout(300);
      }
      ck.ok((await H.state(a)).spins >= spinsBefore + 3, 'game keeps going after the host left');
      ck.ok((await H.state(spec)).spins >= spinsBefore + 3, 'watcher still follows the game');
      ck.errors(a, spec);
      await ctx.close();
      return ck;
    },
  },

  {
    name: 'online: host leaves the lobby, guest takes over and starts',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const host = await player(ctx, url, 'h4', 'Hannah');
      const code = await hostRoom(host);
      const a = await joinRoom(ctx, url, 'a4', 'Avi', code);
      await host.close();
      await a.waitForSelector('#btn-start:not([hidden])', { timeout: 20000 });
      ck.ok(true, 'Avi gets the Start button');
      await a.waitForFunction(() => document.querySelectorAll('#player-list li').length === 1, null, { timeout: 15000 }).catch(() => {});
      ck.eq(await lobbyCount(a), 1, 'host who left is removed from the list');
      ck.ok(await a.isHidden('#host-only'), 'Avi can change settings now');
      await a.click('#add-bot');
      await a.click('[data-set="mode"] [data-v="classic"]');
      await a.waitForTimeout(300);
      await a.click('#btn-start');
      await H.waitState(a, S => S.phase === 'turn', null, 10000);
      ck.eq((await H.state(a)).settings.mode, 'classic', 'online Classic game');
      ck.eq((await H.state(a)).pot, 2, 'both ante into the pot');
      await H.spin(a);
      await H.waitState(a, S => S.spins >= 2, null, 20000);
      ck.ok(true, 'computer player moved after the new host started');
      const S = await H.state(a);
      ck.eq(S.players.reduce((t, x) => t + x.coins, 0) + S.pot, 40, 'Classic keeps every coin');
      ck.errors(a);
      await ctx.close();
      return ck;
    },
  },
  {
    name: 'online: a player whose phone drops off for a moment comes back and spins for himself (Firebase only)',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      if (!EMU) { ck.note('skipped: needs NET=emulator (real Firebase connection handling)'); return ck; }
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const host = await player(ctx, url, 'h5', 'Son');
      const code = await hostRoom(host);
      const y = await joinRoom(ctx, url, 'y5', 'Yair', code);
      await host.click('[data-set="trivia"] [data-v="false"]');
      await host.waitForTimeout(400);
      await host.click('#btn-start');
      await y.waitForSelector('#scr-game:not([hidden])', { timeout: 20000 });
      const yid = await y.evaluate(() => MackTest.room.uid);
      const online = () => host.evaluate(id => { const p = MackTest.room.lobby.players[id]; return p && p.online; }, yid);
      // Host spins; meanwhile Yair's phone loses its connection for a few seconds.
      await H.spin(host, 2);
      await y.evaluate(() => Net.setOffline(true));
      await host.waitForFunction(id => MackTest.room.lobby.players[id] && MackTest.room.lobby.players[id].online === false, yid, { timeout: 20000 });
      ck.ok(true, 'host sees Yair drop off');
      ck.ok(await y.isVisible('#g-banner') && /Reconnecting/.test(await y.textContent('#g-banner')), 'Yair is told he is reconnecting');
      await y.waitForTimeout(3000);
      await y.evaluate(() => Net.setOffline(false));
      await host.waitForFunction(id => MackTest.room.lobby.players[id] && MackTest.room.lobby.players[id].online === true, yid, { timeout: 20000 }).catch(() => {});
      ck.eq(await online(), true, 'after reconnecting, Yair is marked online again');
      // Yair's turn: nobody plays it for him; he bets 4 himself.
      await H.waitState(y, (S, id) => S.phase === 'turn' && S.players[S.turn].id === id, yid, 30000);
      await y.waitForTimeout(14000);   // longer than the 12 s "player gone" grace period
      const S1 = await H.state(host);
      ck.ok(S1.phase === 'turn' && S1.players[S1.turn].id === yid, 'his turn was not played for him');
      await H.force(host, ['nun']);
      await H.spin(y, 4);
      await H.waitState(host, (S, id) => S.spin && S.spin.player === id, yid, 20000);
      const sp = (await H.state(host)).spin;
      ck.eq(sp.wager, 4, 'Yair placed his own bet');
      ck.errors(host, y);
      await ctx.close();
      return ck;
    },
  },

  {
    name: 'online: the host\u2019s phone freezes (asleep but still connected), the other player takes over',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const host = await player(ctx, url, 'h6', 'Son');
      const code = await hostRoom(host);
      const y = await joinRoom(ctx, url, 'y6', 'Yair', code);
      await host.click('[data-set="trivia"] [data-v="false"]');
      await host.waitForTimeout(400);
      await host.click('#btn-start');
      await y.waitForSelector('#scr-game:not([hidden])', { timeout: 20000 });
      await H.spin(host, 2);
      await H.waitState(y, S => S.phase === 'turn' && S.turn === 1, null, 20000);
      const yid = await y.evaluate(() => MackTest.room.uid);
      // The host's phone goes to sleep: its page stops running but nothing tells the server.
      const cdp = await host.context().newCDPSession(host);
      await cdp.send('Debugger.enable');
      await cdp.send('Debugger.pause');
      const t0 = Date.now();
      await y.waitForFunction(() => MackTest.room && MackTest.room.isHost, null, { timeout: 40000 });
      ck.note(`Yair took over ${((Date.now() - t0) / 1000).toFixed(1)} s after the host froze`);
      await H.force(y, ['hey']);
      await H.spin(y, 6);
      await H.waitState(y, (S, id) => S.spin && S.spin.player === id && S.phase !== 'spinning', yid, 20000);
      const coins = (await H.state(y)).players[1].coins;
      ck.eq(coins, 23, 'Yair played his turn with the new referee (hey on 6: +3)');
      // The host wakes up: it must not undo what happened while it slept.
      await cdp.send('Debugger.resume');
      await host.waitForTimeout(4000);
      const after = await H.state(y);
      ck.eq(after.players[1].coins, 23, 'waking host did not overwrite the newer game');
      ck.ok(!(await host.evaluate(() => MackTest.room.isHost)), 'waking host knows it is no longer the referee');
      await H.waitState(host, (S, n) => S.spins >= n, after.spins, 15000);
      ck.ok(true, 'waking host catches up with the game');
      ck.errors(host, y);
      await ctx.close();
      return ck;
    },
  },

];
