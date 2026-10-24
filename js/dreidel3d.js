/* ============================================
   MACK-A-BEE DREIDEL — 3D table and dreidel (Three.js)
   A fuzzy green poker table with a navy rail and gold trim, and a
   dreidel whose look depends on the skin: realistic wood, paper,
   cartoon, anime, pixel, gold, crystal, neon, and more. Everything is
   drawn in code; there are no image files.

   The spin always lands on the letter the referee already drew: the
   animation is built backwards from the final pose, so every screen
   shows the same result.
   ============================================ */
const Dreidel3D = (function () {
  const T = window.THREE;
  const C = CONFIG;

  // Dreidel proportions (model units). The tip sits at the origin.
  const W = 0.9, TIP_H = 0.55, BODY_H = 1.0, HANDLE_H = 0.55, HANDLE_R = 0.085, KNOB_R = 0.12;
  const BODY_Y = TIP_H + BODY_H / 2;
  const TOP_Y = TIP_H + BODY_H;
  const FULL_H = TOP_Y + HANDLE_H + KNOB_R;
  // Face k's outward normal angle, measured from +Z toward +X.
  const FACE_ANGLE = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  const SCALE = 1.3;   // dreidel size on the table

  let renderer, scene, camera, container, envTex = null;
  let table = null, rail = null, trim = null, vignette = null, feltMat = null;
  let pivot, flip, model = null, particles = null, shadowDisc = null;
  let rx = 2.6, rz = 3.5;                  // table radii
  let skinId = 'wood', inIsrael = false;
  let anim = null;                         // current animation
  let idleYaw = 0, lastT = 0, running = false;
  let fontReady = false;
  const texCache = {};
  const listeners = { layout: [] };

  const rand = seed => () => {             // mulberry32: same seed → same spin everywhere
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ---------- Canvas textures ----------
  function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, { srgb = true, repeat = null, nearest = false } = {}) {
    const t = new T.CanvasTexture(c);
    if (srgb) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat, repeat); }
    if (nearest) { t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false; }
    else t.anisotropy = 4;
    return t;
  }
  function noiseFill(g, w, h, base, amt, count, size = 1) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < count; i++) {
      const v = Math.random();
      g.fillStyle = v > 0.5 ? `rgba(255,255,255,${amt * Math.random()})` : `rgba(0,0,0,${amt * Math.random()})`;
      g.fillRect(Math.random() * w, Math.random() * h, size, size);
    }
  }

  function feltTexture() {
    const c = canvas(512), g = c.getContext('2d');
    noiseFill(g, 512, 512, '#1d6b45', 0.16, 60000, 1.4);
    for (let i = 0; i < 2500; i++) {          // fuzzy fibres
      g.strokeStyle = `rgba(${Math.random() > 0.5 ? '140,230,170' : '5,40,20'},${0.06 + Math.random() * 0.08})`;
      g.lineWidth = 0.7;
      const x = Math.random() * 512, y = Math.random() * 512, a = Math.random() * Math.PI * 2, l = 2 + Math.random() * 5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    return tex(c, { repeat: 6 });
  }

  function envTexture() {
    // A dim room: navy walls, a warm candle-lit band, the green table below.
    const c = canvas(512, 256), g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, '#5a6aa0'); sky.addColorStop(0.3, '#2c3768'); sky.addColorStop(0.44, '#6a5a52'); sky.addColorStop(0.5, '#b79a62');
    sky.addColorStop(0.56, '#1c4a33'); sky.addColorStop(1, '#0b2418');
    g.fillStyle = sky; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 9; i++) {              // candle glows
      const x = 40 + i * 54, y = 98;
      const r = g.createRadialGradient(x, y, 0, x, y, 26);
      r.addColorStop(0, 'rgba(255,230,170,1)'); r.addColorStop(0.3, 'rgba(255,190,90,0.6)'); r.addColorStop(1, 'rgba(255,170,60,0)');
      g.fillStyle = r; g.fillRect(x - 30, y - 30, 60, 60);
    }
    const top = g.createRadialGradient(256, 0, 0, 256, 0, 140);
    top.addColorStop(0, 'rgba(255,248,230,1)'); top.addColorStop(1, 'rgba(255,245,220,0)');
    g.fillStyle = top; g.fillRect(0, 0, 512, 140);
    for (const x of [96, 416]) {               // two soft windows for metal highlights
      const w = g.createRadialGradient(x, 60, 0, x, 60, 60);
      w.addColorStop(0, 'rgba(255,255,255,0.85)'); w.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = w; g.fillRect(x - 60, 0, 120, 120);
    }
    const t = tex(c);
    t.mapping = T.EquirectangularReflectionMapping;
    return t;
  }

  // ---------- Letter textures (one per skin per letter) ----------
  const FONT = '"Suez One", "Frank Ruhl Libre", "David", serif';
  function letterTexture(skin, glyph) {
    const key = skin.id + glyph + (fontReady ? 'f' : '');
    if (texCache[key]) return texCache[key];
    const style = skin.style;
    const pixel = style === 'pixel';
    const S = pixel ? 16 : 256;
    const c = canvas(S), g = c.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const cx = S / 2, cy = S * 0.54;

    if (pixel) {
      g.font = `bold 15px ${FONT}`;
      g.fillStyle = '#1b3d1d'; g.fillText(glyph, cx + 1, cy + 1);
      g.fillStyle = skin.letter; g.fillText(glyph, cx, cy);
      // Snap to hard pixels: no half-transparent edges.
      const d = g.getImageData(0, 0, S, S);
      for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 90 ? 255 : 0;
      g.putImageData(d, 0, 0);
      return (texCache[key] = tex(c, { nearest: true }));
    }

    g.font = `${style === 'cartoon' ? 'bold ' : ''}190px ${FONT}`;
    if (style === 'paper') {
      // Hand-drawn marker: wobbly double stroke
      g.font = `175px ${FONT}`;
      g.globalAlpha = 0.85; g.fillStyle = skin.letter;
      g.fillText(glyph, cx + 2, cy + 3);
      g.globalAlpha = 0.5; g.fillText(glyph, cx - 3, cy - 1);
      g.globalAlpha = 1; g.strokeStyle = skin.letter; g.lineWidth = 3; g.strokeText(glyph, cx, cy);
    } else if (style === 'cartoon') {
      g.lineJoin = 'round'; g.lineWidth = 22; g.strokeStyle = '#1a1a2e'; g.strokeText(glyph, cx, cy);
      g.fillStyle = skin.letter; g.fillText(glyph, cx, cy);
    } else if (style === 'anime') {
      g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = '#ffffff'; g.strokeText(glyph, cx, cy);
      g.fillStyle = skin.letter; g.fillText(glyph, cx, cy);
      g.fillStyle = '#ffffff';
      star(g, 200, 60, 16); star(g, 58, 196, 10);
    } else if (style === 'neon' || style === 'glass' || style === 'gem') {
      g.shadowColor = skin.letter; g.shadowBlur = style === 'neon' ? 28 : 12;
      g.fillStyle = skin.letter; g.fillText(glyph, cx, cy); g.fillText(glyph, cx, cy);
    } else if (style === 'stone' || style === 'clay') {
      // Carved: dark inner shadow + light lip
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillText(glyph, cx + 3, cy + 4);
      g.fillStyle = skin.letter; g.fillText(glyph, cx, cy);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillText(glyph, cx - 2, cy - 2);
    } else if (style === 'metal' || style === 'foil') {
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillText(glyph, cx - 2, cy - 2);
      g.fillStyle = skin.letter; g.fillText(glyph, cx + 1, cy + 1);
    } else {
      g.fillStyle = skin.letter; g.fillText(glyph, cx, cy);
    }
    return (texCache[key] = tex(c));
  }

  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, rr = i % 2 ? r * 0.3 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  }

  // ---------- Body textures per style ----------
  function bodyTexture(skin) {
    const key = 'body-' + skin.id;
    if (texCache[key]) return texCache[key];
    const st = skin.style;
    let c, g, t;
    if (st === 'real') {
      c = canvas(256); g = c.getContext('2d');
      g.fillStyle = skin.body; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 2) {          // wood grain
        const w = Math.sin(y * 0.08) * 6 + Math.sin(y * 0.31) * 2;
        g.fillStyle = `rgba(60,30,10,${0.05 + 0.12 * Math.abs(Math.sin(y * 0.17 + w))})`;
        g.fillRect(0, y + w * 0.2, 256, 1.5);
      }
      noiseFill2(g, 256, 0.05, 3000);
      t = tex(c);
    } else if (st === 'paper') {
      c = canvas(256); g = c.getContext('2d');
      noiseFill(g, 256, 256, skin.body, 0.05, 9000, 1);
      g.strokeStyle = 'rgba(120,100,70,0.35)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(256, 256); g.moveTo(256, 0); g.lineTo(0, 256); g.stroke();   // fold lines
      g.strokeStyle = 'rgba(80,60,40,0.5)'; g.lineWidth = 4; g.strokeRect(2, 2, 252, 252);
      t = tex(c);
    } else if (st === 'clay') {
      c = canvas(256); g = c.getContext('2d');
      noiseFill(g, 256, 256, skin.body, 0.12, 6000, 3);
      for (let i = 0; i < 14; i++) {              // fingerprints
        g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 1.5;
        const x = Math.random() * 256, y = Math.random() * 256;
        for (let r = 4; r < 22; r += 4) { g.beginPath(); g.ellipse(x, y, r, r * 0.7, Math.random(), 0, Math.PI * 2); g.stroke(); }
      }
      t = tex(c);
    } else if (st === 'hive') {
      c = canvas(256); g = c.getContext('2d');
      g.fillStyle = '#c98a00'; g.fillRect(0, 0, 256, 256);
      const r = 18, hh = r * Math.sqrt(3);
      for (let row = -1; row < 10; row++) for (let col = -1; col < 10; col++) {
        const x = col * r * 1.5 * 1.0 + 0, y = row * hh + (col % 2 ? hh / 2 : 0);
        g.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; g.lineTo(x + Math.cos(a) * (r - 2.5), y + Math.sin(a) * (r - 2.5)); }
        g.closePath();
        const grd = g.createRadialGradient(x - 4, y - 4, 1, x, y, r);
        grd.addColorStop(0, '#ffd866'); grd.addColorStop(1, skin.body);
        g.fillStyle = grd; g.fill();
      }
      t = tex(c);
    } else if (st === 'stone') {
      c = canvas(256); g = c.getContext('2d');
      noiseFill(g, 256, 256, skin.body, 0.1, 12000, 2);
      g.strokeStyle = 'rgba(110,90,60,0.35)'; g.lineWidth = 3;
      g.strokeRect(10, 10, 236, 236);             // chiselled margin, like Herodian ashlars
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.strokeRect(14, 14, 228, 228);
      t = tex(c);
    } else if (st === 'pixel') {
      c = canvas(16); g = c.getContext('2d');
      const shades = ['#4cb050', '#43a047', '#5cbf60', '#388e3c'];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = shades[Math.floor(Math.random() * 4)]; g.fillRect(x, y, 1, 1); }
      g.fillStyle = '#2e7d32'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16);
      t = tex(c, { nearest: true });
    } else if (st === 'neon') {
      c = canvas(256); g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
      g.shadowColor = skin.edge; g.shadowBlur = 18; g.strokeStyle = skin.edge; g.lineWidth = 8;
      g.strokeRect(10, 10, 236, 236); g.strokeRect(10, 10, 236, 236);
      t = tex(c);
    } else if (st === 'foil') {
      c = canvas(256); g = c.getContext('2d');
      noiseFill(g, 256, 256, '#808080', 0.5, 5000, 4);   // crinkles, used as a bump map
      t = tex(c, { srgb: false });
    } else {
      return null;
    }
    return (texCache[key] = t);
  }
  function noiseFill2(g, s, amt, n) {
    for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${amt * Math.random()})`; g.fillRect(Math.random() * s, Math.random() * s, 2, 1); }
  }

  function toonGradient(steps) {
    const data = new Uint8Array(steps.length * 4);
    steps.forEach((v, i) => { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; });
    const t = new T.DataTexture(data, steps.length, 1, T.RGBAFormat);
    t.minFilter = t.magFilter = T.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  }

  // ---------- Materials per style ----------
  function materials(skin) {
    const st = skin.style, body = new T.Color(skin.body), edge = new T.Color(skin.edge);
    const map = bodyTexture(skin);
    let b, h, outline = null, letterBasic = false;
    switch (st) {
      case 'real':
        b = new T.MeshPhysicalMaterial({ color: 0xffffff, map, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 });
        h = new T.MeshPhysicalMaterial({ color: edge, roughness: 0.4, clearcoat: 0.6 });
        break;
      case 'plastic':
        b = new T.MeshPhysicalMaterial({ color: body, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
        h = new T.MeshPhysicalMaterial({ color: edge, roughness: 0.25, clearcoat: 1 });
        break;
      case 'paper':
        b = new T.MeshStandardMaterial({ color: 0xffffff, map, roughness: 1, flatShading: true });
        h = new T.MeshStandardMaterial({ color: new T.Color('#e9dfc8'), roughness: 1, flatShading: true });
        break;
      case 'cartoon': {
        const grad = toonGradient([90, 180, 255]);
        b = new T.MeshToonMaterial({ color: body, gradientMap: grad });
        h = new T.MeshToonMaterial({ color: edge, gradientMap: grad });
        outline = '#1a1a2e';
        break;
      }
      case 'anime': {
        const grad = toonGradient([170, 255]);
        b = new T.MeshToonMaterial({ color: body, gradientMap: grad });
        h = new T.MeshToonMaterial({ color: edge, gradientMap: grad });
        outline = '#3a2a7a';
        break;
      }
      case 'clay':
        b = new T.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.95 });
        h = new T.MeshStandardMaterial({ color: edge, roughness: 0.95 });
        break;
      case 'metal':
        b = new T.MeshStandardMaterial({ color: body, metalness: skin.id === 'gold' ? 1 : 0.85, roughness: skin.id === 'gold' ? 0.22 : 0.24, envMapIntensity: skin.id === 'gold' ? 1.3 : 1.7 });
        h = new T.MeshStandardMaterial({ color: edge, metalness: 1, roughness: 0.25, envMapIntensity: 1.3 });
        break;
      case 'foil':
        b = new T.MeshStandardMaterial({ color: body, metalness: 1, roughness: 0.3, bumpMap: map, bumpScale: 0.6, envMapIntensity: 1.4 });
        h = new T.MeshStandardMaterial({ color: new T.Color('#6b3f1d'), roughness: 0.6 });   // chocolate showing
        break;
      case 'glass':
        b = new T.MeshPhysicalMaterial({ color: body, transmission: 1, thickness: 0.8, roughness: 0.04, ior: 1.5, attenuationColor: new T.Color('#5fb6ef'), attenuationDistance: 1.5, envMapIntensity: 1.5 });
        h = b;
        letterBasic = true;
        break;
      case 'gem':
        b = new T.MeshPhysicalMaterial({ color: body, transmission: 1, thickness: 1.2, roughness: 0, ior: 2.4, iridescence: 1, iridescenceIOR: 1.6, flatShading: true, envMapIntensity: 2 });
        h = b;
        letterBasic = true;
        break;
      case 'neon':
        b = new T.MeshStandardMaterial({ color: body, roughness: 0.4, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 1.4 });
        h = new T.MeshStandardMaterial({ color: body, emissive: edge, emissiveIntensity: 1.2 });
        letterBasic = true;
        break;
      case 'hive':
        b = new T.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.45 });
        h = new T.MeshStandardMaterial({ color: edge, roughness: 0.5 });
        break;
      case 'stone':
        b = new T.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.9 });
        h = new T.MeshStandardMaterial({ color: body, roughness: 0.9 });
        break;
      case 'pixel':
        b = new T.MeshLambertMaterial({ map });
        h = new T.MeshLambertMaterial({ color: new T.Color('#8d6e63') });
        break;
      default:
        b = new T.MeshStandardMaterial({ color: body });
        h = new T.MeshStandardMaterial({ color: edge });
    }
    return { b, h, outline, letterBasic };
  }

  // ---------- Model ----------
  function buildModel(skin) {
    const g = new T.Group();
    const m = materials(skin);
    const parts = [];
    const add = (geo, mat, y) => {
      const mesh = new T.Mesh(geo, mat);
      mesh.position.y = y; mesh.castShadow = true;
      g.add(mesh); parts.push(mesh);
      return mesh;
    };

    let bodyGeo = new T.BoxGeometry(W, BODY_H, W, skin.style === 'clay' ? 6 : 1, skin.style === 'clay' ? 6 : 1, skin.style === 'clay' ? 6 : 1);
    if (skin.style === 'clay') lumpy(bodyGeo, 0.03);
    add(bodyGeo, m.b, BODY_Y);

    if (skin.style === 'pixel') {
      // Stepped tip and square handle
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        const s = W * (1 - (i + 1) / (steps + 0.6));
        add(new T.BoxGeometry(s, TIP_H / steps, s), m.b, TIP_H - (i + 0.5) * TIP_H / steps);
      }
      add(new T.BoxGeometry(HANDLE_R * 2.2, HANDLE_H, HANDLE_R * 2.2), m.h, TOP_Y + HANDLE_H / 2);
      add(new T.BoxGeometry(KNOB_R * 2, KNOB_R * 1.4, KNOB_R * 2), m.h, TOP_Y + HANDLE_H);
    } else {
      const tipGeo = new T.ConeGeometry(W / Math.SQRT2, TIP_H, 4, 1);
      tipGeo.rotateY(Math.PI / 4);
      tipGeo.rotateX(Math.PI);     // point down
      add(tipGeo, m.b, TIP_H / 2);
      add(new T.CylinderGeometry(HANDLE_R, HANDLE_R * 1.15, HANDLE_H, 20), m.h, TOP_Y + HANDLE_H / 2);
      add(new T.SphereGeometry(KNOB_R, 20, 14), m.h, TOP_Y + HANDLE_H);
      add(new T.CylinderGeometry(W * 0.32, W * 0.36, 0.05, 24), m.h, TOP_Y + 0.025);   // collar
    }

    if (m.outline) {
      const om = new T.MeshBasicMaterial({ color: new T.Color(m.outline), side: T.BackSide });
      for (const p of parts.slice()) {
        const o = new T.Mesh(p.geometry, om);
        o.position.copy(p.position);
        o.scale.setScalar(skin.style === 'cartoon' ? 1.07 : 1.045);
        g.add(o);
      }
    }

    // Letters on the four faces
    const letters = C.letters;
    for (let k = 0; k < 4; k++) {
      const glyph = I18N.glyph(letters[k], inIsrael);
      const lt = letterTexture(skin, glyph);
      // Glowing and flat-coloured styles keep letters unlit so they read clearly.
      const unlit = m.letterBasic || ['cartoon', 'anime', 'pixel'].includes(skin.style);
      const lm = unlit
        ? new T.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false, toneMapped: !m.letterBasic })
        : new T.MeshStandardMaterial({ map: lt, transparent: true, depthWrite: false, roughness: skin.style === 'metal' ? 0.45 : 0.7, metalness: skin.style === 'metal' || skin.style === 'foil' ? 0.6 : 0 });
      const plane = new T.Mesh(new T.PlaneGeometry(W * 0.88, W * 0.88), lm);
      const a = FACE_ANGLE[k];
      plane.position.set(Math.sin(a) * (W / 2 + 0.004), BODY_Y, Math.cos(a) * (W / 2 + 0.004));
      plane.rotation.y = a;
      plane.renderOrder = 2;
      g.add(plane);
    }
    return g;
  }

  function lumpy(geo, amt) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = Math.sin(x * 9 + y * 7) * Math.cos(z * 8 - y * 5) * amt;
      p.setXYZ(i, x * (1 + n), y + n * 0.3, z * (1 + n));
    }
    geo.computeVertexNormals();
  }

  // ---------- Particles for spin effects ----------
  const PN = 70;
  function buildParticles() {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(PN * 3), 3));
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(PN * 3), 3));
    const mat = new T.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
    const pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    pts.userData.seed = Array.from({ length: PN }, () => [Math.random(), Math.random(), Math.random()]);
    return pts;
  }
  const sprites = {};
  function sprite(kind) {
    if (sprites[kind]) return sprites[kind];
    const c = canvas(64), g = c.getContext('2d');
    if (kind === 'bee') { g.font = '48px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🐝', 32, 36); }
    else {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#fff'; star(g, 32, 32, 30);
    }
    return (sprites[kind] = tex(c));
  }

  function setupParticles(fx) {
    const m = particles.material;
    m.map = null; m.blending = T.AdditiveBlending; m.size = 0.12; m.sizeAttenuation = true;
    const col = particles.geometry.attributes.color;
    const skin = getSkin(skinId);
    const palette = {
      sparkle: ['#fff3b0', '#ffd34d', '#ffffff'],
      rainbow: ['#ff6b6b', '#ffd93d', '#6bff95', '#6bc8ff', '#c56bff'],
      pixels: ['#6bff95', '#ffffff', '#3ddc84'],
      trail: [skin.letter, skin.edge],
      speed: ['#ffffff', '#ffd1e6'],
      bees: ['#ffffff'],
    }[fx] || ['#ffffff'];
    for (let i = 0; i < PN; i++) {
      const c = new T.Color(palette[i % palette.length]);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    if (fx === 'sparkle' || fx === 'rainbow' || fx === 'speed') { m.map = sprite('star'); m.size = 0.2; }
    if (fx === 'pixels') { m.size = 0.09; m.blending = T.NormalBlending; }
    if (fx === 'trail') { m.map = sprite('star'); m.size = 0.16; }
    if (fx === 'bees') { m.map = sprite('bee'); m.size = 0.32; m.blending = T.NormalBlending; }
    m.needsUpdate = true;
  }

  function updateParticles(fx, t, energy, center) {
    const pos = particles.geometry.attributes.position;
    const seeds = particles.userData.seed;
    const m = particles.material;
    if (!fx || fx === 'none' || fx === 'flutter' || fx === 'boing' || fx === 'shine') { m.opacity = 0; return; }
    m.opacity = Math.min(1, energy * 1.4);
    for (let i = 0; i < PN; i++) {
      const [a, b, c] = seeds[i];
      let x, y, z;
      if (fx === 'bees') {
        if (i >= 4) { pos.setXYZ(i, 0, -50, 0); continue; }
        const ang = t * 2.2 + i * Math.PI / 2;
        x = Math.cos(ang) * 1.05; z = Math.sin(ang) * 1.05; y = 1.2 + Math.sin(t * 5 + i) * 0.25;
      } else if (fx === 'pixels') {
        const life = (t * 0.9 + a) % 1;
        const ang = b * Math.PI * 2;
        x = Math.cos(ang) * (0.5 + life * 0.6); z = Math.sin(ang) * (0.5 + life * 0.6); y = 1.8 - life * 1.7;
      } else if (fx === 'trail') {
        const ang = -t * 6 - a * 5;
        const r = 0.65 + 0.05 * Math.sin(b * 20);
        x = Math.cos(ang) * r; z = Math.sin(ang) * r; y = TIP_H + c * BODY_H;
      } else if (fx === 'speed') {
        const ang = a * Math.PI * 2 + t * 3;
        const r = 0.9 + ((t * 2 + b) % 1) * 0.9;
        x = Math.cos(ang) * r; z = Math.sin(ang) * r; y = 0.3 + c * 1.5;
      } else {   // sparkle / rainbow: twinkling cloud around the dreidel
        const ang = a * Math.PI * 2 + t * (0.8 + b);
        const r = 0.6 + b * 0.7;
        x = Math.cos(ang) * r; z = Math.sin(ang) * r; y = 0.2 + c * 2 + Math.sin(t * 3 + a * 10) * 0.1;
      }
      pos.setXYZ(i, center.x + x, y, center.z + z);
    }
    pos.needsUpdate = true;
  }

  // ---------- Scene ----------
  function init(el) {
    container = el;
    if (!T) return false;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(38, 1, 0.1, 100);

    const pm = new T.PMREMGenerator(renderer);
    envTex = pm.fromEquirectangular(envTexture()).texture;
    scene.environment = envTex;

    scene.add(new T.HemisphereLight(0xffe9c4, 0x0b1630, 0.9));
    const spot = new T.SpotLight(0xfff1d6, 3.2, 0, 0.62, 0.65, 0);
    spot.position.set(0.6, 9, 2.2);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.radius = 4;
    scene.add(spot, spot.target);
    const fill = new T.DirectionalLight(0x8fb0ff, 0.5);
    fill.position.set(-5, 4, -3);
    scene.add(fill);
    const warm = new T.PointLight(0xffb15c, 0.9, 0, 0);   // candle glow from the head of the table
    warm.position.set(0, 3, -5);
    scene.add(warm);

    feltMat = new T.MeshPhysicalMaterial({ color: 0xffffff, map: feltTexture(), roughness: 1, sheen: 1, sheenColor: new T.Color('#7fe0a8'), sheenRoughness: 0.55 });

    pivot = new T.Group();
    pivot.scale.setScalar(SCALE);
    flip = new T.Group();
    pivot.add(flip);
    scene.add(pivot);

    shadowDisc = new T.Mesh(new T.CircleGeometry(0.75, 32), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.003;
    scene.add(shadowDisc);

    particles = buildParticles();
    scene.add(particles);

    buildTable();
    setSkin(skinId, true);

    new ResizeObserver(resize).observe(el);
    resize();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) lastT = performance.now(); });
    running = true;
    lastT = performance.now();
    requestAnimationFrame(loop);

    if (document.fonts && document.fonts.load) {
      document.fonts.load('190px "Suez One"').then(() => { fontReady = true; setSkin(skinId, true); }).catch(() => {});
    }
    return true;
  }

  function buildTable() {
    for (const o of [table, rail, trim, vignette]) if (o) { scene.remove(o); o.geometry.dispose(); }
    const felt = new T.CircleGeometry(1, 96);
    table = new T.Mesh(felt, feltMat);
    table.rotation.x = -Math.PI / 2;
    table.scale.set(rx, rz, 1);
    table.receiveShadow = true;
    scene.add(table);

    const ring = (r1, r2, y) => {
      const pts = [];
      for (let i = 0; i < 128; i++) { const a = i / 128 * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * r1, y, Math.sin(a) * r2)); }
      return new T.CatmullRomCurve3(pts, true);
    };
    // Spotlight pool: darker toward the rail
    const vc = canvas(256), vg = vc.getContext('2d');
    const grd = vg.createRadialGradient(128, 128, 20, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.05)'); grd.addColorStop(1, 'rgba(0,10,5,0.55)');
    vg.fillStyle = grd; vg.fillRect(0, 0, 256, 256);
    vignette = new T.Mesh(new T.CircleGeometry(1, 96), new T.MeshBasicMaterial({ map: tex(vc), transparent: true, depthWrite: false }));
    vignette.rotation.x = -Math.PI / 2; vignette.position.y = 0.002; vignette.scale.set(rx, rz, 1);
    scene.add(vignette);

    rail = new T.Mesh(new T.TubeGeometry(ring(rx + 0.2, rz + 0.2, 0.12), 200, 0.26, 18, true),
      new T.MeshPhysicalMaterial({ color: new T.Color('#0f1c46'), roughness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.45, envMapIntensity: 0.5 }));
    rail.castShadow = true; rail.receiveShadow = true;
    scene.add(rail);
    trim = new T.Mesh(new T.TubeGeometry(ring(rx - 0.03, rz - 0.03, 0.035), 200, 0.05, 8, true),
      new T.MeshStandardMaterial({ color: new T.Color('#e9b949'), metalness: 1, roughness: 0.28, envMapIntensity: 1.3 }));
    scene.add(trim);
  }

  function resize() {
    if (!renderer) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h;
    const portrait = h > w * 1.05;
    const nrx = portrait ? 2.5 : 3.7, nrz = portrait ? 3.4 : 2.45;
    if (nrx !== rx || nrz !== rz) { rx = nrx; rz = nrz; buildTable(); }
    fitCamera();
    listeners.layout.forEach(f => f());
  }

  // Back the camera off until the whole rail fits on screen, with room for the seat plates.
  function fitCamera() {
    const elev = camera.aspect < 1 ? 1.12 : 1.1;    // radians above the table
    const dir = new T.Vector3(0, Math.sin(elev), Math.cos(elev));
    const margin = camera.aspect < 1 ? 0.9 : 0.86;
    const pts = [];
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * (rx + 0.45), 0.2, Math.sin(a) * (rz + 0.45))); }
    pts.push(new T.Vector3(0, FULL_H * SCALE, 0));
    let lo = 3, hi = 40;
    for (let it = 0; it < 30; it++) {
      const d = (lo + hi) / 2;
      camera.position.copy(dir).multiplyScalar(d);
      camera.lookAt(0, 0.25, 0);
      camera.updateMatrixWorld(); camera.updateProjectionMatrix();
      const fits = pts.every(p => { const v = p.clone().project(camera); return Math.abs(v.x) <= margin && Math.abs(v.y) <= margin; });
      if (fits) hi = d; else lo = d;
    }
    camera.position.copy(dir).multiplyScalar(hi);
    camera.lookAt(0, 0.25, 0);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  }

  function getSkin(id) { return C.skins.find(s => s.id === id) || C.skins[0]; }

  function setSkin(id, force) {
    if (!scene) { skinId = id; return; }
    if (id === skinId && model && !force) return;
    skinId = id;
    if (model) { flip.remove(model); disposeTree(model); }
    model = buildModel(getSkin(id));
    flip.add(model);
  }
  function disposeTree(o) {
    o.traverse(n => { if (n.geometry) n.geometry.dispose(); });
  }
  function setLetters(isr) {
    if (isr === inIsrael) return;
    inIsrael = isr;
    if (scene) setSkin(skinId, true);
  }

  // ---------- Animation ----------
  const ease = {
    outPow: (u, p) => 1 - Math.pow(1 - u, p),
    inQuad: u => u * u,
    inOut: u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2,
  };
  const qYaw = new T.Quaternion(), qTilt = new T.Quaternion(), vAxis = new T.Vector3();
  const tmpV = new T.Vector3(), tmpM = new T.Matrix4();
  const HULL = (() => {
    const p = [new T.Vector3(0, 0, 0), new T.Vector3(0, FULL_H, 0)];
    for (const y of [TIP_H, TOP_Y]) for (const x of [-W / 2, W / 2]) for (const z of [-W / 2, W / 2]) p.push(new T.Vector3(x, y, z));
    for (const a of [0, 1, 2, 3]) p.push(new T.Vector3(Math.cos(a * Math.PI / 2) * KNOB_R, TOP_Y + HANDLE_H, Math.sin(a * Math.PI / 2) * KNOB_R));
    return p;
  })();

  function setPose(yaw, tiltAxisAngle, tilt, x, z, upside) {
    qYaw.setFromAxisAngle(vAxis.set(0, 1, 0), yaw);
    vAxis.set(Math.cos(tiltAxisAngle), 0, Math.sin(tiltAxisAngle));
    qTilt.setFromAxisAngle(vAxis, -tilt);
    pivot.quaternion.copy(qTilt).multiply(qYaw);
    flip.rotation.x = upside ? Math.PI : 0;
    flip.position.y = upside ? FULL_H : 0;
    flip.updateMatrix();
    // Rest on the lowest point of the model so it never sinks into the felt.
    tmpM.makeRotationFromQuaternion(pivot.quaternion).multiply(flip.matrix);
    let minY = Infinity;
    for (const p of HULL) { tmpV.copy(p).applyMatrix4(tmpM); if (tmpV.y < minY) minY = tmpV.y; }
    // Keep the middle of the body over (x, z), so it falls in place instead of toward the rail.
    tmpV.set(0, BODY_Y, 0).applyMatrix4(tmpM);
    pivot.position.set(x - tmpV.x * SCALE, -minY * SCALE, z - tmpV.z * SCALE);
    shadowDisc.position.x = x; shadowDisc.position.z = z;
    shadowDisc.material.opacity = 0.24 * Math.cos(Math.min(tilt, Math.PI / 2));
  }

  // Spin and land on `letter`. Returns a promise that resolves when it lands.
  function spin({ letter, grade = 'good', upside = false, seed = 1 }) {
    const cfg = C.spin[grade] || C.spin.good;
    const R = rand(seed);
    const k = Math.max(0, C.letters.indexOf(letter));
    // Which face ends up on top: after flipping, faces 0 and 2 swap.
    const faceAngle = upside ? [Math.PI, Math.PI / 2, 0, Math.PI * 1.5][k] : FACE_ANGLE[k];
    const yawEnd0 = -faceAngle;
    const startYaw = anim && anim.kind === 'idle' ? anim.yaw : idleYaw;
    const turns = cfg.turns + Math.floor(R() * 2);
    const delta = ((yawEnd0 - startYaw) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const total = turns * Math.PI * 2 + delta;
    const driftAng = R() * Math.PI * 2;
    const skin = getSkin(skinId);
    setupParticles(skin.fx);
    return new Promise(resolve => {
      anim = {
        kind: 'spin', t0: performance.now(), T: cfg.ms, F: C.spin.fallMs, S: skin.fx === 'boing' ? 650 : 380,
        startYaw, total, wobble: cfg.wobble, drift: cfg.drift, driftAng, upside, fx: skin.fx,
        precTurns: 2 + R() * 2, resolve, done: false,
      };
    });
  }

  function standUp() {
    const from = pivot.quaternion.clone();
    anim = { kind: 'stand', t0: performance.now(), from, x0: pivot.position.x, z0: pivot.position.z, upside: flip.rotation.x !== 0 };
  }

  function idle() {
    anim = { kind: 'idle', yaw: idleYaw };
    setPose(idleYaw, 0, 0, 0, 0, false);
  }

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    step(now, dt);
    renderer.render(scene, camera);
  }

  function step(now, dt) {
    if (!anim) idle();
    if (anim.kind === 'idle') {
      anim.yaw += dt * 0.7;
      idleYaw = anim.yaw;
      setPose(anim.yaw, 0, 0.02 * Math.sin(now / 700), 0, 0, false);
      model && (model.position.y = 0);
      updateParticles(null);
      return;
    }
    if (anim.kind === 'stand') {
      const u = Math.min(1, (now - anim.t0) / 420);
      const e = ease.inOut(u);
      pivot.quaternion.copy(anim.from).slerp(new T.Quaternion(), e);
      const x = anim.x0 * (1 - e), z = anim.z0 * (1 - e);
      const yaw = new T.Euler().setFromQuaternion(pivot.quaternion, 'YXZ').y;
      if (u >= 1) { idleYaw = yaw; anim = { kind: 'idle', yaw }; setPose(yaw, 0, 0, 0, 0, false); return; }
      // Lift a little while it rights itself
      pivot.position.set(x, (0.25 * Math.sin(Math.PI * e) + 0.45 * (1 - e)) * SCALE, z);
      shadowDisc.position.x = x; shadowDisc.position.z = z;
      return;
    }
    if (anim.kind === 'spin') {
      const a = anim, t = now - a.t0, total = a.T + a.F;
      const u = Math.min(1, t / total);
      const yaw = a.startYaw + a.total * ease.outPow(u, 2.6);
      let tilt, axis;
      const ts = Math.min(1, t / a.T);
      const prec = -a.precTurns * Math.PI * 2 * Math.pow(1 - ts, 1.5);   // ends at 0 → axis = X
      if (t < a.T) {
        tilt = a.wobble * 0.35 + (a.wobble * 1.6 + 0.1) * Math.pow(ts, 3);
        if (a.fx === 'flutter') tilt += 0.05 * Math.sin(t / 60);
        axis = prec;
      } else if (t < total) {
        const s = (t - a.T) / a.F;
        const startTilt = a.wobble * 0.35 + (a.wobble * 1.6 + 0.1);
        tilt = startTilt + (Math.PI / 2 - startTilt) * ease.inQuad(s);
        if (a.fx === 'flutter') tilt -= 0.12 * Math.sin(s * Math.PI) ;
        axis = 0;
      } else {
        const s = (t - total) / a.S;
        const amp = a.fx === 'boing' ? 0.35 : 0.12;
        tilt = Math.PI / 2 - amp * Math.exp(-6 * s) * Math.abs(Math.sin(s * 14));
        axis = 0;
        if (s >= 1 && !a.done) { a.done = true; tilt = Math.PI / 2; a.resolve(); }
      }
      const dr = a.drift * Math.pow(u, 1.4);
      setPose(yaw, axis, tilt, Math.cos(a.driftAng) * dr, Math.sin(a.driftAng) * dr, a.upside);
      // A cartoon squash on landing
      if (a.fx === 'boing' && t > total) {
        const s = (t - total) / a.S;
        const sq = 1 + 0.12 * Math.exp(-5 * s) * Math.sin(s * 18);
        model.scale.set(1 / sq, sq, 1 / sq);
      } else model.scale.set(1, 1, 1);
      const energy = t < total ? Math.min(1, t / 300) * (1 - Math.max(0, (t - a.T) / a.F) * 0.6) : Math.max(0, 1 - (t - total) / 600);
      updateParticles(a.fx, t / 1000, energy, pivot.position);
      if (a.done) { a.kind = 'landed'; }
      return;
    }
    if (anim.kind === 'landed') {
      const t = (now - anim.t0 - anim.T - anim.F) / 1000;
      updateParticles(anim.fx, t + (anim.T + anim.F) / 1000, Math.max(0, 1 - (t * 1000 - anim.S) / 600), pivot.position);
    }
  }

  // ---------- Screen positions for the HTML overlay ----------
  function project(x, y, z) {
    const v = new T.Vector3(x, y, z).project(camera);
    return { x: (v.x + 1) / 2 * container.clientWidth, y: (1 - v.y) / 2 * container.clientHeight };
  }
  // n seats around the rail, seat 0 nearest the viewer, going clockwise.
  function seatAnchors(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + i * Math.PI * 2 / n;
      out.push(project(Math.cos(a) * (rx + 0.2), 0.2, Math.sin(a) * (rz + 0.2)));
    }
    return out;
  }
  function centerScreen() { return project(0, 0.8, 0); }
  function tableCenter() { return project(0, 0, 0); }
  function headScreen() { return project(0, 0.3, -(rz + 0.2)); }
  function onLayout(f) { listeners.layout.push(f); }

  // ---------- Skin thumbnails for the picker ----------
  let thumbR = null;
  function thumbnail(id, size = 140) {
    const key = 'thumb-' + id + (inIsrael ? 'p' : 's') + (fontReady ? 'f' : '');
    if (texCache[key]) return texCache[key];
    if (!T) return '';
    try {
      if (!thumbR) {
        thumbR = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        thumbR.outputColorSpace = T.SRGBColorSpace;
        thumbR.toneMapping = T.ACESFilmicToneMapping;
      }
      thumbR.setPixelRatio(1);
      thumbR.setSize(size, size, false);
      const sc = new T.Scene();
      const pm = new T.PMREMGenerator(thumbR);
      sc.environment = pm.fromEquirectangular(envTexture()).texture;
      sc.add(new T.HemisphereLight(0xffe9c4, 0x0b1630, 1.1));
      const dl = new T.DirectionalLight(0xfff1d6, 2.4); dl.position.set(2, 4, 3); sc.add(dl);
      const cam = new T.PerspectiveCamera(32, 1, 0.1, 50);
      cam.position.set(2.4, 2.4, 3.6); cam.lookAt(0, 1.0, 0);
      const m = buildModel(getSkin(id));
      m.rotation.y = -0.55;
      m.rotation.z = 0.12;
      sc.add(m);
      thumbR.render(sc, cam);
      const url = thumbR.domElement.toDataURL('image/png');
      disposeTree(m);
      return (texCache[key] = url);
    } catch (e) { return ''; }
  }

  return {
    init, setSkin, setLetters, spin, idle, standUp, seatAnchors, centerScreen, tableCenter, headScreen, onLayout, thumbnail,
    get ready() { return !!renderer; },
  };
})();
