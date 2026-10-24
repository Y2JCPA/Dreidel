/* ============================================
   MACK-A-BEE DREIDEL — Dreidel models
   One smooth dreidel shape for every skin: a rounded-square body that
   flows into a curved tip, with a lathe-turned handle and knob on top.
   Each face gets its own texture with the letter carved, engraved,
   stamped, printed, etched or glowing, depending on the skin, plus a
   normal map so the letters and surfaces (wood grain, brushed metal,
   stone, honeycomb, crinkled foil...) catch the light. All generated
   in code; no image files.
   DreidelModel.build(skin, inIsrael) → THREE.Group with the tip at the origin.
   ============================================ */
const DreidelModel = (function () {
  const T = window.THREE;
  const G = Gfx;

  // Proportions (model units)
  const W = 0.9, HALF = W / 2, TIP_H = 0.58, BODY_H = 1.0, TOP_R = 0.07;
  const TOP_Y = TIP_H + BODY_H, BODY_Y = TIP_H + BODY_H / 2;
  const HANDLE_H = 0.7, FULL_H = TOP_Y + HANDLE_H;
  const FACE_ANGLE = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  const TEX = 384;
  const FONT = '"Suez One", "Frank Ruhl Libre", "David", serif';
  let fontReady = false;
  const cache = {};

  // ---------- Geometry ----------
  // Rounded-square cross-section, unit half-size. Each point knows which face it belongs to.
  function crossSection(c, Ns, Nc) {
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const phi = k * Math.PI / 2;
      const n = [Math.sin(phi), Math.cos(phi)], t = [Math.cos(phi), -Math.sin(phi)];
      for (let i = 0; i <= Ns; i++) {
        const x = -(1 - c) + 2 * (1 - c) * i / Ns;
        pts.push({ x: n[0] + t[0] * x, z: n[1] + t[1] * x, nx: n[0], nz: n[1], side: k, u: i / Ns });
      }
      const cx = (n[0] + t[0]) * (1 - c), cz = (n[1] + t[1]) * (1 - c);
      for (let j = 1; j < Nc; j++) {
        const psi = phi + (Math.PI / 2) * j / Nc;
        pts.push({ x: cx + c * Math.sin(psi), z: cz + c * Math.cos(psi), nx: Math.sin(psi), nz: Math.cos(psi), side: -1, u: 0 });
      }
    }
    let len = 0;
    pts.forEach((p, i) => { if (i) len += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); p.perim = len; });
    const total = len + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
    pts.forEach(p => { p.perim /= total; });
    return pts;
  }

  // Body + tip as one lofted surface. Groups 0–3 are the four lettered faces, group 4 the rest.
  function loftGeometry({ corner = 0.2, Ns = 6, Nc = 6, tipRings = 14, lump = 0 } = {}) {
    const pts = crossSection(corner, Ns, Nc), M = pts.length;
    const rings = [];
    for (let i = 0; i < tipRings; i++) {
      const t = i / tipRings, f = 1 - Math.pow(1 - t, 1.35);
      const ds = HALF * 1.35 * Math.pow(1 - t, 0.35) / TIP_H;
      rings.push({ y: t * TIP_H, s: Math.max(1e-4, HALF * f), nh: 1, ny: -ds });
    }
    const bodyStart = rings.length;
    rings.push({ y: TIP_H, s: HALF, nh: 1, ny: 0 });
    rings.push({ y: TOP_Y - TOP_R, s: HALF, nh: 1, ny: 0 });
    const bodyEnd = rings.length - 1;
    for (let j = 1; j <= 6; j++) {
      const a = (j / 6) * Math.PI / 2;
      rings.push({ y: TOP_Y - TOP_R + TOP_R * Math.sin(a), s: HALF - TOP_R + TOP_R * Math.cos(a), nh: Math.cos(a), ny: Math.sin(a) });
    }
    const faceV = y => (y - TIP_H) / (TOP_Y - TOP_R - TIP_H);
    const groups = [[], [], [], [], []];   // each: flat arrays [px,py,pz,nx,ny,nz,u,v] per vertex
    const vert = (r, p, side, perimOverride) => {
      const R = rings[r];
      let x = p.x * R.s, z = p.z * R.s, y = R.y;
      let nx = p.nx * R.nh, ny = R.ny, nz = p.nz * R.nh;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      if (lump) {   // hand-made unevenness, a function of position so seams stay closed
        const o = (G.noise(x * 7 + 11, y * 7 + z * 5) - 0.5) * lump;
        x += nx * o; y += ny * o; z += nz * o;
      }
      const u = side >= 0 ? p.u : (perimOverride != null ? perimOverride : p.perim) * 4;
      const v = side >= 0 ? faceV(R.y) : R.y / TOP_Y;
      return [x, y, z, nx, ny, nz, u, v];
    };
    const tri = (g, a, b, c) => {
      // Keep triangles facing outward.
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const avg = [a[3] + b[3] + c[3], a[4] + b[4] + c[4], a[5] + b[5] + c[5]];
      if (n[0] * avg[0] + n[1] * avg[1] + n[2] * avg[2] < 0) [b, c] = [c, b];
      groups[g].push(...a, ...b, ...c);
    };
    for (let r = 0; r < rings.length - 1; r++) {
      for (let j = 0; j < M; j++) {
        const a = pts[j], b = pts[(j + 1) % M];
        const wrap = j === M - 1 ? 1 : null;
        const isFace = r >= bodyStart && r + 1 <= bodyEnd && a.side >= 0 && a.side === b.side;
        const g = isFace ? a.side : 4, sd = isFace ? a.side : -1;
        const A0 = vert(r, a, sd), B0 = vert(r, b, sd, wrap), A1 = vert(r + 1, a, sd), B1 = vert(r + 1, b, sd, wrap);
        if (r === 0) { tri(g, A0, B1, A1); continue; }   // the very tip is a point
        tri(g, A0, B0, B1); tri(g, A0, B1, A1);
      }
    }
    // Flat top
    const last = rings.length - 1, top = [0, TOP_Y, 0, 0, 1, 0, 0.5, 1];
    for (let j = 0; j < M; j++) tri(4, vert(last, pts[j], -1), vert(last, pts[(j + 1) % M], -1), top);

    const all = [].concat(...groups);
    const n = all.length / 8;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pos.set(all.slice(i * 8, i * 8 + 3), i * 3);
      nor.set(all.slice(i * 8 + 3, i * 8 + 6), i * 3);
      uv.set(all.slice(i * 8 + 6, i * 8 + 8), i * 2);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    let start = 0;
    groups.forEach((g, i) => { const cnt = g.length / 8; geo.addGroup(start, cnt, i); start += cnt; });
    return geo;
  }
  // Width of a face's flat part vs. its height, so letters aren't stretched.
  const faceAspect = c => (2 * (1 - c) * HALF) / (TOP_Y - TOP_R - TIP_H);

  // Lathe-turned handle: collar, slender stem, round knob.
  function handleGeometry(style) {
    const P = [[0, 0], [0.24, 0], [0.25, 0.025], [0.21, 0.06], [0.12, 0.095], [0.082, 0.16], [0.07, 0.3], [0.068, 0.4], [0.078, 0.47], [0.11, 0.52], [0.128, 0.575], [0.12, 0.63], [0.09, 0.675], [0.05, 0.695], [0, 0.7]];
    const curve = new T.SplineCurve(P.map(p => new T.Vector2(p[0], p[1])));
    const pts = curve.getPoints(48);
    pts[0].x = 0; pts[pts.length - 1].x = 0;
    return new T.LatheGeometry(pts, style === 'gem' ? 8 : style === 'paper' ? 10 : 40);
  }

  // Push every vertex out along its normal (outline shells for cartoon looks).
  function shell(geo, d) {
    const g = geo.clone(), p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d);
    return g;
  }

  // ---------- Surfaces: base color + height for each style ----------
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  function surface(skin, S = TEX) {
    const key = 'surf-' + skin.id + '-' + S;
    if (cache[key]) return cache[key];
    const base = G.hexRGB(skin.body), edge = G.hexRGB(skin.edge);
    const H = new Float32Array(S * S);
    let color;
    const st = skin.style;
    const scale = (rgb, k) => rgb.map(v => Math.min(255, v * k));
    if (st === 'real') {
      const light = scale(base, 1.16), dark = scale(base, 0.7);
      color = G.paint(S, (u, v, x, y) => {
        const warp = G.fbm(u, v, 4, 2);
        const g = u * 16 + warp * 1.6;                      // fine, gently wavy grain lines
        const f = g - Math.floor(g);
        const streak = smooth(0.0, 0.05, f) * (1 - smooth(0.1, 0.22, f));
        const fib = G.noise(u * 192, v * 8, 192);
        const t = clamp01(streak * 0.45 + fib * 0.18 + (warp - 0.5) * 0.7 + 0.15);
        H[y * S + x] = 1 - streak * 0.5 - fib * 0.3;
        return G.mixRGB(light, dark, t);
      });
    } else if (st === 'clay') {
      color = G.paint(S, (u, v, x, y) => {
        const n = G.fbm(u, v, 5, 3), sp = G.noise(u * 90, v * 90, 90);
        H[y * S + x] = n * 0.8 + sp * 0.25;
        return G.mixRGB(scale(base, 0.82), scale(base, 1.12), clamp01(n * 1.2 - 0.1 + (sp > 0.85 ? -0.3 : 0)));
      });
    } else if (st === 'stone') {
      color = G.paint(S, (u, v, x, y) => {
        const n = G.fbm(u, v, 5, 3), sp = G.noise(u * 120, v * 120, 120), pit = sp > 0.9 ? 1 : 0;
        H[y * S + x] = n * 0.6 - pit * 0.6;
        return G.mixRGB(scale(base, 0.86), scale(base, 1.06), clamp01(n * 1.3 - 0.2)).map(c => c * (pit ? 0.75 : 1));
      });
    } else if (st === 'metal') {
      color = G.paint(S, (u, v, x, y) => {
        const s = G.noise(u * 3, v * 220, 220) * 0.6 + G.noise(u * 40, v * 400, 400) * 0.4;
        H[y * S + x] = s * 0.5;
        return scale(base, 0.86 + s * 0.24);
      });
    } else if (st === 'foil') {
      color = G.paint(S, (u, v, x, y) => {
        const r = 1 - Math.abs(2 * G.fbm(u, v, 4, 6) - 1);
        H[y * S + x] = r;
        return scale(base, 0.78 + r * 0.4);
      });
    } else if (st === 'paper') {
      color = G.paint(S, (u, v, x, y) => {
        const f = G.noise(u * 200, v * 200, 200), crease = Math.max(0, 1 - Math.abs(u - v) * 40) + Math.max(0, 1 - Math.abs(u + v - 1) * 40);
        H[y * S + x] = f * 0.15 - crease * 0.4;
        return scale(base, 0.95 + f * 0.06 - crease * 0.06);
      });
    } else if (st === 'hive') {
      const cells = 7, sq3 = Math.sqrt(3);
      color = G.paint(S, (u, v, x, y) => {
        // Hexagonal cells: distance to the nearest cell centre (flat-topped axial grid)
        const px = u * cells * 1.5, py = v * cells * sq3;
        let best = 9, id = 0;
        for (let qi = Math.floor(px / 1.5) - 1; qi <= Math.floor(px / 1.5) + 1; qi++) {
          for (let ri = Math.floor(py / sq3) - 1; ri <= Math.floor(py / sq3) + 2; ri++) {
            const cx = qi * 1.5, cy = ri * sq3 + (qi & 1 ? sq3 / 2 : 0);
            const d = Math.hypot(px - cx, py - cy);
            if (d < best) { best = d; id = qi * 31 + ri * 17; }
          }
        }
        const wall = smooth(0.7, 0.86, best);
        H[y * S + x] = wall;
        const tone = 0.85 + ((Math.sin(id * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.3;
        return G.mixRGB(scale(base, tone * (0.75 + 0.25 * best)), scale(edge, 1.1), wall * 0.6);
      });
    } else if (st === 'neon') {
      color = G.paint(S, (u, v) => scale(base, 0.9 + G.noise(u * 60, v * 60, 60) * 0.2));
    } else {
      // plastic, cartoon, anime, glass, gem: clean colour
      color = G.paint(S, (u, v, x, y) => { const n = G.noise(u * 50, v * 50, 50); H[y * S + x] = n * 0.05; return scale(base, 0.99 + n * 0.02); });
    }
    return (cache[key] = { color, H });
  }

  // How each style treats the letter: colour, relief and roughness.
  const LETTER = {
    real:    { relief: -0.9, blur: 3, rough: [0.42, 0.75], baseRelief: 0.25, normal: 3 },
    plastic: { relief: 0.25, blur: 2, rough: [0.25, 0.35], baseRelief: 0, normal: 2 },
    paper:   { relief: 0, blur: 1, rough: [0.95, 0.95], baseRelief: 0.6, normal: 3 },
    cartoon: { relief: 0, blur: 1, rough: [0.6, 0.6], baseRelief: 0, normal: 0 },
    anime:   { relief: 0, blur: 1, rough: [0.6, 0.6], baseRelief: 0, normal: 0 },
    clay:    { relief: -1.2, blur: 4, rough: [0.95, 0.9], baseRelief: 0.9, normal: 3 },
    metal:   { relief: -0.7, blur: 2, rough: [0.22, 0.55], baseRelief: 0.15, normal: 3 },
    foil:    { relief: 1.0, blur: 4, rough: [0.3, 0.3], baseRelief: 0.5, normal: 4 },
    glass:   { relief: -0.3, blur: 2, rough: [0.05, 0.55], baseRelief: 0, normal: 2 },
    gem:     { relief: -0.3, blur: 2, rough: [0.02, 0.5], baseRelief: 0, normal: 2 },
    neon:    { relief: -0.4, blur: 3, rough: [0.35, 0.5], baseRelief: 0, normal: 2 },
    hive:    { relief: 0.9, blur: 4, rough: [0.35, 0.6], baseRelief: 0.8, normal: 3 },
    stone:   { relief: -1.3, blur: 3, rough: [0.88, 0.95], baseRelief: 0.5, normal: 3 },
  };

  function drawGlyph(g, glyph, aspect, opts = {}) {
    const TEX = g.canvas.width;
    g.save();
    g.translate(TEX / 2, TEX / 2);
    g.scale(1, aspect);   // undo the face's stretch so the letter keeps its shape
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    // Hebrew letters sit small in their em box, so size them by their real outline
    g.font = `${opts.bold ? 'bold ' : ''}${Math.round((opts.size || 300) * TEX / 384 * 1.55)}px ${FONT}`;
    const mt = g.measureText(glyph);
    const y0 = ((mt.actualBoundingBoxAscent || 0) - (mt.actualBoundingBoxDescent || 0)) / 2;
    if (opts.stroke) { g.lineJoin = 'round'; g.lineWidth = opts.stroke * TEX / 512; g.strokeStyle = opts.strokeStyle; g.strokeText(glyph, 0, y0); }
    if (opts.fill) { g.fillStyle = opts.fill; g.fillText(glyph, (opts.dx || 0) * TEX / 512, y0 + (opts.dy || 0) * TEX / 512); }
    g.restore();
  }
  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.3 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }

  // Textures for one face: the surface (shifted so faces differ) with the letter worked into it.
  function faceMaps(skin, glyph, k, aspect, S = TEX) {
    const key = `face-${skin.id}-${glyph}-${k}-${fontReady ? 1 : 0}-${S}`;
    if (cache[key]) return cache[key];
    const surf = surface(skin, S), L = LETTER[skin.style] || LETTER.plastic;
    const off = Math.floor((k * 0.37) * S);
    // Colour: shifted surface, then the letter
    const c = G.canvas(S), g = c.getContext('2d');
    g.drawImage(surf.color, -off, 0); g.drawImage(surf.color, S - off, 0);
    // Letter mask (for relief and roughness)
    const m = G.canvas(S), mg = m.getContext('2d');
    drawGlyph(mg, glyph, aspect, { fill: '#fff', bold: skin.style === 'cartoon' });
    const st = skin.style, ink = skin.letter;
    if (st === 'real') {
      drawGlyph(g, glyph, aspect, { fill: 'rgba(40,18,6,0.35)', dx: 3, dy: 4 });
      drawGlyph(g, glyph, aspect, { fill: ink });
    } else if (st === 'paper') {
      g.globalAlpha = 0.8; drawGlyph(g, glyph, aspect, { fill: ink, dx: 2, dy: 3 });
      g.globalAlpha = 0.45; drawGlyph(g, glyph, aspect, { fill: ink, dx: -3, dy: -2 });
      g.globalAlpha = 1; drawGlyph(g, glyph, aspect, { stroke: 4, strokeStyle: ink });
    } else if (st === 'cartoon') {
      drawGlyph(g, glyph, aspect, { stroke: 30, strokeStyle: '#1a1a2e', fill: ink, bold: true });
    } else if (st === 'anime') {
      drawGlyph(g, glyph, aspect, { stroke: 18, strokeStyle: '#ffffff', fill: ink });
      g.fillStyle = '#fff'; const k5 = S / 512; star(g, 400 * k5, 90 * k5, 22 * k5); star(g, 110 * k5, 410 * k5, 14 * k5); star(g, 430 * k5, 380 * k5, 9 * k5);
    } else if (st === 'glass' || st === 'gem') {
      drawGlyph(g, glyph, aspect, { fill: 'rgba(255,255,255,0.75)' });
    } else if (st === 'neon') {
      g.save(); g.shadowColor = skin.edge; g.shadowBlur = 24; g.strokeStyle = skin.edge; g.lineWidth = 10;
      g.strokeRect(S * 0.035, S * 0.035, S * 0.93, S * 0.93); g.restore();
      g.save(); g.shadowColor = ink; g.shadowBlur = 30; drawGlyph(g, glyph, aspect, { fill: ink }); drawGlyph(g, glyph, aspect, { fill: '#e8ffff', size: 290 }); g.restore();
    } else if (st === 'stone' || st === 'clay') {
      drawGlyph(g, glyph, aspect, { fill: ink });
    } else if (st === 'metal') {
      drawGlyph(g, glyph, aspect, { fill: ink });
    } else if (st === 'foil') {
      drawGlyph(g, glyph, aspect, { stroke: 14, strokeStyle: 'rgba(110,62,18,0.85)' });
      drawGlyph(g, glyph, aspect, { fill: '#fff0b8' });
    } else if (st === 'hive') {
      drawGlyph(g, glyph, aspect, { fill: ink });
    } else {
      drawGlyph(g, glyph, aspect, { fill: ink });
    }
    if (st === 'stone') {   // chiselled margin around the face, like a Temple ashlar
      g.strokeStyle = 'rgba(90,70,40,0.35)'; g.lineWidth = S * 0.02; g.strokeRect(S * 0.043, S * 0.043, S * 0.914, S * 0.914);
    }
    // Relief: surface heights + letter (carved = negative, embossed = positive)
    let mask = G.heightsFrom(m);
    const soft = G.blur(mask, S, Math.max(1, Math.round(L.blur * S / TEX)));
    const Hh = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, sx = (x + off) % S;
      let h = surf.H[y * S + sx] * L.baseRelief + soft[i] * L.relief;
      if (st === 'stone') { const e = Math.min(x, y, S - 1 - x, S - 1 - y), m2 = S * 0.043; h -= e < m2 ? (1 - e / m2) * 0.8 : 0; }
      Hh[i] = h;
    }
    const normal = L.normal ? G.normalMap(Hh, S, L.normal) : null;
    const rough = G.greyCanvas(mask.map(a => L.rough[0] + (L.rough[1] - L.rough[0]) * a), S);
    let emissive = null;
    if (st === 'neon') emissive = c;
    return (cache[key] = { color: c, normal, rough, emissive });
  }

  function bodyMaps(skin, S = TEX) {
    const key = 'body-' + skin.id + '-' + S;
    if (cache[key]) return cache[key];
    const surf = surface(skin, S), L = LETTER[skin.style] || LETTER.plastic;
    const H = surf.H.map(h => h * L.baseRelief);
    return (cache[key] = { color: surf.color, normal: L.normal && L.baseRelief ? G.normalMap(H, S, L.normal, true) : null });
  }

  // ---------- Materials ----------
  let toonGrad3 = null, toonGrad2 = null;
  function toonGradient(steps) {
    const data = new Uint8Array(steps.length * 4);
    steps.forEach((v, i) => { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; });
    const t = new T.DataTexture(data, steps.length, 1, T.RGBAFormat);
    t.minFilter = t.magFilter = T.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  }

  // One material for a face (maps given) or for the body (maps from the surface).
  function material(skin, maps, part) {
    const st = skin.style;
    const map = maps.color ? G.tex(maps.color) : null;
    if (map && part === 'body') { map.wrapS = map.wrapT = T.RepeatWrapping; }
    const normalMap = maps.normal ? G.tex(maps.normal, { srgb: false }) : null;
    if (normalMap && part === 'body') { normalMap.wrapS = normalMap.wrapT = T.RepeatWrapping; }
    const roughnessMap = maps.rough ? G.tex(maps.rough, { srgb: false }) : null;
    const common = { map, normalMap, roughnessMap };
    switch (st) {
      case 'real':
        return new T.MeshPhysicalMaterial({ ...common, roughness: 1, clearcoat: 0.55, clearcoatRoughness: 0.25, envMapIntensity: 0.9 });
      case 'plastic':
        return new T.MeshPhysicalMaterial({ ...common, roughness: roughnessMap ? 1 : 0.28, clearcoat: 1, clearcoatRoughness: 0.08 });
      case 'paper':
        return new T.MeshStandardMaterial({ ...common, roughness: 1, flatShading: true });
      case 'cartoon':
        return new T.MeshToonMaterial({ map, gradientMap: toonGrad3 || (toonGrad3 = toonGradient([110, 190, 255])) });
      case 'anime':
        return new T.MeshToonMaterial({ map, gradientMap: toonGrad2 || (toonGrad2 = toonGradient([175, 255])) });
      case 'clay':
        return new T.MeshStandardMaterial({ ...common, roughness: roughnessMap ? 1 : 0.95 });
      case 'stone':
        return new T.MeshStandardMaterial({ ...common, roughness: roughnessMap ? 1 : 0.9 });
      case 'metal':
        return new T.MeshPhysicalMaterial({ ...common, metalness: 1, roughness: roughnessMap ? 1 : 0.24, clearcoat: skin.id === 'gold' ? 0.4 : 0.2, envMapIntensity: 1.25 });
      case 'foil':
        return new T.MeshStandardMaterial({ ...common, metalness: 1, roughness: 0.32, envMapIntensity: 1.35 });
      case 'glass':
        return new T.MeshPhysicalMaterial({ ...common, transmission: 1, thickness: 0.7, ior: 1.52, roughness: roughnessMap ? 1 : 0.03, attenuationColor: new T.Color('#d6efff'), attenuationDistance: 2.5, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.3, envMapIntensity: 2, specularIntensity: 1 });
      case 'gem':
        return new T.MeshPhysicalMaterial({ ...common, transmission: 1, thickness: 1.4, ior: 2.4, roughness: roughnessMap ? 1 : 0.01, attenuationColor: new T.Color('#bfe3ff'), attenuationDistance: 1.2, iridescence: 1, iridescenceIOR: 1.8, clearcoat: 1, flatShading: true, envMapIntensity: 3, specularIntensity: 1 });
      case 'neon':
        return new T.MeshPhysicalMaterial({ ...common, roughness: roughnessMap ? 1 : 0.3, clearcoat: 1, emissive: new T.Color(0xffffff), emissiveMap: maps.emissive ? G.tex(maps.emissive) : null, emissiveIntensity: maps.emissive ? 1.6 : 0 });
      case 'hive':
        return new T.MeshPhysicalMaterial({ ...common, roughness: roughnessMap ? 1 : 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.3, sheenColor: new T.Color('#ffd34d') });
      default:
        return new T.MeshStandardMaterial({ ...common, roughness: 0.5 });
    }
  }

  function handleMaterial(skin, S = TEX) {
    const st = skin.style, edge = new T.Color(skin.edge), body = new T.Color(skin.body);
    switch (st) {
      case 'real': return new T.MeshPhysicalMaterial({ color: edge, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2, map: G.tex(surface(skin, S).color) });
      case 'plastic': return new T.MeshPhysicalMaterial({ color: edge, roughness: 0.25, clearcoat: 1 });
      case 'paper': return new T.MeshStandardMaterial({ color: new T.Color('#efe6cf'), roughness: 1, flatShading: true });
      case 'cartoon': return new T.MeshToonMaterial({ color: edge, gradientMap: toonGrad3 || (toonGrad3 = toonGradient([110, 190, 255])) });
      case 'anime': return new T.MeshToonMaterial({ color: edge, gradientMap: toonGrad2 || (toonGrad2 = toonGradient([175, 255])) });
      case 'clay': return new T.MeshStandardMaterial({ color: edge, roughness: 0.95 });
      case 'stone': return new T.MeshStandardMaterial({ color: body, roughness: 0.85, map: G.tex(surface(skin, S).color) });
      case 'metal': return new T.MeshPhysicalMaterial({ color: edge.clone().lerp(body, 0.5), metalness: 1, roughness: 0.18, clearcoat: 0.3, envMapIntensity: 1.3 });
      case 'foil': return new T.MeshStandardMaterial({ color: new T.Color('#5a3416'), roughness: 0.55 });
      case 'glass': return new T.MeshPhysicalMaterial({ color: body, transmission: 1, thickness: 0.5, roughness: 0.05, ior: 1.5, envMapIntensity: 1.4 });
      case 'gem': return new T.MeshPhysicalMaterial({ color: body, transmission: 1, thickness: 0.6, roughness: 0, ior: 2.2, iridescence: 0.9, flatShading: true, envMapIntensity: 2 });
      case 'neon': return new T.MeshStandardMaterial({ color: new T.Color('#120d26'), emissive: edge, emissiveIntensity: 1.8, roughness: 0.3 });
      case 'hive': return new T.MeshPhysicalMaterial({ color: edge, roughness: 0.3, clearcoat: 0.8 });
      default: return new T.MeshStandardMaterial({ color: edge, roughness: 0.4 });
    }
  }

  // ---------- Blocky pixel dreidel ----------
  function pixelTex(draw) {
    const c = G.canvas(16), g = c.getContext('2d'); draw(g);
    return G.tex(c, { nearest: true });
  }
  function buildPixel(skin, inIsrael) {
    const grp = new T.Group();
    const shades = ['#4cb050', '#43a047', '#5cbf60', '#388e3c'];
    const grass = () => pixelTex(g => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = shades[(x * 7 + y * 13 + x * y) % 4]; g.fillRect(x, y, 1, 1); }
      g.fillStyle = '#2e7d32'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16);
    });
    const letterFace = glyph => pixelTex(g => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = shades[(x * 7 + y * 13 + x * y) % 4]; g.fillRect(x, y, 1, 1); }
      g.font = `bold 13px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#1b3d1d'; g.fillText(glyph, 9, 10); g.fillStyle = '#ffffff'; g.fillText(glyph, 8, 9);
      const d = g.getImageData(0, 0, 16, 16);   // hard pixels only
      for (let i = 0; i < d.data.length; i += 4) d.data[i + 3] = 255;
      g.putImageData(d, 0, 0);
    });
    const mat = t => new T.MeshLambertMaterial({ map: t });
    const L = CONFIG.letters.map(l => I18N.glyph(l, inIsrael));
    // BoxGeometry face order: +X, −X, +Y, −Y, +Z, −Z  →  faces 1, 3, top, bottom, 0, 2
    const body = new T.Mesh(new T.BoxGeometry(W, BODY_H, W), [mat(letterFace(L[1])), mat(letterFace(L[3])), mat(grass()), mat(grass()), mat(letterFace(L[0])), mat(letterFace(L[2]))]);
    body.position.y = BODY_Y; grp.add(body);
    const g2 = mat(grass());
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const s = W * (1 - (i + 1) / (steps + 0.6));
      const b = new T.Mesh(new T.BoxGeometry(s, TIP_H / steps, s), g2);
      b.position.y = TIP_H - (i + 0.5) * TIP_H / steps; grp.add(b);
    }
    const wood = new T.MeshLambertMaterial({ map: pixelTex(g => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = ['#8d6e63', '#795548', '#6d4c41'][(x + y * 3) % 3]; g.fillRect(x, y, 1, 1); } }) });
    const h = new T.Mesh(new T.BoxGeometry(0.18, HANDLE_H - 0.15, 0.18), wood); h.position.y = TOP_Y + (HANDLE_H - 0.15) / 2; grp.add(h);
    const k = new T.Mesh(new T.BoxGeometry(0.26, 0.2, 0.26), wood); k.position.y = TOP_Y + HANDLE_H - 0.1; grp.add(k);
    grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return grp;
  }

  // ---------- Build ----------
  const GEO = {};
  function geometryFor(style) {
    if (GEO[style]) return GEO[style];
    const opts = style === 'gem' ? { corner: 0.32, Ns: 1, Nc: 1, tipRings: 4 }
      : style === 'paper' ? { corner: 0.12, Ns: 2, Nc: 2, tipRings: 4 }
      : style === 'clay' ? { corner: 0.24, Ns: 8, Nc: 6, tipRings: 14, lump: 0.035 }
      : { corner: 0.2, Ns: 6, Nc: 6, tipRings: 14 };
    return (GEO[style] = { body: loftGeometry(opts), handle: handleGeometry(style), aspect: faceAspect(opts.corner) });
  }

  // `small` builds with low-resolution textures (for thumbnails): much faster.
  function build(skin, inIsrael, { small = false } = {}) {
    if (skin.style === 'pixel') return buildPixel(skin, inIsrael);
    const S = small ? 128 : TEX;
    const grp = new T.Group();
    const geo = geometryFor(skin.style);
    const glyphs = CONFIG.letters.map(l => I18N.glyph(l, inIsrael));
    const mats = glyphs.map((gl, k) => material(skin, faceMaps(skin, gl, k, geo.aspect, S), 'face'));
    mats.push(material(skin, bodyMaps(skin, S), 'body'));
    const body = new T.Mesh(geo.body, mats);
    body.castShadow = true;
    grp.add(body);
    const handle = new T.Mesh(geo.handle, handleMaterial(skin, S));
    handle.position.y = TOP_Y;
    handle.castShadow = true;
    grp.add(handle);
    if (skin.style === 'cartoon' || skin.style === 'anime') {
      const d = skin.style === 'cartoon' ? 0.035 : 0.022;
      const om = new T.MeshBasicMaterial({ color: new T.Color(skin.style === 'cartoon' ? '#1a1a2e' : '#3a2a7a'), side: T.BackSide });
      grp.add(new T.Mesh(shell(geo.body, d), om));
      const ho = new T.Mesh(shell(geo.handle, d * 0.8), om); ho.position.y = TOP_Y; grp.add(ho);
    }
    return grp;
  }

  // Points used to rest the dreidel on the felt (lowest point after rotation).
  const HULL = (() => {
    const p = [[0, 0, 0], [0, FULL_H, 0]];
    for (const y of [TIP_H, TOP_Y]) for (const x of [-HALF, HALF]) for (const z of [-HALF, HALF]) p.push([x * 0.94, y, z * 0.94]);
    for (const a of [0, 1, 2, 3]) p.push([Math.cos(a * Math.PI / 2) * 0.128, TOP_Y + 0.575, Math.sin(a * Math.PI / 2) * 0.128]);
    return p;
  })();

  // Generate a skin's textures ahead of time (they're cached), so its first spin doesn't stutter.
  function warm(skin, inIsrael) {
    if (skin.style === 'pixel') return;
    const geo = geometryFor(skin.style);
    CONFIG.letters.forEach((l, k) => faceMaps(skin, I18N.glyph(l, inIsrael), k, geo.aspect));
    bodyMaps(skin);
  }

  return {
    W, HALF, warm, TIP_H, BODY_H, BODY_Y, TOP_Y, FULL_H, FACE_ANGLE, HULL,
    build,
    setFontReady(v) { fontReady = v; },
    get fontReady() { return fontReady; },
  };
})();
