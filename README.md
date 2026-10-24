# 🕎🐝 Mack-a-bee Dreidel

A dreidel game for the whole family, hosted by **Mack**, a fuzzy bee in a Maccabee helmet who is the dealer, banker and guide. Up to 8 players sit around a green felt poker table, on one phone or each on their own from anywhere.

The full design is in [SPEC.md](SPEC.md).

## How it plays

- **Wager Dreidel** (default): on your turn, bet some of your coins, then stop the skill meter and spin.
  - **ג Gimel** wins your bet again, **ה Hey** wins half (rounded up), **נ Nun** does nothing, **ש Shin / פ Pey** loses your bet.
  - **The meter:** landing in the green zone raises the odds of Gimel and Hey, and Mack's gold line raises them more. The bigger the bet (in plain coins), the smaller the green and the faster the marker.
  - **Buzz Quiz:** a Gimel can trigger a Chanukah trivia question for everyone. Answer right and you keep it. Answer wrong and whoever got it right steals the winnings, split if several did. Every question shows its source and links to Sefaria.
  - **Rounds work like bowling:** everyone spins once per round. Most coins after the last round wins; a tie goes to a spin-off.
- **Classic Dreidel:** traditional pot and ante, no trivia.
- **Settings:** In Israel (פ) or outside (ש), starting coins, rounds, trivia on/off, level (Kids / Adults / Talmid Chacham / Mixed), chance and time.
- **Languages:** English and Hebrew, with full right-to-left layout.
- **Dreidel skins:** 6 to start (wood, blue & white, paper, cartoon, clay, silver), and 9 more unlocked with wins and honey jars (anime, pixel, chocolate gelt, gold, crystal, neon, Mack's beehive, Temple stone, diamond).
- **Easter eggs** (cosmetic only): hold the phone upside down when you spin; shake it after a landing; tap Mack five times.

## Running it

It's plain HTML/CSS/JS with no build step. Three.js and the fonts load from CDNs.

```sh
python3 -m http.server 8000      # then open http://localhost:8000
```

- **Play on this device:** against computer players (Mack's bee friends), or pass one phone around.
- **Online rooms:** need Firebase (see below).
- **Testing online play without Firebase:** add `?net=local` to the address. Rooms then run between browser tabs on the same computer: create a room in one tab, then join with the code in another.

## Online play: Firebase setup

1. Create a Firebase project and enable **Authentication → Anonymous** and **Realtime Database**. Exact steps are in [SPEC.md, Appendix A](SPEC.md#appendix-a--firebase-setup-one-time-5-minutes). The database rules are in [`database.rules.json`](database.rules.json).
2. Paste the web app's `firebaseConfig` into [`js/firebase-config.js`](js/firebase-config.js).
3. In **Authentication → Settings → Authorized domains**, add the domain the game is served from (for GitHub Pages: `y2jcpa.github.io`).

Until that config is filled in, online buttons explain that online play isn't set up, and play on one device still works.

**How a room works:** the host's device is the referee. It applies everyone's moves with the same rules code, keeps time, and plays the computer players. Each player sends their moves to `rooms/{CODE}/inputs/{uid}`, and the host writes the game state to `rooms/{CODE}/state`. If the host drops out for 5 seconds, the online player in the lowest seat takes over automatically.

## Code layout

| File | What's in it |
|---|---|
| `index.html`, `css/style.css` | Screens and layout |
| `js/config.js` | Every tunable number: odds, meter curve, timings, skins and unlocks |
| `js/rules.js` | Pure game logic (the referee). Unit-tested |
| `js/room.js` | Local games and online rooms; referee, bots, host handoff |
| `js/net.js` | Firebase backend, plus the `?net=local` backend for tabs |
| `js/dreidel3d.js` | Three.js table, dreidel skins, spin and landing |
| `js/meter.js` | Skill meter |
| `js/mack.js` | Mack the bee (SVG, expressions, speech bubbles) |
| `js/trivia.js`, `data/questions-*.js` | Question picking and the sourced question bank (150 questions) |
| `js/app.js` | Screens and game flow |
| `js/i18n.js` | English and Hebrew text |
| `js/audio.js` | Synthesized sound effects |
| `js/profile.js`, `js/bots.js` | Player profile, stats and unlocks; computer players |
| `tools/simulate.js` | Odds simulation (`node tools/simulate.js [tap-error-seconds]`) |
| `tests/` | Unit tests (`node --test tests/*.test.js`) and browser tests (`tests/e2e/`) |

## Tests

```sh
node --test tests/*.test.js          # rules, payouts, trivia, spin-offs, question bank (27 tests)
node tests/e2e/run.js                # full browser suite (~15 min), or filter: node tests/e2e/run.js online
```

The browser suite drives real games in headless Chromium with Playwright (`NODE_PATH=$(npm root -g)` if it's installed globally):

- **Single device:** a full game against computer players, then play again. Pass-and-play trivia with every outcome (kept, stolen, split, nun). Classic pot and antes. A double spin-off.
- **Online** (over `?net=local`): three people plus a computer player with trivia on every screen, wrong code, full room, a latecomer watching, reload and rejoin, the 30-second turn timer, a trivia timeout, and the host leaving in the lobby and mid-game.
- **Screens:** custom settings, Israel/Pey, the intro's practice meter, the menu, Hebrew mid-game, quiet Mack, leaving, dreidel unlocks after a win, touch taps, and seat layout at 11 screen sizes with 2–8 players.

To run the online scenarios against **real Firebase code** using Google's local emulators (needs Java), start the emulators and load the rules, then run with `NET=emulator`:

```sh
npx firebase-tools emulators:start --only auth,database --project demo-mackabee
curl -X PUT --data-binary @database.rules.json "http://127.0.0.1:9000/.settings/rules.json?ns=demo-mackabee" -H "Authorization: Bearer owner"
NET=emulator node tests/e2e/run.js online
```

You can also play against the emulators by opening the game with `?emulator=127.0.0.1`.

Tests can force letters with `Rules.force.push('gimel')` and read the state from `window.MackTest.state`. `?p=name` gives a tab its own saved profile.

## Trivia review

Every question was checked word for word against the text fetched from the Sefaria API. Someone knowledgeable should still review the bank before it goes live; [docs/TRIVIA-REVIEW.md](docs/TRIVIA-REVIEW.md) lists the questions worth a second look.
