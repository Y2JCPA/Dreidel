/* ============================================
   MACK-A-BEE DREIDEL — Screens and game flow
   Home → (profile) → setup or online lobby → Mack's intro → game.
   The game screen redraws from the room's state: seats around the
   table, the dreidel, the control panel, trivia, results and the end.
   ============================================ */
(function () {
  const $ = id => document.getElementById(id);
  const t = I18N.t;
  const P = () => Profile.data;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const params = new URLSearchParams(location.search);

  I18N.setLang(P().lang);
  Sound.setEnabled(P().sound);

  let room = null;          // current Room (local or online)
  let S = null, prev = null;
  let threeOk = false, threeTried = false;
  let mackHome, mackCorner, mackIntro;
  let setupMode = 'local';
  let localSettings = Object.assign({}, CONFIG.defaults, P().settings || {});
  let localPlayers = [];
  let unsubLobby = null, unsubState = null;
  const ui = {
    panelKey: '', teardown: null, lastBet: {}, upside: false,
    passFor: null, lastHumanTurn: null, quizKey: '', revealKey: '', resultKey: '', overKey: '', turnKey: '',
    anteKey: '', spinKey: '', quiz: null, wake: null, recorded: '',
  };
  const key = x => (x ? `${x.gid}:${x.seq}` : '');

  // ---------- Small helpers ----------
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => { s.hidden = s.id !== id; });
  }
  function applyTexts(root = document) {
    root.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    $('join-code').placeholder = t('codePlaceholder');
    $('person-name').placeholder = t('personPlaceholder');
    $('prof-name').placeholder = t('namePlaceholder');
  }
  let toastTimer = 0;
  function toast(msg, ms = 2800) {
    const el = $('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }
  function confirmBox(text) {
    return new Promise(res => {
      $('confirm-text').textContent = text;
      $('ov-confirm').hidden = false;
      const done = v => { $('ov-confirm').hidden = true; $('confirm-yes').onclick = $('confirm-no').onclick = null; res(v); };
      $('confirm-yes').onclick = () => done(true);
      $('confirm-no').onclick = () => done(false);
    });
  }
  function letterGlyph(L) { return I18N.glyph(L, S ? S.settings.inIsrael : false); }
  function letterName(L) { return I18N.letterName(L, S ? S.settings.inIsrael : false); }
  function playerName(p) { return p ? p.name : ''; }
  function myId() { return room && room.kind === 'online' ? room.uid : P().id; }
  // Ready-made pictures of each dreidel (img/skins), drawn live only if a picture is missing.
  function skinThumb(id) { return (window.SKIN_IMAGES && SKIN_IMAGES[id]) || `img/skins/${id}.jpg`; }
  function liveThumb(img) {
    if (img.dataset.live) return;
    img.dataset.live = '1';
    const url = window.THREE ? Dreidel3D.thumbnail(img.dataset.thumb) : '';
    if (url) img.src = url;
  }
  document.addEventListener('error', e => { if (e.target.matches && e.target.matches('img[data-thumb]')) liveThumb(e.target); }, true);

  document.addEventListener('pointerdown', () => Sound.unlock(), { passive: true });

  // Phone held upside down → the dreidel spins on its handle (easter egg).
  window.addEventListener('deviceorientation', e => {
    if (e.beta == null) return;
    ui.upside = e.beta < -45 && e.beta > -160;
  });
  let motionAsked = false;
  function askMotion() {
    if (motionAsked) return;
    motionAsked = true;
    try {
      if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {});
      if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) DeviceMotionEvent.requestPermission().catch(() => {});
    } catch (e) { /* not available */ }
  }
  // Shake after a landing → a shower of gelt (easter egg).
  let lastShower = 0;
  window.addEventListener('devicemotion', e => {
    const a = e.accelerationIncludingGravity;
    if (!a || !S || $('scr-game').hidden) return;
    const g = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
    if (g > 28 && Date.now() - lastShower > 4000 && (S.phase === 'result' || S.phase === 'turn')) { lastShower = Date.now(); geltShower(); }
  });

  // ---------- Home ----------
  function renderHome() {
    const p = P();
    $('home-av').textContent = p.avatar;
    $('home-name').textContent = p.name || t('editPlayer');
    $('home-honey').textContent = p.honey;
    $('home-sound').textContent = p.sound ? '🔊' : '🔇';
    $('home-sound').setAttribute('aria-label', t('sound'));
    $('home-lang').textContent = t('language');
    if (!mackHome) mackHome = Mack.create($('home-mack'));
    mackHome.say(I18N.pick('mack_home'));
  }
  function goHome() {
    if (room) { room.leave(); room = null; }
    if (unsubLobby) unsubLobby(); if (unsubState) unsubState();
    unsubLobby = unsubState = null;
    S = prev = null;
    closeAllOverlays();
    releaseWake();
    show('scr-home');
    renderHome();
  }
  function closeAllOverlays() { ['ov-trivia', 'ov-pass', 'ov-over', 'ov-menu', 'ov-intro', 'ov-confirm'].forEach(id => { $(id).hidden = true; }); }

  $('btn-local').onclick = () => openSetupLocal();
  $('btn-create').onclick = () => createOnline();
  $('join-form').onsubmit = e => { e.preventDefault(); joinOnline($('join-code').value); };
  $('join-code').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); };
  $('btn-howto').onclick = () => openIntro(localSettings, { standalone: true });
  $('btn-dreidels').onclick = () => openProfile('home');
  $('home-profile').onclick = () => openProfile('home');
  $('home-sound').onclick = () => { Profile.set({ sound: !P().sound }); Sound.setEnabled(P().sound); renderHome(); };
  $('home-lang').onclick = () => setLang(P().lang === 'he' ? 'en' : 'he');

  function setLang(l) {
    Profile.set({ lang: l });
    I18N.setLang(l);
    applyTexts();
    if (!$('scr-home').hidden) renderHome();
    if (!$('scr-setup').hidden) renderSetup();
    if (!$('scr-profile').hidden) renderProfile();
    if (S && !$('scr-game').hidden) { ui.panelKey = ''; onState(S, true); }
    renderMenuLabels();
  }

  // ---------- Profile & dreidels ----------
  let profileReturn = 'home';
  function openProfile(ret) {
    profileReturn = ret;
    show('scr-profile');
    renderProfile();
  }
  function renderProfile() {
    const p = P();
    $('prof-name').value = p.name;
    $('prof-honey').textContent = p.honey;
    $('prof-avatars').innerHTML = CONFIG.avatars.map(a => `<button type="button" aria-pressed="${a === p.avatar}" data-a="${a}">${a}</button>`).join('');
    $('prof-skins').innerHTML = CONFIG.skins.map(s => {
      const req = Profile.requirement(s);
      const open = !req || req.have >= req.need;
      let lock = '';
      if (!open) {
        const label = { wins: 'unlockWins', honey: 'unlockHoney', correct: 'unlockCorrect', perfect: 'unlockPerfect', tcWins: 'unlockTcWins' }[req.kind];
        lock = `<span class="lock">🔒 ${esc(t(label, { n: req.need }))}</span><span class="prog"><i style="width:${Math.round(req.have / req.need * 100)}%"></i></span>`;
      }
      return `<button type="button" class="skin ${open ? '' : 'locked'}" data-s="${s.id}" aria-pressed="${s.id === p.skin}" ${open ? '' : 'aria-disabled="true"'}>
        <img alt="" data-thumb="${s.id}" src="${skinThumb(s.id)}"><span>${esc(I18N.local(s.name))}</span>${lock}</button>`;
    }).join('');
    $('prof-stats').textContent = t('stats', p.stats);
  }
  $('prof-avatars').onclick = e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    Profile.set({ avatar: b.dataset.a }); renderProfile();
  };
  $('prof-skins').onclick = e => {
    const b = e.target.closest('button[data-s]'); if (!b) return;
    const skin = CONFIG.skins.find(s => s.id === b.dataset.s);
    if (!Profile.isUnlocked(skin)) { toast(b.querySelector('.lock').textContent.replace('🔒 ', '')); return; }
    Profile.set({ skin: skin.id }); renderProfile();
  };
  function saveProfile() {
    const name = $('prof-name').value.trim().slice(0, 16);
    Profile.set({ name: name || P().name });
    const me = localPlayers.find(x => x.id === P().id);
    if (me) Object.assign(me, { name: P().name, avatar: P().avatar, skin: P().skin });
    if (room && room.kind === 'online') room.updateMe({ name: P().name, avatar: P().avatar, skin: P().skin });
  }
  $('prof-done').onclick = $('prof-back').onclick = () => {
    if (!$('prof-name').value.trim() && !P().name) { $('prof-name').focus(); return; }
    saveProfile();
    if (profileReturn === 'setup') { show('scr-setup'); renderSetup(); }
    else if (profileReturn === 'join') { show('scr-home'); renderHome(); joinOnline(params.get('room')); }
    else { show('scr-home'); renderHome(); }
  };

  // ---------- Settings form (shared by local setup and the online lobby) ----------
  function seg(name, options, value, { tall = false } = {}) {
    return `<div class="seg ${tall ? 'tall' : ''}" data-set="${name}">` + options.map(o =>
      `<button type="button" data-v="${esc(o.v)}" aria-pressed="${String(o.v) === String(value)}">${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</button>`).join('') + '</div>';
  }
  function row(label, inner, hint) {
    return `<div class="set-row"><span class="lbl">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>${inner}</div>`;
  }
  // Presets plus an "Other" button that opens a number box.
  const CUSTOM = { startCoins: [1, 500], rounds: [1, 20] };
  function withCustom(name, presets, value) {
    const custom = !presets.includes(value);
    const opts = presets.map(v => ({ v, label: v })).concat([{ v: 'custom', label: custom ? `${value} ✎` : t('other') }]);
    let html = seg(name, opts, custom ? 'custom' : value);
    if (customOpen === name) {
      const [lo, hi] = CUSTOM[name];
      html += `<form class="custom-row" data-custom="${name}" novalidate><input type="number" id="custom-${name}" inputmode="numeric" min="${lo}" max="${hi}" value="${value}" aria-label="${esc(t(name))}"><span class="hint">${lo}–${hi}</span><button class="btn btn-small btn-gold" type="submit">${esc(t('done'))}</button></form>`;
    }
    return html;
  }
  let customOpen = null;

  function renderSettingsForm(s, editable) {
    const O = CONFIG.options;
    let html = '';
    html += row(t('mode'), seg('mode', [{ v: 'wager', label: t('modeWager'), hint: t('modeWagerHint') }, { v: 'classic', label: t('modeClassic'), hint: t('modeClassicHint') }], s.mode, { tall: true }));
    html += row(t('location'), seg('inIsrael', [{ v: false, label: t('outside'), hint: t('outsideHint') }, { v: true, label: t('inIsrael'), hint: t('inIsraelHint') }], !!s.inIsrael, { tall: true }));
    html += row(t('startCoins'), withCustom('startCoins', O.startCoins, s.startCoins));
    html += row(t('rounds'), withCustom('rounds', O.rounds, s.rounds), t('roundsHint'));
    if (s.mode === 'wager') {
      html += row(t('trivia'), seg('trivia', [{ v: true, label: t('on') }, { v: false, label: t('off') }], !!s.trivia), t('triviaHint'));
      if (s.trivia) {
        html += row(t('triviaLevel'), seg('triviaLevel', O.triviaLevel.map(v => ({ v, label: t('level_' + v) })), s.triviaLevel));
        html += row(t('triviaChance'), seg('triviaChance', O.triviaChance.map(v => ({ v, label: v + '%' })), s.triviaChance));
        html += row(t('triviaSeconds'), seg('triviaSeconds', O.triviaSeconds.map(v => ({ v, label: t('seconds', { n: v }) })), s.triviaSeconds));
      }
    }
    const form = $('settings-form');
    form.innerHTML = html;
    form.classList.toggle('readonly', !editable);
  }
  $('settings-form').onclick = e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    const name = b.parentElement.dataset.set;
    let v = b.dataset.v;
    if (v === 'custom') {
      if (setupMode === 'online' && !(room && room.isHost)) return;
      customOpen = customOpen === name ? null : name;
      if (setupMode === 'local') renderSetup(); else renderLobby(room.lobby);
      const box = $('custom-' + name); if (box) { box.focus(); box.select(); }
      return;
    }
    customOpen = null;
    if (v === 'true' || v === 'false') v = v === 'true';
    else if (/^\d+$/.test(v)) v = +v;
    Sound.play('click');
    if (setupMode === 'local') {
      localSettings[name] = v;
      Profile.set({ settings: Object.assign({}, localSettings) });
      renderSetup();
    } else if (room && room.isHost) {
      room.setSettings({ [name]: v });
      Profile.set({ settings: Object.assign({}, room.lobby.settings, { [name]: v }) });
    }
  };

  $('settings-form').addEventListener('submit', e => {
    const f = e.target.closest('form[data-custom]'); if (!f) return;
    e.preventDefault();
    const name = f.dataset.custom;
    const [lo, hi] = CUSTOM[name];
    const v = clamp(Math.round(+$('custom-' + name).value || lo), lo, hi);
    customOpen = null;
    if (setupMode === 'local') {
      localSettings[name] = v;
      Profile.set({ settings: Object.assign({}, localSettings) });
      renderSetup();
    } else if (room && room.isHost) {
      room.setSettings({ [name]: v });
    }
  });

  // ---------- Local setup ----------
  function openSetupLocal() {
    if (!P().name) { openProfile('home'); return; }
    setupMode = 'local';
    if (!localPlayers.length || !localPlayers.some(x => x.id === P().id)) {
      localPlayers = [meLocal()];
      addLocalBot(); addLocalBot();
    } else Object.assign(localPlayers.find(x => x.id === P().id), meLocal());
    show('scr-setup');
    renderSetup();
  }
  function meLocal() { const p = P(); return { id: p.id, name: p.name, avatar: p.avatar, skin: p.skin, local: true }; }
  function addLocalBot() {
    if (localPlayers.length >= CONFIG.players.max) return;
    const n = localPlayers.filter(x => x.bot).length;
    const free = CONFIG.skins.filter(s => !s.unlock);
    localPlayers.push({ id: 'bot' + Date.now().toString(36) + n, name: Bots.name(n, I18N.lang), avatar: '🐝', skin: free[(n + 1) % free.length].id, bot: true });
  }

  function renderSetup() {
    const online = setupMode === 'online';
    $('setup-title').textContent = online ? t('roomCode') + ' ' + (room ? room.code : '') : t('settingsTitle');
    $('room-box').hidden = !online;
    if (!online) {
      renderSettingsForm(localSettings, true);
      $('players-count').textContent = t('playersCount', { n: localPlayers.length });
      $('player-list').innerHTML = localPlayers.map(p => `
        <li><span class="av">${esc(p.avatar)}</span><span class="pname">${esc(p.name)}</span>
        ${p.id === P().id ? `<span class="badge gold">${esc(t('you'))}</span>` : ''}${p.bot ? `<span class="badge">${esc(t('computer'))}</span>` : ''}
        ${p.id === P().id ? `<button class="x" type="button" data-edit="1" aria-label="${esc(t('editPlayer'))}">✎</button>` : `<button class="x" type="button" data-rm="${esc(p.id)}" aria-label="${esc(t('remove'))}">✕</button>`}</li>`).join('');
      $('add-row').hidden = localPlayers.length >= CONFIG.players.max;
      $('add-person').hidden = false;
      $('host-only').hidden = true;
      $('wait-host').hidden = true;
      $('btn-start').hidden = false;
      const ok = localPlayers.length >= CONFIG.players.min;
      $('btn-start').disabled = !ok;
      $('setup-warn').hidden = ok;
      $('setup-warn').textContent = t('needTwo');
      return;
    }
    renderLobby(room.lobby);
  }
  $('player-list').onclick = e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      if (setupMode === 'local') { localPlayers = localPlayers.filter(p => p.id !== rm.dataset.rm); renderSetup(); }
      else if (room) room.removePlayer(rm.dataset.rm);
      return;
    }
    if (e.target.closest('[data-edit]')) openProfile('setup');
  };
  $('add-bot').onclick = () => {
    if (setupMode === 'local') { addLocalBot(); renderSetup(); }
    else if (room) room.addBot(I18N.lang);
  };
  $('add-person').onsubmit = e => {
    e.preventDefault();
    const name = $('person-name').value.trim().slice(0, 16);
    if (!name || localPlayers.length >= CONFIG.players.max) return;
    const used = new Set(localPlayers.map(p => p.avatar));
    const avatar = CONFIG.avatars.find(a => !used.has(a)) || '🙂';
    localPlayers.push({ id: 'g' + Date.now().toString(36), name, avatar, skin: 'wood', local: true });
    $('person-name').value = '';
    renderSetup();
  };
  $('setup-back').onclick = () => goHome();
  $('setup-howto').onclick = () => openIntro(setupMode === 'local' ? localSettings : (room && room.lobby.settings) || localSettings, { standalone: true });
  $('btn-start').onclick = () => {
    Sound.unlock(); askMotion();
    if (setupMode === 'local') {
      if (localPlayers.length < CONFIG.players.min) return;
      const s = Object.assign({}, localSettings, { turnSeconds: 0 });
      openIntro(s, { startAtEnd: P().seenIntro, onDone: () => startLocal(s) });
    } else if (room && room.isHost) {
      room.start();
    }
  };
  $('copy-link').onclick = () => {
    const link = inviteLink();
    const done = () => { $('copy-link').textContent = t('copied'); setTimeout(() => { $('copy-link').textContent = t('copyLink'); }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => toast(link, 6000));
    else toast(link, 6000);
  };
  function inviteLink() {
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('room', room ? room.code : '');
    if (Net.kind === 'local') u.searchParams.set('net', 'local');
    return u.toString();
  }

  // ---------- Online rooms ----------
  async function createOnline() {
    if (!P().name) { openProfile('home'); return; }
    if (!Net.available) { toast(t('offlineTitle') + '. ' + t('offlineBody'), 5000); return; }
    toast(t('connecting'), 8000);
    try {
      room = await Room.create(P());
      $('toast').hidden = true;
      enterLobby();
    } catch (e) { if (e.code !== 'unreachable') console.error(e); toast(t('errConnect'), 5000); }
  }
  async function joinOnline(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 4) { $('join-code').focus(); return; }
    if (!P().name) { params.set('room', code); openProfile('join'); return; }
    if (!Net.available) { toast(t('offlineTitle') + '. ' + t('offlineBody'), 5000); return; }
    toast(t('connecting'), 8000);
    try {
      room = await Room.join(code, P());
      $('toast').hidden = true;
      enterLobby();
    } catch (e) {
      if (e.code !== 'notFound' && e.code !== 'full' && e.code !== 'unreachable') console.error(e);
      toast(e.code === 'notFound' ? t('errNotFound', { code }) : e.code === 'full' ? t('errFull') : t('errConnect'), 4000);
    }
  }
  function enterLobby() {
    setupMode = 'online';
    show('scr-setup');
    let lastHost = null;
    unsubLobby = room.onLobby(L => {
      if (lastHost && L.meta && L.meta.host !== lastHost && L.players[L.meta.host]) toast(t('hostLeft', { name: L.players[L.meta.host].name }));
      lastHost = L.meta && L.meta.host;
      if (!$('scr-setup').hidden) renderLobby(L);
      if (L.meta && L.meta.status === 'lobby' && !$('scr-game').hidden && !S) { show('scr-setup'); closeAllOverlays(); renderLobby(L); }
    });
    unsubState = room.onState(st => {
      if (!st) { if (!$('scr-game').hidden) { S = prev = null; closeAllOverlays(); show('scr-setup'); renderLobby(room.lobby); } return; }
      if ($('scr-game').hidden) enterGame();
      onState(st);
    });
    if (!P().seenIntro) openIntro((room.lobby && room.lobby.settings) || localSettings, { standalone: true });
    const unsubConn = room.onConnection(() => { if (S && !$('scr-game').hidden) renderBanner(); });
    const prevUnsub = unsubLobby;
    unsubLobby = () => { prevUnsub && prevUnsub(); unsubConn(); };
  }
  function renderLobby(L) {
    if (!L || !L.meta) return;
    const s = L.settings || CONFIG.defaults;
    $('room-box').hidden = false;
    renderSettingsForm(s, L.isHost);
    $('setup-title').textContent = t('roomCode') + ' ' + L.code;
    $('room-code').textContent = L.code;
    const qrEl = $('room-qr');
    if (!qrEl.dataset.code || qrEl.dataset.code !== L.code) {
      qrEl.dataset.code = L.code;
      try {
        if (window.qrcode) { const q = qrcode(0, 'M'); q.addData(inviteLink()); q.make(); qrEl.innerHTML = q.createSvgTag({ cellSize: 3, margin: 0 }); }
      } catch (e) { qrEl.innerHTML = ''; }
    }
    const list = Object.entries(L.players).sort((a, b) => a[1].seat - b[1].seat);
    $('players-count').textContent = t('playersCount', { n: list.length });
    $('player-list').innerHTML = list.map(([id, p]) => `
      <li><span class="av">${esc(p.avatar)}</span><span class="pname">${esc(p.name)}</span>
      ${id === L.uid ? `<span class="badge gold">${esc(t('you'))}</span>` : ''}
      ${id === L.meta.host ? `<span class="badge">${esc(t('host'))}</span>` : ''}
      ${p.bot ? `<span class="badge">${esc(t('computer'))}</span>` : ''}
      ${p.online === false ? `<span class="badge off">offline</span>` : ''}
      ${id === L.uid ? `<button class="x" type="button" data-edit="1" aria-label="${esc(t('editPlayer'))}">✎</button>` : L.isHost ? `<button class="x" type="button" data-rm="${esc(id)}" aria-label="${esc(t('remove'))}">✕</button>` : ''}</li>`).join('');
    $('add-row').hidden = !L.isHost || list.length >= CONFIG.players.max;
    $('add-person').hidden = true;
    $('host-only').hidden = L.isHost;
    $('btn-start').hidden = !L.isHost;
    const seated = list.filter(([, p]) => p.bot || p.online !== false).length;
    $('btn-start').disabled = seated < CONFIG.players.min;
    $('setup-warn').hidden = !L.isHost || seated >= CONFIG.players.min;
    $('setup-warn').textContent = t('needTwo');
    const host = L.players[L.meta.host];
    $('wait-host').hidden = L.isHost;
    $('wait-host').textContent = L.spectator ? t('errStarted') : t('waitingHost', { name: host ? host.name : '' });
  }

  // ---------- Mack's intro (centre stage) ----------
  let intro = null;
  function openIntro(settings, { onDone = null, standalone = false, startAtEnd = false } = {}) {
    const s = Rules.normalizeSettings(settings);
    const pages = ['hello', s.mode === 'wager' ? 'wager' : 'classic'];
    if (s.mode === 'wager') pages.push('meter');
    if (s.trivia) pages.push('trivia');
    pages.push(s.mode === 'wager' ? 'rounds' : 'classicEnd');
    intro = { s, pages, i: startAtEnd ? pages.length - 1 : 0, onDone, standalone, meter: null };
    if (!mackIntro) mackIntro = Mack.create($('intro-mack'));
    $('ov-intro').hidden = false;
    renderIntro();
  }
  function payTable(s, classic) {
    const rows = classic
      ? [['nun', 'pay_c_nun', ''], ['gimel', 'pay_c_gimel', 'win'], ['hey', 'pay_c_hey', 'win'], ['shin', 'pay_c_shin', 'lose']]
      : [['gimel', 'pay_gimel', 'win'], ['hey', 'pay_hey', 'win'], ['nun', 'pay_nun', ''], ['shin', 'pay_shin', 'lose']];
    return '<div class="pay-table">' + rows.map(([L, k, c]) =>
      `<div class="pay-row ${c}"><span class="g">${I18N.glyph(L, s.inIsrael)}</span><div><b>${esc(I18N.letterName(L, s.inIsrael))}</b><span>${esc(t(k))}</span></div></div>`).join('') + '</div>';
  }
  function renderIntro() {
    const { s, pages, i } = intro;
    const pg = pages[i];
    let title = '', body = '', mood = 'happy';
    if (intro.meter) { intro.meter.halt(); intro.meter = null; }
    if (pg === 'hello') { title = t('intro_hello_t'); body = `<p>${esc(t('intro_hello'))}</p>`; mood = 'cheer'; }
    if (pg === 'wager') { title = t('intro_wager_t'); body = `<p>${esc(t('intro_wager'))}</p>${payTable(s, false)}`; }
    if (pg === 'classic') { title = t('intro_classic_t'); body = `<p>${esc(t('intro_classic'))}</p>${payTable(s, true)}`; }
    if (pg === 'meter') {
      title = t('intro_meter_t'); mood = 'wink';
      body = `<p>${esc(t('intro_meter'))}</p>
        <div class="bet-row"><div class="bet-val"><b id="ip-bet">5</b><small>${esc(t('yourBet'))}</small></div>
        <input type="range" class="bet-slider" id="ip-slider" min="1" max="100" value="5" aria-label="${esc(t('yourBet'))}"></div>
        <div class="tap-zone" id="ip-tap"><div class="meter big" id="ip-meter"></div><p class="hint center" id="ip-res">${esc(t('intro_meter_try'))}</p></div>`;
    }
    if (pg === 'trivia') { title = t('intro_trivia_t'); body = `<p>${esc(t('intro_trivia'))}</p>`; mood = 'wow'; }
    if (pg === 'rounds') { title = t('intro_rounds_t'); body = `<p>${esc(t('intro_rounds', { n: s.rounds }))}</p>`; mood = 'cheer'; }
    if (pg === 'classicEnd') { title = t('intro_rounds_t'); body = `<p>${esc(t('intro_classic_end', { n: s.rounds }))}</p>`; mood = 'cheer'; }
    $('intro-title').textContent = title;
    $('intro-body').innerHTML = body;
    $('intro-dots').innerHTML = pages.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    $('intro-back').disabled = i === 0;
    const last = i === pages.length - 1;
    $('intro-next').textContent = last ? (intro.standalone ? t('done') : t('intro_go')) : t('next');
    $('intro-skip').hidden = last;
    mackIntro.mood(mood, 0);
    mackIntro.anim(mood === 'cheer' ? 'cheer' : 'gasp');

    if (pg === 'meter') {
      const m = Meter($('ip-meter'));
      intro.meter = m;
      let bet = 5, live = false;
      m.preview(bet);
      $('ip-slider').oninput = e => { bet = +e.target.value; $('ip-bet').textContent = bet; if (!live) m.preview(bet); };
      $('ip-tap').onpointerdown = e => {
        e.preventDefault();
        if (!live) { live = true; m.start(bet); $('ip-res').textContent = t('tapStop'); return; }
        live = false;
        const { grade } = m.stop();
        Sound.play('stop', grade);
        $('ip-res').textContent = t('grade_' + grade);
        mackIntro.mood(grade === 'perfect' ? 'wow' : grade === 'good' ? 'cheer' : 'shrug', 1500);
      };
    }
  }
  $('intro-next').onclick = () => {
    Sound.unlock(); Sound.play('click');
    if (intro.i < intro.pages.length - 1) { intro.i++; renderIntro(); return; }
    finishIntro();
  };
  $('intro-back').onclick = () => { if (intro.i > 0) { intro.i--; renderIntro(); } };
  $('intro-skip').onclick = () => finishIntro();
  function finishIntro() {
    if (intro.meter) intro.meter.halt();
    $('ov-intro').hidden = true;
    Profile.set({ seenIntro: true });
    const f = intro.onDone; intro = null;
    if (f) f();
  }

  // ---------- Game ----------
  function startLocal(settings) {
    room = Room.local(settings, localPlayers.map(p => Object.assign({}, p)));
    enterGame();
    unsubState = room.onState(st => onState(st));
  }

  function enterGame() {
    show('scr-game');
    S = prev = null;
    Object.assign(ui, { panelKey: '', quizKey: '', revealKey: '', resultKey: '', overKey: '', turnKey: '', anteKey: '', spinKey: '', lastHumanTurn: null, passFor: null });
    if (!threeTried) {
      threeTried = true;
      threeOk = !!window.THREE && Dreidel3D.init($('three'));
      $('no3d').hidden = threeOk;
      if (threeOk) Dreidel3D.onLayout(() => S && positionSeats(S));
      window.addEventListener('resize', () => S && positionSeats(S));
    }
    if (!mackCorner) mackCorner = Mack.create($('mack-corner'), { corner: true });
    mackCorner.quiet = P().quiet;
    $('seats').innerHTML = '';
    holdWake();
  }

  function holdWake() {
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { ui.wake = w; }).catch(() => {}); } catch (e) { /* optional */ }
  }
  function releaseWake() { try { ui.wake && ui.wake.release(); } catch (e) { /* ignore */ } ui.wake = null; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S && !$('scr-game').hidden) holdWake(); });

  // Everything on the game screen is drawn from the state.
  function onState(st, force) {
    if (!st) return;
    const old = force ? prev : S;
    prev = old;
    S = st;
    if (threeOk) {
      Dreidel3D.setLetters(S.settings.inIsrael);
      if (ui.warmed !== S.gid) { ui.warmed = S.gid; Dreidel3D.warmSkins(S.players.map(p => p.skin)); }
    }
    renderTop();
    renderSeats();
    if (S.spin && (!old || key(old) !== key(S)) && ui.spinKey !== `${S.gid}:${S.spin.id}`) {
      ui.spinKey = `${S.gid}:${S.spin.id}`;
      if (S.phase === 'spinning') startSpin();
    }
    if (S.phase === 'turn' && ui.turnKey !== key(S)) { ui.turnKey = key(S); onTurn(); }
    if (S.phase === 'result' && ui.resultKey !== key(S)) { ui.resultKey = key(S); showResult(); }
    if (S.phase !== 'result') $('result-pop').hidden = true;
    renderTrivia();
    if (S.phase === 'over' && ui.overKey !== key(S)) { ui.overKey = key(S); showOver(); }
    if (S.phase !== 'over') $('ov-over').hidden = true;
    renderPanel();
    renderBanner();
  }

  // ----- Top bar: round, menorah, pot -----
  function renderTop() {
    $('g-round').innerHTML = S.spinoff
      ? `${esc(t('spinoff'))}`
      : `${esc(t('round', { r: S.round, n: S.settings.rounds }))}${S.settings.mode === 'classic' ? '' : `<small>· ${esc(t('modeWager'))}</small>`}`;
    renderMenorah(Math.min(8, S.round));
    $('g-pot').hidden = S.settings.mode !== 'classic';
    $('g-pot').textContent = `${t('pot')}: ${S.pot}`;
  }
  let menorahLit = -1;
  function renderMenorah(lit) {
    if (lit === menorahLit) return;
    menorahLit = lit;
    const xs = [14, 32, 50, 68, 112, 130, 148, 166];   // left → right; the first night's candle is on the right
    let s = '<defs><linearGradient id="mg" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="70"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#a87414"/></linearGradient></defs>';
    // Straight diagonal branches (as in Rashi's and the Rambam's drawing, the form Chabad uses):
    // each pair rises in a straight line from the centre stem, outer pairs from lower down.
    s += '<g fill="none" stroke="url(#mg)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">';
    for (let i = 0; i < 4; i++) { const x = xs[i], y0 = 62 - i * 8; s += `<path d="M${x} 34 L90 ${y0} L${180 - x} 34"/>`; }
    s += '<path d="M90 26 L90 64"/><path d="M76 66 L104 66" stroke-width="4"/></g>';
    const candle = (x, y, on, sham) => `<rect x="${x - 2.6}" y="${y}" width="5.2" height="${sham ? 14 : 11}" rx="1.4" fill="${sham ? '#fff4d9' : '#cfe0ff'}"/>` +
      (on ? `<ellipse class="flame" cx="${x}" cy="${y - 4}" rx="2.8" ry="5" fill="#ffd34d"/><ellipse cx="${x}" cy="${y - 3}" rx="1.3" ry="2.4" fill="#fff"/>` : '');
    xs.forEach((x, i) => { s += candle(x, 23, (7 - i) < lit, false); });
    s += candle(90, 12, true, true);
    $('menorah').innerHTML = s;
  }

  // ----- Seats around the table -----
  function seatOrder() {
    const n = S.players.length;
    let me = S.players.findIndex(p => room.myIds.includes(p.id));
    if (me < 0) me = 0;
    return S.players.map((p, i) => (i - me + n) % n);
  }
  function renderSeats() {
    const box = $('seats');
    const cur = Rules.current(S);
    const lobbyPlayers = room.kind === 'online' && room.lobby ? room.lobby.players : {};
    S.players.forEach((p, i) => {
      let el = box.querySelector(`[data-pid="${CSS.escape(p.id)}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'seat';
        el.dataset.pid = p.id;
        el.innerHTML = '<span class="s-av"></span><span class="s-name"></span><span class="s-coins"></span><span class="s-tag"></span>';
        box.appendChild(el);
      }
      const classic = S.settings.mode === 'classic';
      const out = classic ? p.out : p.coins <= 0;
      const off = lobbyPlayers[p.id] && lobbyPlayers[p.id].online === false;
      el.querySelector('.s-av').textContent = p.avatar;
      el.querySelector('.s-name').textContent = p.name;
      el.querySelector('.s-coins').textContent = p.coins;
      el.querySelector('.s-tag').textContent = out ? (classic ? t('outClassic') : t('outOfCoins')) : off ? 'offline' : p.bot ? t('computer') : '';
      el.classList.toggle('active', !!cur && cur.id === p.id && S.phase !== 'over');
      el.classList.toggle('me', room.myIds.includes(p.id));
      el.classList.toggle('out', out);
      el.classList.toggle('off', !!off);
      let bet = el.querySelector('.s-bet');
      const showBet = S.phase === 'spinning' && S.spin && S.spin.player === p.id && S.spin.wager > 0;
      if (showBet) { if (!bet) { bet = document.createElement('span'); bet.className = 's-bet'; el.appendChild(bet); } bet.textContent = S.spin.wager; }
      else if (bet) bet.remove();
    });
    box.querySelectorAll('.seat').forEach(el => { if (!S.players.some(p => p.id === el.dataset.pid)) el.remove(); });
    positionSeats();
  }
  function positionSeats() {
    if (!S) return;
    const n = S.players.length;
    const order = seatOrder();
    const stage = $('stage');
    let anchors;
    if (threeOk) anchors = Dreidel3D.seatAnchors(n);
    else {
      const w = stage.clientWidth, h = stage.clientHeight;
      anchors = Array.from({ length: n }, (_, i) => { const a = Math.PI / 2 + i * Math.PI * 2 / n; return { x: w / 2 + Math.cos(a) * w * 0.4, y: h / 2 + Math.sin(a) * h * 0.38 }; });
    }
    const crowded = n >= 7 && stage.clientWidth < 560;
    $('seats').classList.toggle('crowded', crowded);
    const w = stage.clientWidth, h = stage.clientHeight;
    const c = threeOk ? Dreidel3D.tableCenter() : { x: w / 2, y: h / 2 };
    S.players.forEach((p, i) => {
      const el = $('seats').querySelector(`[data-pid="${CSS.escape(p.id)}"]`);
      if (!el) return;
      const a = anchors[order[i]];
      // Push each plate outward from the table centre so it sits on the rail, not over the
      // felt; seats at the far side go further, since the standing dreidel reaches toward them.
      const dx = a.x - c.x, dy = a.y - c.y, len = Math.hypot(dx, dy) || 1;
      const push = 20 + (dy < 0 ? 18 * (-dy / len) : 0);
      const hw = el.offsetWidth / 2 + 4, hh = el.offsetHeight / 2 + 4;   // keep the whole plate on the stage
      el.style.left = clamp(a.x + dx / len * push, hw, w - hw) + 'px';
      el.style.top = clamp(a.y + dy / len * push, hh, h - hh) + 'px';
    });
  }
  function seatPoint(pid) {
    const el = $('seats').querySelector(`[data-pid="${CSS.escape(pid)}"]`);
    if (!el) return centerPoint();
    return { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
  }
  function centerPoint() {
    const st = $('stage');
    return threeOk ? Dreidel3D.centerScreen() : { x: st.clientWidth / 2, y: st.clientHeight / 2 };
  }
  function relPoint(el) {
    const a = el.getBoundingClientRect(), b = $('stage').getBoundingClientRect();
    return { x: a.left + a.width / 2 - b.left, y: a.top + a.height / 2 - b.top };
  }
  const mackPoint = () => relPoint($('mack-corner'));
  const potPoint = () => relPoint($('g-pot').hidden ? $('menorah') : $('g-pot'));

  function flyCoins(from, to, n, delay = 0) {
    const layer = $('coins');
    const count = clamp(n, 1, 10);
    for (let i = 0; i < count; i++) {
      const c = document.createElement('div');
      c.className = 'coin';
      c.style.left = from.x + 'px'; c.style.top = from.y + 'px';
      layer.appendChild(c);
      const dx = to.x - from.x, dy = to.y - from.y;
      const jitter = (Math.random() - 0.5) * 20;
      const anim = c.animate([
        { transform: 'translate(0,0) scale(0.6)', opacity: 0 },
        { transform: `translate(${dx * 0.5 + jitter}px, ${dy * 0.5 - 50}px) scale(1.1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.8)`, opacity: 1 },
      ], { duration: 650, delay: delay + i * 55, easing: 'ease-in-out', fill: 'both' });
      anim.onfinish = () => c.remove();
    }
    setTimeout(() => Sound.play('coin', Math.min(n, 5)), delay + 600);
  }
  function floatDelta(pid, d) {
    const el = $('seats').querySelector(`[data-pid="${CSS.escape(pid)}"]`);
    if (!el || !d) return;
    const f = document.createElement('span');
    f.className = 's-delta ' + (d > 0 ? 'plus' : 'minus');
    f.textContent = (d > 0 ? '+' : '−') + Math.abs(d);
    el.appendChild(f);
    setTimeout(() => f.remove(), 1900);
  }
  function geltShower() {
    const st = $('stage');
    for (let i = 0; i < 24; i++) {
      const x = Math.random() * st.clientWidth;
      flyCoins({ x, y: -20 }, { x: x + (Math.random() - 0.5) * 60, y: st.clientHeight * (0.5 + Math.random() * 0.4) }, 1, i * 40);
    }
  }

  // ----- Turn -----
  function onTurn() {
    const cur = Rules.current(S);
    if (threeOk) { Dreidel3D.setSkin(cur.skin || 'wood'); Dreidel3D.standUp(); }
    $('no3d').classList.remove('spin');
    $('no3d-letter').textContent = '';
    const mine = room.myIds.includes(cur.id);
    // Pass-and-play: ask for the device to be handed over when a different person is up.
    const humansHere = S.players.filter(p => room.myIds.includes(p.id));
    if (room.kind === 'local' && humansHere.length > 1 && mine && ui.lastHumanTurn !== cur.id) {
      ui.passFor = cur.id;
      showPass(cur, () => { ui.passFor = null; ui.lastHumanTurn = cur.id; ui.panelKey = ''; renderPanel(); turnLine(cur); });
    } else {
      if (mine) ui.lastHumanTurn = cur.id;
      turnLine(cur);
    }
    if (S.spinoff && S.spinoff.idx === 0 && ui.spinoffShown !== S.gid + S.spinoff.rounds) {
      ui.spinoffShown = S.gid + S.spinoff.rounds;
      mackCorner.react('wow', I18N.pick('mack_spinoff'), 'cheer');
      Sound.play('fanfare');
    }
    // Classic: a new round starts with everyone putting 1 in the pot.
    if (S.lastAnte && S.lastAnte.round === S.round && ui.anteKey !== S.gid + S.round) {
      ui.anteKey = S.gid + S.round;
      S.lastAnte.paid.forEach((pid, i) => flyCoins(seatPoint(pid), potPoint(), 1, i * 80));
    }
  }
  function turnLine(cur) {
    if (room.myIds.includes(cur.id) && (S.round <= 2 || S.spinoff)) {
      mackCorner.react('happy', I18N.pick('mack_turn', { name: cur.name }));
      Sound.play('buzz');
    }
  }
  function showPass(p, done) {
    $('pass-who').innerHTML = `<span class="av">${esc(p.avatar)}</span>${esc(p.name)}`;
    $('pass-go').textContent = t('imReady', { name: p.name });
    $('ov-pass').hidden = false;
    $('pass-go').onclick = () => { $('ov-pass').hidden = true; Sound.play('click'); done(); };
  }

  // ----- Spin -----
  function startSpin() {
    const sp = S.spin;
    const who = Rules.byId(S, sp.player);
    const skin = CONFIG.skins.find(s => s.id === sp.skin) || CONFIG.skins[0];
    if (sp.wager > 0) flyCoins(seatPoint(sp.player), centerPoint(), sp.wager);
    if (sp.grade !== 'classic') {
      const f = $('grade-flash');
      f.hidden = false; f.className = 'grade-flash ' + sp.grade;
      f.textContent = t('grade_' + sp.grade);
      void f.offsetWidth;
      setTimeout(() => { f.hidden = true; }, 1100);
      if (sp.grade === 'perfect') mackCorner.react('wow', room.myIds.includes(sp.player) ? I18N.pick('mack_perfect') : null);
    }
    Sound.play('spin', sp.ms - CONFIG.spin.fallMs);
    if (skin.fx === 'speed') { $('stage').classList.add('fx-speed'); setTimeout(() => $('stage').classList.remove('fx-speed'), sp.ms); }
    if (threeOk) {
      Dreidel3D.setSkin(sp.skin);
      Dreidel3D.spin({ letter: sp.letter, grade: sp.grade, upside: sp.upside, seed: sp.seed });
    } else {
      $('no3d').classList.add('spin');
      $('no3d-letter').textContent = '';
      setTimeout(() => { $('no3d').classList.remove('spin'); $('no3d-letter').textContent = letterGlyph(sp.letter); }, sp.ms);
    }
    if (who && who.bot) mackCorner.mood('think', 1200);
  }

  // ----- Result -----
  function showResult() {
    const r = S.result;
    if (!r) return;
    const p = Rules.byId(S, r.player);
    const classic = S.settings.mode === 'classic' && !S.spinoff;
    const d = r.deltas[r.player] || 0;
    let text, cls = 'good';
    if (S.spinoff) { text = t('res_spinoff', { letter: letterName(r.letter) }); cls = r.letter === 'gimel' ? 'good' : r.letter === 'shin' ? 'bad' : 'meh'; }
    else if (classic) {
      if (r.outNow.includes(r.player) && r.letter === 'shin') { text = t('res_classic_out'); cls = 'bad'; }
      else text = t('res_classic_' + r.letter, { n: Math.abs(d) });
      if (r.letter === 'shin') cls = 'bad'; if (r.letter === 'nun') cls = 'meh';
    } else {
      text = t('res_' + r.letter, { n: Math.abs(d || r.wager) });
      if (r.letter === 'shin') cls = 'bad'; if (r.letter === 'nun') cls = 'meh';
    }
    const pop = $('result-pop');
    pop.className = 'result-pop ' + cls;
    pop.innerHTML = `<div class="rp-letter">${letterGlyph(r.letter)}</div><div class="rp-name">${esc(letterName(r.letter))}</div><div class="rp-text">${esc(p ? p.name + ': ' : '')}${esc(text)}</div>`;
    pop.hidden = false;
    pop.style.animation = 'none'; void pop.offsetWidth; pop.style.animation = '';

    // Coins move: winnings come from Mack's honey pot (or the pot); losses go to Mack (or the pot).
    if (!S.spinoff) {
      if (d > 0) flyCoins(classic ? potPoint() : mackPoint(), seatPoint(r.player), d, 150);
      if (d < 0) flyCoins(seatPoint(r.player), classic ? potPoint() : mackPoint(), -d, 150);
      if (d) floatDelta(r.player, d);
      if (r.ante && r.ante.length) r.ante.forEach((pid, i) => flyCoins(seatPoint(pid), potPoint(), 1, 900 + i * 80));
    }
    const mine = room.myIds.includes(r.player);
    if (r.letter === 'gimel') { Sound.play('win'); mackCorner.react('cheer', I18N.pick('mack_gimel'), 'cheer'); }
    else if (r.letter === 'hey') { Sound.play('coin', 3); mackCorner.react('wink', mine ? I18N.pick('mack_hey') : null); }
    else if (r.letter === 'nun') { Sound.play('nun'); mackCorner.react('shrug', null); }
    else { Sound.play('lose'); mackCorner.react(mine ? 'sad' : 'gasp', mine || Math.abs(d) >= 10 ? I18N.pick('mack_shin') : null, 'gasp'); }
  }

  // ----- Panel at the bottom -----
  function renderPanel() {
    const cur = Rules.current(S);
    const mine = cur && room.myIds.includes(cur.id) && !ui.passFor;
    const k = (S.phase === 'turn' && mine) ? 'my:' + key(S) : 'wait:' + S.phase + ':' + key(S);
    if (k === ui.panelKey) return;
    if (ui.teardown) { ui.teardown(); ui.teardown = null; }
    ui.panelKey = k;
    $('panel').classList.toggle('compact', S.settings.mode === 'classic');
    if (S.phase === 'turn' && mine) {
      if (S.settings.mode === 'classic' || S.spinoff) panelClassic(cur);
      else panelWager(cur);
    } else panelWait(cur);
  }

  function timerHtml() { return S.deadline && S.phase === 'turn' ? '<span class="p-timer" id="p-timer"></span>' : ''; }
  setInterval(() => {
    const el = $('p-timer');
    if (!el || !S || !S.deadline || !room) return;
    const s = Math.max(0, Math.ceil((S.deadline - room.now()) / 1000));
    el.textContent = t('timeLeft', { s });
    el.classList.toggle('low', s <= 5);
  }, 250);

  function panelWager(cur) {
    const panel = $('panel');
    const max = cur.coins;
    let bet = clamp(ui.lastBet[cur.id] || Math.min(5, max), 1, max);
    panel.innerHTML = `
      <div class="p-head"><h3 class="p-title">${esc(t('yourTurn', { name: cur.name }))}</h3>${timerHtml()}</div>
      <div class="bet-row">
        <button class="bet-step" type="button" data-step="-1" aria-label="−">−</button>
        <div class="bet-val"><b id="bet-v">${bet}</b><small>${esc(t('ofCoins', { n: max }))}</small></div>
        <button class="bet-step" type="button" data-step="1" aria-label="+">+</button>
        <input type="range" class="bet-slider" id="bet-slider" min="1" max="${max}" value="${bet}" aria-label="${esc(t('yourBet'))}">
      </div>
      <div class="quick">
        ${[1, 5, 10].map(v => `<button type="button" data-q="${v}" ${v > max ? 'disabled' : ''}>${v}</button>`).join('')}
        <button type="button" class="allin" data-q="${max}">${esc(t('allIn'))}</button>
      </div>
      <div class="meter" id="bet-meter"></div>
      <p class="harder">${esc(t('harder'))}</p>
      <button class="btn btn-gold btn-big" id="spin-btn" type="button">${esc(t('spin'))}</button>`;
    const meter = Meter($('bet-meter'));
    meter.preview(bet);
    const setBet = v => {
      bet = clamp(Math.round(v), 1, max);
      $('bet-v').textContent = bet; $('bet-slider').value = bet;
      meter.preview(bet);
    };
    $('bet-slider').oninput = e => setBet(+e.target.value);
    panel.querySelectorAll('[data-step]').forEach(b => { b.onclick = () => { setBet(bet + +b.dataset.step); Sound.play('tick'); }; });
    panel.querySelectorAll('[data-q]').forEach(b => { b.onclick = () => { setBet(+b.dataset.q); Sound.play('click'); }; });
    ui.teardown = () => meter.halt();
    $('spin-btn').onclick = () => {
      Sound.unlock(); askMotion();
      meter.halt();
      ui.lastBet[cur.id] = bet;
      goLive(cur, bet);
    };
  }

  // The meter goes live: tap anywhere on the panel (or press Space) to stop it.
  function goLive(cur, bet) {
    const panel = $('panel');
    panel.innerHTML = `
      <div class="tap-zone" id="tap-zone">
        <div class="p-head"><h3 class="p-title" style="flex:1">${esc(t('tapStop'))}</h3>${timerHtml()}</div>
        <div class="meter big" id="live-meter"></div>
        <p class="harder">${esc(t('yourBet'))}: ${bet}</p>
      </div>`;
    const m = Meter($('live-meter'));
    m.start(bet);
    let done = false;
    const seq = S.seq;
    const stop = e => {
      if (done) return;
      if (e && e.type === 'keydown' && e.code !== 'Space' && e.code !== 'Enter') return;
      if (e) e.preventDefault();
      done = true;
      const { grade } = m.stop();
      Sound.play('stop', grade);
      cleanup();
      setTimeout(() => { if (S.seq === seq && S.phase === 'turn') room.send(cur.id, { type: 'spin', wager: bet, grade, upside: ui.upside }); }, 320);
    };
    const cleanup = () => { panel.removeEventListener('pointerdown', stop); document.removeEventListener('keydown', stop); };
    // Wait a beat so the tap that pressed Spin doesn't also stop the meter.
    setTimeout(() => { if (!done) { panel.addEventListener('pointerdown', stop); document.addEventListener('keydown', stop); } }, 120);
    ui.teardown = () => { done = true; cleanup(); m.halt(); };
  }

  function panelClassic(cur) {
    const panel = $('panel');
    panel.innerHTML = `
      <div class="p-head"><h3 class="p-title">${esc(S.spinoff ? t('spinoff') + ' ' + cur.name : t('yourTurn', { name: cur.name }))}</h3>${timerHtml()}</div>
      ${S.spinoff ? `<p class="harder">${esc(t('spinoffHint'))}</p>` : ''}
      <button class="btn btn-gold btn-big" id="spin-btn" type="button">${esc(t('spin'))}</button>`;
    $('spin-btn').onclick = () => {
      Sound.unlock(); askMotion();
      $('spin-btn').disabled = true;
      room.send(cur.id, { type: 'spin', upside: ui.upside });
    };
  }

  function panelWait(cur) {
    const panel = $('panel');
    let text = '';
    const classic = S.settings.mode === 'classic' || !!S.spinoff;
    if (S.phase === 'turn') text = classic ? t('turnOf', { name: cur.name }) : t('choosingBet', { name: cur.name });
    else if (S.phase === 'spinning') { const p = Rules.byId(S, S.spin.player); text = S.spin.wager ? t('spinning', { name: p.name, n: S.spin.wager }) : t('spinningClassic', { name: p.name }); }
    else if (S.phase === 'trivia' || S.phase === 'reveal') text = t('buzzQuiz');
    else if (S.phase === 'result') { const p = Rules.byId(S, S.result.player); text = `${p.name}: ${letterName(S.result.letter)}`; }
    else if (S.phase === 'over') text = t('gameOver');
    const who = S.phase === 'spinning' ? Rules.byId(S, S.spin.player) : S.phase === 'result' ? Rules.byId(S, S.result.player) : cur;
    panel.innerHTML = `<div class="p-wait"><span class="av">${esc(who ? who.avatar : '🐝')}</span><span>${esc(text)}</span>${timerHtml()}</div>`;
  }

  function renderBanner() {
    const b = $('g-banner');
    let text = '';
    if (room && room.kind === 'online' && room.connected === false) text = t('reconnecting');
    else if (S.spinoff) text = t('spinoffHint');
    else if (!room.myIds.length) text = t('spectating');
    b.hidden = !text;
    b.textContent = text;
  }

  // ----- Trivia -----
  function renderTrivia() {
    if (S.phase === 'trivia') {
      if (ui.quizKey !== key(S)) { ui.quizKey = key(S); openQuiz(); }
      else updateQuizWho();
    } else if (S.phase === 'reveal') {
      if (ui.revealKey !== key(S)) { ui.revealKey = key(S); showReveal(); }
    } else if (!$('ov-trivia').hidden) {
      closeQuiz();
    }
  }
  function closeQuiz() {
    if (ui.quiz && ui.quiz.timer) clearInterval(ui.quiz.timer);
    ui.quiz = null;
    $('ov-trivia').hidden = true;
  }
  const OPT_MARK = { en: ['A', 'B', 'C', 'D'], he: ['א', 'ב', 'ג', 'ד'] };
  function qText(q, field) { return (q[field] && (q[field][I18N.lang] || q[field].en)) || ''; }
  function optText(q, d) { const opts = q.options[I18N.lang] || q.options.en; return opts[S.trivia.order[d]]; }

  function openQuiz() {
    const q = Trivia.byId(S.trivia.qid);
    if (!q) return;
    const queue = S.players.filter(p => room.myIds.includes(p.id) && !p.bot).map(p => p.id);
    ui.quiz = { q, queue, idx: 0, start: 0, endAt: 0, timer: 0, answered: false, seq: key(S) };
    $('ov-trivia').hidden = false;
    $('ov-trivia').scrollTop = 0;
    Sound.play('quiz');
    mackCorner.react('wow', I18N.pick('mack_quiz'), 'cheer');
    if (queue.length > 1) quizReady();
    else quizAsk(queue[0] || null);
  }
  function quizReady() {
    const Q = ui.quiz;
    const p = Rules.byId(S, Q.queue[Q.idx]);
    $('quiz').innerHTML = `
      <div class="q-top"><h2 class="q-title">${esc(t('buzzQuiz'))}</h2></div>
      <p class="q-stake">${esc(stakeLine())}</p>
      <div class="pass-card" style="box-shadow:none;background:none;padding:0">
        <p>${esc(t('passTo'))}</p><div class="pass-who"><span class="av">${esc(p.avatar)}</span>${esc(p.name)}</div>
        <button class="btn btn-gold btn-big" id="q-ready" type="button">${esc(t('imReady', { name: p.name }))}</button>
      </div>`;
    $('q-ready').onclick = () => quizAsk(p.id);
  }
  function stakeLine() {
    const sp = Rules.byId(S, S.spin.player);
    return t('atStake', { name: sp.name, n: S.spin.wager });
  }
  function quizAsk(pid) {
    const Q = ui.quiz;
    const q = Q.q;
    const secs = S.settings.triviaSeconds;
    Q.pid = pid; Q.answered = false;
    Q.start = Date.now();
    // One person answering: everyone shares the room clock. Several on one device: each gets their own time.
    Q.endAt = Q.queue.length > 1 ? Date.now() + secs * 1000 : Date.now() + Math.max(0, S.trivia.at + secs * 1000 - room.now());
    const p = pid ? Rules.byId(S, pid) : null;
    const marks = OPT_MARK[I18N.lang] || OPT_MARK.en;
    $('quiz').innerHTML = `
      <div class="q-top">
        <div><h2 class="q-title">${esc(t('buzzQuiz'))}</h2><span class="q-level">${esc(t('level_' + q.level))}</span></div>
        <div class="q-clock"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="3.5"/><circle id="q-ring" cx="18" cy="18" r="15.5" fill="none" stroke="#e9b949" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="97.4" stroke-dashoffset="0"/></svg><b id="q-sec"></b></div>
      </div>
      <p class="q-stake">${esc(stakeLine())}${p && Q.queue.length > 1 ? ' · ' + esc(t('yourAnswer', { name: p.name })) : ''}</p>
      <p class="q-text">${esc(qText(q, 'q'))}</p>
      <div class="q-opts" id="q-opts">
        ${[0, 1, 2, 3].map(d => `<button class="q-opt" type="button" data-d="${d}" ${pid ? '' : 'disabled'}><i>${marks[d]}</i><span>${esc(optText(q, d))}</span><span class="q-who" data-who="${d}"></span></button>`).join('')}
      </div>
      <p class="q-status" id="q-status">${pid ? '' : esc(t('waitingOthers'))}</p>`;
    $('q-opts').onclick = e => {
      const b = e.target.closest('.q-opt'); if (!b || !Q.pid || Q.answered) return;
      submitAnswer(+b.dataset.d, b);
    };
    clearInterval(Q.timer);
    Q.timer = setInterval(tickQuiz, 200);
    tickQuiz();
    updateQuizWho();
  }
  function tickQuiz() {
    const Q = ui.quiz;
    if (!Q || !$('q-sec')) return;
    const secs = S.settings.triviaSeconds;
    const left = Math.max(0, Q.endAt - Date.now());
    $('q-sec').textContent = Math.ceil(left / 1000);
    $('q-ring').setAttribute('stroke-dashoffset', String(97.4 * (1 - left / (secs * 1000))));
    if (left <= 0 && Q.pid && !Q.answered) submitAnswer(null, null);
  }
  function submitAnswer(d, btn) {
    const Q = ui.quiz;
    Q.answered = true;
    if (btn) btn.setAttribute('aria-pressed', 'true');
    $('q-opts').querySelectorAll('.q-opt').forEach(b => { b.disabled = true; });
    $('q-status').textContent = d === null ? t('timeUp') : t('lockedIn') + ' ' + t('waitingOthers');
    Sound.play('click');
    const more = Q.queue.length > 1 && Q.idx < Q.queue.length - 1;
    // On this device the answer can close the question at once and show the reveal, so send last.
    room.send(Q.pid, { type: 'answer', choice: d, ms: Date.now() - Q.start });
    if (more && ui.quiz === Q) {
      Q.idx++;
      clearInterval(Q.timer);
      setTimeout(() => { if (ui.quiz === Q && S.phase === 'trivia') quizReady(); }, 700);
    }
  }
  function updateQuizWho() {
    const n = Object.keys(S.trivia.answers).length;
    const st = $('q-status');
    if (st && ui.quiz && ui.quiz.answered && ui.quiz.queue.length <= 1) st.textContent = `${t('lockedIn')} ${t('waitingOthers')} (${n}/${S.players.length})`;
  }

  function showReveal() {
    const T = S.trivia;
    const q = Trivia.byId(T.qid);
    if (!q) return;
    if (ui.quiz && ui.quiz.timer) clearInterval(ui.quiz.timer);
    $('ov-trivia').hidden = false;
    $('ov-trivia').scrollTop = 0;
    const marks = OPT_MARK[I18N.lang] || OPT_MARK.en;
    const sp = Rules.byId(S, S.spin.player);
    const thieves = Object.keys(S.result.deltas).filter(pid => pid !== sp.id).map(pid => Rules.byId(S, pid).name);
    const outcome = T.outcome === 'kept' ? t('out_kept', { name: sp.name, n: S.spin.wager })
      : T.outcome === 'nun' ? t('out_nun')
      : T.outcome === 'stolen' ? t('out_stolen', { thieves: thieves[0], n: S.spin.wager })
      : t('out_split', { thieves: thieves.join(t('and')) });
    const cls = T.outcome === 'kept' ? 'kept' : T.outcome === 'nun' ? 'nun' : 'steal';
    const byChoice = [[], [], [], []];
    for (const pid in T.answers) { const a = T.answers[pid]; if (a && a.c !== null && a.c !== undefined) byChoice[a.c].push(Rules.byId(S, pid)); }
    const canContinue = room.kind === 'local' || room.isHost;
    $('quiz').innerHTML = `
      <div class="q-top"><div><h2 class="q-title">${esc(t('buzzQuiz'))}</h2><span class="q-level">${esc(t('level_' + q.level))}</span></div></div>
      <p class="q-text">${esc(qText(q, 'q'))}</p>
      <div class="q-opts">
        ${[0, 1, 2, 3].map(d => `<div class="q-opt ${d === T.correct ? 'right' : byChoice[d].some(p => room.myIds.includes(p.id)) ? 'wrong' : ''}"><i>${marks[d]}</i><span>${esc(optText(q, d))}</span><span class="q-who">${byChoice[d].map(p => `<span title="${esc(p.name)}">${esc(p.avatar)}</span>`).join('')}</span></div>`).join('')}
      </div>
      <p class="q-outcome ${cls}">${esc(outcome)}</p>
      <div class="q-source">
        <span class="ref">${esc(q.ref)}</span>
        <span class="he">${esc(q.quote.he)}</span>
        <span class="en">${esc(q.quote.en)}${q.enTranslated ? ` <em>(${esc(t('translatedNote'))})</em>` : ''}</span>
        <a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(t('learnMore'))} ↗</a>
      </div>
      ${canContinue ? `<button class="btn btn-gold" id="q-continue" type="button">${esc(t('continue'))}</button>` : ''}`;
    if (canContinue) $('q-continue').onclick = () => room.send(myId(), { type: 'continue' });
    const right = (T.right || []).some(pid => room.myIds.includes(pid));
    const answeredHere = Object.keys(T.answers).some(pid => room.myIds.includes(pid));
    if (answeredHere) Sound.play(right ? 'right' : 'wrong');
    for (const pid in S.result.deltas) {
      const d = S.result.deltas[pid];
      flyCoins(mackPoint(), seatPoint(pid), d, 300);
      floatDelta(pid, d);
    }
    if (cls === 'steal') { Sound.play('steal'); mackCorner.react('sneaky', I18N.pick('mack_steal'), 'cheer'); }
    else if (cls === 'kept') mackCorner.react('cheer', null, 'cheer');
    else mackCorner.react('shrug', null);
  }

  // ----- Game over -----
  function showOver() {
    if (ui.teardown) { ui.teardown(); ui.teardown = null; }
    const winners = S.winners.map(id => Rules.byId(S, id));
    const w = winners[0];
    const iWon = winners.some(p => room.myIds.includes(p.id));
    let earned = null;
    const recKey = S.gid;
    if (ui.recorded !== recKey) {
      ui.recorded = recKey;
      earned = Profile.recordGame(S, myId());
      ui.lastEarned = earned;
    } else earned = ui.lastEarned;
    const list = Rules.standings(S);
    const canAgain = room.kind === 'local' || room.isHost;
    $('over').innerHTML = `
      <h2>${esc(t('gameOver'))}</h2>
      <div class="podium"><span class="crown">👑</span><span class="who">${esc(iWon && room.myIds.length === 1 ? t('youWin', { name: w.name }) : t('winnerIs', { name: w ? w.name : '' }))}</span></div>
      <ol class="final">${list.map(p => `<li class="${S.winners.includes(p.id) ? 'win' : ''}"><span class="av">${esc(p.avatar)}</span><span class="n">${esc(p.name)}</span><span class="c">${p.coins}</span></li>`).join('')}</ol>
      ${earned && earned.honey ? `<p class="earned">${esc(t('honeyEarned', { n: earned.honey }))}</p>` : ''}
      ${earned && earned.unlocks ? earned.unlocks.map(s => `<div class="unlock"><img alt="" data-thumb="${s.id}" src="${skinThumb(s.id)}"><b>${esc(t('newUnlock', { name: I18N.local(s.name) }))}</b></div>`).join('') : ''}
      <div class="btns">
        <button class="btn btn-navy" id="over-home" type="button">${esc(t('home'))}</button>
        ${canAgain ? `<button class="btn btn-gold" id="over-again" type="button">${esc(t('playAgain'))}</button>` : `<span class="hint center">${esc(t('waitingHost', { name: '' }))}</span>`}
      </div>`;
    $('ov-over').hidden = false;
    $('over-home').onclick = () => goHome();
    if (canAgain) $('over-again').onclick = () => {
      $('ov-over').hidden = true;
      if (room.kind === 'local') room.playAgain(); else room.backToLobby();
    };
    Sound.play('fanfare');
    mackCorner.react('cheer', I18N.pick('mack_win', { name: w ? w.name : '' }), 'loop');
    confetti();
  }
  function confetti() {
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#e9b949', '#ffe08a', '#2f63d6', '#ffffff', '#5fd68f', '#f7b81c'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 2.2 + Math.random() * 2 + 's';
      c.style.animationDelay = Math.random() * 0.8 + 's';
      box.appendChild(c);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 5200);
  }

  // ----- Menu -----
  function renderMenuLabels() {
    $('m-sound').textContent = `${t('sound')}: ${P().sound ? t('on') : t('off')}`;
    $('m-quiet').textContent = `${t('quietMack')}: ${P().quiet ? t('on') : t('off')}`;
    $('m-lang').textContent = t('language');
  }
  $('g-menu').onclick = () => { renderMenuLabels(); $('ov-menu').hidden = false; };
  $('m-close').onclick = () => { $('ov-menu').hidden = true; };
  $('m-rules').onclick = () => { $('ov-menu').hidden = true; if (S) openIntro(S.settings, { standalone: true }); };
  $('m-sound').onclick = () => { Profile.set({ sound: !P().sound }); Sound.setEnabled(P().sound); renderMenuLabels(); };
  $('m-quiet').onclick = () => { Profile.set({ quiet: !P().quiet }); if (mackCorner) mackCorner.quiet = P().quiet; renderMenuLabels(); };
  $('m-lang').onclick = () => setLang(P().lang === 'he' ? 'en' : 'he');
  $('m-leave').onclick = async () => {
    $('ov-menu').hidden = true;
    if (await confirmBox(t('leaveConfirm'))) goHome();
  };

  // Read-only view for automated tests.
  window.MackTest = { get state() { return S; }, get room() { return room; }, get ui() { return ui; } };

  // ---------- Start ----------
  applyTexts();
  const roomParam = (params.get('room') || '').toUpperCase();
  if (roomParam) $('join-code').value = roomParam.slice(0, 4);
  if (!P().name) {
    show('scr-profile');
    profileReturn = roomParam ? 'join' : 'home';
    renderProfile();
  } else {
    show('scr-home');
    renderHome();
    if (roomParam) joinOnline(roomParam);
  }
})();
