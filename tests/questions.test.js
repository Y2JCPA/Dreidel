// Checks the shape of the trivia bank. Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
for (const f of ['kids', 'adults', 'tc']) require(`../data/questions-${f}.js`);
const bank = window.QUESTION_BANK;

test('50 questions per level, unique ids', () => {
  const count = {};
  for (const q of bank) count[q.level] = (count[q.level] || 0) + 1;
  assert.deepEqual(count, { kids: 50, adults: 50, tc: 50 });
  assert.equal(new Set(bank.map(q => q.id)).size, bank.length);
});

test('every question is bilingual, has 4 options, an answer and a Sefaria source', () => {
  for (const q of bank) {
    assert.ok(q.q.en && q.q.he, q.id);
    assert.equal(q.options.en.length, 4, q.id);
    assert.equal(q.options.he.length, 4, q.id);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, q.id);
    assert.ok(q.url.startsWith('https://www.sefaria.org/'), q.id);
    assert.ok(q.ref && q.quote.he && q.quote.en, q.id);
  }
});

test('picking never repeats a question and respects the level', () => {
  global.CONFIG = require('../js/config.js');
  const Trivia = (new Function('window', require('fs').readFileSync(__dirname + '/../js/trivia.js', 'utf8') + '; return Trivia;'))(window);
  const S = { settings: { triviaLevel: 'tc', rounds: 5 }, round: 1, usedQ: [] };
  for (let i = 0; i < 50; i++) {
    const id = Trivia.pick(S);
    assert.ok(id.startsWith('t'));
    assert.ok(!S.usedQ.includes(id));
    S.usedQ.push(id);
  }
});
