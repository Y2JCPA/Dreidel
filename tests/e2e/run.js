// Runs the browser test scenarios. Usage: node tests/e2e/run.js [name-filter]
// Needs Playwright with Chromium (NODE_PATH=$(npm root -g) if installed globally).
const H = require('./helpers');
const files = ['local', 'online', 'ui'];

(async () => {
  const filter = (process.argv[2] || '').toLowerCase();
  const { srv, url } = await H.serve();
  const browser = await H.launch();
  const results = [];
  for (const f of files) {
    let list;
    try { list = require(`./${f}.e2e.js`); } catch (e) { if (e.code === 'MODULE_NOT_FOUND') continue; throw e; }
    for (const sc of list) {
      if (filter && !sc.name.toLowerCase().includes(filter)) continue;
      const t0 = Date.now();
      let ck;
      try {
        ck = await Promise.race([sc.run({ browser, url }), new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 6 min')), 360000))]);
      } catch (e) {
        ck = new H.Check(sc.name); ck.fails.push('threw: ' + (e.stack || e.message).split('\n').slice(0, process.env.VERBOSE ? 40 : 4).join(' | '));
      }
      for (const c of browser.contexts()) await c.close().catch(() => {});   // free every player's browser
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      results.push([sc.name, ck]);
      console.log(`${ck.fails.length ? 'FAIL' : 'PASS'}  ${sc.name}  (${secs}s)`);
      for (const m of ck.fails) console.log('      ✗ ' + m);
      for (const m of ck.notes) console.log('      · ' + m);
    }
  }
  await browser.close();
  srv.close();
  const failed = results.filter(([, c]) => c.fails.length).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed. Screenshots: ${H.SHOTS}`);
  process.exit(failed ? 1 : 0);
})();
