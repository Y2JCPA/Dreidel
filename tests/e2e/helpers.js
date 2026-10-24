// Shared helpers for the browser tests (Playwright + headless Chromium).
// Run everything with: node tests/e2e/run.js   (or pass a filter: node tests/e2e/run.js online)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.env.SHOTS || path.join(require('os').tmpdir(), 'mackabee-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

function serve(port = 0) {
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { resp.writeHead(404); resp.end(); return; }
      resp.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(resp);
    }).listen(port, () => res({ srv, url: `http://localhost:${srv.address().port}/` }));
  });
}

async function launch() {
  return chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
}

// A page that records page errors and console errors.
async function page(ctxOrBrowser, url, name = 'p') {
  const p = await ctxOrBrowser.newPage();
  p.errs = [];
  p.label = name;
  p.on('pageerror', e => p.errs.push(`[${name}] pageerror: ${e.stack || e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) p.errs.push(`[${name}] console: ${m.text()}`); });
  if (url) await p.goto(url);
  return p;
}

class Check {
  constructor(name) { this.name = name; this.fails = []; this.notes = []; }
  ok(cond, msg) { if (!cond) this.fails.push(msg); return !!cond; }
  eq(a, b, msg) { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) this.fails.push(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); return ok; }
  note(m) { this.notes.push(m); }
  errors(...pages) { for (const p of pages) for (const e of p.errs) this.fails.push(e); }
}

const state = p => p.evaluate(() => window.MackTest && MackTest.state ? JSON.parse(JSON.stringify(MackTest.state)) : null);
const waitState = (p, fnSrc, arg, timeout = 30000) => p.waitForFunction(`(() => { const S = window.MackTest && MackTest.state; if (!S) return false; const arg = ${JSON.stringify(arg)}; return (${fnSrc})(S, arg); })()`, null, { timeout, polling: 100 });
const force = (p, letters) => p.evaluate(L => { Rules.force.length = 0; Rules.force.push(...L); }, letters);

// First run: type a name and finish the profile screen.
async function profile(p, name) {
  await p.waitForSelector('#scr-profile:not([hidden]), #scr-home:not([hidden])');
  if (await p.isVisible('#scr-profile')) {
    await p.fill('#prof-name', name);
    await p.click('#prof-done');
  }
}

// Local setup: humans are extra people on this device, bots are computer players.
async function setupLocal(p, { humans = [], bots = 0, settings = {} } = {}) {
  await p.click('#btn-local');
  await p.waitForSelector('#scr-setup:not([hidden])');
  while (await p.$('#player-list [data-rm]')) await p.click('#player-list [data-rm]');
  for (const h of humans) { await p.fill('#person-name', h); await p.click('#add-person button[type=submit]'); }
  for (let i = 0; i < bots; i++) await p.click('#add-bot');
  for (const [k, v] of Object.entries(settings)) await p.click(`[data-set="${k}"] [data-v="${v}"]`);
}
async function startLocal(p) {
  await p.click('#btn-start');
  await p.waitForSelector('#ov-intro:not([hidden])');
  await skipIntro(p);
  await p.waitForSelector('#scr-game:not([hidden])');
}
async function skipIntro(p) {
  if (await p.isVisible('#ov-intro')) {
    if (await p.isVisible('#intro-skip')) await p.click('#intro-skip');
    else await p.click('#intro-next');
  }
}
async function pass(p) { if (await p.isVisible('#ov-pass')) await p.click('#pass-go'); }

// Take my turn: optionally set the bet, press Spin, stop the meter.
async function spin(p, bet) {
  // Wait for my Spin button, handing the device over if asked.
  const t0 = Date.now();
  while (!(await p.isVisible('#spin-btn'))) {
    await pass(p);
    if (Date.now() - t0 > 20000) throw new Error('Spin button never appeared');
    await p.waitForTimeout(100);
  }
  if (bet) await p.evaluate(b => { const s = document.getElementById('bet-slider'); if (s) { s.value = b; s.dispatchEvent(new Event('input')); } }, bet);
  const wager = await p.$('#bet-slider');
  await p.click('#spin-btn');
  if (wager) {
    await p.waitForSelector('#live-meter');
    await p.waitForTimeout(220);
    await p.click('#panel');
  }
}

// Answer the trivia question for whoever is at the screen: 'right', 'wrong' or 'none' (let time run out).
async function answer(p, how) {
  // Wait for either the next person's "ready" screen (pass-and-play) or live options.
  const sel = '#ov-trivia:not([hidden]) button.q-opt:not([disabled])';
  const t0 = Date.now();
  while (!(await p.$(sel))) {
    if (await p.isVisible('#q-ready')) await p.click('#q-ready');
    if (Date.now() - t0 > 20000) throw new Error('trivia options never appeared');
    await p.waitForTimeout(100);
  }
  if (how === 'none') return;
  const right = await p.evaluate(() => { const T = MackTest.state.trivia; return T.order.indexOf(Trivia.byId(T.qid).answer); });
  const d = how === 'right' ? right : (right + 1) % 4;
  await p.click(`.q-opt[data-d="${d}"]`);
}

// Press Continue on the trivia answer, unless it already moved on by itself (it does after 7 s).
async function cont(p) {
  await p.waitForFunction(() => { const S = MackTest.state; return S && S.phase !== 'trivia'; }, null, { timeout: 30000, polling: 100 });
  await p.click('#q-continue', { timeout: 3000 }).catch(() => {});
}

// Seat plates must show the same coins as the state.
async function seatsMatch(p, ck, label = '') {
  const r = await p.evaluate(() => {
    const S = MackTest.state;
    return S.players.map(pl => {
      const el = document.querySelector(`.seat[data-pid="${CSS.escape(pl.id)}"] .s-coins`);
      return [pl.name, pl.coins, el ? +el.textContent : null];
    });
  });
  for (const [n, want, got] of r) ck.eq(got, want, `${label} seat coins for ${n}`);
}

async function shot(p, name) { await p.screenshot({ path: path.join(SHOTS, name + '.png') }); }

module.exports = { cont, serve, launch, page, Check, state, waitState, force, profile, setupLocal, startLocal, skipIntro, pass, spin, answer, seatsMatch, shot, SHOTS };
