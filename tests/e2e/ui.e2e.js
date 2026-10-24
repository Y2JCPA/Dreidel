// Screens and controls: settings, Mack's intro, menu, language, skins and unlocks, layout.
const H = require('./helpers');

// Seat plates must not cover each other, must stay on the stage, and shouldn't sit under Mack.
async function layoutReport(p) {
  return p.evaluate(() => {
    const r = el => el.getBoundingClientRect();
    const stage = r(document.getElementById('stage'));
    const seats = [...document.querySelectorAll('.seat')].map(r);
    const mack = r(document.querySelector('#mack-corner .mack-body'));
    // Mack's resting spot (not his temporary speech bubble)
    const over = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    let worst = 0, out = 0, mackHit = 0;
    for (let i = 0; i < seats.length; i++) {
      const a = seats[i], area = a.width * a.height;
      for (let j = i + 1; j < seats.length; j++) worst = Math.max(worst, over(a, seats[j]) / area);
      if (a.left < stage.left - 1 || a.right > stage.right + 1 || a.top < stage.top - 1 || a.bottom > stage.bottom + 1) out++;
      mackHit = Math.max(mackHit, over(a, mack) / area);
    }
    return { n: seats.length, worst: +worst.toFixed(2), out, mackHit: +mackHit.toFixed(2) };
  });
}

module.exports = [
  {
    name: 'ui: custom coins and rounds, intro practice meter, how-to from home',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await H.page(ctx, url + '?p=ui1', 'ui1');
      await H.profile(p, 'Rivka');
      // How to play from the home screen
      await p.click('#btn-howto');
      await p.waitForSelector('#ov-intro:not([hidden])');
      const pages = await p.$$eval('#intro-dots i', l => l.length);
      ck.eq(pages, 5, 'Wager intro with trivia has 5 pages');
      await p.click('#intro-next'); await p.click('#intro-next');
      ck.ok(await p.isVisible('#ip-meter'), 'practice meter on page 3');
      // Wait for the zone's resize animation to settle before measuring
      // Wait until the zone reaches the width the rules give for this bet (it animates there)
      const settled = bet => p.waitForFunction(b => {
        const z = document.querySelector('#ip-meter .meter-zone'), t = document.querySelector('#ip-meter .meter-track');
        return Math.abs(z.getBoundingClientRect().width - Rules.meterParams(b).width * t.getBoundingClientRect().width) < 2;
      }, bet, { timeout: 15000 });
      await p.evaluate(() => { const s = document.getElementById('ip-slider'); s.value = 80; s.dispatchEvent(new Event('input')); });
      await settled(80);
      const w80 = await p.$eval('#ip-meter .meter-zone', e => e.getBoundingClientRect().width);
      await p.evaluate(() => { const s = document.getElementById('ip-slider'); s.value = 1; s.dispatchEvent(new Event('input')); });
      await settled(1);
      const w1 = await p.$eval('#ip-meter .meter-zone', e => e.getBoundingClientRect().width);
      ck.ok(w1 > w80 * 2, `green zone shrinks with the bet (1 coin: ${w1.toFixed(0)}px, 80 coins: ${w80.toFixed(0)}px)`);
      await p.click('#ip-tap'); await p.waitForTimeout(300); await p.click('#ip-tap');
      ck.ok(/spin|green|Perfect/i.test(await p.textContent('#ip-res')), 'practice tap gives a grade: ' + await p.textContent('#ip-res'));
      await p.click('#intro-next'); await p.click('#intro-next');
      ck.eq(await p.textContent('#intro-next'), 'Done', 'standalone intro ends with Done');
      await p.click('#intro-next');
      ck.ok(await p.isHidden('#ov-intro'), 'intro closed');

      // Custom starting coins and rounds
      await H.setupLocal(p, { bots: 1 });
      await p.click('[data-set="startCoins"] [data-v="custom"]');
      await p.fill('#custom-startCoins', '35');
      await p.click('form[data-custom="startCoins"] button');
      await p.click('[data-set="rounds"] [data-v="custom"]');
      await p.fill('#custom-rounds', '99');
      await p.click('form[data-custom="rounds"] button');
      ck.ok((await p.textContent('[data-set="startCoins"] [data-v="custom"]')).includes('35'), 'custom coins shown');
      ck.ok((await p.textContent('[data-set="rounds"] [data-v="custom"]')).includes('20'), 'rounds capped at 20');
      await p.click('[data-set="mode"] [data-v="classic"]');
      ck.ok(!(await p.$('[data-set="trivia"]')), 'Classic hides trivia settings');
      await p.click('[data-set="mode"] [data-v="wager"]');
      await p.click('[data-set="trivia"] [data-v="false"]');
      ck.ok(!(await p.$('[data-set="triviaLevel"]')), 'trivia off hides its options');
      await p.click('[data-set="inIsrael"] [data-v="true"]');
      await H.startLocal(p);
      const S = await H.state(p);
      ck.eq([S.settings.startCoins, S.settings.rounds, S.settings.inIsrael, S.settings.trivia], [35, 20, true, false], 'game uses the chosen settings');
      ck.ok((await p.textContent('#g-round')).includes('of 20'), 'round counter shows 20');
      // Israel: the shin face is a pey
      await H.force(p, ['shin']);
      await H.spin(p, 2);
      await H.waitState(p, S => S.phase === 'result');
      ck.eq(await p.textContent('.rp-letter'), 'פ', 'In Israel the 4th letter is Pey');
      ck.ok((await p.textContent('.rp-name')).includes('Pey'), 'named Pey');
      // Settings are remembered next time
      ck.eq(await p.evaluate(() => Profile.data.settings.startCoins), 35, 'settings saved');
      ck.errors(p);
      await ctx.close();
      return ck;
    },
  },

  {
    name: 'ui: menu — Hebrew mid-game, quiet Mack, rules, leave',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await H.page(ctx, url + '?p=ui2', 'ui2');
      await H.profile(p, 'Rivka');
      await H.setupLocal(p, { bots: 2, settings: { rounds: 3, trivia: false } });
      await H.startLocal(p);
      await p.click('#g-menu');
      await p.click('#m-lang');
      ck.eq(await p.evaluate(() => document.documentElement.dir), 'rtl', 'Hebrew flips the page right-to-left');
      ck.ok(/סבב/.test(await p.textContent('#g-round')), 'round counter in Hebrew');
      ck.ok(/התור שלך/.test(await p.textContent('#panel')), 'panel in Hebrew');
      ck.ok(/סובב/.test(await p.textContent('#spin-btn')), 'Spin button in Hebrew');
      await p.click('#m-quiet');
      ck.ok(/פעיל/.test(await p.textContent('#m-quiet')), 'quiet Mack on');
      await p.click('#m-close');
      await H.shot(p, 'ui-hebrew-game');
      await H.force(p, ['gimel']);
      await H.spin(p, 5);
      await H.waitState(p, S => S.phase === 'result');
      ck.ok(await p.isHidden('#mack-corner .mack-bubble'), 'quiet Mack shows no bubble');
      ck.eq(await p.textContent('.rp-name'), 'גימל', 'letter named in Hebrew');
      // Rules from the menu
      await p.click('#g-menu'); await p.click('#m-rules');
      ck.ok(await p.isVisible('#ov-intro'), 'rules open from the menu');
      ck.ok(/מכבי/.test((await p.textContent('#intro-title')).replace(/[\u0591-\u05C7]/g, '')), 'Mack introduces himself in Hebrew');
      await p.click('#intro-skip');
      // Leave: "No" keeps playing, "Yes" goes home
      await p.click('#g-menu'); await p.click('#m-leave');
      await p.click('#confirm-no');
      ck.ok(await p.isVisible('#scr-game'), '"No" keeps the game');
      await p.click('#g-menu'); await p.click('#m-leave'); await p.click('#confirm-yes');
      await p.waitForSelector('#scr-home:not([hidden])');
      ck.ok(/סביבון מכבי/.test(await p.textContent('.logo-main')), 'home in Hebrew');
      await p.click('#home-lang');
      ck.eq(await p.evaluate(() => document.documentElement.dir), 'ltr', 'back to English');
      // A new game after leaving works
      await p.click('#btn-local'); await p.click('#btn-start'); await H.skipIntro(p);
      await H.waitState(p, S => S.round === 1 && S.phase === 'turn');
      ck.ok(await p.isVisible('#spin-btn'), 'new game after leaving');
      ck.errors(p);
      await ctx.close();
      return ck;
    },
  },

  {
    name: 'ui: dreidel skins — locked and open, choosing one, unlocking by winning',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await H.page(ctx, url + '?p=ui3', 'ui3');
      await H.profile(p, 'Rivka');
      await p.click('#btn-dreidels');
      await p.waitForSelector('#scr-profile:not([hidden])');
      ck.eq(await p.$$eval('.skin:not(.locked)', l => l.length), 6, '6 dreidels open at the start');
      ck.eq(await p.$$eval('.skin.locked', l => l.length), 9, '9 locked');
      await p.waitForFunction(() => [...document.querySelectorAll('.skin img')].every(i => i.src.startsWith('data:image')), null, { timeout: 30000 });
      ck.ok(true, 'every thumbnail drawn');
      await H.shot(p, 'ui-skins');
      await p.click('.skin[data-s="anime"]', { force: true });
      ck.ok(/Win 1 game/.test(await p.textContent('#toast')), 'locked dreidel says how to unlock it');
      await p.click('.skin[data-s="paper"]');
      ck.eq(await p.evaluate(() => Profile.data.skin), 'paper', 'paper dreidel chosen');
      await p.click('#prof-done');
      // Win a game against one computer player (every spin forced).
      await H.setupLocal(p, { bots: 1, settings: { rounds: 3, trivia: false } });
      await H.startLocal(p);
      ck.eq((await H.state(p)).players[0].skin, 'paper', 'my seat uses my dreidel');
      await H.force(p, ['gimel', 'shin', 'gimel', 'shin', 'gimel', 'shin']);
      for (let i = 0; i < 3; i++) { await H.spin(p, 5); await H.waitState(p, (S, n) => S.spins >= n, (i + 1) * 2, 20000); }
      await p.waitForSelector('#ov-over:not([hidden])');
      ck.ok(/You win/.test(await p.textContent('.podium .who')), 'You win shown');
      ck.ok(/Anime/.test(await p.textContent('#over')), 'new dreidel unlocked: Anime');
      await p.click('#over-home');
      await p.click('#btn-dreidels');
      ck.ok(!(await p.$eval('.skin[data-s="anime"]', e => e.classList.contains('locked'))), 'Anime now open');
      ck.ok(/1 wins/.test(await p.textContent('#prof-stats')), 'stats count the win');
      ck.errors(p);
      await ctx.close();
      return ck;
    },
  },

  {
    name: 'ui: touch phone — tap to spin, tap to stop the meter, tap answers',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const p = await H.page(ctx, url + '?p=touch', 'touch');
      await H.profile(p, 'Rivka');
      await H.setupLocal(p, { bots: 1, settings: { rounds: 3, triviaChance: 100 } });
      await p.tap('#btn-start');
      await p.waitForSelector('#ov-intro:not([hidden])');
      await p.tap('#intro-skip');
      await p.waitForSelector('#spin-btn');
      await p.tap('[data-q="10"]');
      ck.eq(await p.textContent('#bet-v'), '10', 'tap a quick bet');
      await H.force(p, ['gimel']);
      await p.tap('#spin-btn');
      await p.waitForSelector('#live-meter');
      await p.waitForTimeout(250);
      await p.tap('#live-meter');
      await H.waitState(p, S => S.phase === 'spinning' || S.phase === 'trivia', null, 5000);
      ck.ok(true, 'a tap stops the meter and spins');
      await H.waitState(p, S => S.phase === 'trivia', null, 10000);
      await p.waitForSelector('#ov-trivia button.q-opt:not([disabled])');
      await p.tap('#ov-trivia button.q-opt');
      await H.waitState(p, S => S.trivia && Object.keys(S.trivia.answers).includes(S.players[0].id), null, 5000);
      ck.ok(true, 'a tap answers the question');
      ck.errors(p);
      await ctx.close();
      return ck;
    },
  },

  {
    name: 'ui: easter eggs, every dreidel skin spins and lands, Kids trivia level',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await H.page(ctx, url + '?p=egg', 'egg');
      await H.profile(p, 'Rivka');
      await H.setupLocal(p, { bots: 1, settings: { rounds: 3, triviaLevel: 'kids', triviaChance: 100 } });
      await H.startLocal(p);
      await p.waitForSelector('#spin-btn');   // my turn: nothing else moves while the skins spin
      // Every skin spins and lands on the letter it was told to.
      const letters = ['nun', 'gimel', 'hey', 'shin'];
      const results = await p.evaluate(async (letters) => {
        const out = [];
        for (const [i, s] of CONFIG.skins.entries()) {
          Dreidel3D.setSkin(s.id);
          const t0 = performance.now();
          await Dreidel3D.spin({ letter: letters[i % 4], grade: ['miss', 'good', 'perfect'][i % 3], upside: i % 5 === 0, seed: i + 1 });
          out.push([s.id, Math.round(performance.now() - t0)]);
          Dreidel3D.standUp();
          await new Promise(r => setTimeout(r, 450));
        }
        return out;
      }, letters);
      ck.eq(results.length, 15, 'all 15 skins spun');
      ck.ok(results.every(([, ms]) => ms > 1000 && ms < 5000), 'each spin landed in 1–5 s: ' + results.map(r => r.join(' ')).join(', '));
      // Phone upside down → the spin is flagged upside down for everyone.
      await p.evaluate(() => { const e = new Event('deviceorientation'); e.beta = -100; e.gamma = 0; window.dispatchEvent(e); });
      await H.force(p, ['gimel']);
      await H.spin(p, 3);
      await H.waitState(p, S => S.spin && S.spin.id === 1);
      ck.eq((await H.state(p)).spin.upside, true, 'upside-down phone spins the dreidel upside down');
      await H.waitState(p, S => S.phase === 'trivia', null, 10000);
      ck.ok((await H.state(p)).trivia.qid.startsWith('k'), 'Kids level asks a Kids question');
      await H.answer(p, 'right');
      await H.cont(p);
      // Shake → gelt shower
      await p.evaluate(() => { const e = new Event('devicemotion'); e.accelerationIncludingGravity = { x: 30, y: 10, z: 5 }; window.dispatchEvent(e); });
      await p.waitForTimeout(150);
      ck.ok((await p.$$('.coins-layer .coin')).length >= 10, 'shaking showers gelt');
      // Tap Mack five times → loop-de-loop
      for (let i = 0; i < 5; i++) await p.click('#mack-corner .mack-body', { force: true });   // he bobs, so never "stable"
      ck.ok(await p.$eval('#mack-corner .mack-body', e => e.classList.contains('a-loop')), 'Mack does a loop after 5 taps');
      ck.errors(p);
      await ctx.close();
      return ck;
    },
  },

  {
    name: 'ui: layout — seats at phone, tablet and desktop sizes, 2 to 8 players, resize',
    async run({ browser, url }) {
      const ck = new H.Check(this.name);
      const sizes = [[320, 568], [375, 667], [390, 844], [412, 915], [667, 375], [844, 390], [915, 412], [768, 1024], [1024, 768], [1280, 800], [1920, 1080]];
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await H.page(ctx, url + '?p=ui4', 'ui4');
      await H.profile(p, 'Rivka');
      for (const n of [2, 4, 6, 8]) {
        await p.goto(url + '?p=ui4');
        await p.waitForSelector('#scr-home:not([hidden])');
        await p.setViewportSize({ width: 390, height: 844 });
        await H.setupLocal(p, { bots: n - 1, settings: { rounds: 3 } });
        await H.startLocal(p);
        for (const [w, h] of sizes) {
          await p.setViewportSize({ width: w, height: h });
          await p.waitForTimeout(450);
          const r = await layoutReport(p);
          const label = `${n} players at ${w}×${h}`;
          ck.eq(r.n, n, `${label}: all seats drawn`);
          ck.ok(r.worst <= 0.12, `${label}: seats overlap ${Math.round(r.worst * 100)}%`);
          ck.ok(r.out === 0, `${label}: ${r.out} seats off the table area`);
          ck.ok(r.mackHit <= 0.25, `${label}: Mack covers ${Math.round(r.mackHit * 100)}% of a seat`);
          const panelFits = await p.evaluate(() => { const b = document.getElementById('spin-btn'); return !b || b.getBoundingClientRect().bottom <= innerHeight + 1; });
          ck.ok(panelFits, `${label}: Spin button fits on screen`);
          const stageH = await p.evaluate(() => document.getElementById('stage').clientHeight);
          ck.ok(stageH >= 200, `${label}: table area is ${stageH}px tall`);
          if ((n === 8 && (w === 320 || w === 1280 || w === 844)) || (n === 4 && (w === 768 || w === 667))) await H.shot(p, `layout-${n}p-${w}x${h}`);
        }
      }
      ck.errors(p);
      await ctx.close();
      return ck;
    },
  },
];
