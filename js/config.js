/* ============================================
   MACK-A-BEE DREIDEL — Tunable numbers
   Every number that shapes how the game plays lives here, so odds,
   meter difficulty, timings and unlocks can be tuned without touching
   logic. Loaded as a plain <script> in the browser and with require()
   in Node (tests and the odds simulation).
   ============================================ */
const CONFIG = {
  players: { min: 2, max: 8 },

  defaults: {
    mode: 'wager',          // 'wager' | 'classic'
    inIsrael: false,        // true → פ (Pey, נס גדול היה פה), false → ש (Shin, נס גדול היה שם)
    startCoins: 20,
    rounds: 5,
    trivia: true,           // Wager mode only
    triviaLevel: 'adults',  // 'kids' | 'adults' | 'tc' | 'mixed'
    triviaChance: 70,       // % chance a Gimel triggers a question
    triviaSeconds: 15,
    turnSeconds: 0,         // 0 = no turn timer (local play); online rooms use `onlineTurnSeconds`
  },
  onlineTurnSeconds: 30,
  options: {
    startCoins: [10, 20, 50],
    rounds: [3, 5, 7, 10],
    triviaLevel: ['kids', 'adults', 'tc', 'mixed'],
    triviaChance: [50, 70, 100],
    triviaSeconds: [10, 15, 20],
  },

  // Letters in the order they sit around the dreidel (face 0..3).
  letters: ['nun', 'gimel', 'hey', 'shin'],

  // Percent chances by meter grade. Each row must add up to 100.
  odds: {
    miss:    { gimel: 20, hey: 25, nun: 25, shin: 30 },
    good:    { gimel: 30, hey: 28, nun: 22, shin: 20 },
    perfect: { gimel: 35, hey: 30, nun: 20, shin: 15 },
    classic: { gimel: 25, hey: 25, nun: 25, shin: 25 },
  },

  // Skill meter. Difficulty uses the plain number of coins wagered:
  //   d = log2(1 + wager) / log2(1 + fullAt)
  // From 0 to fullAt coins, width and speed slide from `easy` to `hard`.
  // From fullAt to beyondAt they keep sliding to `floor` / `ceil`.
  meter: {
    fullAt: 100,
    beyondAt: 250,
    width: { easy: 0.30, hard: 0.05, floor: 0.025 },  // fraction of the bar
    speed: { easy: 0.8, hard: 3.0, ceil: 3.5 },       // sweeps per second (one side to the other)
    goldRatio: 0.2,                                   // gold line = this share of the green width
  },

  // Spin animation by grade: length, number of turns, wobble and sideways drift.
  spin: {
    miss:    { ms: 1500, turns: 4,  wobble: 0.22, drift: 0.55 },
    good:    { ms: 2600, turns: 9,  wobble: 0.08, drift: 0.12 },
    perfect: { ms: 3000, turns: 11, wobble: 0.05, drift: 0.06 },
    classic: { ms: 2200, turns: 7,  wobble: 0.1,  drift: 0.2 },
    fallMs: 480,
  },

  // How long each phase is shown before the game moves on (ms).
  timing: {
    afterSpin: 450,     // pause after the dreidel lands
    result: 2300,       // payout banner
    reveal: 7000,       // trivia answer + source
    ante: 900,          // extra time when everyone antes in Classic
  },

  // Honey jars earned (used to unlock dreidels).
  honey: { played: 2, win: 5, perfect: 1, correct: 1, steal: 2 },

  avatars: ['🦁', '🐻', '🦊', '🐼', '🐨', '🐯', '🐸', '🐵', '🦄', '🐙', '🐧', '🐢', '🦉', '🐬', '🦒', '🐞'],

  botNames: [
    { en: 'Buzzy', he: 'בַּאזִי' },
    { en: 'Honey', he: 'דֻּבְשִׁי' },
    { en: 'Bumble', he: 'בַּמְבְּל' },
    { en: 'Queenie', he: 'מַלְכָּה' },
    { en: 'Pollen', he: 'אַבְקָנִי' },
    { en: 'Nectar', he: 'צוּפִי' },
    { en: 'Waxy', he: 'שַׁעֲוָוה' },
  ],

  // Dreidel skins. `style` picks how the 3D model is drawn; `fx` is the
  // spin effect. `unlock` is null for starters, otherwise the milestone.
  skins: [
    { id: 'wood',    style: 'real',    fx: 'none',      name: { en: 'Classic wood',  he: 'עץ קלאסי' },      body: '#b07a45', letter: '#3b2210', edge: '#7a4c25', unlock: null },
    { id: 'blue',    style: 'plastic', fx: 'none',      name: { en: 'Blue & white',  he: 'כחול לבן' },      body: '#f4f7ff', letter: '#1f4fbf', edge: '#1f4fbf', unlock: null },
    { id: 'paper',   style: 'paper',   fx: 'flutter',   name: { en: 'Paper',         he: 'נייר' },          body: '#fbf6ea', letter: '#2d4a8a', edge: '#d9cfb8', unlock: null },
    { id: 'cartoon', style: 'cartoon', fx: 'boing',     name: { en: 'Cartoon',       he: 'מצויר' },         body: '#ff7a59', letter: '#ffffff', edge: '#ffd23f', unlock: null },
    { id: 'clay',    style: 'clay',    fx: 'none',      name: { en: 'Clay',          he: 'חימר' },          body: '#c96f4a', letter: '#fff3e0', edge: '#9c4e30', unlock: null },
    { id: 'silver',  style: 'metal',   fx: 'shine',     name: { en: 'Silver',        he: 'כסף' },           body: '#d4d9e0', letter: '#26303d', edge: '#9aa2ad', unlock: null },
    { id: 'anime',   style: 'anime',   fx: 'speed',     name: { en: 'Anime',         he: 'אנימה' },         body: '#ffb3d1', letter: '#3a2a7a', edge: '#8fd3ff', unlock: { wins: 1 } },
    { id: 'pixel',   style: 'pixel',   fx: 'pixels',    name: { en: 'Pixel',         he: 'פיקסל' },         body: '#4cb050', letter: '#ffffff', edge: '#2e7d32', unlock: { wins: 3 } },
    { id: 'gelt',    style: 'foil',    fx: 'shine',     name: { en: 'Chocolate gelt', he: 'מטבע שוקולד' },  body: '#e8b84a', letter: '#6b3f1d', edge: '#b8862b', unlock: { honey: 20 } },
    { id: 'gold',    style: 'metal',   fx: 'sparkle',   name: { en: 'Gold',          he: 'זהב' },           body: '#f2c14e', letter: '#5a3a00', edge: '#c8952a', unlock: { wins: 5 } },
    { id: 'glass',   style: 'glass',   fx: 'rainbow',   name: { en: 'Crystal',       he: 'קריסטל' },        body: '#bfe6ff', letter: '#ffffff', edge: '#7cc6f2', unlock: { correct: 25 } },
    { id: 'neon',    style: 'neon',    fx: 'trail',     name: { en: 'Neon',          he: 'ניאון' },         body: '#15112b', letter: '#3df2ff', edge: '#ff3df2', unlock: { perfect: 10 } },
    { id: 'hive',    style: 'hive',    fx: 'bees',      name: { en: "Mack's beehive", he: 'הכוורת של מכבי' }, body: '#f5b31b', letter: '#3a2500', edge: '#c98a00', unlock: { wins: 10 } },
    { id: 'stone',   style: 'stone',   fx: 'sparkle',   name: { en: 'Temple stone',  he: 'אבן המקדש' },     body: '#e3d6b8', letter: '#6a5532', edge: '#b9a57c', unlock: { tcWins: 1 } },
    { id: 'diamond', style: 'gem',     fx: 'rainbow',   name: { en: 'Diamond',       he: 'יהלום' },         body: '#eaf6ff', letter: '#7fb7ff', edge: '#cfe8ff', unlock: { wins: 25 } },
  ],
};

if (typeof module !== 'undefined') module.exports = CONFIG;
