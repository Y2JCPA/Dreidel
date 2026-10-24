/* ============================================
   MACK-A-BEE DREIDEL — Skill meter
   A bar with a green zone and a gold line. The marker sweeps back and
   forth; tap to stop it. The zone narrows and the marker speeds up as
   the wager grows (sizes come from Rules.meterParams).

   preview(wager)  shows the zone centred with the marker sweeping, so
                   players see how hard a bet is before they commit.
   start(wager)    moves the zone to a random spot and goes live.
   stop()          returns { grade, pos } using the exact tap time.
   ============================================ */
function Meter(el) {
  el.classList.add('meter');
  el.innerHTML = '<div class="meter-track"><div class="meter-zone"><div class="meter-gold"></div></div><div class="meter-marker"></div></div>';
  const zone = el.querySelector('.meter-zone');
  const marker = el.querySelector('.meter-marker');
  let params = Rules.meterParams(1);
  let center = 0.5, t0 = 0, raf = 0, live = false, stopped = false, stopPos = 0;

  function layout() {
    zone.style.left = ((center - params.width / 2) * 100) + '%';
    zone.style.width = (params.width * 100) + '%';
    // Gold line: its real share of the zone, but never thinner than 2px so it stays visible.
    const g = zone.querySelector('.meter-gold');
    const minPct = 2 / Math.max(1, el.clientWidth * params.width) * 100;
    g.style.width = Math.max(minPct, params.gold / params.width * 100) + '%';
  }
  function frame() {
    const pos = stopped ? stopPos : Rules.markerPos((performance.now() - t0) / 1000, params.speed);
    marker.style.left = (pos * 100) + '%';
    if (!stopped) raf = requestAnimationFrame(frame);
  }
  function run() { cancelAnimationFrame(raf); stopped = false; t0 = performance.now(); raf = requestAnimationFrame(frame); }

  return {
    preview(wager) {
      params = Rules.meterParams(wager);
      live = false; center = 0.5;
      el.classList.remove('live', 'hit-miss', 'hit-good', 'hit-perfect');
      layout();
      if (stopped || !raf) run();
    },
    start(wager) {
      params = Rules.meterParams(wager);
      center = params.width / 2 + Math.random() * (1 - params.width);
      live = true;
      el.classList.remove('hit-miss', 'hit-good', 'hit-perfect');
      el.classList.add('live');
      layout();
      run();
    },
    stop() {
      const pos = Rules.markerPos((performance.now() - t0) / 1000, params.speed);
      stopped = true; stopPos = pos; live = false;
      cancelAnimationFrame(raf); raf = 0;
      marker.style.left = (pos * 100) + '%';
      const grade = Rules.gradeTap(pos, center, params);
      el.classList.remove('live');
      el.classList.add('hit-' + grade);
      return { grade, pos };
    },
    halt() { cancelAnimationFrame(raf); raf = 0; },
    get live() { return live; },
  };
}
