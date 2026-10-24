/* ============================================
   MACK-A-BEE DREIDEL — Procedural graphics helpers
   Everything the 3D scenes need that would normally come from image
   files is generated here: noise, surface relief (normal maps) made
   from height fields, a softly lit room for reflections, and a soft
   contact shadow. Shared by the dreidels, the table and Mack.
   ============================================ */
const Gfx = (function () {
  const T = window.THREE;

  // ---------- Noise ----------
  const perm = new Uint8Array(512);
  (function seed(s) {
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  })(1337);
  const fade = t => t * t * (3 - 2 * t);
  function hash(x, y) { return perm[(perm[x & 255] + y) & 511] / 255; }
  // Smooth value noise in [0, 1]; `period` makes it tile.
  function noise(x, y, period = 256) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = hash(x0, y0), b = hash(x1, y0), c = hash(x0, y1), d = hash(x1, y1);
    const u = fade(xf), v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // Fractal noise in [0, 1]. Frequencies are kept whole so the result tiles across `size`.
  function fbm(x, y, oct = 4, freq = 4) {
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < oct; o++) {
      const f = freq << o;
      sum += noise(x * f, y * f, f) * amp;
      norm += amp; amp *= 0.5;
    }
    return sum / norm;
  }

  // ---------- Canvas & textures ----------
  function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, { srgb = true, repeat = null, nearest = false, aniso = 8 } = {}) {
    const t = new T.CanvasTexture(c);
    if (srgb) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    if (nearest) { t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false; }
    else t.anisotropy = aniso;
    return t;
  }
  // Fill a canvas from a per-pixel function returning [r, g, b] (0–255).
  function paint(size, fn) {
    const c = canvas(size), g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const [r, gg, b] = fn(x / size, y / size, x, y);
      const i = (y * size + x) * 4;
      d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  const mix = (a, b, t) => a + (b - a) * t;
  const mixRGB = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  // ---------- Height fields → normal maps ----------
  // Read a canvas's brightness (or alpha) into a Float32Array of 0–1 heights.
  function heightsFrom(c, channel = 'alpha') {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const out = new Float32Array(c.width * c.height);
    for (let i = 0; i < out.length; i++) out[i] = channel === 'alpha' ? d[i * 4 + 3] / 255 : d[i * 4] / 255;
    return out;
  }
  // Separable box blur, run twice (close to a gaussian). Clamps at the edges.
  function blur(h, size, r) {
    if (r < 1) return h;
    const tmp = new Float32Array(h.length), out = new Float32Array(h.length);
    const pass = (src, dst, horiz) => {
      for (let a = 0; a < size; a++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) { const b = Math.min(size - 1, Math.max(0, k)); acc += horiz ? src[a * size + b] : src[b * size + a]; }
        for (let b = 0; b < size; b++) {
          const i = horiz ? a * size + b : b * size + a;
          dst[i] = acc / (2 * r + 1);
          const add = Math.min(size - 1, b + r + 1), sub = Math.max(0, b - r);
          acc += (horiz ? src[a * size + add] : src[add * size + a]) - (horiz ? src[a * size + sub] : src[sub * size + a]);
        }
      }
    };
    pass(h, tmp, true); pass(tmp, out, false);
    pass(out, tmp, true); pass(tmp, out, false);
    return out;
  }
  // Tangent-space normal map (OpenGL convention, as three.js expects). `wrap` for tiling surfaces.
  function normalMap(h, size, strength = 2, wrap = false) {
    const c = canvas(size), g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
    const at = (x, y) => {
      if (wrap) { x = (x + size) % size; y = (y + size) % size; }
      else { x = Math.max(0, Math.min(size - 1, x)); y = Math.max(0, Math.min(size - 1, y)); }
      return h[y * size + x];
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;   // image y runs down, texture v runs up
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  // Greyscale canvas from 0–1 values (for roughness maps; three reads the green channel).
  function greyCanvas(vals, size) {
    const c = canvas(size), g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
    for (let i = 0; i < vals.length; i++) { const v = Math.max(0, Math.min(255, vals[i] * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---------- A softly lit room, for reflections on metal, glass and lacquer ----------
  const envCache = new WeakMap();
  function roomEnvironment(renderer) {
    if (envCache.has(renderer)) return envCache.get(renderer);
    const sc = new T.Scene();
    const glow = (r, g, b, k) => new T.MeshBasicMaterial({ color: new T.Color(r * k, g * k, b * k), side: T.DoubleSide });
    const room = new T.Mesh(new T.BoxGeometry(20, 12, 20), new T.MeshBasicMaterial({ color: new T.Color(0.06, 0.07, 0.14), side: T.BackSide }));
    sc.add(room);
    const panel = (w, h, mat, pos, rot) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), mat); m.position.set(...pos); m.rotation.set(...rot); sc.add(m); };
    panel(9, 9, glow(1, 0.95, 0.85, 3.2), [0, 5.9, 0], [Math.PI / 2, 0, 0]);          // big warm softbox overhead
    panel(5, 3.5, glow(0.8, 0.88, 1, 2.2), [-9.9, 2.5, -1], [0, Math.PI / 2, 0]);      // cool window, left
    panel(3, 4, glow(1, 0.85, 0.65, 1.8), [9.9, 2, 3], [0, -Math.PI / 2, 0]);          // warm lamp, right
    panel(14, 0.7, glow(1, 0.62, 0.25, 4.5), [0, 1.6, -9.9], [0, 0, 0]);               // a row of candles behind
    panel(20, 20, glow(0.04, 0.1, 0.07, 1), [0, -5.9, 0], [-Math.PI / 2, 0, 0]);       // dim felt below
    const pm = new T.PMREMGenerator(renderer);
    const env = pm.fromScene(sc, 0.035).texture;
    pm.dispose();
    envCache.set(renderer, env);
    return env;
  }

  // Soft round shadow for under objects.
  let contactTex = null;
  function contactShadow() {
    if (contactTex) return contactTex;
    const c = canvas(128), g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(0,0,0,0.75)'); r.addColorStop(0.45, 'rgba(0,0,0,0.35)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return (contactTex = tex(c));
  }

  // A soft glowing dot (for sparkles, candle halos, neon glow).
  let glowTex = null;
  function glowSprite() {
    if (glowTex) return glowTex;
    const c = canvas(128), g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,0.7)'); r.addColorStop(0.5, 'rgba(255,255,255,0.18)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return (glowTex = tex(c));
  }

  return { noise, fbm, canvas, tex, paint, mix, mixRGB, hexRGB, heightsFrom, blur, normalMap, greyCanvas, roomEnvironment, contactShadow, glowSprite };
})();
