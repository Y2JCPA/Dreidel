// Single-device play: against computer players, pass-and-play, Classic, spin-offs.
const H = require('./helpers');

module.exports = [
  {
    name: 'local: full Wager game vs 3 computer players, then play again',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await H.page(ctx, url + '?p=solo', 'solo');
      await H.profile(p, 'Rivka');
      await H.setupLocal(p, { bots: 3, settings: { rounds: 3, triviaChance: 100 } });
      await H.startLocal(p);
      let spins = 0, quizzes = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 150000) {
        const S = await H.state(p);
        if (S.phase === 'over') break;
        if (await p.isVisible('#q-continue')) { await p.click('#q-continue').catch(() => {}); continue; }
        if (await p.$('#ov-trivia:not([hidden]) button.q-opt:not([disabled])')) { await H.answer(p, 'right'); quizzes++; continue; }
        if (await p.isVisible('#spin-btn')) { await H.spin(p, 7); spins++; await p.waitForTimeout(400); await H.seatsMatch(p, ck, `after spin ${spins}`); continue; }
        await p.waitForTimeout(250);
      }
      await H.waitState(p, S => S.phase === 'over', null, 20000);
      await p.waitForSelector('#ov-over:not([hidden])');
      ck.eq(spins, 3, 'human spins in 3 rounds');
      const S = await H.state(p);
      const shown = await p.textContent('.podium .who');
      const winner = S.players.find(x => x.id === S.winners[0]);
      ck.ok(shown.includes(winner.name), `winner shown (${shown}) is ${winner.name}`);
      await H.seatsMatch(p, ck, 'at end');
      const honey = await p.evaluate(() => Profile.data.honey);
      ck.ok(honey >= 2, 'honey jars earned: ' + honey);
      ck.eq(await p.evaluate(() => Profile.data.stats.games), 1, 'games played recorded');
      await H.shot(p, 'local-over');
      await p.click('#over-again');
      await H.waitState(p, S => S.round === 1 && S.phase === 'turn', null, 10000);
      const S2 = await H.state(p);
      ck.ok(S2.gid !== S.gid, 'play again starts a new game');
      ck.ok(S2.players.every(x => x.coins === 20), 'coins reset to 20');
      ck.ok(await p.isHidden('#ov-over'), 'game over closed');
      ck.note(`quizzes answered: ${quizzes}`);
      ck.errors(p);
      await ctx.close();
      return ck;
    },
  },

  {
    name: 'local: pass-and-play trivia — kept, stolen, split and nun',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await H.page(ctx, url + '?p=pnp', 'pnp');
      await H.profile(p, 'Rivka');
      await H.setupLocal(p, { humans: ['Moshe', 'Dina'], settings: { rounds: 3, triviaChance: 100, triviaSeconds: 10 } });
      await H.startLocal(p);
      const coins = async () => (await H.state(p)).players.map(x => x.coins);
      const finishReveal = async () => { await p.waitForSelector('#q-continue'); await H.shot(p, 'pnp-reveal'); await p.click('#q-continue'); };

      // Rivka: gimel, she answers right → keeps it.
      await H.force(p, ['gimel']);
      ck.ok(await p.isVisible('#ov-pass'), 'first turn asks to pass the device to Rivka');
      await H.spin(p, 10);
      await H.waitState(p, S => S.phase === 'trivia');
      await H.answer(p, 'right'); await H.answer(p, 'wrong'); await H.answer(p, 'wrong');
      await H.waitState(p, S => S.phase === 'reveal');
      ck.eq((await H.state(p)).trivia.outcome, 'kept', 'Rivka keeps her gimel');
      ck.eq(await coins(), [30, 20, 20], 'after kept');
      ck.ok((await p.textContent('.q-outcome')).includes('Rivka'), 'outcome line names Rivka');
      ck.ok(await p.isVisible('.q-source a[href^="https://www.sefaria.org/"]'), 'Sefaria link shown');
      await finishReveal();

      // Moshe: gimel, Moshe wrong, Rivka right → Rivka steals.
      await H.waitState(p, S => S.phase === 'turn' && S.turn === 1);
      ck.ok(await p.isVisible('#ov-pass'), 'asks to pass the device to Moshe');
      ck.ok((await p.textContent('#pass-who')).includes('Moshe'), 'pass screen names Moshe');
      await H.force(p, ['gimel']);
      await H.spin(p, 10);
      await H.waitState(p, S => S.phase === 'trivia');
      await H.answer(p, 'right'); await H.answer(p, 'wrong'); await H.answer(p, 'wrong');
      await H.waitState(p, S => S.phase === 'reveal');
      ck.eq((await H.state(p)).trivia.outcome, 'stolen', 'Rivka steals Moshe’s gimel');
      ck.eq(await coins(), [40, 20, 20], 'after steal');
      await finishReveal();

      // Dina: gimel of 11, Rivka and Moshe right → split 11.
      await H.waitState(p, S => S.phase === 'turn' && S.turn === 2);
      await H.force(p, ['gimel']);
      await H.spin(p, 11);
      await H.waitState(p, S => S.phase === 'trivia');
      await H.answer(p, 'right'); await H.answer(p, 'right'); await H.answer(p, 'wrong');
      await H.waitState(p, S => S.phase === 'reveal');
      const c3 = await coins();
      ck.eq((await H.state(p)).trivia.outcome, 'split', 'Rivka and Moshe split');
      ck.eq(c3[0] + c3[1], 40 + 20 + 11, 'split adds 11 between them');
      ck.ok(c3[0] - 40 >= 5 && c3[1] - 20 >= 5, 'each gets at least 5 of 11: ' + c3);
      ck.eq(c3[2], 20, 'Dina keeps her 20');
      await finishReveal();

      // Round 2, Rivka: gimel, nobody answers in time → nun.
      await H.waitState(p, S => S.phase === 'turn' && S.round === 2 && S.turn === 0);
      await H.force(p, ['gimel']);
      await H.spin(p, 5);
      await H.waitState(p, S => S.phase === 'trivia');
      for (let i = 0; i < 3; i++) await H.answer(p, 'none').then(() => p.waitForTimeout(10600));
      await H.waitState(p, S => S.phase === 'reveal', null, 20000);
      ck.eq((await H.state(p)).trivia.outcome, 'nun', 'nobody right → nun');
      ck.eq(await coins(), c3, 'nun changes nothing');
      await finishReveal();

      // Moshe loses his whole stack on shin; Dina gets a hey.
      await H.force(p, ['shin']);
      await H.spin(p, c3[1]);
      await H.waitState(p, S => S.phase === 'result');
      ck.eq((await coins())[1], 0, 'Moshe busts');
      await H.waitState(p, S => S.phase === 'turn' && S.turn === 2);
      await H.force(p, ['hey']);
      await H.spin(p, 9);
      await H.waitState(p, S => S.phase === 'result');
      ck.eq((await coins())[2], 25, 'hey on 9 wins 5');
      // Round 3: Moshe has no coins, so only Rivka and Dina spin.
      await H.waitState(p, S => S.phase === 'turn' && S.round === 3);
      ck.eq((await H.state(p)).turn, 0, 'round 3 starts with Rivka');
      await H.force(p, ['nun', 'nun']);
      await H.spin(p, 1);
      await H.waitState(p, S => S.phase === 'turn' && S.round === 3 && S.turn !== 0);
      ck.eq((await H.state(p)).turn, 2, 'busted Moshe is skipped');
      await H.spin(p, 1);
      await H.waitState(p, S => S.phase === 'over', null, 10000);
      await H.seatsMatch(p, ck, 'end');
      ck.errors(p);
      await ctx.close();
      return ck;
    },
  },

  {
    name: 'local: Classic game — pot, antes, out, winner',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
      const p = await H.page(ctx, url + '?p=classic', 'classic');
      await H.profile(p, 'Rivka');
      await H.setupLocal(p, { bots: 2, settings: { mode: 'classic', rounds: 3, startCoins: 10 } });
      ck.ok(!(await p.$('[data-set="trivia"]')), 'no trivia setting in Classic');
      await H.startLocal(p);
      let S = await H.state(p);
      ck.eq(S.pot, 3, 'everyone antes 1 to start');
      ck.eq((await p.textContent('#g-pot')).replace(/\D/g, ''), '3', 'pot shown');
      // Every spin in the game is forced: the human's and the bots'.
      await H.force(p, ['gimel', 'hey', 'shin', 'nun', 'gimel', 'nun', 'hey', 'nun', 'gimel']);
      await H.spin(p);
      await H.waitState(p, S => S.phase === 'result');
      S = await H.state(p);
      ck.eq(S.players[0].coins, 11, 'gimel took the pot of 3, then the ante');
      ck.eq(S.pot, 3, 'pot refilled by everyone');
      let spins = 1;
      const t0 = Date.now();
      while (Date.now() - t0 < 90000) {
        S = await H.state(p);
        if (S.phase === 'over') break;
        const potShown = +(await p.textContent('#g-pot')).replace(/\D/g, '');
        ck.ok(potShown === S.pot || S.phase !== 'turn', `pot shown ${potShown} vs ${S.pot}`);
        if (await p.isVisible('#spin-btn')) { await H.spin(p); spins++; }
        await p.waitForTimeout(250);
      }
      S = await H.state(p);
      ck.eq(S.phase, 'over', 'Classic game ends');
      ck.eq(spins, 3, 'human spun once per round');
      ck.ok(await p.isVisible('#ov-over'), 'game over shown');
      await H.seatsMatch(p, ck, 'end');
      ck.eq(S.players.reduce((a, x) => a + x.coins, 0) + S.pot, 30, 'no coins created or lost in Classic');
      ck.errors(p);
      await ctx.close();
      return ck;
    },
  },

  {
    name: 'local: tie goes to a spin-off (twice), best letter wins',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await H.page(ctx, url + '?p=tie', 'tie');
      await H.profile(p, 'Rivka');
      await H.setupLocal(p, { humans: ['Moshe'], settings: { rounds: 3, trivia: false } });
      await H.startLocal(p);
      // 3 rounds of nun for both → tie at 20.
      await H.force(p, ['nun', 'nun', 'nun', 'nun', 'nun', 'nun', 'hey', 'hey', 'gimel', 'nun']);
      for (let i = 0; i < 6; i++) { await H.spin(p, 3); await H.waitState(p, (S, n) => S.spins === n, i + 1, 10000); }
      await H.waitState(p, S => !!S.spinoff && S.phase === 'turn', null, 10000);
      ck.ok((await p.textContent('#g-round')).length > 0 && await p.isVisible('#g-banner'), 'spin-off banner shown');
      ck.ok(!(await p.$('#bet-slider')), 'no bet in a spin-off');
      await H.spin(p); await H.waitState(p, S => S.spinoff && S.spinoff.idx === 1 && S.phase === 'turn', null, 10000);
      await H.spin(p); await H.waitState(p, S => S.spinoff && S.spinoff.rounds === 2 && S.phase === 'turn', null, 10000);
      ck.ok(true, 'second spin-off after hey/hey');
      await H.spin(p); await H.waitState(p, S => S.spinoff && S.spinoff.idx === 1 && S.phase === 'turn', null, 10000);
      await H.spin(p);
      await H.waitState(p, S => S.phase === 'over', null, 10000);
      const S = await H.state(p);
      ck.eq(S.winners, [S.players[0].id], 'Rivka wins with gimel');
      ck.ok((await p.textContent('.podium .who')).includes('Rivka'), 'winner screen names Rivka');
      ck.eq(S.players.map(x => x.coins), [20, 20], 'spin-offs don’t change coins');
      ck.errors(p);
      await ctx.close();
      return ck;
    },
  },
];
