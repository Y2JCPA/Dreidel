/* ============================================
   MACK-A-BEE DREIDEL — Tunable numbers
   Every number that shapes how the game plays lives here, so odds,
   meter difficulty and defaults can be tuned without touching logic.
   Loaded as a plain <script> in the browser and with require() in Node.
   ============================================ */
const CONFIG = {
  players: { min: 2, max: 8 },

  defaults: {
    mode: 'wager',        // 'wager' | 'classic'
    inIsrael: false,      // true → פ (Pey, נס גדול היה פה), false → ש (Shin, נס גדול היה שם)
    startCoins: 20,
    rounds: 5,
  },
  options: {
    startCoins: [10, 20, 50],
    rounds: [3, 5, 7, 10],
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

  // Spin animation lengths (ms) and how many turns the dreidel makes.
  spin: {
    miss:    { ms: 1500, turns: 4,  wobble: 0.22, drift: 0.7 },
    good:    { ms: 2600, turns: 9,  wobble: 0.08, drift: 0.15 },
    perfect: { ms: 3000, turns: 11, wobble: 0.05, drift: 0.1 },
    classic: { ms: 2200, turns: 7,  wobble: 0.1,  drift: 0.25 },
    fallMs: 480,
  },

  // Starter dreidel skins (unlockable ones come in phase 6).
  skins: [
    { id: 'wood',   name: 'Classic wood', body: '#b07a45', letter: '#3b2210', edge: '#8a5a2e' },
    { id: 'blue',   name: 'Blue & white', body: '#f4f7ff', letter: '#1f4fbf', edge: '#1f4fbf' },
    { id: 'silver', name: 'Silver',       body: '#c9ced6', letter: '#2b3340', edge: '#9aa2ad', metal: true },
    { id: 'clay',   name: 'Clay',         body: '#c96f4a', letter: '#fff3e0', edge: '#9c4e30' },
    { id: 'olive',  name: 'Olive wood',   body: '#cdb48a', letter: '#4a3b1c', edge: '#8c7445', grain: true },
    { id: 'glass',  name: 'Glass',        body: '#9fd8ff', letter: '#ffffff', edge: '#5fb6ef', glass: true },
  ],
};

if (typeof module !== 'undefined') module.exports = CONFIG;
