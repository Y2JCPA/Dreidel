// Renders the dreidel thumbnails shown in the skin picker to img/skins/*.jpg, at full texture
// quality, so players get them instantly instead of drawing them on the device.
// Run after changing a skin's look:  node tools/render-thumbnails.js   (needs Playwright)
const fs = require('fs');
const path = require('path');
const H = require('../tests/e2e/helpers.js');

(async () => {
  const { srv, url } = await H.serve();
  const b = await H.launch();
  const p = await H.page(await b.newContext({ viewport: { width: 600, height: 600 } }), url + '?p=thumbs&gfx=high', 'thumbs');
  await H.profile(p, 'Thumbs');
  const shots = await p.evaluate(async () => {
    await document.fonts.load('190px "Suez One"');
    DreidelModel.setFontReady(true);
    localStorage.clear();
    const out = {};
    for (const s of CONFIG.skins) out[s.id] = Dreidel3D.thumbnail(s.id, 240, { full: true });
    return out;
  });
  const dir = path.join(__dirname, '..', 'img', 'skins');
  fs.mkdirSync(dir, { recursive: true });
  for (const [id, dataUrl] of Object.entries(shots)) {
    fs.writeFileSync(path.join(dir, id + '.jpg'), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(id, Math.round(fs.statSync(path.join(dir, id + '.jpg')).size / 1024) + ' KB');
  }
  if (p.errs.length) console.log(p.errs.join('\n'));
  await b.close(); srv.close();
})();
