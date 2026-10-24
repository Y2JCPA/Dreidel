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
  const M = DreidelModel;
  const W = M.W, TIP_H = M.TIP_H, BODY_H = M.BODY_H, BODY_Y = M.BODY_Y, TOP_Y = M.TOP_Y, FULL_H = M.FULL_H;
  // Face k's outward normal angle, measured from +Z toward +X.
  const FACE_ANGLE = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  const SCALE = 1.3;   // dreidel size on the table

  let renderer, scene, camera, container, envTex = null;
  let table = null, rail = null, trim = null, vignette = null, track = null, feltMat = null, railMat = null, woodMat = null;
  let pivot, flip, model = null, particles = null, shadowDisc = null;
  let rx = 2.6, rz = 3.5;                  // table radii
  let skinId = 'wood', inIsrael = false;
  let anim = null;                         // current animation
  let idleYaw = 0, lastT = 0, running = false;
  const texCache = {};
  const listeners = { layout: [] };

  const rand = seed => () => {             // mulberry32: same seed → same spin everywhere
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const canvas = Gfx.canvas;
  const tex = (c, o = {}) => Gfx.tex(c, Object.assign({ aniso: 4 }, o, o.repeat ? { repeat: [o.repeat, o.repeat] } : {}));
  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.3 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }

  // ---------- Table surfaces ----------
  // Felt: green fibres, with a fuzzy relief map so the sheen catches the light.
  function feltMaps() {
    const S = 512;
    const H = new Float32Array(S * S);
    const color = Gfx.paint(S, (u, v, x, y) => {
      const n = Gfx.noise(u * 256, v * 256, 256), m = Gfx.fbm(u, v, 3, 8);
      H[y * S + x] = n * 0.8 + m * 0.2;
      return Gfx.mixRGB([26, 100, 64], [36, 122, 78], n * 0.7 + m * 0.3);
    });
    return { map: tex(color, { repeat: 6 }), normal: (() => { const t = Gfx.tex(Gfx.normalMap(H, S, 1.6, true), { srgb: false, repeat: [6, 6] }); return t; })() };
  }
  // Rail leather and racetrack wood.
  function leatherNormal() {
    const S = 256, H = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) H[y * S + x] = Gfx.fbm(x / S, y / S, 4, 16);
    return Gfx.tex(Gfx.normalMap(H, S, 2.2, true), { srgb: false, repeat: [24, 2] });
  }
  function woodRing() {
    const S = 512;
    return Gfx.tex(Gfx.paint(S, (u, v) => {
      const w = Gfx.fbm(u, v, 4, 2), g = v * 10 + w * 2.5, f = g - Math.floor(g);
      const streak = f < 0.12 ? 1 - f / 0.12 : 0;
      return Gfx.mixRGB([150, 92, 50], [92, 50, 24], Math.min(1, streak * 0.6 + w * 0.5));
    }), { repeat: [16, 1] });
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

    envTex = Gfx.roomEnvironment(renderer);
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

    const felt = feltMaps();
    feltMat = new T.MeshPhysicalMaterial({ color: 0xffffff, map: felt.map, normalMap: felt.normal, normalScale: new T.Vector2(0.6, 0.6), roughness: 1, sheen: 1, sheenColor: new T.Color('#86e8b0'), sheenRoughness: 0.5, envMapIntensity: 0.4 });
    railMat = new T.MeshPhysicalMaterial({ color: new T.Color('#101d4a'), roughness: 0.48, normalMap: leatherNormal(), normalScale: new T.Vector2(0.5, 0.5), clearcoat: 0.6, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: new T.Color('#3550a8'), envMapIntensity: 0.55 });
    woodMat = new T.MeshPhysicalMaterial({ map: woodRing(), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.9 });

    pivot = new T.Group();
    pivot.scale.setScalar(SCALE);
    flip = new T.Group();
    pivot.add(flip);
    scene.add(pivot);

    shadowDisc = new T.Mesh(new T.PlaneGeometry(2.2, 2.2), new T.MeshBasicMaterial({ map: Gfx.contactShadow(), transparent: true, opacity: 0.6, depthWrite: false }));
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
      document.fonts.load('190px "Suez One"').then(() => { M.setFontReady(true); setSkin(skinId, true); }).catch(() => {});
    }
    return true;
  }

  function buildTable() {
    for (const o of [table, rail, trim, vignette, track]) if (o) { scene.remove(o); o.geometry.dispose(); }
    // Felt, then a varnished wooden racetrack, then the padded rail (like a real poker table).
    const TR = 0.32;   // racetrack width
    table = new T.Mesh(new T.CircleGeometry(1, 96), feltMat);
    table.rotation.x = -Math.PI / 2;
    table.scale.set(rx - TR, rz - TR, 1);
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
    vignette.rotation.x = -Math.PI / 2; vignette.position.y = 0.002; vignette.scale.set(rx - TR, rz - TR, 1);
    scene.add(vignette);

    // Racetrack: a flat elliptical band between the felt and the rail
    const tg = new T.BufferGeometry(), tp = [], tu = [], ti = [];
    const SEG = 160;
    for (let i = 0; i <= SEG; i++) {
      const a = i / SEG * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a);
      tp.push(c * (rx - TR), 0.012, s2 * (rz - TR), c * (rx + 0.02), 0.012, s2 * (rz + 0.02));
      tu.push(i / SEG, 0, i / SEG, 1);
      if (i < SEG) { const k = i * 2; ti.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }   // facing up
    }
    tg.setAttribute('position', new T.Float32BufferAttribute(tp, 3));
    tg.setAttribute('uv', new T.Float32BufferAttribute(tu, 2));
    tg.setIndex(ti); tg.computeVertexNormals();
    track = new T.Mesh(tg, woodMat);
    track.receiveShadow = true;
    scene.add(track);
    rail = new T.Mesh(new T.TubeGeometry(ring(rx + 0.2, rz + 0.2, 0.12), 220, 0.26, 20, true), railMat);
    rail.castShadow = true; rail.receiveShadow = true;
    scene.add(rail);
    trim = new T.Mesh(new T.TubeGeometry(ring(rx - TR, rz - TR, 0.03), 220, 0.035, 8, true),
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
    model = M.build(getSkin(id), inIsrael);
    flip.add(model);
  }
  // Free GPU memory for a model we no longer show (shared geometry is re-uploaded if used again).
  function disposeTree(o) {
    o.traverse(n => {
      if (n.geometry) n.geometry.dispose();
      if (n.material) [].concat(n.material).forEach(m => {
        for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) if (m[k]) m[k].dispose();
        m.dispose();
      });
    });
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
  const HULL = M.HULL.map(p => new T.Vector3(...p));

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
    settle();
    return new Promise(resolve => {
      anim = {
        kind: 'spin', t0: performance.now(), T: cfg.ms, F: C.spin.fallMs, S: skin.fx === 'boing' ? 650 : 380,
        startYaw, total, wobble: cfg.wobble, drift: cfg.drift, driftAng, upside, fx: skin.fx,
        precTurns: 2 + R() * 2, resolve, done: false,
      };
    });
  }

  // A new animation replaces the current one; an interrupted spin still reports that it ended.
  function settle() { if (anim && anim.kind === 'spin' && !anim.done) { anim.done = true; anim.resolve(); } }

  function standUp() {
    settle();
    const from = pivot.quaternion.clone();
    anim = { kind: 'stand', t0: performance.now(), from, x0: pivot.position.x, z0: pivot.position.z, upside: flip.rotation.x !== 0 };
  }

  function idle() {
    settle();
    anim = { kind: 'idle', yaw: idleYaw };
    setPose(idleYaw, 0, 0, 0, 0, false);
  }

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (document.hidden || !container.offsetParent) return;
    // Full speed while spinning or standing up; 30 fps when the dreidel is just idling.
    const busy = anim && (anim.kind === 'spin' || anim.kind === 'stand' || (anim.kind === 'landed' && now - anim.t0 < anim.T + anim.F + 1200));
    if (!busy && now - lastT < 31) return;
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
  let thumbR = null, thumbScene = null, thumbCam = null;
  function thumbnail(id, size = 140) {
    const key = 'thumb-' + id + (inIsrael ? 'p' : 's') + (M.fontReady ? 'f' : '');
    if (texCache[key]) return texCache[key];
    // Finished thumbnails are kept on the device, so the picker is instant next time.
    const store = 'mackabee_thumb_v3_' + key + '_' + size;
    try { const saved = localStorage.getItem(store); if (saved) return (texCache[key] = saved); } catch (e) { /* storage blocked */ }
    if (!T) return '';
    try {
      if (!thumbR) {
        thumbR = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        thumbR.outputColorSpace = T.SRGBColorSpace;
        thumbR.toneMapping = T.ACESFilmicToneMapping;
      }
      thumbR.setPixelRatio(2);   // render at 2x so thumbnails stay crisp on phones
      thumbR.setSize(size, size, false);
      if (!thumbScene) {   // one scene and lighting for every thumbnail
        thumbScene = new T.Scene();
        // A felt backdrop, so see-through dreidels have something to refract
        const bc = canvas(256), bg = bc.getContext('2d'), gr = bg.createRadialGradient(128, 110, 10, 128, 128, 180);
        gr.addColorStop(0, '#2f9462'); gr.addColorStop(0.6, '#1d6b45'); gr.addColorStop(1, '#0f3d27');
        bg.fillStyle = gr; bg.fillRect(0, 0, 256, 256);
        thumbScene.background = tex(bc);
        thumbScene.environment = Gfx.roomEnvironment(thumbR);
        thumbScene.add(new T.HemisphereLight(0xffe9c4, 0x0b1630, 0.7));
        const dl = new T.DirectionalLight(0xfff1d6, 2.2); dl.position.set(2.5, 4, 3.5); thumbScene.add(dl);
        const rim = new T.DirectionalLight(0x9fc0ff, 1.2); rim.position.set(-3, 2, -2); thumbScene.add(rim);
        thumbCam = new T.PerspectiveCamera(30, 1, 0.1, 50);
        thumbCam.position.set(2.5, 2.3, 3.7); thumbCam.lookAt(0, 1.08, 0);
      }
      const m = M.build(getSkin(id), inIsrael, { small: true });
      m.rotation.y = -0.55;
      m.rotation.z = 0.12;
      thumbScene.add(m);
      thumbR.render(thumbScene, thumbCam);
      const url = thumbR.domElement.toDataURL('image/jpeg', 0.86);
      thumbScene.remove(m);
      disposeTree(m);
      if (M.fontReady) { try { localStorage.setItem(store, url); } catch (e) { /* full or blocked */ } }
      return (texCache[key] = url);
    } catch (e) { return ''; }
  }

  // Prepare these skins' textures in idle moments so turns don't stutter.
  function warmSkins(ids) {
    const queue = [...new Set(ids)].map(getSkin);
    const next = () => {
      const sk = queue.shift(); if (!sk) return;
      M.warm(sk, inIsrael);
      (window.requestIdleCallback || setTimeout)(next, { timeout: 500 });
    };
    (window.requestIdleCallback || setTimeout)(next, { timeout: 500 });
  }

  return {
    init, setSkin, warmSkins, setLetters, spin, idle, standUp, seatAnchors, centerScreen, tableCenter, headScreen, onLayout, thumbnail,
    get ready() { return !!renderer; },
  };
})();
