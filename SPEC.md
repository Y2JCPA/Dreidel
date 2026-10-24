# 🕎 Dreidel — Game Spec (draft v0.1)

A multiplayer dreidel game for phones and computers. Everyone joins one room with a short code. They can sit at the same table or be in different countries. Players **wager their own coins**, aim a **skill meter** for a better spin, and answer **Hilchot Chanukah trivia** to protect (or steal) a Gimel. Classic dreidel is still available as a toggle.

> Status: **planning**. Nothing is built yet. Items marked ❓ are open questions; the value shown is the suggested default.

---

## 1. Game modes

| Mode | Summary |
|---|---|
| **Wager Dreidel** (default) | Each player bets their own coins every turn. Skill meter + optional trivia. |
| **Classic Dreidel** (toggle) | Traditional rules with a shared pot and an ante. |

Both modes are played in **rounds, like bowling**: in each round every player spins once, in seat order. After the last round, the player with the most coins wins.

---

## 2. Wager Dreidel rules

### 2.1 A turn
1. **Wager:** pick how many of your coins to bet (minimum 1, maximum all of them), using a slider plus quick buttons: 1 · ¼ · ½ · All-in.
2. **Aim:** the skill meter appears (see §3). Tap to stop the marker.
3. **Spin:** the dreidel spins and lands on a letter.
4. **Payout:**

| Letter | Result (wager = 10) |
|---|---|
| **ג Gimel** | Win your wager again: +10 (you have 20 from that bet) |
| **ה Hey** | Win half your wager: +5 |
| **נ Nun** | Nothing happens: you keep your 10 |
| **ש Shin** / **פ Pey** | Lose your wager: −10 |

- **Hey with an odd wager:** ❓ round **up** (a wager of 5 wins +3).
- **Gimel + trivia:** see §4. A Gimel can be lost or stolen.

### 2.2 Running out of coins
❓ Suggested: a player who reaches 0 is **"out of coins" but stays in the game**. They skip their spins but can still answer trivia, and a correct steal (§4) brings them back. Busted players stay involved and get a way back in.

### 2.3 Turn timer
30 seconds to wager and aim. If time runs out, the bet is 1 coin and the spin counts as a miss. This keeps a slow or disconnected player from stalling the game.

### 2.4 End of game
- After **N rounds** (host chooses 3 / 5 / 7 / 10, default 5), the player with the most coins wins.
- ❓ **Ties:** a one-spin sudden-death spin-off between the tied players (all-in on a fixed 10, best letter wins), or simply co-winners.

---

## 3. The skill meter

A horizontal bar with a **green zone** and a marker that moves back and forth across the bar. Tap (or press Space) to stop it.

- **The green zone moves**: it starts at a random spot each turn, so players can't memorize it.
- **A gold center** inside the green gives a "Perfect" spin. ❓ Optional, but it adds a skill moment worth going for.
- **Difficulty grows with the wager.** Let *r* = wager ÷ your current coins (so All-in is always the hardest):

| | r ≈ 0 (tiny bet) | r = 1 (All-in) |
|---|---|---|
| Green width | 30% of the bar | 6% of the bar |
| Marker speed | ~0.8 sweeps/sec | ~2.6 sweeps/sec |

  ❓ The alternative is to base difficulty on the **absolute** number of coins (betting 10 is always harder than betting 5). The ratio stays fair as balances grow; the absolute version is simpler to explain.

### 3.1 How the spin result changes the odds

The tap is graded **Miss / Good / Perfect**. The referee (§6) then draws the letter with weighted odds:

| Tap | Gimel | Hey | Nun | Shin/Pey | Spinner's average result* |
|---|---|---|---|---|---|
| Miss | 20% | 25% | 25% | 30% | +2.5% of wager (≈ break-even) |
| Good | 30% | 28% | 22% | 20% | +24% |
| Perfect | 35% | 30% | 20% | 15% | +35% |

\*Before trivia. Trivia lowers the real value of a Gimel. All numbers live in one config file and will be tuned with a simulation script plus playtesting.

### 3.2 How the spin looks
- **Miss:** a short, wobbly spin (~1.5 s) that tips over quickly.
- **Good / Perfect:** a smooth, longer spin (~2.5–3 s) with a slow, dramatic fall at the end. Perfect adds sparkles.
- No spin lasts longer than about 3.5 s.
- The letter is chosen **before** the animation starts, and the animation is built to land on it. That keeps the odds exact, and every screen shows the same result.

---

## 4. Torah trivia (toggle, default ON)

**Trigger:** when a spinner lands on **Gimel**, there is a ❓ **70%** chance a trivia question pops up for **everyone**.

**Format:** a question on Hilchot / Inyanei Chanukah with 4 multiple-choice options. Everyone answers at the same time on their own screen with a countdown (host setting: 10 / 15 / 20 s, default 15).

**Resolution:**

| Spinner | Others | Outcome |
|---|---|---|
| ✅ Correct | anyone | Gimel stands: the spinner wins it (even if others were also right). |
| ❌ Wrong / no answer | nobody correct | Gimel turns into **Nun**: the spinner keeps the wager and wins nothing. |
| ❌ Wrong / no answer | one correct | That player **steals the winnings** (+wager). The spinner keeps their original wager. |
| ❌ Wrong / no answer | several correct | The winnings are **split** between them. ❓ Leftover coin(s) go to the fastest correct answer. |

After the question closes, everyone sees the correct answer and a one-line source (e.g. *Shulchan Aruch OC 671:2*), so the game teaches as it goes.

### 4.1 Question bank
- Bilingual (English + Hebrew), written into a data file: `{ id, difficulty, q:{en,he}, options:{en[],he[]}, answer, source }`.
- Topics: the story and its sources (Gemara Shabbat 21b), who is obligated, number of candles and mehadrin (Beit Shammai / Beit Hillel), time and place of lighting, shamash, brachot, Shabbat and Motzei Shabbat, travelers and guests, al hanisim, Hallel, Torah reading, oil vs. wax, women's customs, the dreidel itself.
- Where Ashkenazi and Sephardi practice differ, questions say which, or ask about the dispute directly.
- Target ~150 questions so a game rarely repeats one. Questions are not repeated within a room's session.
- ❓ **Difficulty setting:** Kids / Adults / Talmid Chacham / Mixed (default Adults + hard mixed in).
- ⚠️ I'll draft the questions with sources, but **someone knowledgeable should review the bank** before it goes live.

---

## 5. Classic Dreidel (toggle)

- Everyone antes 1 into the pot at the start of each round, and again whenever the pot is empty.
- Nun: nothing. Gimel: take the whole pot. Hey: take half (rounded up). Shin/Pey: put 1 in.
- A player with 0 coins is out. The game ends after N rounds or when one player is left.
- Tap to spin with straight 25% odds (no wager, so no meter).
- ❓ Trivia in Classic: if it's on, the **pot** is at stake on a Gimel, with the same steal/split rules.

---

## 6. Multiplayer

### 6.1 Technology: Firebase Realtime Database (same setup as Grow a Garden)
- Static site on **GitHub Pages** with **Firebase Realtime Database + anonymous sign-in** (free Spark plan).
- Why not a socket.io server like Purim-Pictionary? Free Render servers go to sleep and take ~1 minute to wake up. Firebase is always on, costs nothing at this scale, and you already know it.
- ❓ Use a **new Firebase project** (`dreidel-…`), which is cleaner, or a `dreidel/` section inside the existing grow-a-garden project. Either way it's a 5-minute console step for you (I'll write exact instructions).

### 6.2 Rooms
- **Host creates a room**, gets a **4-character code** (no look-alike letters, like Pictionary) plus a share link and QR code.
- **Players join** with the code and enter a name and avatar. There are no accounts: Firebase signs them in anonymously in the background.
- Up to **8 players**. The host picks the settings in the lobby; everyone sees them update live.
- **Rejoin:** if a phone sleeps or a browser refreshes, the player rejoins the same seat with their coins.
- Spectators can join after the game starts. ❓ A "TV mode" big-screen view for when everyone is in one room is a possible later phase.

### 6.3 Who decides results: the host's device is the referee
- The host's device runs the rules: it draws letters, runs the trivia timer and settles payouts. The other devices send in actions (wager, tap grade, trivia answer) and display the shared state.
- The tap is graded on the spinner's own device, so internet lag can't spoil a good tap.
- **If the host drops out**, the next player in seat order automatically becomes referee.
- Trivia answers stay on the referee's device until the question closes.
- This is "family-fair", not secure against someone hacking the browser. That's fine for this audience.

Data layout sketch (`/rooms/{CODE}/`): `settings`, `players/{uid}` (name, avatar, skin, coins, seat, lang, online), `state` (phase, round, turn, deadline), `spin` (wager, grade, letter, seed), `trivia` (question id, option order, deadline), `answers/{uid}`, `log`.

---

## 7. Start screen and settings

**Start:** language (English / עברית) · Create room / Join room · How to play.

**Host settings (lobby):**

| Setting | Options | Default |
|---|---|---|
| Mode | Wager / Classic | Wager |
| Location | 🇮🇱 In Israel (נס גדול היה **פה**, פ) / Outside Israel (נס גדול היה **שם**, ש) | Outside |
| Starting coins | 10 / 20 / 50 / custom | 20 |
| Rounds | 3 / 5 / 7 / 10 / custom | 5 |
| Trivia | On / Off | On |
| Trivia chance on Gimel | 50 / 70 / 100% | 70% |
| Trivia time | 10 / 15 / 20 s | 15 s |
| Trivia difficulty | Kids / Adults / Talmid Chacham / Mixed | Adults |

**Per player (own device):** language, name, avatar, dreidel skin.

The Israel toggle changes the 4th letter on the dreidel model, the result screens, and the phrase on the splash screen.

---

## 8. "How to play" screen

- Shown automatically to each player the first time, and always available from a **?** button.
- Short, illustrated, and **built from the current settings**: it explains Wager or Classic rules, says Shin or Pey, and includes the trivia section only when trivia is on.
- Interactive practice meter: try a few taps before the game starts.

---

## 9. Dreidel skins and easter eggs

**Skins** (per player, everyone sees them): Classic wood · Silver · Glass · Clay ("I made it out of clay") · Gold · Chocolate gelt · Blocky/Lego · Neon · Olive wood · Menorah-lit.
Each skin has its own look and cosmetic spin style (wobble, trail, sparkle, sound). ❓ All unlocked from the start, or unlocked by playing?

**Easter eggs** (not explained anywhere):
- **Phone upside down** while spinning: the dreidel spins on its handle, upside down, on everyone's screen.
- More ideas: shake the phone after landing for a gelt shower; hold the dreidel for 3 s for a "Maccabee spin" animation; on the 8th night (or 25 Kislev) the menorah fills up.
- ❓ Suggested: easter eggs are **cosmetic only** and never change the odds, so the game stays fair.
- Note: on iPhone, reading phone orientation needs a one-time permission tap. We'll ask quietly when the player enters a game.

---

## 10. Look and feel
- Phone-first, also works on tablets and desktops. Big tap targets.
- **3D dreidel with Three.js** (same library and CDN as Grow a Garden), with a 2D fallback for weak devices.
- Full **Hebrew UI with right-to-left layout**. Each player sees their own language; the trivia text appears in each player's language.
- Synthesized sound effects (spin whir, clatter, coins, buzzer), like Grow a Garden, so there are no audio files. Mute button.
- Installable PWA (add to home screen).

---

## 11. Code layout (plain HTML/CSS/JS, no build step)

| File | Contents |
|---|---|
| `index.html`, `css/style.css` | Screens and layout |
| `js/config.js` | Odds tables, meter curves, defaults: all tunable numbers in one place |
| `js/rules.js` | Pure game logic (wager payouts, classic pot, trivia settlement). No UI code, so it can be unit-tested |
| `js/net.js` | Firebase rooms, presence, host/referee handoff |
| `js/meter.js` | Skill meter |
| `js/dreidel3d.js` | Three.js model, skins, spin and landing animation |
| `js/trivia.js` + `data/questions.js` | Trivia flow + bilingual question bank |
| `js/i18n.js` | English/Hebrew strings, RTL switching |
| `js/audio.js` | Synth sounds |
| `js/app.js` | Screens, lobby, game flow |
| `tests/` | Rules unit tests, odds simulation, multi-browser multiplayer test |

---

## 12. Build phases

1. **Core rules + meter + dreidel on one device.** `rules.js` with tests, the meter, the 3D spin/landing, and pass-and-play to feel out the fun and tune the odds.
2. **Multiplayer.** Firebase rooms, codes, lobby, settings, turn flow, referee handoff, rejoin.
3. **Trivia.** Question bank (first ~50, then up to 150), simultaneous answering, steal/split logic.
4. **Hebrew + Israel toggle + How-to-play screen.**
5. **Classic mode.**
6. **Skins, easter eggs, sound, PWA polish.**

Each phase ends with something playable that you can test on real phones.
