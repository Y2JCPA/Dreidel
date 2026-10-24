/* ============================================
   MACK-A-BEE DREIDEL — Mack in 3D
   A fuzzy bee built in Three.js: fur made of layered shells, glossy
   eyes with highlights, a polished gold Maccabee helmet with a blue
   plume crest, see-through rainbow wings, little arms and a shield
   with a Magen David. He bobs, flaps, blinks, and changes expression.

   Mack3D.create(el) puts a live Mack inside `el` and returns
   { setMood(name), play(anim), dispose() }. One shared clock drives
   every Mack on screen, and Macks that aren't visible don't render.
   ============================================ */
const Mack3D = (function () {
  const T = window.THREE;
  const G = typeof Gfx !== 'undefined' ? Gfx : null;
  const available = !!(T && G && (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })());

  const instances = new Set();
  let ticking = false;

  // ---------- Textures ----------
  let furTex = null, headTex = null, bodyTex = null, wingTex = null, plumeTex = null;
  function hairNoise() {
    if (furTex) return furTex;
    const S = 256, c = G.canvas(S), g = c.getContext('2d'), img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { const v = Math.random() * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    furTex = G.tex(c, { srgb: false, repeat: [10, 5] });
    return furTex;
  }
  function furColors() {
    if (headTex) return;
    // Head: warm honey yellow, lighter on top
    headTex = G.tex(G.paint(128, (u, v) => {
      const n = G.fbm(u, v, 3, 4);
      return G.mixRGB([255, 214, 72], [236, 160, 20], Math.min(1, v * 0.9 + n * 0.25));
    }));
    // Body: yellow with two dark brown stripes
    bodyTex = G.tex(G.paint(128, (u, v) => {
      const n = G.fbm(u, v, 3, 4);
      const stripe = (v > 0.4 && v < 0.53) || (v > 0.66 && v < 0.8);
      return stripe ? G.mixRGB([52, 33, 16], [34, 22, 10], n) : G.mixRGB([255, 206, 60], [230, 150, 18], Math.min(1, v * 0.8 + n * 0.3));
    }));
  }
  function wingTexture() {
    if (wingTex) return wingTex;
    const S = 256, c = G.canvas(S), g = c.getContext('2d');
    const r = g.createRadialGradient(S * 0.3, S * 0.5, 10, S * 0.5, S * 0.5, S * 0.55);
    r.addColorStop(0, 'rgba(255,255,255,0.75)'); r.addColorStop(1, 'rgba(210,235,255,0.35)');
    g.fillStyle = r; g.beginPath(); g.ellipse(S / 2, S / 2, S / 2 - 2, S / 2 - 2, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(80,110,160,0.55)'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(S / 2, S / 2, S / 2 - 4, S / 2 - 4, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2;
    for (const a of [-0.5, -0.15, 0.2, 0.55]) { g.beginPath(); g.moveTo(8, S / 2); g.quadraticCurveTo(S * 0.45, S / 2 + a * S * 0.3, S - 14, S / 2 + a * S * 0.75); g.stroke(); }
    return (wingTex = G.tex(c));
  }
  function plumeTexture() {
    if (plumeTex) return plumeTex;
    const c = G.canvas(256, 64), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#4f7dff'); gr.addColorStop(1, '#142f86');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 64);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
    for (let x = 0; x < 256; x += 7) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 10, 0); g.stroke(); }
    return (plumeTex = G.tex(c));
  }

  // ---------- Model ----------
  const SHELLS = 12, FUR = 0.11;
  // A furry part: a base mesh plus layered shells whose hairs thin out toward the tips.
  function furry(geo, map, scale = [1, 1, 1]) {
    const grp = new T.Group();
    const noise = hairNoise();
    const base = new T.Mesh(geo, new T.MeshStandardMaterial({ map, roughness: 0.95, color: new T.Color(0.62, 0.6, 0.58) }));
    grp.add(base);
    for (let i = 1; i <= SHELLS; i++) {
      const f = i / SHELLS;
      const m = new T.MeshStandardMaterial({
        map, alphaMap: noise, alphaTest: 0.15 + f * 0.75, roughness: 0.9,
        color: new T.Color().setScalar(0.62 + f * 0.45), alphaToCoverage: true,
      });
      const s = new T.Mesh(geo, m);
      s.scale.setScalar(1 + FUR * f);
      grp.add(s);
    }
    grp.scale.set(...scale);
    return grp;
  }

  // How far forward the fur surface is at height y on the head (radius 1 + fur).
  const faceZ = (y, x = 0) => Math.sqrt(Math.max(0, 1 - y * y - x * x)) * (1 + FUR) + 0.01;

  function build() {
    furColors();
    const root = new T.Group();      // whole Mack (bob, jump, spin)
    const parts = {};
    const sphere = new T.SphereGeometry(1, 48, 32);
    const gold = new T.MeshPhysicalMaterial({ color: new T.Color('#f2c14e'), metalness: 1, roughness: 0.2, clearcoat: 0.5, envMapIntensity: 1.4 });
    const dark = new T.MeshPhysicalMaterial({ color: new T.Color('#1c1209'), roughness: 0.35, clearcoat: 0.6 });

    // Body (striped, behind and below the head) and stinger
    const body = furry(sphere, bodyTex, [0.82, 0.74, 0.76]);
    body.position.set(0, -0.12, -0.25);
    root.add(body);
    const sting = new T.Mesh(new T.ConeGeometry(0.12, 0.32, 16), dark);
    sting.position.set(0, -0.62, -0.62); sting.rotation.x = Math.PI * 0.8;
    root.add(sting);

    // Head
    const head = new T.Group();
    head.position.set(0, 1.0, 0.15);
    head.add(furry(sphere, headTex));
    root.add(head);
    parts.head = head;

    // Eyes: white, glossy dark pupils, sparkly highlights
    const white = new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1 });
    const pupilMat = new T.MeshPhysicalMaterial({ color: new T.Color('#140c24'), roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
    const shine = new T.MeshBasicMaterial({ color: 0xffffff });
    parts.eyes = [];
    for (const side of [-1, 1]) {
      const eye = new T.Group();
      eye.position.set(side * 0.37, 0.1, faceZ(0.1, 0.37) - 0.1);
      eye.rotation.y = side * 0.32;
      const sclera = new T.Mesh(sphere, white); sclera.scale.set(0.27, 0.33, 0.16); eye.add(sclera);
      const pupil = new T.Mesh(sphere, pupilMat); pupil.scale.set(0.17, 0.21, 0.1); pupil.position.set(-side * 0.02, -0.03, 0.09); eye.add(pupil);
      const h1 = new T.Mesh(sphere, shine); h1.scale.setScalar(0.055); h1.position.set(0.05, 0.07, 0.19); eye.add(h1);
      const h2 = new T.Mesh(sphere, shine); h2.scale.setScalar(0.025); h2.position.set(-0.05, -0.08, 0.19); eye.add(h2);
      head.add(eye);
      parts.eyes.push({ group: eye, pupil, sclera });
    }
    // Closed "happy" eyes (curved lids)
    const lidGeo = new T.TorusGeometry(0.2, 0.045, 10, 24, Math.PI);
    parts.happyEyes = [-1, 1].map(side => {
      const m = new T.Mesh(lidGeo, dark);
      m.position.set(side * 0.37, 0.04, faceZ(0.04, 0.37)); m.rotation.y = side * 0.32;
      m.visible = false; head.add(m); return m;
    });
    // Brows
    const browGeo = new T.CapsuleGeometry(0.035, 0.18, 4, 8);
    parts.brows = [-1, 1].map(side => {
      const b = new T.Mesh(browGeo, dark);
      b.position.set(side * 0.37, 0.48, faceZ(0.48, 0.37)); b.rotation.z = Math.PI / 2; b.rotation.y = side * 0.32;
      b.visible = false; head.add(b); return b;
    });
    // Cheeks
    const cheekMat = new T.MeshBasicMaterial({ color: new T.Color('#ff7f9a'), transparent: true, opacity: 0.6, depthWrite: false });
    for (const side of [-1, 1]) {
      const ch = new T.Mesh(new T.CircleGeometry(0.13, 24), cheekMat);
      ch.position.set(side * 0.62, -0.16, faceZ(-0.16, 0.62)); ch.lookAt(side * 1.6, -0.4, 2.6); head.add(ch);
    }
    // Mouths
    const mouthRed = new T.MeshStandardMaterial({ color: new T.Color('#7a1f2b'), roughness: 0.6 });
    const tongue = new T.MeshStandardMaterial({ color: new T.Color('#ff8fa3'), roughness: 0.7 });
    const mouthAt = (m, y = -0.32) => { m.position.set(0, y, faceZ(y)); m.rotation.x = Math.asin(-y) * 0.9; head.add(m); m.visible = false; return m; };
    const arc = (r, a) => new T.TorusGeometry(r, 0.04, 10, 24, a);
    const smile = new T.Mesh(arc(0.2, Math.PI), dark); smile.rotation.z = Math.PI;
    const grin = new T.Group();
    { const sh = new T.Shape(); sh.moveTo(-0.24, 0); sh.quadraticCurveTo(0, -0.42, 0.24, 0); sh.lineTo(-0.24, 0);
      const m = new T.Mesh(new T.ShapeGeometry(sh, 16), mouthRed); grin.add(m);
      const tg = new T.Shape(); tg.moveTo(-0.12, -0.12); tg.quadraticCurveTo(0, -0.28, 0.12, -0.12); tg.quadraticCurveTo(0, -0.05, -0.12, -0.12);
      const t2 = new T.Mesh(new T.ShapeGeometry(tg, 12), tongue); t2.position.z = 0.005; grin.add(t2); }
    const oMouth = new T.Mesh(new T.CircleGeometry(0.1, 24), mouthRed); oMouth.scale.y = 1.25;
    const flat = new T.Mesh(new T.CapsuleGeometry(0.035, 0.22, 4, 8), dark); flat.rotation.z = Math.PI / 2;
    const smirk = new T.Mesh(arc(0.18, Math.PI * 0.7), dark); smirk.rotation.z = Math.PI * 1.15;
    const frown = new T.Mesh(arc(0.18, Math.PI), dark);
    parts.mouths = {
      smile: mouthAt(smile, -0.18), grin: mouthAt(grin, -0.22), o: mouthAt(oMouth, -0.32),
      flat: mouthAt(flat, -0.3), smirk: mouthAt(smirk, -0.24), frown: mouthAt(frown, -0.4),
    };

    // Antennae, coming out through the helmet
    parts.antennae = [];
    for (const side of [-1, 1]) {
      const a = new T.Group();
      a.position.set(side * 0.42, 0.78, 0.1);
      const curve = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(side * 0.12, 0.35, 0.05), new T.Vector3(side * 0.34, 0.62, 0.12)]);
      a.add(new T.Mesh(new T.TubeGeometry(curve, 16, 0.035, 8), dark));
      const tip = new T.Mesh(sphere, dark); tip.scale.setScalar(0.1); tip.position.copy(curve.getPoint(1)); a.add(tip);
      head.add(a);
      parts.antennae.push(a);
    }

    // Maccabee helmet: gold dome, brim, and a blue plume crest
    const helmet = new T.Group();
    const dome = new T.Mesh(new T.SphereGeometry(1.1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.4), gold);
    dome.rotation.x = -0.12;
    helmet.add(dome);
    const brim = new T.Mesh(new T.TorusGeometry(1.03, 0.075, 12, 64), gold);
    brim.rotation.x = Math.PI / 2 - 0.12; brim.position.y = 0.33; brim.position.z = 0.04;
    brim.scale.set(1, 1, 0.9);
    helmet.add(brim);
    const band = new T.Mesh(new T.TorusGeometry(0.55, 0.05, 10, 48, Math.PI), gold);   // ridge over the top
    band.rotation.y = Math.PI / 2; band.position.y = 0.48; band.scale.set(1, 1.15, 1.3);
    helmet.add(band);
    // Plume: a curved crest, front to back
    const crestShape = new T.Shape();
    crestShape.moveTo(-0.85, 0); crestShape.quadraticCurveTo(-0.9, 0.55, -0.2, 0.75); crestShape.quadraticCurveTo(0.5, 0.85, 0.95, 0.35);
    crestShape.quadraticCurveTo(0.6, 0.35, 0.55, 0); crestShape.lineTo(-0.85, 0);
    const crestGeo = new T.ExtrudeGeometry(crestShape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 6, curveSegments: 24 });
    crestGeo.translate(0, 0, -0.15);
    const crest = new T.Mesh(crestGeo, new T.MeshPhysicalMaterial({ map: plumeTexture(), roughness: 0.75, sheen: 1, sheenColor: new T.Color('#9fbfff'), sheenRoughness: 0.4 }));
    crest.rotation.y = -Math.PI / 2;
    crest.position.set(0, 0.98, -0.05);
    crest.scale.setScalar(0.85);
    helmet.add(crest);
    const stud = new T.Mesh(sphere, gold); stud.scale.setScalar(0.09); stud.position.set(0, 0.62, 0.9); helmet.add(stud);
    helmet.position.y = 0.17;
    head.add(helmet);
    parts.helmet = helmet;

    // Wings, attached at the back
    const wingMat = new T.MeshPhysicalMaterial({ map: wingTexture(), color: new T.Color('#eaf6ff'), emissive: new T.Color('#5d7fb8'), emissiveIntensity: 0.35, transparent: true, side: T.DoubleSide, depthWrite: false, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.7, envMapIntensity: 1.5 });
    parts.wings = [-1, 1].map(side => {
      const pivot = new T.Group();
      pivot.position.set(side * 0.35, 0.42, -0.6);
      const w = new T.Mesh(new T.PlaneGeometry(1.45, 0.9), wingMat);
      w.position.set(side * 0.66, 0.32, 0);
      w.rotation.z = side * 0.45;
      pivot.add(w);
      root.add(pivot);
      return pivot;
    });

    // Arms
    const armMat = new T.MeshStandardMaterial({ color: new T.Color('#f7b81c'), roughness: 0.8 });
    parts.arms = [-1, 1].map(side => {
      const a = new T.Group();
      a.position.set(side * 0.72, 0.05, 0.25);
      const limb = new T.Mesh(new T.CapsuleGeometry(0.1, 0.3, 4, 10), armMat);
      limb.position.set(side * 0.12, -0.15, 0.08); limb.rotation.z = side * 0.7;
      a.add(limb);
      const hand = new T.Mesh(sphere, dark); hand.scale.setScalar(0.11); hand.position.set(side * 0.28, -0.3, 0.14); a.add(hand);
      root.add(a);
      return a;
    });
    // Little legs
    for (const side of [-1, 1]) {
      const leg = new T.Mesh(new T.CapsuleGeometry(0.07, 0.18, 4, 8), dark);
      leg.position.set(side * 0.28, -0.72, 0.15); leg.rotation.z = side * 0.25; root.add(leg);
    }

    // Shield: blue enamel, gold rim, gold Magen David
    const shield = new T.Group();
    const enamel = new T.Mesh(new T.CylinderGeometry(0.46, 0.46, 0.07, 48), new T.MeshPhysicalMaterial({ color: new T.Color('#1f4fbf'), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }));
    enamel.rotation.x = Math.PI / 2; shield.add(enamel);
    const rim = new T.Mesh(new T.TorusGeometry(0.46, 0.05, 10, 48), gold); shield.add(rim);
    const tri = (rot) => {
      const sh = new T.Shape(); const r = 0.27;
      for (let i = 0; i < 3; i++) { const a = rot + i * Math.PI * 2 / 3; (i ? sh.lineTo : sh.moveTo).call(sh, Math.sin(a) * r, Math.cos(a) * r); }
      const hole = new T.Path(); const r2 = 0.17;
      for (let i = 0; i < 3; i++) { const a = rot + i * Math.PI * 2 / 3; (i ? hole.lineTo : hole.moveTo).call(hole, Math.sin(a) * r2, Math.cos(a) * r2); }
      sh.holes.push(hole);
      const m = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2 }), gold);
      m.position.z = 0.04; return m;
    };
    shield.add(tri(0)); shield.add(tri(Math.PI));
    shield.position.set(-0.86, -0.18, 0.62);
    shield.rotation.y = 0.45;
    root.add(shield);
    parts.shield = shield;

    return { root, parts };
  }

  // ---------- Moods ----------
  const MOODS = {
    happy:  { eyes: 'open', mouth: 'smile' },
    cheer:  { eyes: 'happy', mouth: 'grin' },
    wink:   { eyes: 'wink', mouth: 'smile' },
    shrug:  { eyes: 'open', mouth: 'flat', brows: 'up' },
    gasp:   { eyes: 'wide', mouth: 'o', brows: 'up' },
    sneaky: { eyes: 'narrow', mouth: 'smirk', brows: 'sly' },
    sad:    { eyes: 'down', mouth: 'frown', brows: 'sad' },
    think:  { eyes: 'side', mouth: 'flat', brows: 'up' },
    wow:    { eyes: 'wide', mouth: 'grin', brows: 'up' },
  };

  function applyMood(p, name) {
    const md = MOODS[name] || MOODS.happy;
    for (const k in p.mouths) p.mouths[k].visible = k === md.mouth;
    const open = md.eyes !== 'happy';
    p.eyes.forEach((e, i) => {
      const winkClosed = md.eyes === 'wink' && i === 1;
      e.group.visible = open && !winkClosed;
      p.happyEyes[i].visible = !open || winkClosed;
      const wide = md.eyes === 'wide' ? 1.15 : 1;
      e.group.userData.baseY = md.eyes === 'narrow' ? 0.55 : 1;
      e.group.scale.set(wide, wide * e.group.userData.baseY, 1);
      e.pupil.position.x = md.eyes === 'side' ? 0.06 : md.eyes === 'narrow' ? 0.05 : (i ? -0.02 : 0.02);
      e.pupil.position.y = md.eyes === 'down' ? -0.08 : -0.03;
      e.pupil.scale.set(md.eyes === 'wide' ? 0.13 : 0.17, md.eyes === 'wide' ? 0.17 : 0.21, 0.1);
    });
    p.brows.forEach((b, i) => {
      const side = i ? 1 : -1;
      b.visible = !!md.brows;
      b.position.y = md.brows === 'up' ? 0.56 : 0.48;
      b.rotation.x = 0;
      b.rotation.z = Math.PI / 2 + (md.brows === 'sad' ? side * 0.35 : md.brows === 'sly' ? -side * 0.3 : 0);
    });
  }

  // ---------- Instances ----------
  // `portrait` frames just the head and helmet (for the small corner Mack).
  function create(el, { portrait = false } = {}) {
    if (!available) return null;
    let renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
    catch (e) { return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const cv = renderer.domElement;
    cv.className = 'mack-canvas';
    el.appendChild(cv);

    const scene = new T.Scene();
    scene.environment = G.roomEnvironment(renderer);
    scene.add(new T.HemisphereLight(0xfff2d8, 0x223060, 0.9));
    const key = new T.DirectionalLight(0xfff0d6, 2.4); key.position.set(2.5, 3.5, 4); scene.add(key);
    const rim = new T.DirectionalLight(0x8fb4ff, 1.6); rim.position.set(-3, 2, -3); scene.add(rim);
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 50);
    if (portrait) { camera.position.set(0, 1.45, 5.0); camera.lookAt(0, 1.35, 0); }
    else { camera.position.set(0, 1.0, 7.8); camera.lookAt(0, 0.85, 0); }

    const { root, parts } = build();
    root.rotation.y = -0.25;
    scene.add(root);
    applyMood(parts, 'happy');

    const inst = {
      el, renderer, scene, camera, root, parts, portrait, frame: 0,
      mood: 'happy', anim: null, animT: 0, blinkAt: performance.now() + 2500, t0: performance.now(), w: 0, h: 0,
    };
    function size() {
      const w = el.clientWidth || 60, h = el.clientHeight || 60;
      if (w === inst.w && h === inst.h) return;
      inst.w = w; inst.h = h;
      renderer.setSize(w, h, false);
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    inst.size = size;
    size();
    instances.add(inst);
    startTicker();
    return {
      setMood(name) { inst.mood = name; applyMood(parts, name); },
      play(name) { inst.anim = name; inst.animT = performance.now(); },
      dispose() { instances.delete(inst); renderer.dispose(); cv.remove(); },
    };
  }

  function visible(el) {
    if (document.hidden || !el.isConnected || el.offsetParent === null) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight;
  }

  function startTicker() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(tick);
  }
  function tick(now) {
    requestAnimationFrame(tick);
    for (const inst of instances) {
      if (!visible(inst.el)) continue;
      if (inst.portrait && (inst.frame++ & 1)) continue;   // the small corner Mack draws at half rate
      inst.size();
      animate(inst, now);
      inst.renderer.render(inst.scene, inst.camera);
    }
  }

  function animate(inst, now) {
    const t = (now - inst.t0) / 1000;
    const { root, parts } = inst;
    // Idle: gentle bob and sway, buzzing wings, wobbly antennae
    let y = Math.sin(t * 2.2) * 0.07, rz = Math.sin(t * 1.3) * 0.04, ry = -0.25 + Math.sin(t * 0.7) * 0.12, rx = 0, x = 0, s = 1;
    const flap = Math.sin(t * 46);
    parts.wings[0].rotation.set(0.1, 0.35 + flap * 0.45, 0.15 + flap * 0.25);
    parts.wings[1].rotation.set(0.1, -0.35 - flap * 0.45, -0.15 - flap * 0.25);
    parts.antennae.forEach((a, i) => { a.rotation.z = Math.sin(t * 3 + i) * 0.08; a.rotation.x = Math.sin(t * 2.4 + i * 2) * 0.06; });
    parts.head.rotation.z = Math.sin(t * 1.1) * 0.05;
    parts.arms[1].rotation.z = Math.sin(t * 2) * 0.12;
    // Blink
    if (now > inst.blinkAt) {
      const k = (now - inst.blinkAt) / 140;
      const sc = k < 1 ? Math.max(0.08, Math.abs(1 - 2 * k)) : 1;
      parts.eyes.forEach(e => { e.group.scale.y = (e.group.userData.baseY || 1) * sc * (e.group.scale.x); });
      if (k >= 1) { inst.blinkAt = now + 2500 + Math.random() * 2500; parts.eyes.forEach(e => { e.group.scale.y = (e.group.userData.baseY || 1) * e.group.scale.x; }); }
    }
    // Animations
    if (inst.anim) {
      const k = (now - inst.animT) / 1000;
      const a = inst.anim;
      if (a === 'cheer') {
        if (k < 0.9) { y += Math.sin(Math.PI * Math.min(1, k / 0.45)) * 0.5 * (k < 0.45 ? 1 : 0); rz += Math.sin(k * 14) * 0.15 * (1 - k); parts.arms.forEach((ar, i) => { ar.rotation.z = (i ? -1 : 1) * Math.sin(Math.min(1, k * 3) * Math.PI) * 1.2; }); }
        else inst.anim = null;
      } else if (a === 'gasp') {
        if (k < 0.8) { x = Math.sin(k * 40) * 0.06 * (1 - k); s = 1 + Math.sin(Math.min(1, k * 5) * Math.PI) * 0.06; } else inst.anim = null;
      } else if (a === 'loop') {
        if (k < 1.1) { const e = k / 1.1; y += Math.sin(e * Math.PI) * 0.9; rx = -e * Math.PI * 2; } else inst.anim = null;
      } else if (a === 'sad') {
        if (k < 1.2) { y -= Math.sin(Math.min(1, k / 1.2) * Math.PI) * 0.15; parts.head.rotation.x = Math.sin(Math.min(1, k / 1.2) * Math.PI) * 0.25; } else { inst.anim = null; parts.head.rotation.x = 0; }
      } else inst.anim = null;
    }
    root.position.set(x, y, 0);
    root.rotation.set(rx, ry, rz);
    root.scale.setScalar(s);
  }

  return { available, create };
})();
