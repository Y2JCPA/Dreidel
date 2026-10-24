/* ============================================
   MACK-A-BEE DREIDEL — Sound effects
   Everything is synthesized with Web Audio, so there are no sound files.
   Browsers only allow sound after the first tap, so unlock() is called
   from the first click.
   ============================================ */
const Sound = (function () {
  let ctx = null, master = null, enabled = true;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  function setEnabled(on) { enabled = !!on; }
  const ok = () => enabled && ctx && ctx.state === 'running';

  function tone(freq, start, dur, { type = 'sine', vol = 0.3, slide = 0, attack = 0.005 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(master);
    o.start(start); o.stop(start + dur + 0.02);
  }

  let noiseBuf = null;
  function noise(start, dur, { vol = 0.2, freq = 2000, q = 1, type = 'bandpass', freqEnd } = {}) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(freq, start); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(start); s.stop(start + dur + 0.02);
  }

  const fx = {
    click() { const t = ctx.currentTime; tone(660, t, 0.06, { type: 'triangle', vol: 0.15 }); },
    tick() { const t = ctx.currentTime; tone(1200, t, 0.03, { type: 'square', vol: 0.05 }); },
    stop(grade) {
      const t = ctx.currentTime;
      if (grade === 'perfect') { [880, 1109, 1319, 1760].forEach((f, i) => tone(f, t + i * 0.05, 0.25, { type: 'triangle', vol: 0.18 })); }
      else if (grade === 'good') { tone(784, t, 0.12, { type: 'triangle', vol: 0.2 }); tone(1047, t + 0.08, 0.2, { type: 'triangle', vol: 0.2 }); }
      else tone(300, t, 0.25, { type: 'sawtooth', vol: 0.08, slide: 0.6 });
    },
    // A whirring spin that slows down, then a wooden clatter as it falls.
    spin(ms) {
      const t = ctx.currentTime, d = ms / 1000;
      noise(t, d, { vol: 0.12, freq: 1400, freqEnd: 300, q: 4 });
      const n = Math.floor(d * 14);
      for (let i = 0; i < n; i++) {
        const k = i / n, at = t + d * (1 - Math.pow(1 - k, 1.6));   // ticks spread out as it slows
        tone(500 + 300 * (1 - k), at, 0.03, { type: 'triangle', vol: 0.04 });
      }
      [0, 0.09, 0.16, 0.21].forEach((o, i) => noise(t + d + o, 0.06, { vol: 0.25 / (i + 1), freq: 900 - i * 120, q: 3 }));
    },
    coin(n = 1) {
      const t = ctx.currentTime;
      for (let i = 0; i < Math.min(n, 8); i++) {
        const at = t + i * 0.06;
        tone(2093, at, 0.12, { type: 'square', vol: 0.06 });
        tone(2637, at + 0.03, 0.18, { type: 'square', vol: 0.05 });
      }
    },
    win() { const t = ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.3, { type: 'triangle', vol: 0.2 })); },
    lose() { const t = ctx.currentTime; [392, 330, 262].forEach((f, i) => tone(f, t + i * 0.14, 0.3, { type: 'sawtooth', vol: 0.07 })); },
    nun() { const t = ctx.currentTime; tone(440, t, 0.15, { type: 'triangle', vol: 0.15 }); tone(440, t + 0.18, 0.2, { type: 'triangle', vol: 0.12 }); },
    buzz() { const t = ctx.currentTime; tone(180, t, 0.35, { type: 'sawtooth', vol: 0.06, slide: 1.3 }); tone(184, t, 0.35, { type: 'sawtooth', vol: 0.05, slide: 1.25 }); },
    quiz() { const t = ctx.currentTime; [659, 784, 659, 988].forEach((f, i) => tone(f, t + i * 0.1, 0.18, { type: 'square', vol: 0.08 })); this.buzz(); },
    right() { const t = ctx.currentTime; tone(880, t, 0.12, { type: 'triangle', vol: 0.2 }); tone(1320, t + 0.1, 0.25, { type: 'triangle', vol: 0.2 }); },
    wrong() { const t = ctx.currentTime; tone(200, t, 0.3, { type: 'square', vol: 0.08 }); },
    steal() { const t = ctx.currentTime; tone(300, t, 0.4, { type: 'triangle', vol: 0.15, slide: 3 }); },
    fanfare() { const t = ctx.currentTime; [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.12, 0.25, { type: 'triangle', vol: 0.18 })); },
    countdown() { const t = ctx.currentTime; tone(1000, t, 0.05, { type: 'sine', vol: 0.08 }); },
  };

  function play(name, ...args) {
    if (!ok() || !fx[name]) return;
    try { fx[name](...args); } catch (e) { /* audio is optional */ }
  }

  return { unlock, play, setEnabled, get enabled() { return enabled; } };
})();
