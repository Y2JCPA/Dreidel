/* ============================================
   MACK-A-BEE DREIDEL — Mack the bee
   A fuzzy cartoon bee in a gold Maccabee helmet with a little shield.
   He is drawn as SVG (no image files), flaps his wings, and changes
   expression. Mack.create(el) returns a Mack you can make talk and react.
   At the start he stands centre-stage to explain the rules; during the
   game he lives in a corner with short speech bubbles that fade away.
   ============================================ */
const Mack = (function () {
  let uid = 0;

  const EYES = {
    normal: `<g class="eye"><ellipse cx="80" cy="86" rx="10" ry="13" fill="#fff"/><circle cx="82" cy="89" r="7" fill="#1b1230"/><circle cx="85" cy="85" r="2.6" fill="#fff"/></g>
             <g class="eye"><ellipse cx="120" cy="86" rx="10" ry="13" fill="#fff"/><circle cx="118" cy="89" r="7" fill="#1b1230"/><circle cx="121" cy="85" r="2.6" fill="#fff"/></g>`,
    happy: `<path d="M70 90 Q80 78 90 90" stroke="#1b1230" stroke-width="4.5" fill="none" stroke-linecap="round"/>
            <path d="M110 90 Q120 78 130 90" stroke="#1b1230" stroke-width="4.5" fill="none" stroke-linecap="round"/>`,
    wink: `<g class="eye"><ellipse cx="80" cy="86" rx="10" ry="13" fill="#fff"/><circle cx="82" cy="89" r="7" fill="#1b1230"/><circle cx="85" cy="85" r="2.6" fill="#fff"/></g>
           <path d="M110 90 Q120 80 130 90" stroke="#1b1230" stroke-width="4.5" fill="none" stroke-linecap="round"/>`,
    wide: `<g class="eye"><ellipse cx="80" cy="85" rx="12" ry="15" fill="#fff"/><circle cx="80" cy="86" r="8" fill="#1b1230"/><circle cx="84" cy="81" r="3.2" fill="#fff"/><circle cx="76" cy="90" r="1.6" fill="#fff"/></g>
           <g class="eye"><ellipse cx="120" cy="85" rx="12" ry="15" fill="#fff"/><circle cx="120" cy="86" r="8" fill="#1b1230"/><circle cx="124" cy="81" r="3.2" fill="#fff"/><circle cx="116" cy="90" r="1.6" fill="#fff"/></g>`,
    sad: `<g class="eye"><ellipse cx="80" cy="89" rx="9" ry="11" fill="#fff"/><circle cx="80" cy="92" r="6" fill="#1b1230"/><circle cx="82" cy="89" r="2" fill="#fff"/></g>
          <g class="eye"><ellipse cx="120" cy="89" rx="9" ry="11" fill="#fff"/><circle cx="120" cy="92" r="6" fill="#1b1230"/><circle cx="122" cy="89" r="2" fill="#fff"/></g>
          <path d="M68 74 L90 79 M132 74 L110 79" stroke="#1b1230" stroke-width="3.5" stroke-linecap="round"/>`,
    sneaky: `<g class="eye"><ellipse cx="80" cy="88" rx="10" ry="9" fill="#fff"/><circle cx="85" cy="90" r="6" fill="#1b1230"/><path d="M69 84 L91 84" stroke="#1b1230" stroke-width="4" stroke-linecap="round"/></g>
             <g class="eye"><ellipse cx="120" cy="88" rx="10" ry="9" fill="#fff"/><circle cx="125" cy="90" r="6" fill="#1b1230"/><path d="M109 84 L131 84" stroke="#1b1230" stroke-width="4" stroke-linecap="round"/></g>`,
  };
  const MOUTH = {
    smile: '<path d="M88 106 Q100 117 112 106" stroke="#1b1230" stroke-width="4" fill="none" stroke-linecap="round"/>',
    grin: '<path d="M85 104 Q100 124 115 104 Z" fill="#7a1f2b" stroke="#1b1230" stroke-width="3.5" stroke-linejoin="round"/><path d="M92 112 Q100 117 108 112" fill="#ff8fa3"/>',
    o: '<ellipse cx="100" cy="110" rx="7" ry="9" fill="#7a1f2b" stroke="#1b1230" stroke-width="3.5"/>',
    flat: '<path d="M90 109 L110 109" stroke="#1b1230" stroke-width="4" stroke-linecap="round"/>',
    smirk: '<path d="M88 109 Q104 114 114 103" stroke="#1b1230" stroke-width="4" fill="none" stroke-linecap="round"/>',
    frown: '<path d="M89 113 Q100 104 111 113" stroke="#1b1230" stroke-width="4" fill="none" stroke-linecap="round"/>',
  };
  const MOODS = {
    happy: ['normal', 'smile'], cheer: ['happy', 'grin'], wink: ['wink', 'smile'], shrug: ['normal', 'flat'],
    gasp: ['wide', 'o'], sneaky: ['sneaky', 'smirk'], sad: ['sad', 'frown'], think: ['normal', 'flat'], wow: ['wide', 'grin'],
  };

  function svg(id) {
    return `
<svg class="mack-svg" viewBox="0 0 200 210" aria-hidden="true">
  <defs>
    <filter id="fuzz${id}" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <radialGradient id="fur${id}" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="#ffe27a"/><stop offset="0.6" stop-color="#f7b81c"/><stop offset="1" stop-color="#d98e00"/>
    </radialGradient>
    <linearGradient id="helm${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff1b8"/><stop offset="0.45" stop-color="#e9b949"/><stop offset="1" stop-color="#a87414"/>
    </linearGradient>
    <clipPath id="bodyClip${id}"><ellipse cx="100" cy="158" rx="42" ry="36"/></clipPath>
  </defs>
  <g class="mack-wings">
    <g transform="rotate(-30 62 128)"><ellipse class="wing wing-l" cx="62" cy="128" rx="30" ry="20" fill="rgba(220,240,255,0.75)" stroke="#9fc7e8" stroke-width="2.5"/></g>
    <g transform="rotate(30 138 128)"><ellipse class="wing wing-r" cx="138" cy="128" rx="30" ry="20" fill="rgba(220,240,255,0.75)" stroke="#9fc7e8" stroke-width="2.5"/></g>
  </g>
  <path d="M100 194 L94 182 L106 182 Z" fill="#2b1d0e"/>
  <g filter="url(#fuzz${id})">
    <ellipse cx="100" cy="158" rx="42" ry="36" fill="url(#fur${id})"/>
    <g clip-path="url(#bodyClip${id})" fill="#2b1d0e">
      <path d="M50 150 Q100 162 150 150 L150 166 Q100 178 50 166 Z"/>
      <path d="M50 178 Q100 190 150 178 L150 200 L50 200 Z"/>
    </g>
  </g>
  <g class="mack-arm">
    <ellipse cx="146" cy="150" rx="9" ry="7" fill="#f7b81c" stroke="#2b1d0e" stroke-width="2"/>
  </g>
  <g class="mack-shield">
    <circle cx="60" cy="160" r="21" fill="#1f4fbf" stroke="#e9b949" stroke-width="4.5"/>
    <path d="M60 147 L71 166 L49 166 Z M60 173 L49 154 L71 154 Z" fill="none" stroke="#e9b949" stroke-width="2.6" stroke-linejoin="round"/>
  </g>
  <g class="mack-antennae" stroke="#2b1d0e" stroke-width="3.5" fill="none" stroke-linecap="round">
    <path d="M82 52 Q72 30 60 26"/><path d="M118 52 Q128 30 140 26"/>
    <circle cx="58" cy="25" r="6" fill="#2b1d0e"/><circle cx="142" cy="25" r="6" fill="#2b1d0e"/>
  </g>
  <g filter="url(#fuzz${id})"><circle cx="100" cy="92" r="48" fill="url(#fur${id})"/></g>
  <ellipse cx="72" cy="102" rx="9" ry="6" fill="#ff8fa3" opacity="0.7"/>
  <ellipse cx="128" cy="102" rx="9" ry="6" fill="#ff8fa3" opacity="0.7"/>
  <g class="mack-eyes"></g>
  <g class="mack-mouth"></g>
  <g class="mack-helmet">
    <path d="M54 72 Q56 34 100 30 Q144 34 146 72 Q100 60 54 72 Z" fill="url(#helm${id})" stroke="#8a5d0c" stroke-width="2.5"/>
    <path d="M50 72 Q100 58 150 72 L150 78 Q100 65 50 78 Z" fill="#c9952b" stroke="#8a5d0c" stroke-width="2"/>
    <path d="M100 31 Q96 10 116 4 Q108 14 124 14 Q110 22 114 34 Z" fill="#2f63d6" stroke="#173a8c" stroke-width="2"/>
    <circle cx="100" cy="48" r="5" fill="#fff5cf" stroke="#8a5d0c" stroke-width="1.5"/>
  </g>
</svg>`;
  }

  function create(el, { corner = false } = {}) {
    const id = ++uid;
    el.classList.add('mack', corner ? 'mack-corner' : 'mack-big');
    el.innerHTML = `<div class="mack-body"></div><div class="mack-bubble" role="status" aria-live="polite" hidden></div>`;
    const bubble = el.querySelector('.mack-bubble');
    const body = el.querySelector('.mack-body');
    let moodTimer = 0, bubbleTimer = 0, quiet = false, pokes = 0, pokeTimer = 0;

    // The drawn (SVG) Mack shows at once; on devices that can draw 3D he's swapped for the
    // 3D Mack once the page has loaded and the browser is idle, so he never slows the first screen.
    let m3 = null, current = 'happy';
    body.innerHTML = svg(id);
    const eyes = el.querySelector('.mack-eyes'), mouth = el.querySelector('.mack-mouth');
    const svgMood = name => { const [e, m] = MOODS[name] || MOODS.happy; eyes.innerHTML = EYES[e]; mouth.innerHTML = MOUTH[m]; };
    const setMood = name => { current = name; if (m3) m3.setMood(name); else svgMood(name); };
    setInterval(() => {   // the drawn Mack blinks now and then
      if (m3 || document.hidden) return;
      el.classList.add('blink');
      setTimeout(() => el.classList.remove('blink'), 140);
    }, 3800 + Math.random() * 2000);
    if (typeof Mack3D !== 'undefined' && Mack3D.available) {
      const upgrade = () => {
        const inst = Mack3D.create(body, { portrait: corner });
        if (!inst) return;
        const drawn = body.querySelector('svg'); if (drawn) drawn.remove();
        el.classList.add('mack-3d');
        m3 = inst;
        m3.setMood(current);
      };
      const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 200));
      if (document.readyState === 'complete') idle(upgrade);
      else window.addEventListener('load', () => idle(upgrade), { once: true });
    }
    setMood('happy');

    function anim(name) {
      if (m3) m3.play(name);
      body.classList.remove('a-cheer', 'a-gasp', 'a-loop', 'a-sad');
      void body.offsetWidth;   // restart the CSS animation (drawn Mack)
      body.classList.add('a-' + name);
      setTimeout(() => body.classList.remove('a-' + name), 1300);
    }

    const api = {
      mood(name, ms = 2400) {
        setMood(name);
        clearTimeout(moodTimer);
        if (ms) moodTimer = setTimeout(() => setMood('happy'), ms);
      },
      anim,
      // Short line in a bubble. In the corner it fades away on its own.
      say(text, ms = corner ? 2600 : 0) {
        if (corner && quiet) return;
        bubble.textContent = text;
        bubble.hidden = false;
        bubble.classList.remove('show'); void bubble.offsetWidth; bubble.classList.add('show');
        clearTimeout(bubbleTimer);
        if (ms) bubbleTimer = setTimeout(() => { bubble.classList.remove('show'); setTimeout(() => { bubble.hidden = true; }, 300); }, ms);
      },
      hush() { clearTimeout(bubbleTimer); bubble.hidden = true; },
      react(mood, line, animName) {
        api.mood(mood);
        if (animName) anim(animName);
        if (line) api.say(line);
      },
      set quiet(q) { quiet = !!q; if (q) api.hush(); },
      get quiet() { return quiet; },
      el,
    };

    // Easter egg: tap Mack five times quickly and he does a loop-de-loop.
    body.addEventListener('click', () => {
      pokes++;
      clearTimeout(pokeTimer);
      pokeTimer = setTimeout(() => { pokes = 0; }, 1400);
      if (pokes >= 5) {
        pokes = 0;
        anim('loop'); api.mood('cheer', 1500);
        if (typeof Sound !== 'undefined') Sound.play('buzz');
        if (!quiet || !corner) api.say(I18N.pick('mack_poke'), 1500);
      } else if (pokes === 1) {
        api.mood('wink', 900);
      }
    });
    return api;
  }

  return { create };
})();
