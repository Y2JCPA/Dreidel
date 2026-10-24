/* ============================================
   MACK-A-BEE DREIDEL — Your player
   Name, avatar, chosen dreidel, settings, stats and honey jars, saved
   on this device. Honey jars and wins unlock more dreidels.
   ============================================ */
const Profile = (function () {
  // ?p=name keeps a separate profile, so several test players can share one browser.
  const slot = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('p') : null;
  const KEY = 'mackabee_profile_v1' + (slot ? '_' + slot.replace(/\W/g, '') : '');
  const rid = () => Math.random().toString(36).slice(2, 10);
  const browserHe = typeof navigator !== 'undefined' && /^he|^iw/i.test(navigator.language || '');

  const defaults = () => ({
    id: 'u_' + rid(),
    name: '',
    avatar: CONFIG.avatars[Math.floor(Math.random() * CONFIG.avatars.length)],
    skin: 'wood',
    lang: browserHe ? 'he' : 'en',
    sound: true,
    quiet: false,
    seenIntro: false,
    honey: 0,
    stats: { games: 0, wins: 0, perfect: 0, correct: 0, steals: 0, tcWins: 0 },
    settings: null,
    guests: [],        // other people added on this device (pass-and-play)
  });

  let data = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = Object.assign(defaults(), JSON.parse(raw));
    data.stats = Object.assign(defaults().stats, data.stats || {});
  } catch (e) { /* storage blocked: play without saving */ }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }

  // { have, need, kind } for a locked skin, or null if it is open.
  function requirement(skin) {
    const u = skin.unlock;
    if (!u) return null;
    const kind = Object.keys(u)[0];
    const need = u[kind];
    const have = kind === 'honey' ? data.honey : (data.stats[kind] || 0);
    return { kind, need, have: Math.min(have, need) };
  }
  function isUnlocked(skin) {
    const r = requirement(skin);
    return !r || r.have >= r.need;
  }
  function unlockedSkins() { return CONFIG.skins.filter(isUnlocked); }

  // Credit this device's player for a finished game. Returns what they earned.
  function recordGame(S, myId) {
    const me = S.players.find(p => p.id === myId);
    if (!me) return { honey: 0, unlocks: [] };
    const before = new Set(unlockedSkins().map(s => s.id));
    const H = CONFIG.honey;
    const won = S.winners.includes(myId);
    let honey = H.played + me.stats.perfect * H.perfect + me.stats.correct * H.correct + me.stats.steals * H.steal;
    if (won) honey += H.win;
    data.honey += honey;
    data.stats.games++;
    if (won) data.stats.wins++;
    if (won && S.settings.trivia && S.settings.triviaLevel === 'tc') data.stats.tcWins++;
    data.stats.perfect += me.stats.perfect;
    data.stats.correct += me.stats.correct;
    data.stats.steals += me.stats.steals;
    save();
    const unlocks = unlockedSkins().filter(s => !before.has(s.id));
    return { honey, unlocks, won };
  }

  return {
    get data() { return data; },
    set(patch) { Object.assign(data, patch); save(); },
    save, requirement, isUnlocked, unlockedSkins, recordGame,
  };
})();
