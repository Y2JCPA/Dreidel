/* ============================================
   MACK-A-BEE DREIDEL — Trivia question bank
   Questions come from data/questions-*.js (each pushes onto
   window.QUESTION_BANK). Every question cites the Sefaria passage it
   comes from. pick() chooses one for the room's level without repeats;
   on Mixed, questions get harder as the game goes on.
   ============================================ */
const Trivia = (function () {
  let index = null;
  function bank() { return (typeof window !== 'undefined' && window.QUESTION_BANK) || []; }
  function byId(id) {
    if (!index || index.size !== bank().length) index = new Map(bank().map(q => [q.id, q]));
    return index.get(id);
  }
  function answerOf(id) { const q = byId(id); return q ? q.answer : 0; }

  function levelFor(S, rng) {
    const lvl = S.settings.triviaLevel;
    if (lvl !== 'mixed') return lvl;
    const progress = (S.round - 1) / Math.max(1, S.settings.rounds - 1);   // 0 → 1 over the game
    const r = rng();
    if (progress < 0.34) return r < 0.6 ? 'kids' : 'adults';
    if (progress < 0.67) return r < 0.2 ? 'kids' : r < 0.8 ? 'adults' : 'tc';
    return r < 0.5 ? 'adults' : 'tc';
  }

  function pick(S, rng = Math.random) {
    const used = new Set(S.usedQ || []);
    const want = levelFor(S, rng);
    let pool = bank().filter(q => q.level === want && !used.has(q.id));
    if (!pool.length) pool = bank().filter(q => !used.has(q.id) && (S.settings.triviaLevel === 'mixed' || q.level === S.settings.triviaLevel));
    if (!pool.length) pool = bank().filter(q => !used.has(q.id));
    if (!pool.length) return null;
    return pool[Math.floor(rng() * pool.length)].id;
  }

  const ctx = { pickQuestion: pick, answerOf };
  return { bank, byId, answerOf, pick, ctx, count: () => bank().length };
})();
