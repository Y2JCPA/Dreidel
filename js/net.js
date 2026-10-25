/* ============================================
   MACK-A-BEE DREIDEL — Network backend
   A tiny database API used by online rooms:
     connect() → my user id
     get / set / update / remove / transaction(path, …)
     on(path, cb) → unsubscribe        (cb gets the value now and on every change)
     onDisconnect(path, value)        (set when this device drops off; null removes)
     now()                            (server-corrected clock)

   Two backends:
   • Firebase Realtime Database with anonymous sign-in (real online play).
   • "Local net" over BroadcastChannel + localStorage, for testing
     several players in browser tabs on one computer. Turn it on by
     adding ?net=local to the address.
   ============================================ */
const Net = (function () {
  const params = new URLSearchParams(location.search);
  const wantLocal = params.get('net') === 'local';
  // ?emulator=127.0.0.1 points at the Firebase emulators (auth :9099, database :9000) for local testing.
  const emu = params.get('emulator');
  const config = emu
    ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-mackabee', databaseURL: `http://${emu}:9000?ns=demo-mackabee` }
    : (typeof FIREBASE_CONFIG !== 'undefined' ? FIREBASE_CONFIG : null);
  const hasFirebase = !!config && typeof firebase !== 'undefined' && !!firebase.initializeApp;

  const split = path => path.split('/').filter(Boolean);
  const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

  // ---------- Local net (tabs on one computer) ----------
  function LocalBackend() {
    const KEY = 'mackabee_localnet';
    const chan = new BroadcastChannel('mackabee_localnet');
    const listeners = new Set();
    const disconnects = [];
    let me = sessionStorage.getItem('mackabee_localnet_uid');
    if (!me) { me = 'L' + Math.random().toString(36).slice(2, 9); sessionStorage.setItem('mackabee_localnet_uid', me); }

    const readTree = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const writeTree = t => localStorage.setItem(KEY, JSON.stringify(t));
    function at(tree, path) { let n = tree; for (const k of split(path)) { if (n == null || typeof n !== 'object') return null; n = n[k]; } return n === undefined ? null : n; }
    function put(tree, path, val) {
      const keys = split(path);
      let n = tree;
      for (let i = 0; i < keys.length - 1; i++) { if (typeof n[keys[i]] !== 'object' || n[keys[i]] === null) n[keys[i]] = {}; n = n[keys[i]]; }
      const last = keys[keys.length - 1];
      if (val === null || val === undefined) delete n[last]; else n[last] = clone(val);
    }
    function notify() {
      for (const l of listeners) {
        const v = at(readTree(), l.path);
        const s = JSON.stringify(v);
        if (s !== l.last) { l.last = s; try { l.cb(clone(v)); } catch (e) { console.error(e); } }
      }
    }
    chan.onmessage = () => notify();
    window.addEventListener('storage', e => { if (e.key === KEY) notify(); });
    function changed() { chan.postMessage(1); setTimeout(notify, 0); }
    window.addEventListener('pagehide', () => {
      const t = readTree();
      for (const [p, v] of disconnects) put(t, p, v);
      writeTree(t); chan.postMessage(1);
    });

    return {
      kind: 'local',
      async connect() { return me; },
      async get(path) { return clone(at(readTree(), path)); },
      async set(path, val) { const t = readTree(); put(t, path, val); writeTree(t); changed(); },
      async update(path, obj) { const t = readTree(); for (const k in obj) put(t, path + '/' + k, obj[k]); writeTree(t); changed(); },
      async remove(path) { const t = readTree(); put(t, path, null); writeTree(t); changed(); },
      async transaction(path, fn) {
        const t = readTree();
        const next = fn(clone(at(t, path)));
        if (next === undefined) return { committed: false, value: at(t, path) };
        put(t, path, next); writeTree(t); changed();
        return { committed: true, value: clone(next) };
      },
      on(path, cb) {
        const l = { path, cb, last: undefined };
        listeners.add(l);
        setTimeout(() => { const v = at(readTree(), path); l.last = JSON.stringify(v); cb(clone(v)); }, 0);
        return () => listeners.delete(l);
      },
      onDisconnect(path, val) { disconnects.push([path, val]); },
      cancelDisconnects() { disconnects.length = 0; },
      onConnection(cb) { setTimeout(() => cb(true), 0); return () => {}; },   // tabs are always connected
      setOffline() {},
      now: () => Date.now(),
    };
  }

  // ---------- Firebase ----------
  function FirebaseBackend() {
    let db = null, offset = 0;
    const ref = p => db.ref(p);
    return {
      kind: 'firebase',
      connect() {
        return new Promise((resolve, reject) => {
          try {
            const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
            const auth = app.auth();
            db = app.database();
            if (emu) { auth.useEmulator(`http://${emu}:9099`, { disableWarnings: true }); db.useEmulator(emu, 9000); }
            const timer = setTimeout(() => reject(new Error('timeout')), 12000);
            auth.onAuthStateChanged(u => {
              if (!u) return;
              clearTimeout(timer);
              db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
              resolve(u.uid);
            });
            auth.signInAnonymously().catch(e => { clearTimeout(timer); reject(e); });
          } catch (e) { reject(e); }
        });
      },
      async get(path) { const s = await ref(path).get(); return s.val(); },
      set(path, val) { return ref(path).set(val); },
      update(path, obj) { return ref(path).update(obj); },
      remove(path) { return ref(path).remove(); },
      async transaction(path, fn) {
        const r = await ref(path).transaction(cur => { const n = fn(cur); return n === undefined ? undefined : n; });
        return { committed: r.committed, value: r.snapshot.val() };
      },
      on(path, cb) {
        const h = s => cb(s.val());
        ref(path).on('value', h);
        return () => ref(path).off('value', h);
      },
      onDisconnect(path, val) { const d = ref(path).onDisconnect(); return val === null ? d.remove() : d.set(val); },
      cancelDisconnects() { /* handled per path by Firebase */ },
      // Called with true/false whenever this device's link to the database comes and goes.
      onConnection(cb) {
        const r = db.ref('.info/connected'), h = s => cb(!!s.val());
        r.on('value', h);
        return () => r.off('value', h);
      },
      setOffline(off) { if (off) db.goOffline(); else db.goOnline(); },   // used by tests
      now: () => Date.now() + offset,
    };
  }

  const backend = wantLocal ? LocalBackend() : hasFirebase ? FirebaseBackend() : null;
  function withTimeout(promise, ms = 15000) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('unreachable'), { code: 'unreachable' })), ms); }),
    ]).finally(() => clearTimeout(timer));
  }
  let uid = null, connecting = null;

  return {
    get available() { return !!backend; },
    get kind() { return backend ? backend.kind : 'none'; },
    get uid() { return uid; },
    connect() {
      if (!backend) return Promise.reject(new Error('offline'));
      if (!connecting) connecting = backend.connect().then(id => (uid = id)).catch(e => { connecting = null; throw e; });
      return connecting;
    },
    // Reads and transactions give up after 15 s, so an unreachable database shows an error
    // instead of "Connecting…" forever.
    get: (p) => withTimeout(backend.get(p)),
    set: (p, v) => backend.set(p, v),
    update: (p, o) => backend.update(p, o),
    remove: (p) => backend.remove(p),
    transaction: (p, fn) => withTimeout(backend.transaction(p, fn)),
    on: (p, cb) => backend.on(p, cb),
    onDisconnect: (p, v) => backend.onDisconnect(p, v),
    onConnection: (cb) => backend.onConnection(cb),
    setOffline: (off) => backend.setOffline(off),
    now: () => (backend ? backend.now() : Date.now()),
  };
})();
