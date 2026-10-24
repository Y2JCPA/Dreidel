# Firebase setup for Mack-a-bee Dreidel (instructions for OpenClaw)

Copy everything below the line into OpenClaw.

---

You're setting up the online-multiplayer backend for a web game, **Mack-a-bee Dreidel**. The code is in the GitHub repo **Y2JCPA/Dreidel**, on the branch **`claude/dreidel-game-design-e6have`**. The game is plain HTML/JS (no build step) and uses **Firebase Realtime Database with anonymous sign-in**. Please do the following, in order, and report back at the end.

**1. Create the Firebase project**
- Go to https://console.firebase.google.com and click **Create a project**. Name it `mackabee-dreidel` (any free ID is fine). Turn **Google Analytics off**.

**2. Turn on anonymous sign-in**
- **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save.**

**3. Create the Realtime Database** (do this *before* step 5, so the web config includes the database URL)
- **Build → Realtime Database → Create database.**
- Location: **europe-west1 (Belgium)**.
- Start in **locked mode**.

**4. Set the database rules**
- In Realtime Database, open the **Rules** tab, replace everything with exactly this, and click **Publish**:

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": "auth != null",
        ".write": "auth != null",
        ".validate": "$code.matches(/^[A-Z2-9]{4}$/)"
      }
    },
    "profiles": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

(The same rules are in the repo as `database.rules.json`.)

**5. Register the web app and get its config**
- **Project settings (gear icon) → General → Your apps → Web (`</>`)**. Name it `dreidel`. **Don't** set up Firebase Hosting.
- Copy the `firebaseConfig` object it shows. Check that it includes a **`databaseURL`** like `https://mackabee-dreidel-default-rtdb.europe-west1.firebasedatabase.app`. If it doesn't, copy that URL from the top of the Realtime Database page and add it as `databaseURL`.

**6. Allow the game's website to sign in**
- **Authentication → Settings → Authorized domains → Add domain:** `y2jcpa.github.io`.

**7. Put the config into the game**
- In the repo, on branch `claude/dreidel-game-design-e6have`, edit **`js/firebase-config.js`**. Replace the line `const FIREBASE_CONFIG = null;` with your config, for example:

```js
const FIREBASE_CONFIG = {
  apiKey: '…',
  authDomain: 'mackabee-dreidel.firebaseapp.com',
  databaseURL: 'https://mackabee-dreidel-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'mackabee-dreidel',
  storageBucket: 'mackabee-dreidel.firebasestorage.app',
  messagingSenderId: '…',
  appId: '…',
};
```

- These values aren't secrets; they're meant to be in the web page, and the rules protect the data. Commit with the message `Connect Firebase project` and push to the **same branch**. If you can't push to GitHub, skip this step and send me the config instead.

**8. Publish the site with GitHub Pages**
- In the GitHub repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `claude/dreidel-game-design-e6have`, folder `/ (root)` → Save.**
- Wait a minute or two. The site will be at **https://y2jcpa.github.io/Dreidel/**.

**9. Test it with two players**
- Open the site in a normal browser window and in a private/incognito window (or on two devices).
- In window 1: type a name → **Create an online room**. Note the 4-letter code.
- In window 2: type a different name → enter the code → **Join**.
- Window 1 should show both players. Press **Start game**, and take a turn in each window. Both windows should show the same coins.
- If anything fails, open the browser's developer console (F12 → Console) and copy any red error messages.

**10. Report back with:**
- the Firebase project ID and the full `firebaseConfig`
- whether the config was pushed to the branch (with the commit link)
- the GitHub Pages URL and whether it loads
- the result of the two-player test, plus any console errors
