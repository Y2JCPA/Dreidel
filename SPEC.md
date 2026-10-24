# 🕎🐝 Mack-a-bee Dreidel — Game Spec (v0.3)

A multiplayer dreidel game for phones and computers, hosted by **Mack**, a cute bee who is the game's dealer, banker and guide (*Mack-a-bee*). Up to **8 players** join one room with a short code. They can sit at the same table or be in different countries. Players **wager their own coins**, aim a **skill meter** for a better spin, and answer **Sefaria-sourced Chanukah trivia** to protect (or steal) a Gimel. Classic dreidel is still available as a toggle.

> Status: **all six phases built** and playable on one device; online rooms are ready and switch on once `js/firebase-config.js` is filled in. Items marked ❓ are ideas for later. See [README.md](README.md) for running and testing.

### Decisions so far
| Topic | Decision |
|---|---|
| Players | 2–8 per game |
| Meter difficulty | Based on the **plain number of coins** wagered, so it's harder to build a big pile |
| Gold "perfect" line | Yes. It shrinks along with the green zone, and the marker speeds up as the wager grows |
| Out of coins | Can't spin, but can still answer trivia and **steal** their way back in |
| Hey on an odd wager | Round up |
| Ties at the end | Spin-off between the tied players |
| Trivia | Difficulty levels, every question sourced from texts on **Sefaria** |
| Skins | Many available from the start; more unlock the more you win |
| Server | **New Firebase project** (Realtime Database + anonymous sign-in) |
| Host character | **Mack the bee**: dealer, banker, narrator and rules guide. Hebrew name **מַכַּבִּי הַדְּבוֹרָה** |
| Trivia in Classic | **No.** Trivia is Wager mode only |
| Easter eggs | Cosmetic only; they never change the odds |

---

## 1. Game modes

| Mode | Summary |
|---|---|
| **Wager Dreidel** (default) | Each player bets their own coins every turn. Skill meter + optional trivia. |
| **Classic Dreidel** (toggle) | Traditional rules with a shared pot (Mack holds it) and an ante. |

Both modes are played in **rounds, like bowling**: in each round every player spins once, in seat order. After the last round, the player with the most coins wins.

---

## 2. Wager Dreidel rules

### 2.1 A turn
1. **Wager:** pick how many of your coins to bet (minimum 1, maximum all of them), using a slider plus quick buttons: 1 · 5 · 10 · All-in. The meter preview updates live, so you can see how hard the bet will be before you commit.
2. **Aim:** the skill meter appears (see §3). Tap to stop the marker.
3. **Spin:** the dreidel spins and lands on a letter.
4. **Payout** (Mack pays out of, or collects into, his honey-pot bank):

| Letter | Result (wager = 10) |
|---|---|
| **ג Gimel** | Win your wager again: +10 (you have 20 from that bet) |
| **ה Hey** | Win half your wager, rounded up: +5 (a wager of 5 wins +3) |
| **נ Nun** | Nothing happens: you keep your 10 |
| **ש Shin** / **פ Pey** | Lose your wager: −10 |

A Gimel may trigger trivia (§4), and then it can be lost or stolen.

### 2.2 Running out of coins
A player at 0 coins is **"out of coins" but stays in the game**. Their spin is skipped, but they still answer every trivia question. A correct steal puts coins back in their pocket, and they spin again from the next round.

### 2.3 Turn timer
30 seconds to wager and aim. If time runs out, the bet is 1 coin and the spin counts as a miss.

### 2.4 End of game and tiebreaker
- After **N rounds** (host chooses 3 / 5 / 7 / 10 / custom, default 5), the player with the most coins wins.
- **Spin-off:** if players tie for first, each tied player spins once with no wager and no trivia, and the best letter wins (Gimel > Hey > Nun > Shin/Pey). Anyone still tied spins again.

---

## 3. The skill meter

A horizontal bar with a **green zone**, a **gold line** at its center, and a marker that moves back and forth across the bar. Tap (or press Space) to stop it.

- **The green zone moves**: it starts at a random spot each turn.
- **Grades:** marker outside the green = **Miss**; in the green = **Good**; on the gold line = **Perfect**.
- **Difficulty depends on the plain number of coins wagered.** It climbs fast for the first coins and then levels off, reaching full difficulty at 100 coins:

| Wager | 1 | 5 | 10 | 20 | 50 | 100+ |
|---|---|---|---|---|---|---|
| Green width (% of bar) | 26% | 20% | 17% | 13.5% | 9% | 5% |
| Marker speed (sweeps/sec) | 1.1 | 1.65 | 1.9 | 2.25 | 2.7 | 3.0 |

  - The gold line is always ~20% of the green width, so it shrinks too.
  - Above 100 coins it keeps getting harder, down to a 2.5% green zone at 3.5 sweeps/sec. Big piles can't be bet in one easy swing.
  - Formula (in `config.js`): `d = log2(1 + wager) / log2(101)`; width and speed scale with `d`.
  - Because difficulty uses the plain number, a bigger **starting coins** setting makes all-in bets harder. That's intended.

### 3.1 How the spin result changes the odds
The referee (§7) draws the letter with weighted odds based on the grade:

| Tap | Gimel | Hey | Nun | Shin/Pey | Spinner's average result* |
|---|---|---|---|---|---|
| Miss | 20% | 25% | 25% | 30% | +2.5% of wager (≈ break-even) |
| Good | 30% | 28% | 22% | 20% | +24% |
| Perfect | 35% | 30% | 20% | 15% | +35% |

\*Before trivia, which lowers the real value of a Gimel. All numbers are in `config.js` and will be tuned with an odds simulation plus playtesting.

### 3.2 How the spin looks
- **Miss:** a short, wobbly spin (~1.5 s) that tips over quickly.
- **Good / Perfect:** a smooth, longer spin (~2.5–3 s) with a slow, dramatic fall at the end. Perfect adds a sparkle trail and a cheer from Mack.
- No spin lasts longer than about 3.5 s. The letter is chosen **before** the animation starts and the animation lands on it, so the odds stay exact and every screen shows the same result.

---

## 4. Torah trivia (toggle, default ON)

**Trigger:** a Gimel triggers a "Buzz Quiz!" from Mack with a 70% chance (host setting: 50 / 70 / 100%).

**Format:** one question with 4 options. Every player, including busted ones, answers at the same time on their own screen with a countdown (host setting: 10 / 15 / 20 s, default 15).

**Resolution:**

| Spinner | Others | Outcome |
|---|---|---|
| ✅ Correct | anyone | Gimel stands: the spinner wins it (even if others were also right). |
| ❌ Wrong / no answer | nobody correct | Gimel turns into **Nun**: the spinner keeps the wager and wins nothing. |
| ❌ Wrong / no answer | one correct | That player **steals the winnings** (+wager). The spinner keeps their original wager. |
| ❌ Wrong / no answer | several correct | The winnings are **split**; any leftover coin goes to the fastest correct answer. |

### 4.1 After each question: the source
Everyone sees the right answer, a short quote from the source (Hebrew + English), and a **"Learn more on Sefaria"** link that opens the exact passage (e.g. *Shabbat 21b*, *Shulchan Arukh OC 671:2*).

### 4.2 Difficulty levels (host setting)
| Level | What it covers | Main sources |
|---|---|---|
| 🐝 **Kids** | The story, the miracle of the oil, the basics of lighting, the brachot | Shabbat 21b, Megillat Antiochus, Maccabees I, Al HaNisim, Kitzur Shulchan Arukh 139 |
| 🍯 **Adults** | Practical halacha: time, place, number of candles, shamash, Shabbat, guests, Hallel, Torah reading | Shulchan Arukh OC 670–684, Kitzur Shulchan Arukh 139, Rambam Hilchot Megillah vaChanukah 3–4 |
| 📜 **Talmid Chacham** | Gemara discussions, disputes and fine details | Shabbat 21a–24a (Beit Shammai/Hillel, *mehadrin min hamehadrin*, *pirsumei nisa*, *ner ish uveito*), Rambam, Mishnah Berurah, Megillah, Soferim 20 |
| 🎲 **Mixed** | A blend that gets harder as the game goes on | All of the above |

### 4.3 How the question bank is built
- Questions are written **ahead of time from the actual texts** and saved in `data/questions.js`. They are not generated live, so the game never depends on Sefaria being up.
- A small tool (`tools/fetch-sources.js`) downloads each source passage from the Sefaria API. Every question records the exact reference it comes from: `{ id, level, q:{en,he}, options:{en[],he[]}, answer, ref, quote:{en,he}, url }`.
- **Rule: no source, no question.** Where Ashkenazi and Sephardi practice differ (e.g. the Rema vs. the Mechaber on how many candles each person lights), the question says which, or asks about the dispute directly.
- Hebrew quotes use the original texts. English quotes are short and credited to the Sefaria translation (some, like the Koren Talmud, are licensed for non-commercial use only, which fits a free family game).
- Target: ~50 questions per level (~150 total). A question isn't repeated within a room's session.
- ⚠️ I'll draft and source every question, but **someone knowledgeable should review the bank** before it goes live.

---

## 5. Classic Dreidel (toggle)

- Everyone antes 1 into Mack's pot at the start of each round, and again whenever the pot is empty.
- Nun: nothing. Gimel: take the whole pot. Hey: take half (rounded up). Shin/Pey: put 1 in.
- A player with 0 coins is out. The game ends after N rounds or when one player is left.
- Tap to spin with straight 25% odds (no wager, so no meter).
- No trivia in Classic mode. The trivia settings are hidden when Classic is selected.

---

## 6. Mack the bee 🐝 (dealer, banker, guide)

Mack is a round, fuzzy, friendly bee in a little Maccabee helmet with a tiny shield. He runs the table.

- **Guide:** on the start screen and the How-to-play screen, Mack explains the rules step by step in speech bubbles, then has players try a practice meter tap ("Try to land on my gold line!").
- **Dealer:** he calls each turn ("Buzz buzz, Rivka, you're up!"), counts down the turn timer, and introduces the spin-off.
- **Banker:** coins fly from and to his honey pot on every payout. In Classic mode the pot *is* his honey pot.
- **Quizmaster:** he pops up with "Buzz Quiz!" for trivia, then reveals the answer and the source.
- **Reactions:** cheer (Gimel / Perfect), wink (Hey), shrug (Nun), gasp (Shin/Pey), sneaky grin (a steal), trophy dance (winner).
- **Art:** a real-time 3D character built in code: layered fur, glossy eyes, a polished gold helmet with a blue plume crest, see-through rainbow wings and a shield with a Magen David. He bobs, flaps, blinks and changes expression. Devices without 3D get a drawn (SVG) Mack instead.
- **Lines:** a pool of short, varied lines in English and Hebrew so he doesn't repeat himself. He talks more at the start and gets quieter as the game moves on.
- **Hebrew name:** **מַכַּבִּי הַדְּבוֹרָה** ("Makabi the bee"). In Hebrew the pun works by sound: *Makabi* = מכבי.

---

## 7. Multiplayer

### 7.1 Technology: a new Firebase project
- Static site on **GitHub Pages** with **Firebase Realtime Database + anonymous sign-in** (free Spark plan), the same approach as Grow a Garden but in its own project.
- One-time setup steps are in **Appendix A**.

### 7.2 Rooms
- **Host creates a room**, gets a **4-character code** (no look-alike letters) plus a share link and QR code.
- **Players join** with the code and enter a name and avatar. There are no accounts or passwords.
- **2–8 players.** A 9th person can watch as a spectator but can't play. The host picks the settings in the lobby; everyone sees them update live.
- **Rejoin:** if a phone sleeps or a browser refreshes, the player rejoins the same seat with their coins.
- ❓ A "TV mode" big-screen view for when everyone is in one room is a possible later phase.

### 7.3 Who decides results: the host's device is the referee
- The host's device runs the rules: it draws letters, runs the trivia timer and settles payouts. The other devices send in actions (wager, tap grade, trivia answer) and display the shared state.
- The tap is graded on the spinner's own device, so internet lag can't spoil a good tap.
- **If the host drops out**, the next player in seat order automatically becomes referee.
- Trivia answers stay on the referee's device until the question closes. This is "family-fair", which is fine for this audience.

Data layout sketch: `/rooms/{CODE}/` → `settings`, `players/{uid}` (name, avatar, skin, coins, seat, lang, online), `state` (phase, round, turn, deadline), `spin` (wager, grade, letter), `trivia` (question id, option order, deadline), `answers/{uid}`, `log`. `/profiles/{uid}/` → wins, stats, unlocked skins.

---

## 8. Start screen and settings

**Start:** Mack waves hello · language (English / עברית) · Create room / Join room · How to play.

**Host settings (lobby):**

| Setting | Options | Default |
|---|---|---|
| Mode | Wager / Classic | Wager |
| Location | 🇮🇱 In Israel (נס גדול היה **פה**, פ) / Outside Israel (נס גדול היה **שם**, ש) | Outside |
| Starting coins | 10 / 20 / 50 / custom | 20 |
| Rounds | 3 / 5 / 7 / 10 / custom | 5 |
| Trivia (Wager mode only) | On / Off | On |
| Trivia level | Kids / Adults / Talmid Chacham / Mixed | Adults |
| Trivia chance on Gimel | 50 / 70 / 100% | 70% |
| Trivia time | 10 / 15 / 20 s | 15 s |

**Per player (own device):** language, name, avatar, dreidel skin.

The Israel toggle changes the 4th letter on the dreidel model, the result screens, and Mack's splash-screen line.

---

## 9. How-to-play screen (presented by Mack)
- Shown automatically to each player the first time, and always available from a **?** button.
- Built from the current settings: it explains Wager or Classic rules, says Shin or Pey, and includes the trivia section only when trivia is on.
- Interactive: a practice wager and meter tap, with Mack showing how a bigger bet shrinks the green zone.

---

## 10. Dreidel skins, unlocks and easter eggs

**Starter skins (available right away):** Classic wood · Silver · Blue & white · Clay ("I made it out of clay") · Olive wood · Glass.

**Unlockable skins:** earned with **honey jars 🍯**, which come from game wins, Perfect spins, correct trivia answers, and steals:

| Skin | Unlocks at |
|---|---|
| Chocolate gelt | 1st win |
| Gold | 3 wins |
| Neon | 10 Perfect spins |
| Blocky / Lego | 5 wins |
| Menorah-lit (flames on each face) | 25 trivia answers correct |
| Beehive (Mack's own) | 10 wins |
| Beit HaMikdash stone | Win on Talmid Chacham level |
| Diamond | 25 wins |

- Each skin has its own look and cosmetic spin style (wobble, trail, sparkle, sound). Skins never change the odds.
- Progress is saved with the player's anonymous Firebase profile plus a copy on the device. Because there are no accounts, progress belongs to **that phone/browser**. ❓ "Sign in with Google" to carry progress between devices could be added later.
- Exact thresholds go in `config.js` and get tuned after playtesting.

**Easter eggs** (not explained anywhere):
- **Phone upside down** while spinning: the dreidel spins upside down, on its handle, on everyone's screen.
- Shake the phone after landing for a gelt shower; tap Mack 5 times and he does a loop-de-loop; on 25 Kislev the room's menorah fills with lights.
- Easter eggs are **cosmetic only** and never change the odds.
- On iPhone, reading phone orientation needs a one-time permission tap. We'll ask quietly when the player enters a game.

---

## 11. Look and feel
- Phone-first, also works on tablets and desktops. Big tap targets.
- **3D dreidel with Three.js** (same library and CDN as Grow a Garden), with a 2D fallback for weak devices. Mack is drawn in SVG over the scene.
- Full **Hebrew UI with right-to-left layout**. Each player sees their own language, including trivia.
- Synthesized sound effects (spin whir, clatter, coins, buzzer, Mack's buzz), so there are no audio files. Mute button.
- Installable PWA (add to home screen).

---

## 12. Code layout (plain HTML/CSS/JS, no build step)

| File | Contents |
|---|---|
| `index.html`, `css/style.css` | Screens and layout |
| `js/config.js` | Odds, meter curve, unlock thresholds, defaults: all tunable numbers in one place |
| `js/rules.js` | Pure game logic (wager payouts, classic pot, trivia settlement, spin-off). No UI code, so it can be unit-tested |
| `js/net.js` | Firebase rooms, presence, referee handoff, profiles |
| `js/meter.js` | Skill meter |
| `js/dreidel3d.js` | Three.js model, skins, spin and landing animation |
| `js/mack.js` | Mack the bee: SVG, animations, expressions, lines |
| `js/trivia.js` + `data/questions.js` | Trivia flow + bilingual, sourced question bank |
| `js/i18n.js` | English/Hebrew strings, RTL switching |
| `js/audio.js` | Synth sounds |
| `js/app.js` | Screens, lobby, game flow |
| `tools/fetch-sources.js` | Downloads source passages from the Sefaria API for writing and checking questions |
| `tests/` | Rules unit tests, odds simulation, multi-browser multiplayer test |

---

## 13. Build phases

1. **Core rules + meter + dreidel on one device.** `rules.js` with tests, the meter with the coin-based curve, the 3D spin/landing, and pass-and-play to feel out the fun and tune the odds.
2. **Mack + multiplayer.** Mack's character and lines; Firebase rooms (up to 8), codes, lobby, settings, turn flow, referee handoff, rejoin.
3. **Trivia.** The Sefaria source tool, a first 20 questions per level, simultaneous answering, steal/split, source reveal. Then grow to ~150.
4. **Hebrew + Israel toggle + Mack's How-to-play.**
5. **Classic mode + spin-off polish.**
6. **Skins, honey jars and unlocks, easter eggs, sound, PWA polish.**

Each phase ends with something playable that you can test on real phones.

---

## Appendix A — Firebase setup (one time, ~5 minutes)

1. Go to **console.firebase.google.com**, click **Create a project**, and name it e.g. `mackabee-dreidel`. You can turn off Google Analytics.
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
3. **Build → Realtime Database → Create database.** Location: **europe-west1 (Belgium)**, the closest to Israel and fine for the US. Start in **locked mode**.
4. In the database's **Rules** tab, paste the contents of [`database.rules.json`](database.rules.json) and click **Publish**. Signed-in players can read and write rooms, room codes must be 4 valid characters, and each profile is private to its owner. The online test suite runs against these exact rules.
5. **Project settings (gear icon) → General → Your apps → Web (`</>`)**: register an app named `dreidel`, no hosting.
6. Copy the `firebaseConfig` block it shows you and paste it to me. Those values aren't secret: they're meant to be in the web page, and the rules above protect the data.
